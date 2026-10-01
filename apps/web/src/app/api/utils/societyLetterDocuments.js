import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import {
  LETTER_TAGS,
  LETTER_ADDRESS_TAGS,
  formatLetterAddress,
  letterError,
  letterMergeData,
  letterAddressMergeData,
  letterNameIssue,
  mergeLetterText,
  normalizeLetterMergeSettings,
} from "@/utils/societyLetters";
import {
  processLetterWordFields,
  wordFieldSource,
} from "./societyLetterWordFields";

export const MAX_TEMPLATE_BYTES = 1024 * 1024;
const sample = Object.fromEntries(
  LETTER_TAGS.map((tag) => [tag, `Sample ${tag.replaceAll("_", " ")}`]),
);

function validatedTemplateZip(base64) {
  const buffer = Buffer.from(base64, "base64");
  if (!buffer.length || buffer.length > MAX_TEMPLATE_BYTES)
    throw letterError("Upload a Word .docx template no larger than 1 MB.");
  const zip = new PizZip(buffer);
  const files = Object.values(zip.files).filter((file) => !file.dir);
  if (
    files.length > 200 ||
    !zip.file("word/document.xml") ||
    !zip.file("[Content_Types].xml")
  )
    throw letterError("Upload a valid Word .docx document.");
  let expanded = 0;
  for (const file of files) {
    // Pinned PizZip keeps central-directory sizes without inflating entries.
    const size = file._data?.uncompressedSize;
    if (!Number.isSafeInteger(size) || size < 0 || size > 5 * 1024 * 1024)
      throw letterError("Template contents exceed the supported limits.");
    expanded += size;
    if (
      expanded > 10 * 1024 * 1024 ||
      /(?:vbaProject|embeddings\/|activeX\/)/i.test(file.name)
    )
      throw letterError(
        "Use a small template without macros or embedded objects.",
      );
    const compressed = Buffer.from(file._data.getCompressedContent());
    const method = file._data.compressionMethod;
    const decoded =
      method === "\x08\x00"
        ? inflateRawSync(compressed, { maxOutputLength: 5 * 1024 * 1024 })
        : method === "\x00\x00"
          ? compressed
          : null;
    if (!decoded || decoded.length !== size)
      throw letterError("The template archive could not be validated.");
  }
  for (const file of files.filter((f) => /\.(xml|rels)$/i.test(f.name))) {
    const xml = file.asText();
    if (
      /<!DOCTYPE|<!ENTITY|macroEnabled|oleObject|<w:altChunk\b|TargetMode\s*=\s*["']External/i.test(
        xml,
      )
    )
      throw letterError(
        "Remove external document links, linked images, and embedded content from the template.",
      );
  }
  return zip;
}

export function inspectLetterTemplate(content) {
  return processLetterWordFields(validatedTemplateZip(content));
}

function templateDocument(base64, settings, usedFields = new Set()) {
  const zip = validatedTemplateZip(base64);
  if (settings.wordBindings) processLetterWordFields(zip, settings);
  for (const file of Object.values(zip.files)) {
    if (/^word\/.+\.xml$/.test(file.name)) {
      const xml = file.asText();
      const visible = xml.replace(/<[^>]*>/g, "");
      for (const match of visible.matchAll(/\{([^{}]+)\}/g)) {
        const field = settings.wordBindings
          ? wordFieldSource(match[1].trim(), settings)
          : match[1].trim();
        if (!LETTER_TAGS.includes(field))
          throw letterError(
            `Choose a value for Word field ${match[1].slice(0, 60)} in the template's merge-field settings.`,
          );
      }
    }
  }
  const document = new Docxtemplater(zip, {
    paragraphLoop: false,
    linebreaks: true,
    errorLogging: false,
    parser: (tag) => {
      const field = settings.wordBindings
        ? wordFieldSource(tag.trim(), settings)
        : tag.trim();
      if (!LETTER_TAGS.includes(field))
        throw letterError("Use only the listed merge fields.");
      usedFields.add(field);
      return { get: (data) => data[field] || "" };
    },
  });
  for (const field of usedFields) {
    if (!settings.fields.includes(field))
      throw letterError(
        `Select the merge field {${field}} or remove it from the Word letter before saving.`,
      );
  }
  return document;
}

