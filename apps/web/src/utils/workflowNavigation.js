const RETURN_PAGES = {
  "/": "Home",
  "/reports": "Reports",
  "/my-top-prospects": "Top Prospects",
  "/prospect-pool": "Prospect Pool",
  "/follow-ups": "Follow-ups & Discussion",
  "/team-discussion": "Follow-ups & Discussion",
  "/constituent-lookup": "Find a Constituent",
  "/import-history": "Import History",
  "/constituency-import": "Constituency Import",
  "/submissions": "Work Queue",
  "/pledge-payments": "Pledge Payments",
  "/prospect-exports": "Top Prospect Exports",
  "/setup": "Setup Hub",
  "/stewardship": "Stewardship",
  "/stewardship/society-letters": "Society Letter Creation",
};

export function getSafeInternalReturnPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "";
  // Reject URL-parser normalization tricks and never navigate to API/auth routes.
  if (/[\\\u0000-\u0020\u007f]/.test(value) || /%(?:0[0-9a-f]|1[0-9a-f]|5c|7f)/i.test(value)) return "";
  try {
    const url = new URL(value, "https://navigation.invalid");
    if (url.origin !== "https://navigation.invalid") return "";
    const report = /^\/reports\/(?:future-made-phase-ii|alumni-family-engagement|executive-team-standings|(?:dashboards|custom-field)\/[a-zA-Z0-9_-]+)$/.test(url.pathname);
    return Object.hasOwn(RETURN_PAGES, url.pathname) || report
      ? `${url.pathname}${url.search}${url.hash}` : "";
  } catch { return ""; }
}

export function getReturnDestination(value, fallback = "/") {
  const href = getSafeInternalReturnPath(value) || getSafeInternalReturnPath(fallback) || "/";
  const url = new URL(href, "https://navigation.invalid");
  let name = RETURN_PAGES[url.pathname] || "Report";
  if (url.pathname === "/my-top-prospects" && url.searchParams.get("tab") === "portfolio") name = "My Portfolio";
  const run = url.searchParams.get("queueRun");
  if (url.pathname === "/constituency-import" && /^[1-9]\d{0,17}$/.test(run || "")) name = `Import Batch #${run}`;
  return { href, label: `Back to ${name}` };
}

export function buildImportBatchHref(runId, rowId) {
  if (!/^[1-9]\d{0,17}$/.test(String(runId || ""))) return "/constituency-import";
  const params = new URLSearchParams({ queueRun: String(runId) });
  if (/^[1-9]\d{0,17}$/.test(String(rowId || ""))) params.set("queueRow", String(rowId));
  return `/constituency-import?${params}`;
}

export function getImportReturnPath(value, fallback = "/import-history") {
  const path = getSafeInternalReturnPath(value);
  if (!path) return fallback;
  const url = new URL(path, "https://navigation.invalid");
  if (url.pathname === "/constituency-import") return buildImportBatchHref(url.searchParams.get("queueRun"), url.searchParams.get("queueRow"));
  return url.pathname === "/import-history" ? path : fallback;
}
