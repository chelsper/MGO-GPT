import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import {
  wordFixture,
  templateFixture,
} from "../../../../test/societyLetterFixture";
import {
  validateLetterTemplate,
  renderSocietyLetter,
  letterArchive,
} from "./societyLetterDocuments";

const row = {
  householdId: "10",
  societyKey: "presidents_society",
  societyName: "President's Society",
  name: "Sample Household",
  addressee: "Alex & Pat",
  salutation: "Alex & Pat",
  address: "10 Test Street",
  period: { start: "2026-01-01", end: "2026-12-31" },
  letterDate: "2026-09-22",
};
describe("society Word letters", () => {
  it("stores versioned templates and retains Word formatting while escaping merged text", () => {
    const template = validateLetterTemplate(templateFixture());
    expect(template.version).toMatch(/^[a-f0-9]{64}$/);
    const output = renderSocietyLetter(template, row, "2026-09-22");
    const xml = new PizZip(output.document).file("word/document.xml").asText();
    expect(xml).toContain("<w:b/>");
    expect(xml).toContain("Alex &amp; Pat");
    expect(xml).not.toContain("{salutation}");
    expect(output.subject).toBe("Your President's Society letter");
  });
  it("archives frozen template versions without marking mail as sent", () => {
    const template = validateLetterTemplate(templateFixture());
    const item = {
      ...row,
      status: "prepared",
      templateVersion: template.version,
    };
    const zip = new PizZip(
      letterArchive([item], { [template.version]: template }),
    );
    expect(zip.file("10-presidents_society.docx")).toBeTruthy();
    expect(item.status).toBe("prepared");
    expect(() => letterArchive([item], {})).toThrow(/unavailable/);
  });
  it.each([
    "{constructor}",
    "{@salutation}",
    "{#salutation}X{/salutation}",
    "{unfinished",
  ])("rejects unsafe or broken merge tags %s", (text) => {
    const source = {
      ...templateFixture(),
      content: wordFixture(text).generate({ type: "base64" }),
    };
    expect(() => validateLetterTemplate(source)).toThrow();
  });
  it("rejects wrong formats, large files and newline injection in email subjects", () => {
    expect(() =>
      validateLetterTemplate({ ...templateFixture(), filename: "letter.pdf" }),
    ).toThrow(/Word/);
    expect(() =>
      validateLetterTemplate({
        ...templateFixture(),
        content: "A".repeat(1600000),
      }),
    ).toThrow();
    expect(() =>
      validateLetterTemplate({
        ...templateFixture(),
        subject: "Hello\nBcc: bad@example.org",
      }),
    ).toThrow(/subject/);
  });
  it.each([
    "word/vbaProject.bin",
    "word/embeddings/object.bin",
    "word/activeX/a.xml",
  ])("rejects active content %s", (filename) => {
    const zip = wordFixture();
    zip.file(filename, "payload");
    expect(() =>
      validateLetterTemplate({
        ...templateFixture(),
        content: zip.generate({ type: "base64" }),
      }),
    ).toThrow();
  });
  it("rejects external relationships", () => {
    const zip = wordFixture();
    zip.file(
      "word/_rels/document.xml.rels",
      '<Relationships><Relationship TargetMode="External" Target="https://example.org/tracker"/></Relationships>',
    );
    expect(() =>
      validateLetterTemplate({
        ...templateFixture(),
        content: zip.generate({ type: "base64" }),
      }),
    ).toThrow(/external/);
  });
});
