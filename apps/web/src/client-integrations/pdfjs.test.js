import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getDocument: vi.fn(), create: vi.fn(), revoke: vi.fn() }));
vi.mock("pdfjs-dist", () => ({ getDocument: mocks.getDocument, GlobalWorkerOptions: {} }));
vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "/test-worker.mjs" }));
import { extractTextFromPDF } from "./pdfjs";

describe("PDF extraction worker cleanup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("URL", { createObjectURL: mocks.create, revokeObjectURL: mocks.revoke });
    mocks.create.mockReturnValue("blob:fictional-pdf");
  });
  afterEach(() => vi.unstubAllGlobals());
  it("extracts text with evaluation disabled and releases the worker and blob", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const getPage = vi.fn().mockResolvedValue({
      getTextContent: async () => ({ items: [{ str: "Fictional recipient" }, { other: true }] }),
    });
    mocks.getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 1, getPage }), destroy });
    expect(await extractTextFromPDF(new Blob())).toBe("Fictional recipient ");
    expect(mocks.getDocument).toHaveBeenCalledWith({ url: "blob:fictional-pdf", isEvalSupported: false });
    expect(destroy).toHaveBeenCalledOnce();
    expect(mocks.revoke).toHaveBeenCalledWith("blob:fictional-pdf");
  });
  it("releases resources after parsing fails", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    mocks.getDocument.mockReturnValue({ promise: Promise.reject(new Error("Invalid PDF")), destroy });
    expect(await extractTextFromPDF(new Blob())).toBeUndefined();
    expect(destroy).toHaveBeenCalledOnce();
    expect(mocks.revoke).toHaveBeenCalledWith("blob:fictional-pdf");
  });
  it("does not discard extracted text if worker cleanup fails", async () => {
    mocks.getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage: async () => ({
        getTextContent: async () => ({ items: [{ str: "Letter" }] }),
      }) }),
      destroy: vi.fn().mockRejectedValue(new Error("Worker already gone")),
    });
    expect(await extractTextFromPDF(new Blob())).toBe("Letter");
  });
});
