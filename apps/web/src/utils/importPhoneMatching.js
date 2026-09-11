function phoneKey(value) {
  const text = String(value ?? "").trim().toLowerCase();
  const extension = text.match(/(?:ext(?:ension)?\.?|x|#)\s*(\d+)$/);
  const base = extension ? text.slice(0, extension.index).trim() : text;
  if (!/^[+\d\s().-]+$/.test(base)) return text;
  let digits = base.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) digits = digits.slice(1);
  return digits ? `${digits}${extension ? `x${extension[1]}` : ""}` : "";
}

export function importPhonesMatch(a, b) {
  const key = phoneKey(a);
  return Boolean(key && key === phoneKey(b));
}
