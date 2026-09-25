import { describe, it, expect } from "vitest";
import PizZip from "pizzip";
import {
  wordFixture,
  templateFixture,
} from "../../../../test/societyLetterFixture";
import {
  inspectLetterTemplate,
  validateLetterTemplate,
  renderSocietyLetter,
} from "./societyLetterDocuments";
import { LETTER_TAGS } from "@/utils/societyLetters";

const run = (text) =>
  `<w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${text}</w:t></w:r>`;
const p = (content) => `<w:p>${content}</w:p>`;
const field = (name) =>
  `<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText> MERGEFIELD "${name}" </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r>${run(`\u00ab${name}\u00bb`)}<w:r><w:fldChar w:fldCharType="end"/></w:r>`;
function content(body) {
  const zip = wordFixture();
  zip.file(
    "word/document.xml",
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}<w:sectPr/></w:body></w:document>`,
  );
  zip.file("word/media/logo.png", Buffer.from("logo preserved"));
  return zip.generate({ type: "base64" });
}
const ood = () =>
  content(
    p(run("Date")) +
      p(field("Addressee")) +
      p(field("Address_Line_1")) +
      p(field("Address_Line_2")) +
      p(field("City") + run(", ") + field("State") + run(" ") + field("Zip")) +
      p(run("Dear \u00ab") + run("First_Name") + run("\u00bb,")) +
      p(run("Thank you for your support.")),
  );
const row = {
  members: ["10", "11"],
  firstName: "Alex",
  spouseFirstName: "Pat",
  addressee: "Alex & Pat Sample",
  salutation: "Alex and Pat",
  address: "10 Test Street\nSuite 2\nJacksonville FL 32211",
  societyName: "Order of the Dolphin",
  period: { start: "2026-01-01", end: "2026-12-31" },
};
const settings = {
  fields: LETTER_TAGS,
  dateFormat: "long_us",
  wordBindings: { First_Name: "first_names" },
  wordAddressMode: "block",
  mergeDateLabel: true,
};
const template = (source = ood(), config = settings) =>
  validateLetterTemplate({
    ...templateFixture(),
    content: source,
    mergeSettings: config,
  });
const xml = (result) =>
  new PizZip(result.document).file("word/document.xml").asText();

describe("Word field mappings", () => {
  it("does not require an address for a template that does not use one", () => {
    const saved = template(content(p(run("Dear {salutation},"))));
    expect(
      xml(
        renderSocietyLetter(
          saved,
          { ...row, address: undefined },
          "2026-09-25",
        ),
      ),
    ).toContain("Dear Alex and Pat,");
  });
  it("checks address availability independently of the selected output field allowlist", () => {
    const saved = template(content(p(run("{city}"))), {
      ...settings,
      fields: ["city", "society_name", "salutation"],
    });
    expect(
      xml(
        renderSocietyLetter(
          saved,
          {
            ...row,
            addressParts: { address_line_1: "10 Test Street", city: "Town" },
          },
          "2026-09-25",
        ),
      ),
    ).toContain("Town");
  });
  it("discovers native fields, a split greeting and the address block without changing the source", () => {
    const source = ood();
    const result = inspectLetterTemplate(source);
    expect(result).toMatchObject({
      hasAddressBlock: true,
      hasDateLabel: true,
      legacy: true,
    });
    expect(result.fields).toContainEqual({
      name: "First_Name",
      suggestedField: "first_name",
    });
    expect(result.fields).toContainEqual({
      name: "Address_Line_1",
      suggestedField: "address_line_1",
    });
    expect(
      new PizZip(Buffer.from(source, "base64"))
        .file("word/document.xml")
        .asText(),
    ).toContain("MERGEFIELD");
  });
  it("merges the original OOD layout using the full reviewed address and saved greeting mapping", () => {
    const saved = template();
    const rendered = renderSocietyLetter(saved, row, "2026-09-25");
    const result = xml(rendered);
    for (const value of [
      "September 25, 2026",
      "Alex &amp; Pat Sample",
      "10 Test Street",
      "Suite 2",
      "Jacksonville FL 32211",
      "Alex &amp; Pat",
      "<w:b/>",
    ])
      expect(result).toContain(value);
    expect(result).not.toMatch(
      /MERGEFIELD|instrText|fldChar|\u00ab|\u00bb|\{\w+\}/,
    );
    expect(
      new PizZip(rendered.document).file("word/media/logo.png").asText(),
    ).toBe("logo preserved");
    expect(saved.content).toBe(ood());
    expect(saved.usedFields).toContain("address");
    expect(saved.usedFields).not.toContain("city");
    expect(rendered.text).toContain("Alex and Pat"); // Word mapping does not change email tags.
  });
  it("supports actual separate address parts, including a blank second street line", () => {
    const saved = template(ood(), {
      ...settings,
      wordAddressMode: "components",
    });
    const parts = {
      address_line_1: "25 Main St",
      address_line_2: "",
      city: "Boston",
      state: "MA",
      zip: "02110",
      country: "",
    };
    const result = xml(
      renderSocietyLetter(saved, { ...row, addressParts: parts }, "2026-09-25"),
    );
    for (const value of ["25 Main St", "Boston", "MA", "02110"])
      expect(result).toContain(value);
    expect(result).not.toContain("undefined");
    expect(result).not.toMatch(/MERGEFIELD|\u00ab/);
    expect(() => renderSocietyLetter(saved, row, "2026-09-25")).toThrow(
      /Separate address fields/,
    );
  });
  it("versions mappings without mutating the original saved Word document", () => {
    const saved = template();
    const changed = template(saved.content, {
      ...settings,
      wordBindings: { First_Name: "salutation" },
    });
    expect(changed.version).not.toBe(saved.version);
    expect(changed.content).toBe(saved.content);
    expect(xml(renderSocietyLetter(changed, row, "2026-09-25"))).toContain(
      "Alex and Pat",
    );
    expect(xml(renderSocietyLetter(saved, row, "2026-09-25"))).toContain(
      "Alex &amp; Pat",
    );
  });
  it("allows new and existing brace placeholders to map to a different saved data field", () => {
    const source = content(p(run("Dear {salutation} / {Greeting},")));
    const saved = template(source, {
      ...settings,
      wordBindings: { salutation: "first_names", Greeting: "first_name" },
    });
    expect(xml(renderSocietyLetter(saved, row, "2026-09-25"))).toContain(
      "Dear Alex &amp; Pat / Alex,",
    );
  });
  it("handles simple Word fields and blocks unsupported fields instead of silently sending placeholders", () => {
    const source = content(
      p(
        `<w:fldSimple w:instr=' MERGEFIELD "Nickname" '>${run("Sample")}</w:fldSimple>`,
      ),
    );
    expect(() => template(source)).toThrow(
      /Choose a value for Word field Nickname/,
    );
    const saved = template(source, {
      ...settings,
      wordBindings: { Nickname: "first_name" },
    });
    expect(xml(renderSocietyLetter(saved, row, "2026-09-25"))).toContain(
      "Alex",
    );
    expect(() =>
      renderSocietyLetter(
        validateLetterTemplate({ ...templateFixture(), content: ood() }),
        row,
        "2026-09-25",
      ),
    ).toThrow(/Read|read the Word fields/);
  });
  it("leaves ordinary dates, punctuation, and non-address paragraphs alone", () => {
    const source = content(
      p(run("Date of the event")) +
        p(run("Date")) +
        p(field("Address_Line_1")) +
        p(run("Keep this sentence")) +
        p(field("City")),
    );
    expect(inspectLetterTemplate(source).hasAddressBlock).toBe(false);
    const saved = template(source, { ...settings, mergeDateLabel: false });
    const result = xml(
      renderSocietyLetter(
        saved,
        { ...row, addressParts: { address_line_1: "10 Test", city: "Town" } },
        "2026-09-25",
      ),
    );
    expect(result).toContain("Date of the event");
    expect(result).toContain(">Date<");
    expect(result).toContain("Keep this sentence");
  });
  it.each(["MERGEFIELD Name \\# 0", "MERGEFIELD Name \\* Upper"])(
    "rejects unsupported Word instructions: %s",
    (instruction) => {
      expect(() =>
        inspectLetterTemplate(
          content(
            p(
              `<w:fldSimple w:instr='${instruction}'>${run("Name")}</w:fldSimple>`,
            ),
          ),
        ),
      ).toThrow(/unsupported formatting/);
    },
  );
});
