// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { createCanvas } from "@napi-rs/canvas";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { fileURLToPath } from "node:url";

describe("real PDF.js upgrade compatibility", () => {
  it("extracts and renders every page of a fictional saved letter", async () => {
    const source = await PDFDocument.create();
    const font = await source.embedFont(StandardFonts.Helvetica);
    for (const text of ["Dear Fictional Donor,", "Thank you for your support."]) {
      const page = source.addPage([400, 500]);
      page.drawText(text, { x: 30, y: 450, font, size: 18 });
    }
    const task = getDocument({
      data: await source.save(), isEvalSupported: false,
      standardFontDataUrl: fileURLToPath(new URL("../../node_modules/pdfjs-dist/standard_fonts/", import.meta.url)),
    });
    try {
      const pdf = await task.promise;
      expect(pdf.numPages).toBe(2);
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const text = (await page.getTextContent()).items.map((item) => item.str || "").join(" ");
        expect(text).toBe(i === 1 ? "Dear Fictional Donor," : "Thank you for your support.");
        const viewport = page.getViewport({ scale: 1 });
        const canvas = createCanvas(viewport.width, viewport.height);
        await page.render({ canvas, canvasContext: canvas.getContext("2d"), viewport }).promise;
        expect(canvas.toBuffer("image/png").byteLength).toBeGreaterThan(1000);
      }
    } finally {
      await task.destroy();
    }
  });
});
