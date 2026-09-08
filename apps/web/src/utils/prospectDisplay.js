function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function isPlaceholderProspectName(value) {
  const name = cleanText(value);
  return !name || /^(?:NXT\s+)?constituent\s+(?:ID[:\s]*)?\d+$/i.test(name) ||
    /^(?:Unnamed constituent|Unknown constituent|Imported prospect)$/i.test(name);
}

export function fiscalYearForOpportunityDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const year = date.getUTCFullYear() + (date.getUTCMonth() >= 6 ? 1 : 0);
  return `FY${String(year).slice(-2)}`;
}

export function withProspectDisplayData(prospect, opportunities) {
  const {
    cached_constituent_name: cachedName,
    cached_summary_name: summaryName,
    linked_constituent_name: linkedName,
    open_opportunity_dates: storedDates,
    ...record
  } = prospect;
  const resolvedName = [record.prospect_name, linkedName, cachedName, summaryName]
    .find((name) => !isPlaceholderProspectName(name));
  const dates = Array.isArray(opportunities)
    ? opportunities.filter((item) => item.opportunity_status === "Active")
      .map((item) => item.expected_date)
    : Array.isArray(storedDates) ? storedDates : null;
  const years = dates?.map(fiscalYearForOpportunityDate) || [];

  return {
    ...record,
    prospect_name: resolvedName ? cleanText(resolvedName) : record.prospect_name,
    name_status: resolvedName ? "loaded" : "unavailable",
    // Unknown is distinct from having no open opportunities, especially while
    // an older API response is still in the browser cache.
    open_opportunity_fys: dates ? [...new Set(years.filter(Boolean))].sort() : null,
    open_opportunity_undated_count: dates ? years.filter((year) => !year).length : null,
  };
}

export function getProspectFiscalYearLabel(prospect) {
  if (prospect.status !== "Active") return prospect.expected_close_fy || "FY not set";
  if (!Array.isArray(prospect.open_opportunity_fys)) return "Open opportunity years unavailable";
  const years = [...prospect.open_opportunity_fys];
  if (prospect.open_opportunity_undated_count > 0) years.push("date not set");
  return years.length ? `Open opportunities: ${years.join(", ")}` : "No open opportunities";
}

export function matchesProspectFiscalYear(prospect, year) {
  if (year === "all") return true;
  return prospect.status === "Active"
    ? (prospect.open_opportunity_fys || []).includes(year)
    : prospect.expected_close_fy === year;
}
