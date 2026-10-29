const DAY = 86400000;
const result = (status, reason) => ({ status, reason });

// NXT fuzzy dates are ranges, not guessed dates. Old year-only end dates can
// be excluded conclusively; uncertainty near the six-month cutoff needs review.
export function boardDateRange(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  let y, m, d, match;
  if ((match = text.match(/^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/))) [, y, m, d] = match;
  else if ((match = text.match(/^(\d{1,2})\/(?:(\d{1,2})\/)?(\d{4})$/))) [, m, d, y] = match;
  else return { invalid: true };
  y = Number(y); m = m === undefined ? null : Number(m); d = d === undefined ? null : Number(d);
  if (y < 1000 || y > 9999 || (m !== null && (m < 1 || m > 12)) ||
      (d !== null && (d < 1 || d > new Date(Date.UTC(y, m, 0)).getUTCDate()))) return { invalid: true };
  const min = Date.UTC(y, (m ?? 1) - 1, d ?? 1);
  return { min, max: d === null ? Date.UTC(y, m ?? 12, 0) : min };
}

function sixMonthsAfter(time) {
  const date = new Date(time), month = date.getUTCMonth() + 6;
  const last = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
  return Date.UTC(date.getUTCFullYear(), month, Math.min(date.getUTCDate(), last));
}

function exactTerm(start, end, fyStart, fyEnd) {
  if (start > end) return "review";
  if (end < fyStart || start > fyEnd) return "excluded";
  if (end > fyEnd) return "included";
  return end + DAY >= sixMonthsAfter(Math.max(start, fyStart)) ? "included" : "excluded";
}

function termEligibility(term, fyStart, fyEnd) {
  const start = boardDateRange(term.start), end = boardDateRange(term.end);
  if (!end) return result("included", "Trustee end date is blank");
  if (end.invalid) return result("review", "Trustee end date is invalid");
  if (end.max < fyStart) return result("excluded", "Trustee service ended before this fiscal year");
  if (start?.invalid) return result("review", "Trustee start date is invalid");
  if (start?.min > fyEnd) return result("excluded", "Trustee service began after this fiscal year");
  if (!start && end.min > fyEnd) return result("included", "Trustee end date is after this fiscal year");
  const starts = start ? [start.min, start.max] : [fyStart, Math.min(end.max, fyEnd)];
  const statuses = new Set(starts.flatMap(from => [end.min, end.max].map(to => exactTerm(from, to, fyStart, fyEnd))));
  if (statuses.size !== 1 || statuses.has("review"))
    return result("review", "Complete Trustee service dates are needed to confirm six months in this fiscal year");
  const status = [...statuses][0];
  return result(status, status === "included" ? (end.min > fyEnd ? "Trustee service continued beyond this fiscal year" : "At least six months of Trustee service in this fiscal year") : "Less than six months of Trustee service in this fiscal year");
}

export function evaluateBoardService(records, fiscalYear) {
  const terms = records.filter(row => row.code.trim().toLowerCase() === "trustee");
  if (!terms.length) return result("excluded", "No Trustee code returned; Trustee-Former does not establish service dates");
  const fyStart = Date.UTC(fiscalYear - 1, 6, 1), fyEnd = Date.UTC(fiscalYear, 5, 30);
  // Blank Trustee end dates qualify explicitly, even when Trustee-Former is also present.
  if (terms.some(term => !term.end.trim())) return result("included", "Trustee end date is blank");
  const decisions = terms.map(term => termEligibility(term, fyStart, fyEnd));
  const relevant = terms.filter((term, i) => decisions[i].status !== "excluded" ||
    (boardDateRange(term.end)?.max >= fyStart && boardDateRange(term.start)?.min <= fyEnd));
  const endsByStart = new Map();
  for (const term of relevant) {
    const key = JSON.stringify(boardDateRange(term.start));
    const end = JSON.stringify(boardDateRange(term.end));
    if (endsByStart.has(key) && endsByStart.get(key) !== end)
      return result("review", "Trustee records have conflicting end dates for the same service start");
    endsByStart.set(key, end);
  }
  const included = decisions.find(item => item.status === "included");
  if (included) return included;
  const review = decisions.find(item => item.status === "review");
  if (review) return review;
  // Merge overlapping or adjacent exact terms so duplicated/renewed terms do not
  // inflate time served. Nonconsecutive short terms near six months need review.
  const intervals = relevant.map(term => ({ from: boardDateRange(term.start), to: boardDateRange(term.end) }))
    .filter(term => term.from?.min === term.from?.max && term.to?.min === term.to?.max && term.from && term.to)
    .map(term => [Math.max(term.from.min, fyStart), Math.min(term.to.max, fyEnd)])
    .filter(([from, to]) => from <= to).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const interval of intervals) {
    const last = merged.at(-1);
    if (last && interval[0] <= last[1] + DAY) last[1] = Math.max(last[1], interval[1]);
    else merged.push([...interval]);
  }
  if (merged.some(([from, to]) => to + DAY >= sixMonthsAfter(from)))
    return result("included", "At least six months of continuous Trustee service across service records");
  if (merged.length > 1 && merged.reduce((days, [from, to]) => days + (to - from) / DAY + 1, 0) >= 181)
    return result("review", "Multiple nonconsecutive Trustee terms need a six-month eligibility review");
  return decisions[0];
}
