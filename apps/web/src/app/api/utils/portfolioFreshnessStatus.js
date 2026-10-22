export function portfolioFreshnessStatus(ids, rows, now = Date.now()) {
  const byId = new Map(rows.map(row => [String(row.constituent_id), row]));
  let missing = 0, delayed = 0;
  const dates = [];
  for (const id of ids) {
    const row = byId.get(String(id));
    const checked = Date.parse(row?.giving_refreshed_at || "");
    if (!row?.summary_payload || !row?.giving_payload || !Number.isFinite(checked) || checked > now) missing++;
    else dates.push(checked);
    const summaryDue = Date.parse(row?.stale_after || "");
    if ((Number.isFinite(checked) && now - checked > 48 * 3600000) ||
        (Number.isFinite(summaryDue) && now - summaryDue > 24 * 3600000)) delayed++;
  }
  // The newest completed item must not make an old portfolio look current.
  return { missing, delayed, givingUpdatedAt: !missing && dates.length
    ? new Date(Math.min(...dates)).toISOString() : null };
}
