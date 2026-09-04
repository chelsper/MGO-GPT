// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
import { BlackbaudQueryResultTooLargeError, downloadBlackbaudQueryResultWithMetadata } from "./blackbaud";

const resultUrl = "https://query-results.example/result.csv?signature=not-real";
const bytes = (text) => new TextEncoder().encode(text);
let fetchMock;

function streamedResponse(chunks, headers = {}, status = 200) {
  let index = 0;
  const reader = {
    read: vi.fn(async () => index < chunks.length ? { done: false, value: chunks[index++] } : { done: true }),
    cancel: vi.fn(async () => {}),
    releaseLock: vi.fn(),
  };
  const body = { getReader: vi.fn(() => reader), cancel: vi.fn(async () => {}) };
  const response = {
    ok: status >= 200 && status < 300, status, statusText: status === 200 ? "OK" : "Failed",
    headers: new Headers({ "Content-Type": "text/csv; charset=windows-1252", ...headers }),
    body, arrayBuffer: vi.fn(), text: vi.fn(),
  };
  fetchMock.mockResolvedValue(response);
  return { response, reader, body };
}

describe("optional bounded metadata downloads", () => {
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    expect(console.error).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it("keeps bytes undecoded and metadata intact at the exact cap", async () => {
    const { response, reader } = streamedResponse([bytes("N\n"), Uint8Array.of(0xe9)]);
    const result = await downloadBlackbaudQueryResultWithMetadata(resultUrl, { maxBytes: 3 });
    expect(result).toEqual({ httpStatus: 200, statusText: "OK", contentType: "text/csv; charset=windows-1252", contentLength: null, body: Uint8Array.from([78,10,233]) });
    expect(response.text).not.toHaveBeenCalled();
    expect(response.arrayBuffer).not.toHaveBeenCalled();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
    expect(reader.cancel).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it.each([{}, { "Content-Length": "1" }, { "Content-Length": "invalid" }])
    ("bounds streaming even with missing or misleading Content-Length: %s", async (headers) => {
      const { reader, response } = streamedResponse([bytes("12"), bytes("345"), bytes("unread private bytes")], headers);
      await expect(downloadBlackbaudQueryResultWithMetadata(resultUrl, { maxBytes: 4 })).rejects.toBeInstanceOf(BlackbaudQueryResultTooLargeError);
      expect(reader.read).toHaveBeenCalledTimes(2);
      expect(reader.cancel).toHaveBeenCalledOnce();
      expect(reader.releaseLock).toHaveBeenCalledOnce();
      expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
      expect(response.arrayBuffer).not.toHaveBeenCalled();
    });

  it("rejects an oversized declared length before reading the body", async () => {
    const { body, reader } = streamedResponse([bytes("private")], { "Content-Length": "10" });
    await expect(downloadBlackbaudQueryResultWithMetadata(resultUrl, { maxBytes: 4 })).rejects.toBeInstanceOf(BlackbaudQueryResultTooLargeError);
    expect(reader.read).not.toHaveBeenCalled();
    expect(body.getReader).not.toHaveBeenCalled();
    expect(body.cancel).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
  });

  it("bounds unsuccessful response bodies too", async () => {
    const { reader } = streamedResponse([bytes("private oversized error")], {}, 500);
    await expect(downloadBlackbaudQueryResultWithMetadata(resultUrl, { maxBytes: 4 })).rejects.toBeInstanceOf(BlackbaudQueryResultTooLargeError);
    expect(reader.cancel).toHaveBeenCalledOnce();
  });

  it("handles empty bodies and a zero-byte bound without buffering", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect((await downloadBlackbaudQueryResultWithMetadata(resultUrl, { maxBytes: 0 })).body).toHaveLength(0);
  });

  it.each([-1, 1.5, NaN, Infinity, null, "4"])("rejects invalid byte bounds before fetching: %s", async (maxBytes) => {
    await expect(downloadBlackbaudQueryResultWithMetadata(resultUrl, { maxBytes })).rejects.toThrow("byte limit");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps existing diagnostic behavior unbounded and MIME-agnostic by default", async () => {
    const response = new Response("x".repeat(524289), { headers: { "Content-Type": "application/json", "Content-Length": "524289" } });
    const arrayBuffer = vi.spyOn(response, "arrayBuffer");
    fetchMock.mockResolvedValue(response);
    const result = await downloadBlackbaudQueryResultWithMetadata(resultUrl);
    expect(result.body).toHaveLength(524289);
    expect(result.contentType).toBe("application/json");
    expect(result.contentLength).toBe("524289");
    expect(arrayBuffer).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][1].headers.Accept).toContain("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  });

  it("retains diagnostic HTTP error metadata", async () => {
    fetchMock.mockResolvedValue(new Response("untrusted body", { status: 404, statusText: "Not Found" }));
    await expect(downloadBlackbaudQueryResultWithMetadata(resultUrl)).rejects.toMatchObject({ httpStatus: 404, message: "Blackbaud query result download failed: 404 Not Found" });
  });

  it("cancels and releases the stream after a read failure", async () => {
    const { reader } = streamedResponse([]);
    reader.read.mockRejectedValue(new Error("connection failed"));
    await expect(downloadBlackbaudQueryResultWithMetadata(resultUrl, { maxBytes: 4 })).rejects.toThrow("connection failed");
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
  });

  it("keeps the download timeout active while the body is streaming", async () => {
    vi.useFakeTimers();
    const { reader } = streamedResponse([]);
    reader.read.mockImplementation(() => new Promise((resolve, reject) => {
      fetchMock.mock.calls[0][1].signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    }));
    const assertion = expect(downloadBlackbaudQueryResultWithMetadata(resultUrl, { maxBytes: 4, timeoutMs: 1000 })).rejects.toThrow("download timed out");
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(reader.cancel).toHaveBeenCalledOnce();
  });
});
