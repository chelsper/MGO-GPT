// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import PizZip from "pizzip";
import {
  inspectLetterTemplate,
  renderSocietyLetter,
  validateLetterTemplate,
} from "@/app/api/utils/societyLetterDocuments";
import { LETTER_TAGS, formatLetterAddress } from "@/utils/societyLetters";
import { contactChoiceKey } from "@/utils/societyLetterContacts";
import { processLetterWordFields } from "@/app/api/utils/societyLetterWordFields";
import { templateFixture, wordFixture } from "./societyLetterFixture";

const date = "2026-10-02";
const period = { start: "2026-01-01", end: "2026-12-31" };
const contact = {
  role: "Society letter contact",
  firstName: "Alexandra",
  preferredName: "Alex",
  lastName: "Example",
};
const cases = [
  {
    key: "individual",
    members: ["900001"],
    firstName: "Alexandra",
    preferredName: "Alex",
    lastName: "Example",
    name: "Alexandra Example",
    addressee: "Alexandra Example",
    salutation: "Alex",
    expectedGreeting: "Dear Alex,",
  },
  {
    key: "household",
    members: ["900001", "900002"],
    firstName: "Alexandra",
    preferredName: "Alex",
    lastName: "Example",
    spouseFirstName: "Jordan",
    spouseLastName: "Sample",
    name: "Alexandra Example & Jordan Sample",
    addressee: "Alexandra Example & Jordan Sample",
    salutation: "Alex & Jordan",
    expectedGreeting: "Dear Alex &amp; Jordan,",
  },
  {
    key: "organization",
    sourceMode: "society_queries",
    members: ["900003"],
    recipientConstituentId: "900003",
    recipientCandidates: [
      {
        constituentId: "900003",
        organizationContacts: {
          constituencyCodes: ["Foundation"],
          contacts: [contact],
        },
      },
    ],
    organizationContactKey: contactChoiceKey(contact),
    name: "Example Community Education Foundation",
    addressee: "Alexandra Example\nExample Community Education Foundation",
    salutation: "Alex",
    expectedGreeting: "Dear Alex,",
  },
];

function sampleRow(item, societyName) {
  const addressParts = {
    address_line_1: "123 Sample Street",
    address_line_2: item.key === "individual" ? "" : "Suite 200",
    city: "Example City",
    state: "FL",
    zip: "00000",
    country: "",
  };
  return {
    ...item,
    householdId: item.members[0],
    societyName,
    period,
    addressParts,
    address: formatLetterAddress(addressParts),
  };
}

