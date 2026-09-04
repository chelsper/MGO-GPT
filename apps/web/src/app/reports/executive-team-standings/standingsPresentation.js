export const RANKING_MODES = {
  raised: { field: "fundedThisFiscalYear", label: "FY raised" },
  actions: { field: "highValueActionsThisFiscalYear", label: "High-value actions" },
};

export function numericScore(value) {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export function rankStandings(entries, mode = "raised") {
  const field = (RANKING_MODES[mode] || RANKING_MODES.raised).field;
  const sorted = entries.map((entry) => ({ ...entry, score: numericScore(entry[field]) }))
    .sort((a, b) => {
      if (a.score === null && b.score !== null) return 1;
      if (b.score === null && a.score !== null) return -1;
      return (b.score ?? 0) - (a.score ?? 0) || String(a.name).localeCompare(String(b.name)) || a.userId - b.userId;
    });
  let rank = null;
  let previousScore = null;
  return sorted.map((entry, index) => {
    if (entry.score !== null && entry.score !== previousScore) rank = index + 1;
    previousScore = entry.score;
    return { ...entry, rank: entry.score === null ? null : rank };
  });
}

export function scoreText(value, mode) {
  const score = numericScore(value);
  if (score === null) return "Unavailable";
  return new Intl.NumberFormat("en-US", mode === "raised"
    ? { style: "currency", currency: "USD", minimumFractionDigits: Number.isInteger(score) ? 0 : 2, maximumFractionDigits: 2 }
    : { maximumFractionDigits: 0 }).format(score);
}

export function coverageText(covered, active) {
  if (!active) return "No active prospects";
  return `${Math.round((Number(covered || 0) / Number(active)) * 100)}% coverage`;
}

export function comparisonChange(current, prior, mode) {
  const a = numericScore(current), b = numericScore(prior);
  if (a === null || b === null) return "Unavailable";
  const delta = a - b;
  if (delta === 0) return "No change";
  const amount = `${delta > 0 ? "+" : "-"}${scoreText(Math.abs(delta), mode)}`;
  if (b === 0) return `${amount} (no prior baseline)`;
  const percentage = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(Math.abs(delta / b * 100));
  return `${amount} (${delta > 0 ? "+" : "-"}${percentage}%)`;
}

export function periodText(period) {
  const format = (value) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
  return `${format(period.startsOn)} to ${format(period.endsOn)}`;
}
