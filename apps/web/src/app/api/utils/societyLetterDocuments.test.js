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
  renderSocietyLetterSample,
} from "./societyLetterDocuments";
import { LETTER_TAGS } from "@/utils/societyLetters";
import { contactChoiceKey } from "@/utils/societyLetterContacts";

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
  it("renders a setup sample with fictional values for every supported merge field", () => {
    const template = validateLetterTemplate({
      ...templateFixture(),
      content: wordFixture(
        LETTER_TAGS.map((tag) => `{${tag}}`).join(" | "),
      ).generate({ type: "base64" }),
    });
    const result = renderSocietyLetterSample(
      template,
      "Order of the Dolphin",
      row.period,
      "2026-09-25",
    );
    const xml = new PizZip(result.document).file("word/document.xml").asText();
    expect(xml).toContain("Alex");
    expect(xml).toContain("Jordan");
    expect(xml).toContain("123 Sample Street");
    expect(xml).toContain("Suite 200");
    expect(xml).toContain("Example City");
    expect(xml).toContain("00000");
    expect(xml).toContain("Order of the Dolphin");
    expect(xml).toContain("2026-09-25");
    expect(xml).not.toMatch(/\{[a-z_]+\}/);
  });
  it("renders the selected organization contact's names with the organization's reviewed address", () => {
    const contact = {
      role: "Society letter contact",
      firstName: "Jamie",
      lastName: "Jones",
    };
    const candidate = {
      constituentId: "10",
      organizationContacts: {
        constituencyCodes: ["Foundation"],
        contacts: [contact],
      },
    };
    const source = {
      ...row,
      sourceMode: "society_queries",
      members: ["10"],
      recipientConstituentId: "10",
      recipientCandidates: [candidate],
      organizationContactKey: contactChoiceKey(contact),
      memberNames: [],
      name: "Example Foundation",
      address: "25 Organization Street",
    };
    const template = validateLetterTemplate({
      ...templateFixture(),
      content: wordFixture(
        "{first_name} {last_name} | {address} | {household_name}",
      ).generate({ type: "base64" }),
    });
    const result = renderSocietyLetter(template, source, "2026-09-25");
    const xml = new PizZip(result.document).file("word/document.xml").asText();
    expect(xml).toContain(
      "Jamie Jones | 25 Organization Street | Example Foundation",
    );
    expect(source.members).toEqual(["10"]);
    expect(() =>
      renderSocietyLetter(
        template,
        { ...source, organizationContactKey: "invalid" },
        "2026-09-25",
      ),
    ).toThrow(/Missing name value/);
  });
  const namedRow = {
    ...row,
    members: ["10", "11"],
    firstName: "Alex",
    lastName: "Smith",
    spouseFirstName: "Pat",
    spouseLastName: "Jones",
  };
  const nameTemplate = (tag = "first_name") =>
    validateLetterTemplate({
      ...templateFixture(),
      content: wordFixture(`Dear {${tag}},`).generate({ type: "base64" }),
      subject: "Your {society_name} letter",
      emailBody: `Dear {${tag}}, please see your letter.`,
      mergeSettings: { fields: [tag, "society_name"], dateFormat: "iso" },
    });
  it("renders saved first-name choices into Word and email without substituting salutation", () => {
    const template = nameTemplate();
    expect(template.usedFields).toEqual(["first_name", "society_name"]);
    const result = renderSocietyLetter(template, namedRow, "2026-09-24");
    const xml = new PizZip(result.document).file("word/document.xml").asText();
    expect(xml).toContain("Dear Alex,");
    expect(xml).toContain("<w:b/>");
    expect(xml).not.toContain("{first_name}");
    expect(result.text).toBe("Dear Alex, please see your letter.");
    expect(row.salutation).toBe("Alex & Pat");
  });
  it("renders first_names for couples and individuals without leaving dangling conjunctions", () => {
    const template = nameTemplate("first_names");
    const couple = renderSocietyLetter(template, namedRow, "2026-09-24");
    expect(couple.text).toBe("Dear Alex & Pat, please see your letter.");
    expect(
      new PizZip(couple.document).file("word/document.xml").asText(),
    ).toContain("Dear Alex &amp; Pat,");
    const individual = renderSocietyLetter(
      template,
      { ...namedRow, members: ["10"] },
      "2026-09-24",
    );
    expect(individual.text).toBe("Dear Alex, please see your letter.");
  });
  it.each([
    "first_name",
    "last_name",
    "spouse_first_name",
    "spouse_last_name",
    "first_names",
  ])("renders mapped %s and blocks it when missing", (tag) => {
    const template = nameTemplate(tag);
    expect(
      renderSocietyLetter(template, namedRow, "2026-09-24").text,
    ).not.toContain(`{${tag}}`);
    expect(() => renderSocietyLetter(template, row, "2026-09-24")).toThrow(
      /Missing name value/,
    );
  });
  it("checks actual Word and email usage rather than trusting saved usedFields", () => {
    const template = { ...nameTemplate(), usedFields: [] };
    expect(() => renderSocietyLetter(template, row, "2026-09-24")).toThrow(
      /\{first_name\}/,
    );
    const emailOnly = validateLetterTemplate({
      ...templateFixture(),
      emailBody: "Hello {first_name}",
    });
    expect(() => renderSocietyLetter(emailOnly, row, "2026-09-24")).toThrow(
      /\{first_name\}/,
    );
    const wordOnly = { ...nameTemplate(), emailBody: "Hello", usedFields: [] };
    expect(() => renderSocietyLetter(wordOnly, row, "2026-09-24")).toThrow(
      /\{first_name\}/,
    );
  });
  it("requires explicit selection for used name tags and does not change older template versions", () => {
    const previous = validateLetterTemplate(templateFixture());
    const original = JSON.stringify(previous);
    const next = nameTemplate();
    expect(next.version).not.toBe(previous.version);
    expect(JSON.stringify(previous)).toBe(original);
    expect(() =>
      validateLetterTemplate({
        ...next,
        mergeSettings: { fields: ["salutation", "society_name"] },
      }),
    ).toThrow(/Select the merge field \{first_name\}/);
    expect(renderSocietyLetter(previous, row, "2026-09-24").text).toContain(
      "Alex & Pat",
    );
  });
  it("saves canonical selected fields and versions changes to the field settings", () => {
    const source = templateFixture();
    const saved = validateLetterTemplate({
      ...source,
      mergeSettings: {
        fields: ["society_name", "salutation"],
        dateFormat: "long_us",
      },
    });
    expect(saved.mergeSettings).toEqual({
      fields: ["salutation", "society_name"],
      dateFormat: "long_us",
    });
    expect(saved.usedFields).toEqual(["salutation", "society_name"]);
    expect(saved.version).not.toBe(validateLetterTemplate(source).version);
    expect(saved.version).toBe(
      validateLetterTemplate({
        ...source,
        mergeSettings: {
          fields: ["salutation", "society_name"],
          dateFormat: "long_us",
        },
      }).version,
    );
  });
  it("rejects unchecked fields still used in Word or email instead of silently removing values", () => {
    expect(() =>
      validateLetterTemplate({
        ...templateFixture(),
        mergeSettings: { fields: ["society_name"] },
      }),
    ).toThrow(/Select the merge field \{salutation\}/);
    expect(() =>
      validateLetterTemplate({
        ...templateFixture(),
        subject: "Letter for {addressee}",
        mergeSettings: { fields: ["salutation", "society_name"] },
      }),
    ).toThrow(/Select the merge field \{addressee\}/);
  });
  it.each([
    { fields: ["constructor"] },
    { fields: "salutation" },
    { fields: ["salutation", "salutation"] },
    { fields: LETTER_TAGS, dateFormat: "unsupported" },
    null,
  ])("rejects invalid merge preferences %j", (mergeSettings) => {
    expect(() =>
      validateLetterTemplate({ ...templateFixture(), mergeSettings }),
    ).toThrow(/supported merge fields/);
  });
  it("applies the saved date format and preserves the old default for legacy templates", () => {
    const source = {
      ...templateFixture(),
      content: wordFixture(
        "{letter_date}: {period_start} to {period_end}",
      ).generate({ type: "base64" }),
      subject: "{letter_date}",
      emailBody: "{period_start}",
    };
    const modern = validateLetterTemplate({
      ...source,
      mergeSettings: { fields: LETTER_TAGS, dateFormat: "long_us" },
    });
    const rendered = renderSocietyLetter(modern, row, "2026-09-24");
    expect(
      new PizZip(rendered.document).file("word/document.xml").asText(),
    ).toContain("September 24, 2026: January 1, 2026 to December 31, 2026");
    expect(rendered.subject).toBe("September 24, 2026");
    expect(rendered.text).toBe("January 1, 2026");
    expect(renderSocietyLetter(source, row, "2026-09-24").subject).toBe(
      "2026-09-24",
    );
  });
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
