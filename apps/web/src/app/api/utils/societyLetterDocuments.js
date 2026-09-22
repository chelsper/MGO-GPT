import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import { createHash } from "node:crypto";
import { inflateRawSync } from "node:zlib";
import {
  LETTER_TAGS,
  letterError,
  letterMergeData,
  mergeLetterText,
} from "@/utils/societyLetters";

export const MAX_TEMPLATE_BYTES = 1024 * 1024;
const sample = Object.fromEntries(
  LETTER_TAGS.map((tag) => [tag, `Sample ${tag.replaceAll("_", " ")}`]),
);

function templateDocument(base64) {
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
    if (/^word\/.+\.xml$/.test(file.name)) {
      const visible = xml.replace(/<[^>]*>/g, "");
      for (const match of visible.matchAll(/\{([^{}]+)\}/g)) {
        if (!LETTER_TAGS.includes(match[1].trim()))
          throw letterError(
            `Unsupported merge field: ${match[1].slice(0, 60)}. Use only the listed fields.`,
          );
      }
    }
  }
  return new Docxtemplater(zip, {
    paragraphLoop: false,
    linebreaks: true,
    errorLogging: false,
    parser: (tag) => {
      if (!LETTER_TAGS.includes(tag.trim()))
        throw letterError("Use only the listed merge fields.");
      return { get: (data) => data[tag.trim()] || "" };
    },
  });
}

export function validateLetterTemplate(raw) {
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
    templateDocument(content).render(sample);
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
    version: createHash("sha256")
      .update(JSON.stringify([content, subject, emailBody]))
      .digest("hex"),
  };
}

export function renderSocietyLetter(template, row, today) {
  const data = letterMergeData(row, today);
  const document = templateDocument(template.content);
  document.render(data);
  return {
    document: document.toBuffer(),
    subject: mergeLetterText(template.subject, data),
    text: mergeLetterText(template.emailBody, data),
  };
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
