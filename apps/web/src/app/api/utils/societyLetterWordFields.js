import Docxtemplater from "docxtemplater";
import { LETTER_TAGS, letterError } from "@/utils/societyLetters";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const elements = (node, name) =>
  Array.from(node.getElementsByTagNameNS(W, name));
const sourceFor = (name) => {
  const key = name
    .trim()
    .toLowerCase()
    .replace(/[ .-]+/g, "_");
  return LETTER_TAGS.includes(key)
    ? key
    : { date: "letter_date", postal_code: "zip" }[key] || "";
};
const visibleText = (node) =>
  elements(node, "t")
    .map((item) => item.textContent)
    .join("");

function replaceText(node, start, length, replacement) {
  let offset = 0;
  let inserted = false;
  for (const item of elements(node, "t")) {
    const value = item.textContent;
    const end = offset + value.length;
    if (end > start && offset < start + length) {
      item.textContent =
        value.slice(0, Math.max(0, start - offset)) +
        (inserted ? "" : replacement) +
        value.slice(Math.max(0, start + length - offset));
      item.setAttribute("xml:space", "preserve");
      inserted = true;
    }
    offset = end;
  }
}

function fieldName(instruction) {
  const match =
    /^\s*MERGEFIELD\s+(?:"([^"]+)"|([^\s\\]+))(?:\s+\\\*\s+MERGEFORMAT)?\s*$/i.exec(
      instruction,
    );
  if (!match)
    throw letterError(
      "This Word merge field uses unsupported formatting or nesting. Use a plain merge field instead.",
    );
  return match[1] || match[2];
}

// Normalize only recognized mail-merge fields; preserve logos, runs and unrelated Word fields.
export function processLetterWordFields(zip, settings = null) {
  const names = new Set();
  let hasAddressBlock = false;
  let hasDateLabel = false;
  let legacy = false;
  function tag(name) {
    name = name.trim();
    if (
      !/^[A-Za-z][A-Za-z0-9_ .-]{0,79}$/.test(name) ||
      ["constructor", "prototype", "__proto__"].includes(name)
    )
      throw letterError(
        "Use a simple name for each Word merge field (up to 80 characters).",
      );
    names.add(name);
    if (names.size > 100)
      throw letterError(
        "Use no more than 100 distinct Word merge fields per template.",
      );
    return `{${name}}`;
  }
  for (const file of Object.values(zip.files).filter((f) =>
    /^word\/(?:document|header\d*|footer\d*|footnotes|endnotes)\.xml$/.test(
      f.name,
    ),
  )) {
    const doc = Docxtemplater.DocUtils.str2xml(file.asText());
    for (const simple of elements(doc, "fldSimple")) {
      const instruction = simple.getAttributeNS(W, "instr") || "";
      if (!/\bMERGEFIELD\b/i.test(instruction)) continue;
      legacy = true;
      if (
        elements(simple, "fldSimple").length ||
        elements(simple, "fldChar").length
      )
        throw letterError(
          "Nested Word merge fields are not supported. Use a plain merge field.",
        );
      const run =
        elements(simple, "r")[0]?.cloneNode(true) ||
        doc.createElementNS(W, "w:r");
      for (const child of Array.from(run.childNodes))
        if (child.localName !== "rPr") run.removeChild(child);
      const text = doc.createElementNS(W, "w:t");
      text.textContent = tag(fieldName(instruction));
      run.appendChild(text);
      simple.parentNode.replaceChild(run, simple);
    }
    for (const paragraph of elements(doc, "p")) {
      const nodes = Array.from(paragraph.getElementsByTagName("*"));
      let field = null;
      for (const node of nodes) {
        if (node.namespaceURI !== W) continue;
        if (node.localName === "fldChar") {
          const kind = node.getAttributeNS(W, "fldCharType");
          if (kind === "begin") {
            if (field)
              throw letterError(
                "Nested Word fields are not supported in letter templates.",
              );
            field = {
              nodes: [node],
              instruction: "",
              result: [],
              separated: false,
            };
          } else if (field) {
            field.nodes.push(node);
            if (kind === "separate") field.separated = true;
            if (kind === "end") {
              if (/\bMERGEFIELD\b/i.test(field.instruction)) {
                legacy = true;
                if (!field.result.length)
                  throw letterError(
                    "A Word merge field has no visible placeholder. Reinsert that field in Word.",
                  );
                field.result[0].textContent = tag(fieldName(field.instruction));
                for (const extra of field.result.slice(1))
                  extra.textContent = "";
                for (const marker of field.nodes)
                  marker.parentNode.removeChild(marker);
              }
              field = null;
            }
          }
        } else if (field && node.localName === "instrText") {
          field.instruction += node.textContent;
          field.nodes.push(node);
        } else if (field?.separated && node.localName === "t")
          field.result.push(node);
      }
      if (field && /MERGEFIELD/i.test(field.instruction))
        throw letterError(
          "A Word merge field is incomplete. Reinsert it in a single paragraph.",
        );
      const text = visibleText(paragraph);
      for (const match of [
        ...text.matchAll(/\u00ab([^\u00ab\u00bb]+)\u00bb/g),
      ].reverse()) {
        legacy = true;
        replaceText(paragraph, match.index, match[0].length, tag(match[1]));
      }
      const normalized = visibleText(paragraph);
      for (const match of normalized.matchAll(/\{([^{}]+)\}/g)) tag(match[1]);
      if (normalized.trim() === "Date") {
        hasDateLabel = true;
        if (settings?.mergeDateLabel)
          replaceText(
            paragraph,
            normalized.indexOf("Date"),
            4,
            tag("letter_date"),
          );
      }
    }
    const paragraphs = elements(doc, "p");
    const canonical = (p) =>
      visibleText(p)
        .trim()
        .replace(/\{([^{}]+)\}/g, (_, name) => `{${sourceFor(name)}}`);
    for (let i = 0; i < paragraphs.length - 1; i++) {
      if (canonical(paragraphs[i]) !== "{address_line_1}") continue;
      const second = canonical(paragraphs[i + 1]) === "{address_line_2}";
      const last = paragraphs[i + (second ? 2 : 1)];
      if (!last || !/^\{city\},?\s*\{state\}\s*\{zip\}$/.test(canonical(last)))
        continue;
      const group = paragraphs.slice(i, i + (second ? 3 : 2));
      // Collapse only an adjacent, address-only block, never arbitrary body text.
      if (group.some((p, n) => n && group[n - 1].nextSibling !== p)) continue;
      if (
        group.some((p) =>
          ["drawing", "pict", "object", "sectPr", "br", "tab"].some(
            (kind) => elements(p, kind).length,
          ),
        )
      )
        continue;
      hasAddressBlock = true;
      if (settings?.wordAddressMode === "block") {
        replaceText(group[0], 0, visibleText(group[0]).length, "{address}");
        for (const p of group.slice(1)) p.parentNode.removeChild(p);
      }
    }
    if (settings) zip.file(file.name, Docxtemplater.DocUtils.xml2str(doc));
  }
  return {
    fields: [...names].map((name) => ({
      name,
      suggestedField: sourceFor(name),
    })),
    hasAddressBlock,
    hasDateLabel,
    legacy,
  };
}

export function wordFieldSource(name, settings) {
  return settings.wordBindings?.[name] || sourceFor(name);
}
