import { describe, expect, it, vi } from "vitest";
import {
  convertLetterPdf,
  postalPdfCapability,
  POSTAL_DOCUMENT_LIMIT,
} from "./societyLetterPdf";
const env = {
  SOCIETY_PDF_ENABLED: "true",
  SOCIETY_PDF_CONVERTER_URL:
    "https://private.example.org/forms/libreoffice/convert",
  SOCIETY_PDF_CONVERTER_TOKEN: "test-secret",
};
const content = "%PDF-1.7\nfictional converter response\n%%EOF";
describe("private letter PDF conversion", () => {
  it.each([undefined, "10"])(
    "supports ten PDFs with batch configuration %s without exposing credentials",
    (limit) => {
      expect(
        postalPdfCapability({ ...env, SOCIETY_PDF_MAX_BATCH_SIZE: limit }),
      ).toEqual({ enabled: true, maxBatchSize: 10 });
    },
  );
  it("keeps Vercel and converter authorization separate and exposes only the pilot limit", async () => {
    const config = {
      ...env,
      SOCIETY_PDF_CONVERTER_URL:
        "https://ju-only.vercel.app/forms/libreoffice/convert",
      SOCIETY_PDF_VERCEL_BYPASS_SECRET: "platform-secret",
      SOCIETY_PDF_MAX_BATCH_SIZE: "3",
    };
    expect(postalPdfCapability(config)).toEqual({
      enabled: true,
      maxBatchSize: 3,
    });
    const fetchImpl = vi.fn(
      async () =>
        new Response(content, {
          headers: { "content-type": "application/pdf; charset=binary" },
        }),
    );
    await convertLetterPdf(Buffer.from("Word"), { env: config, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledWith(
      config.SOCIETY_PDF_CONVERTER_URL,
      expect.objectContaining({
        redirect: "error",
        headers: {
          Authorization: "Bearer test-secret",
          "x-vercel-protection-bypass": "platform-secret",
          "Gotenberg-Output-Filename": "letter",
        },
      }),
    );
    for (const invalid of [
      { ...config, SOCIETY_PDF_VERCEL_BYPASS_SECRET: undefined },
      { ...config, SOCIETY_PDF_VERCEL_BYPASS_SECRET: "bad\nheader" },
      { ...config, SOCIETY_PDF_CONVERTER_TOKEN: "bad token" },
      ...["0", "11", "3.5", "NaN"].map((value) => ({
        ...config,
        SOCIETY_PDF_MAX_BATCH_SIZE: value,
      })),
    ])
      expect(postalPdfCapability(invalid)).toEqual({ enabled: false });
  });
  it("rejects misleading PDF types and platform redirects without retrying or leaking secrets", async () => {
    for (const response of [
      new Response(content, {
        headers: { "content-type": "application/pdf-not-really" },
      }),
      new Response(null, {
        status: 302,
        headers: { location: "https://login.example.org" },
      }),
    ]) {
      const fetchImpl = vi.fn(async () => response);
      await expect(
        convertLetterPdf(Buffer.from("Word"), { env, fetchImpl }),
      ).rejects.toMatchObject({
        status: 502,
        message: expect.not.stringContaining(env.SOCIETY_PDF_CONVERTER_TOKEN),
      });
      expect(fetchImpl).toHaveBeenCalledOnce();
    }
  });
  it("is disabled by default and never sends a letter to incomplete or unsafe configuration", async () => {
    const fetchImpl = vi.fn();
    for (const config of [
      {},
      { ...env, SOCIETY_PDF_ENABLED: "false" },
      { ...env, SOCIETY_PDF_CONVERTER_TOKEN: "" },
      {
        ...env,
        SOCIETY_PDF_CONVERTER_URL:
          "http://private.example.org/forms/libreoffice/convert",
      },
      {
        ...env,
        SOCIETY_PDF_CONVERTER_URL:
          "https://user:secret@private.example.org/forms/libreoffice/convert",
      },
    ]) {
      expect(postalPdfCapability(config).enabled).toBe(false);
      await expect(
        convertLetterPdf(Buffer.from("Word"), { env: config, fetchImpl }),
      ).rejects.toMatchObject({ status: 503 });
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("posts a generic filename once with a token, no redirects, and a bounded response", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(content, {
          headers: { "content-type": "application/pdf" },
        }),
    );
    const pdf = await convertLetterPdf(Buffer.from("Word"), { env, fetchImpl });
    expect(pdf.toString()).toBe(content);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, request] = fetchImpl.mock.calls[0];
    expect(url).toBe(env.SOCIETY_PDF_CONVERTER_URL);
    expect(request).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: { Authorization: "Bearer test-secret" },
    });
    expect(request.body.get("files").name).toBe("letter.docx");
  });
  it("aborts a hung converter after 45 seconds without retrying", async () => {
    vi.useFakeTimers();
    try {
      const fetchImpl = vi.fn(
        (_url, { signal }) =>
          new Promise((_resolve, reject) =>
            signal.addEventListener("abort", () => reject(Error("aborted"))),
          ),
      );
      const pending = expect(
        convertLetterPdf(Buffer.from("Word"), { env, fetchImpl }),
      ).rejects.toMatchObject({ status: 502 });
      await vi.advanceTimersByTimeAsync(45000);
      await pending;
      expect(fetchImpl).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
  it("rejects a streamed oversize PDF even without a size header", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response(new Uint8Array(POSTAL_DOCUMENT_LIMIT + 1), {
          headers: { "content-type": "application/pdf" },
        }),
    );
    await expect(
      convertLetterPdf(Buffer.from("Word"), { env, fetchImpl }),
    ).rejects.toMatchObject({ status: 502 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
  it.each(["html", "truncated", "large", "unavailable", "network"])(
    "fails closed on %s with no provider details or retry",
    async (kind) => {
      const fetchImpl = vi.fn(async () => {
        if (kind === "network") throw Error("secret donor contents");
        return new Response(
          kind === "truncated"
            ? "%PDF-1.7"
            : kind === "html"
              ? "<html>private details</html>"
              : content,
          {
            status: kind === "unavailable" ? 503 : 200,
            headers: {
              "content-type": kind === "html" ? "text/html" : "application/pdf",
              ...(kind === "large"
                ? { "content-length": String(POSTAL_DOCUMENT_LIMIT + 1) }
                : {}),
            },
          },
        );
      });
      await expect(
        convertLetterPdf(Buffer.from("Word"), { env, fetchImpl }),
      ).rejects.toMatchObject({
        status: 502,
        message: expect.stringContaining("No appeals were applied"),
      });
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    },
  );
});
