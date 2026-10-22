// @vitest-environment node
import { expect, it } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  convertLetterPdf,
  postalPdfCapability,
} from "@/app/api/utils/societyLetterPdf";

it.skipIf(process.env.SOCIETY_PDF_HOSTED_TEST !== "true")(
  "converts only the six fictional samples through the real protected app adapter",
  async () => {
    const source = process.env.SOCIETY_PDF_SAMPLE_DIRECTORY;
    const manifest = JSON.parse(
      readFileSync(path.join(source, "manifest.json"), "utf8"),
    );
    expect(manifest.fictionalRecipients).toBe(true);
    expect(manifest.samples).toHaveLength(6);
    const allowed = ["ood", "presidents"].flatMap((society) =>
      ["individual", "household", "organization"].map(
        (kind) => `${society}-${kind}.docx`,
      ),
    );
    expect(manifest.samples.map((sample) => sample.name).sort()).toEqual(
      allowed.sort(),
    );
    const env = {
      SOCIETY_PDF_ENABLED: "true",
      SOCIETY_PDF_CONVERTER_URL: process.env.SOCIETY_PDF_TEST_URL,
      SOCIETY_PDF_CONVERTER_TOKEN: readFileSync(
        process.env.SOCIETY_PDF_TEST_TOKEN_FILE,
        "utf8",
      ).trim(),
      SOCIETY_PDF_VERCEL_BYPASS_SECRET: readFileSync(
        process.env.SOCIETY_PDF_TEST_BYPASS_FILE,
        "utf8",
      ).trim(),
      SOCIETY_PDF_MAX_BATCH_SIZE: "3",
    };
    expect(postalPdfCapability(env)).toEqual({
      enabled: true,
      maxBatchSize: 3,
    });
    const output = mkdtempSync(path.join(tmpdir(), "ju-pdf-adapter-"));
    for (const sample of manifest.samples) {
      expect(sample.mergeSettings.fontReplacement).toBe("carlito");
      const input = readFileSync(path.join(source, sample.name));
      const start = Date.now();
      const pdf = await convertLetterPdf(input, { env });
      writeFileSync(
        path.join(output, sample.name.replace(/docx$/, "pdf")),
        pdf,
        { flag: "wx", mode: 0o600 },
      );
      console.info(
        `${sample.name}: ${pdf.length} PDF bytes, ${Date.now() - start} ms`,
      );
    }
    console.info(`Fictional adapter PDF samples: ${output}`);
  },
  300000,
);
