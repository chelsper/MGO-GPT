import { createHash } from "node:crypto";
import { letterError } from "@/utils/societyLetters";

export const POSTAL_DOCUMENT_LIMIT = 4 * 1024 * 1024;
export const documentHash = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

function configuration(env) {
  if (env.SOCIETY_PDF_ENABLED !== "true") return null;
  try {
    const url = new URL(env.SOCIETY_PDF_CONVERTER_URL);
    const token = env.SOCIETY_PDF_CONVERTER_TOKEN;
    const bypass = env.SOCIETY_PDF_VERCEL_BYPASS_SECRET;
    const maxBatchSize = Number(env.SOCIETY_PDF_MAX_BATCH_SIZE || 10);
    const safeSecret = (value) =>
      typeof value === "string" && /^[\x21-\x7e]+$/.test(value);
    // Deployment-owned configuration only. Never accept a URL from a request.
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== "/forms/libreoffice/convert" ||
      !safeSecret(token) ||
      (bypass !== undefined && !safeSecret(bypass)) ||
      (url.hostname.endsWith(".vercel.app") && !safeSecret(bypass)) ||
      !Number.isInteger(maxBatchSize) ||
      maxBatchSize < 1 ||
      maxBatchSize > 10
    )
      return null;
    return { url: url.href, token, bypass, maxBatchSize };
  } catch {
    return null;
  }
}

export function postalPdfCapability(env = process.env) {
  const config = configuration(env);
  return {
    enabled: !!config,
    ...(config ? { maxBatchSize: config.maxBatchSize } : {}),
  };
}

export async function convertLetterPdf(
  document,
  { env = process.env, fetchImpl = fetch } = {},
) {
  const config = configuration(env);
  if (!config)
    throw letterError(
      "Automatic PDFs need a configured private converter. Choose Word letters or ask your administrator to finish PDF setup.",
      503,
    );
  if (!document?.length || document.length > POSTAL_DOCUMENT_LIMIT)
    throw letterError("This letter is too large to convert safely.");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const form = new FormData();
    form.append(
      "files",
      new Blob([document], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      }),
      "letter.docx",
    );
    const response = await fetchImpl(config.url, {
      method: "POST",
      body: form,
      redirect: "error",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.token}`,
        ...(config.bypass
          ? { "x-vercel-protection-bypass": config.bypass }
          : {}),
        "Gotenberg-Output-Filename": "letter",
      },
    });
    if (
      !response.ok ||
      response.headers
        .get("content-type")
        ?.split(";")[0]
        .trim()
        .toLowerCase() !== "application/pdf"
    )
      throw new Error("Conversion failed");
    if (Number(response.headers.get("content-length")) > POSTAL_DOCUMENT_LIMIT)
      throw new Error("Oversize PDF");
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.length;
        if (length > POSTAL_DOCUMENT_LIMIT) throw new Error("Oversize PDF");
        chunks.push(Buffer.from(value));
      }
    } finally {
      await reader.cancel().catch(() => {});
    }
    const pdf = Buffer.concat(chunks);
    if (
      !pdf.subarray(0, 8).toString("ascii").startsWith("%PDF-") ||
      !pdf.subarray(-1024).toString("ascii").includes("%%EOF")
    )
      throw new Error("Invalid PDF");
    return pdf;
  } catch {
    // Never surface converter URLs, tokens, provider bodies, or donor content.
    throw letterError(
      "The PDF could not be prepared. No appeals were applied. Try preparing this document again or ask your administrator to check the private converter.",
      502,
    );
  } finally {
    clearTimeout(timeout);
  }
}
