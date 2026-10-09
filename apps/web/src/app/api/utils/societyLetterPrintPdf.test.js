// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  Duplex,
  PDFDocument,
  PDFName,
  PDFString,
  PrintScaling,
  degrees,
} from "pdf-lib";
import { documentHash, POSTAL_DOCUMENT_LIMIT } from "./societyLetterPdf";
import { postalBatchPrintPdf } from "./societyLetterPrintPdf";

async function fixture(count = 2) {
  const records = new Map();
  const items = [];
  for (let index = 0; index < count; index++) {
    const doc = await PDFDocument.create();
    for (let p = 0; p <= index % 2; p++) {
      const page = doc.addPage([612 + p, 792]);
      page.drawText(`Fictional letter ${index}, page ${p}`);
      page.node.set(PDFName.of("TestOrder"), PDFString.of(`${index}-${p}`));
      if (p) page.setRotation(degrees(90));
    }
    const bytes = Buffer.from(await doc.save());
    const id = randomUUID();
    const sha256 = documentHash(bytes);
    records.set(id, { content: bytes.toString("base64"), sha256 });
    items.push({
      id: `letter-${index}`,
      batchId: "approved-batch",
      channel: "post",
      status: "prepared",
      postalApproval: { batchId: "approved-batch", index },
      postalDocument: { id, sha256, size: bytes.length, format: "pdf" },
      letterAppeals: {
        status: "complete",
        members: [{ id: String(index + 10), status: "verified" }],
      },
    });
  }
  return { items, records, read: vi.fn(async (id) => records.get(id)) };
}