export function validateLetterTemplate(raw) {
  const mergeSettings = normalizeLetterMergeSettings(raw?.mergeSettings);
  const usedFields = new Set();
  const filename = String(raw?.filename || "")
    .replace(/[^a-zA-Z0-9_. -]/g, "_")
    .slice(0, 100);
  const content = String(raw?.content || "");
  const subject = String(raw?.subject || "").trim();
  const emailBody = String(raw?.emailBody || "").trim();
  if (
    !/\.docx$/i.test(filename) ||
    content.length > 1.4 * MAX_TEMPLATE_BYTES ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(content)
  )
    throw letterError("Upload a Word .docx template, up to 1 MB.");
  if (
    !subject ||
    subject.length > 200 ||
    /[\r\n]/.test(subject) ||
    !emailBody ||
    emailBody.length > 10000
  )
    throw letterError(
      "Add an email subject (up to 200 characters) and cover message.",
    );
  try {
    templateDocument(content, mergeSettings, usedFields).render(sample);
    for (const text of [subject, emailBody]) {
      for (const match of text.matchAll(/\{([^{}]+)\}/g)) {
        const field = match[1].trim();
        if (!mergeSettings.fields.includes(field))
          throw letterError(
            `Select the merge field {${field.slice(0, 60)}} or remove it from the email before saving.`,
          );
        usedFields.add(field);
      }
    }
    mergeLetterText(subject, sample);
    mergeLetterText(emailBody, sample);
  } catch (error) {
    if (error.status) throw error;
    throw letterError(
      "The Word template could not be merged. Check that each field uses a complete {field_name} tag.",
    );
  }
  return {
    filename,
    content,
    subject,
    emailBody,
    mergeSettings,
    ...(mergeSettings.wordBindings
      ? { wordFields: inspectLetterTemplate(content) }
      : {}),
    usedFields: LETTER_TAGS.filter((field) => usedFields.has(field)),
    version: createHash("sha256")
      .update(JSON.stringify([content, subject, emailBody, mergeSettings]))
      .digest("hex"),
  };
}

export function renderSocietyLetter(template, row, today) {
  const settings = normalizeLetterMergeSettings(template.mergeSettings);
  if (!settings.wordBindings && inspectLetterTemplate(template.content).legacy)
    throw letterError(
      "This letter still uses Word mail-merge placeholders. Open Letter templates, read the Word fields, and save their mappings before previewing or creating letters.",
    );
  const data = letterMergeData(row, today, settings);
  const usedFields = new Set();
  const document = templateDocument(template.content, settings, usedFields);
  for (const value of [template.subject, template.emailBody]) {
    for (const match of String(value).matchAll(/\{([^{}]+)\}/g))
      usedFields.add(match[1].trim());
  }
  const nameIssue = letterNameIssue(row, [...usedFields]);
  if (nameIssue) throw letterError(nameIssue);
  if (
    [...usedFields].some((key) => LETTER_ADDRESS_TAGS.includes(key)) &&
    !letterAddressMergeData(row).address_line_1
  )
    throw letterError(
      "Separate address fields are not available for this recipient. Use the full mailing-address block in Letter templates, or enter the separate address fields in recipient review.",
    );
  if (usedFields.has("address") && !data.address)
    throw letterError(
      "Add a mailing address in recipient review before previewing this letter.",
    );
  document.render(data);
  return {
    document: document.toBuffer(),
    subject: mergeLetterText(template.subject, data),
    text: mergeLetterText(template.emailBody, data),
  };
}

export function renderSocietyLetterSample(
  template,
  societyName,
  period,
  today,
) {
  const addressParts = {
    address_line_1: "123 Sample Street",
    address_line_2: "Suite 200",
    city: "Example City",
    state: "FL",
    zip: "00000",
    country: "United States",
  };
  return renderSocietyLetter(
    template,
    {
      members: ["sample-primary", "sample-spouse"],
      name: "Alex Example & Jordan Example",
      firstName: "Alex",
      lastName: "Example",
      spouseFirstName: "Jordan",
      spouseLastName: "Example",
      addressee: "Alex and Jordan Example",
      salutation: "Alex and Jordan",
      address: formatLetterAddress(addressParts),
      addressParts,
      societyName,
      period,
    },
    today,
  );
}

export function letterArchive(items, templates) {
  const zip = new PizZip();
  for (const item of items) {
    const template = templates[item.templateVersion];
    if (!template)
      throw letterError(
        "The saved template version is unavailable. No mailing was marked complete.",
      );
    zip.file(
      `${item.householdId}-${item.societyKey.replace(/[^a-zA-Z0-9_-]/g, "_")}.docx`,
      renderSocietyLetter(template, item, item.letterDate).document,
    );
  }
  const archive = zip.generate({ type: "nodebuffer", compression: "DEFLATE" });
  if (archive.length > 3500000)
    throw letterError(
      "This batch exceeds the download size limit. Open its recipients and download the individual letters instead.",
      413,
    );
  return archive;
}
