export function groupLettersBySociety(items) {
  const groups = new Map();
  for (const item of items) {
    const key = item.societyKey || item.societyName || "unknown";
    if (!groups.has(key))
      groups.set(key, {
        key,
        name: item.societyName || "Society letters",
        items: [],
      });
    groups.get(key).items.push(item);
  }
  return [...groups.values()];
}

export function printReadyPdfFilename(items, selected = false) {
  const groups = groupLettersBySociety(items);
  const name = groups.length === 1 ? items[0]?.societyName : "";
  const slug = (name || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
  return `society-letters${slug ? `-${slug}` : ""}${selected ? "-selected" : ""}-print-ready.pdf`;
}