function renderChecked(template, item, societyName) {
  const original = new PizZip(Buffer.from(template.content, "base64"));
  const result = renderSocietyLetter(
    template,
    sampleRow(item, societyName),
    date,
  );
  const merged = new PizZip(result.document);
  const xml = merged.file("word/document.xml").asText();
  const visible = xml.replace(/<[^>]+>/g, "");
  expect(visible).toContain(item.expectedGreeting);
  expect(visible).toContain("Example City, FL 00000");
  expect(visible).toContain("October 2, 2026");
  expect(visible).not.toMatch(/\{[a-z_]+\}|\u00ab|\u00bb/);
  expect(visible).not.toContain("undefined");
  if (item.key === "organization") expect(visible).toContain(item.name);
  for (const file of original.file(/^word\/media\//)) {
    expect(merged.file(file.name)?.asUint8Array()).toEqual(file.asUint8Array());
  }
  return result.document;
}

function prepareLegacyPresidentSample(content) {
  const fields = inspectLetterTemplate(content);
  if (!fields.fields.some((field) => field.name === "Organization_Name")) {
    return { content, normalizedLegacyOrganizationLine: false };
  }
  // QA-only: reproduce the September 24 template cleanup. The reviewed
  // addressee already includes the organization when staff select that option.
  const zip = new PizZip(Buffer.from(content, "base64"));
  processLetterWordFields(zip, {});
  let removed = 0;
  const xml = zip
    .file("word/document.xml")
    .asText()
    .replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
      if (paragraph.replace(/<[^>]+>/g, "").trim() !== "{Organization_Name}")
        return paragraph;
      expect(paragraph).not.toMatch(/<w:(drawing|pict|object|sectPr)\b/);
      removed++;
      return "";
    });
  expect(removed).toBe(1);
  zip.file("word/document.xml", xml);
  return {
    content: zip.generate({ type: "base64" }),
    normalizedLegacyOrganizationLine: true,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("fictional society PDF input samples", () => {
  it.each(cases)("merges $key using the real letter renderer", (item) => {
    const template = validateLetterTemplate({
      ...templateFixture(),
      content: wordFixture(
        "{letter_date}\n{addressee}\n{address}\nDear {first_names},",
      ).generate({ type: "base64" }),
      mergeSettings: { fields: LETTER_TAGS, dateFormat: "long_us" },
    });
    renderChecked(template, item, "Order of the Dolphin");
  });

  it.skipIf(process.env.SOCIETY_PDF_LOCAL_SAMPLES !== "true")(
    "exports six local samples from supplied templates without network access",
    () => {
      vi.stubGlobal("fetch", () => {
        throw new Error("Local sample export cannot use the network.");
      });
      const sources = [
        ["ood", "Order of the Dolphin", process.env.SOCIETY_PDF_OOD_TEMPLATE],
        [
          "presidents",
          "President's Society",
          process.env.SOCIETY_PDF_PRESIDENTS_TEMPLATE,
        ],
      ];
      for (const [, , filename] of sources) {
        expect(filename && path.isAbsolute(filename)).toBe(true);
      }
      const directory = mkdtempSync(path.join(tmpdir(), "ju-pdf-samples-"));
      const manifest = { fictionalRecipients: true, date, samples: [] };
      for (const [key, societyName, filename] of sources) {
        const bytes = readFileSync(filename);
        const prepared =
          key === "presidents"
            ? prepareLegacyPresidentSample(bytes.toString("base64"))
            : {
                content: bytes.toString("base64"),
                normalizedLegacyOrganizationLine: false,
              };
        const { content } = prepared;
        const fields = inspectLetterTemplate(content);
        const wordBindings = Object.fromEntries(
          fields.fields.map((field) => {
            const source = /^first[ _]name$/i.test(field.name)
              ? "first_names"
              : field.name === "CnAdrSal_Salutation"
                ? "salutation"
                : field.suggestedField;
            expect(LETTER_TAGS, `Map Word field ${field.name}`).toContain(
              source,
            );
            return [field.name, source];
          }),
        );
        const template = validateLetterTemplate({
          filename: `${key}.docx`,
          content,
          subject: "Your {society_name} letter",
          emailBody: "Dear {salutation}, please see your letter.",
          mergeSettings: {
            fields: LETTER_TAGS,
            dateFormat: "long_us",
            wordBindings,
            wordAddressMode: "block",
            mergeDateLabel: true,
            ...(process.env.SOCIETY_PDF_FONT_REPLACEMENT === "carlito"
              ? { fontReplacement: "carlito" }
              : {}),
          },
        });
        for (const item of cases) {
          const document = renderChecked(template, item, societyName);
          const name = `${key}-${item.key}.docx`;
          writeFileSync(path.join(directory, name), document, {
            flag: "wx",
            mode: 0o600,
          });
          manifest.samples.push({
            name,
            bytes: document.length,
            templateSha256: createHash("sha256").update(bytes).digest("hex"),
            normalizedLegacyOrganizationLine:
              prepared.normalizedLegacyOrganizationLine,
            mergeSettings: template.mergeSettings,
          });
        }
      }
      writeFileSync(
        path.join(directory, "manifest.json"),
        JSON.stringify(manifest, null, 2),
        { flag: "wx", mode: 0o600 },
      );
      console.info(`Fictional letter samples saved locally: ${directory}`);
    },
  );
});
