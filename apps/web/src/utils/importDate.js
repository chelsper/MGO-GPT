// Keep full-date validation identical in preview, automatic completion, and apply.
// Two-digit years retain the import's existing rolling-century convention.
export function parseImportDate(value) {
  const normalized = String(value ?? "").trim();
  const iso = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  const us = normalized.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/);
  if (!iso && !us) return null;
  const yearText = iso?.[1] ?? us[3];
  const year = Number(yearText);
  const month = Number(iso?.[2] ?? us[1]);
  const day = Number(iso?.[3] ?? us[2]);
  const resolvedYear = yearText.length === 2
    ? (year <= new Date().getUTCFullYear() % 100 ? 2000 + year : 1900 + year)
    : year;
  if (resolvedYear < 1000) return null;
  const date = new Date(Date.UTC(resolvedYear, month - 1, day));
  if (date.getUTCFullYear() !== resolvedYear || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return { y: resolvedYear, m: month, d: day };
}
