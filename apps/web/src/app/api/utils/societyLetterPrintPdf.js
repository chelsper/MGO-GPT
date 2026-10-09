import { Duplex, PDFDocument, PrintScaling } from "pdf-lib";
import { letterError } from "@/utils/societyLetters";
import { assertLetterAppealsComplete } from "./societyLetterFinalization";
import {
  POSTAL_BATCH_LIMIT,
  savedPostalDocument,
} from "./societyLetterPostalBatches";
import { POSTAL_DOCUMENT_LIMIT } from "./societyLetterPdf";

const PRINT_PAGE_LIMIT = 100;
const tooLarge = () =>
  letterError(
    "This batch is too large for one PDF. Download the individual saved letters instead; nothing has changed.",
    413,
  );

// Read-only assembly of approved pages, never another conversion or NXT update.
export async function postalBatchPrintPdf(items, read) {
  if (
    !Array.isArray(items) ||
    !items.length ||
    items.length > POSTAL_BATCH_LIMIT ||
    !items[0].batchId ||
    new Set(items.map((item) => item.id)).size !== items.length ||
    new Set(items.map((item) => item.postalDocument?.id)).size !==
      items.length ||
    new Set(items.map((item) => item.postalApproval?.index)).size !==
      items.length ||
    items.some(
      (item) =>
        item.batchId !== items[0].batchId ||
        item.channel !== "post" ||
        !["prepared", "mailed"].includes(item.status) ||
        !item.letterAppeals ||
        item.postalApproval?.batchId !== item.batchId ||
        !Number.isInteger(item.postalApproval?.index) ||
        item.postalApproval.index < 0 ||
        item.postalDocument?.format !== "pdf" ||
        !Number.isInteger(item.postalDocument.size) ||
        item.postalDocument.size <= 0,
    )
  )
    throw letterError(
      "One print-ready PDF requires completed, approved PDF letters from the same batch. Word and individual letter downloads remain available.",
      409,
    );
  assertLetterAppealsComplete(items);
  if (
    items.reduce((total, item) => total + item.postalDocument.size, 0) >
    POSTAL_DOCUMENT_LIMIT
  )
    throw tooLarge();

  const combined = await PDFDocument.create();
  combined.setTitle("Society letters - print-ready batch");
  const preferences = combined.catalog.getOrCreateViewerPreferences();
  preferences.setPrintScaling(PrintScaling.None);
  preferences.setDuplex(Duplex.Simplex);
  const ordered = [...items].sort(
    (a, b) => a.postalApproval.index - b.postalApproval.index,
  );
  for (const item of ordered) {
    // Verify stored bytes against their approved hashes before copying any pages.
    const { bytes } = await savedPostalDocument(item.postalDocument, read);
    try {
      const source = await PDFDocument.load(bytes, {
        updateMetadata: false,
        throwOnInvalidObject: true,
      });
      if (!source.getPageCount() || source.getForm().getFields().length)
        throw new Error("Not a static letter PDF");
      if (combined.getPageCount() + source.getPageCount() > PRINT_PAGE_LIMIT)
        throw tooLarge();
      const pages = await combined.copyPages(source, source.getPageIndices());
      for (const page of pages) combined.addPage(page);
    } catch (error) {
      if (error.status === 413) throw error;
      throw letterError(
        "A saved PDF could not be combined safely. Download the individual letters or ask an administrator to check the saved document. Nothing has changed.",
        409,
      );
    }
  }
  const bytes = Buffer.from(
    await combined.save({
      useObjectStreams: true,
      addDefaultPage: false,
      updateFieldAppearances: false,
    }),
  );
  if (bytes.length > POSTAL_DOCUMENT_LIMIT) throw tooLarge();
  return bytes;
}
