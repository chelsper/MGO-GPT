// Never infer a country/area code, translate letters, or dial a list of numbers.
export function outreachPhoneHref(value) {
  if (typeof value !== "string" || /[\r\n\x00-\x1f\x7f]/.test(value)) return null;
  const match = /^(\+?[\d ().-]+?)(?:\s*(?:ext\.?|x)\s*(\d{1,8}))?$/i.exec(value.trim());
  if (!match) return null;
  const number = match[1].replace(/[ ().-]/g, "");
  if (!/^\+?\d{7,15}$/.test(number)) return null;
  return `tel:${number}${match[2] ? `;ext=${match[2]}` : ""}`;
}

export function outreachContactRows(person) {
  const seen = new Set();
  return [
    ["Phone", "phone", person?.phones],
    ["Alternate phone", "phone", person?.alternatePhones],
    ["Email", "email", person?.emails],
  ].flatMap(([label, type, values]) => (values || []).flatMap(raw => {
    const value = String(raw ?? "").trim();
    if (!value) return [];
    const href = type === "phone" ? outreachPhoneHref(value) : null;
    const key = `${type}:${href || value}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{key, label, type, value, href}];
  }));
}