describe("print-ready approved PDF batches", () => {
  it("combines an explicit completed subset in approved order without reading a blocked document", async () => {
    const f = await fixture(3);
    f.items[1].letterAppeals.status = "pending";
    const before = structuredClone(f.items);
    const merged = await PDFDocument.load(
      await postalBatchPrintPdf([f.items[2], f.items[0]], f.read),
    );
    expect(
      merged
        .getPages()
        .map((page) => page.node.get(PDFName.of("TestOrder")).decodeText()),
    ).toEqual(["0-0", "2-0"]);
    expect(f.read.mock.calls.map(([id]) => id)).toEqual([
      f.items[0].postalDocument.id,
      f.items[2].postalDocument.id,
    ]);
    expect(f.items).toEqual(before);
  });
  it("copies every page in approved order with sizes and rotations intact, without changing stored records", async () => {
    const f = await fixture();
    const before = structuredClone({ items: f.items, records: f.records });
    const bytes = await postalBatchPrintPdf([...f.items].reverse(), f.read);
    const merged = await PDFDocument.load(bytes);
    expect(merged.getPageCount()).toBe(3);
    expect(
      merged
        .getPages()
        .map((p) => p.node.get(PDFName.of("TestOrder")).decodeText()),
    ).toEqual(["0-0", "1-0", "1-1"]);
    expect(merged.getPages().map((p) => p.getSize())).toEqual([
      { width: 612, height: 792 },
      { width: 612, height: 792 },
      { width: 613, height: 792 },
    ]);
    expect(merged.getPages().map((p) => p.getRotation().angle)).toEqual([
      0, 0, 90,
    ]);
    const preferences = merged.catalog.getViewerPreferences();
    expect(preferences.getPrintScaling()).toBe(PrintScaling.None);
    expect(preferences.getDuplex()).toBe(Duplex.Simplex);
    expect(f.read.mock.calls.map(([id]) => id)).toEqual(
      f.items.map((i) => i.postalDocument.id),
    );
    expect({ items: f.items, records: f.records }).toEqual(before);
  });

  it("supports all ten PDFs, mailed re-downloads, and confirmed relationship-only spouses", async () => {
    const f = await fixture(10);
    f.items[0].status = "mailed";
    f.items[0].letterAppeals.members.push({
      id: "spouse",
      status: "not_applicable",
      reason: "relationship_only",
      checkedAt: "2026-10-08T12:00:00Z",
    });
    const merged = await PDFDocument.load(
      await postalBatchPrintPdf(f.items, f.read),
    );
    expect(merged.getPageCount()).toBe(15);
  });

  it.each(["pending", "uncertain"])(
    "blocks %s members even if the overall receipt says complete",
    async (status) => {
      const f = await fixture();
      f.items[1].letterAppeals.members[0].status = status;
      await expect(postalBatchPrintPdf(f.items, f.read)).rejects.toMatchObject({
        status: 409,
      });
      expect(f.read).not.toHaveBeenCalled();
    },
  );

  it.each([
    "empty",
    "mixed-format",
    "missing-pdf",
    "unapproved",
    "cancelled",
    "other-batch",
    "duplicate-letter",
    "duplicate-document",
    "duplicate-order",
    "missing-receipt",
    "invalid-size",
    "too-many",
  ])("rejects %s batches before reading any files", async (kind) => {
    const f = await fixture(kind === "too-many" ? 11 : 2);
    if (kind === "empty") f.items = [];
    if (kind === "mixed-format") f.items[1].postalDocument.format = "docx";
    if (kind === "missing-pdf") delete f.items[1].postalDocument;
    if (kind === "unapproved") delete f.items[1].postalApproval;
    if (kind === "cancelled") f.items[1].status = "cancelled";
    if (kind === "other-batch") f.items[1].batchId = "another-batch";
    if (kind === "duplicate-letter") f.items[1].id = f.items[0].id;
    if (kind === "duplicate-document")
      f.items[1].postalDocument.id = f.items[0].postalDocument.id;
    if (kind === "duplicate-order") f.items[1].postalApproval.index = 0;
    if (kind === "missing-receipt") delete f.items[1].letterAppeals;
    if (kind === "invalid-size") f.items[1].postalDocument.size = NaN;
    await expect(postalBatchPrintPdf(f.items, f.read)).rejects.toMatchObject({
      status: 409,
    });
    expect(f.read).not.toHaveBeenCalled();
  });

  it.each(["missing", "changed", "corrupt", "zero-page", "form"])(
    "fails the whole download on a %s document, without skipping a letter",
    async (kind) => {
      const f = await fixture();
      const meta = f.items[1].postalDocument;
      if (kind === "missing") f.records.delete(meta.id);
      else if (kind === "changed")
        f.records.get(meta.id).content =
          Buffer.from("tampered").toString("base64");
      else {
        const pdf = await PDFDocument.create();
        if (kind === "form")
          pdf.getForm().createTextField("Name").addToPage(pdf.addPage());
        const bytes =
          kind === "corrupt"
            ? Buffer.from("invalid confidential data")
            : Buffer.from(await pdf.save({ addDefaultPage: false }));
        meta.sha256 = documentHash(bytes);
        meta.size = bytes.length;
        f.records.set(meta.id, {
          content: bytes.toString("base64"),
          sha256: meta.sha256,
        });
      }
      await expect(postalBatchPrintPdf(f.items, f.read)).rejects.toMatchObject({
        status: 409,
        message: expect.not.stringContaining("confidential"),
      });
    },
  );

  it("bounds input bytes before loading documents", async () => {
    const f = await fixture();
    f.items[0].postalDocument.size = POSTAL_DOCUMENT_LIMIT;
    await expect(postalBatchPrintPdf(f.items, f.read)).rejects.toMatchObject({
      status: 413,
    });
    expect(f.read).not.toHaveBeenCalled();
  });

  it("bounds page count and final response size", async () => {
    const f = await fixture(1);
    const pdf = await PDFDocument.create();
    for (let i = 0; i < 101; i++) pdf.addPage();
    const bytes = Buffer.from(await pdf.save());
    const meta = f.items[0].postalDocument;
    meta.sha256 = documentHash(bytes);
    meta.size = bytes.length;
    f.records.set(meta.id, {
      content: bytes.toString("base64"),
      sha256: meta.sha256,
    });
    await expect(postalBatchPrintPdf(f.items, f.read)).rejects.toMatchObject({
      status: 413,
    });
    const valid = await fixture();
    const save = vi
      .spyOn(PDFDocument.prototype, "save")
      .mockResolvedValue(new Uint8Array(POSTAL_DOCUMENT_LIMIT + 1));
    try {
      await expect(
        postalBatchPrintPdf(valid.items, valid.read),
      ).rejects.toMatchObject({ status: 413 });
    } finally {
      save.mockRestore();
    }
  });
});
