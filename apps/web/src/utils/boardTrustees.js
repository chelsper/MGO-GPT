export const BOARD_TRUSTEES_KEY = "board-of-trustees";
export const BOARD_MEMBERSHIP_RULE = "trustee-service-six-months-v2";
export const BOARD_SERVICE_COLUMNS = Object.freeze({ code: "Constituency Code", start: "Constituency Date From", end: "Constituency Date To" });
export const BOARD_DEFAULT_SOURCES = Object.freeze([
  [2027, "31092"],
  [2026, "31093"],
  [2025, "31094"],
  [2024, "31095"],
  [2023, "31096"],
  [2022, "31097"],
  [2021, "31098"],
  [2020, "31099"],
  [2019, "31100"],
  [2018, "31101"],
  [2017, "31102"],
].map(([fiscalYear, queryId]) => {
  const fy = `FY${String(fiscalYear).slice(-2)}`;
  return Object.freeze({ fiscalYear, queryId, queryName: `${fy} BoT Giving - MGOGPT`,
    columns: Object.freeze({ name: "Name", cash: `Total Gifts ${fy} (Cash)`,
      commitments: `Total Pledges or Planned Gifts ${fy}`, ...BOARD_SERVICE_COLUMNS }),
  });
}));
export const BOARD_INITIAL_SOURCE = BOARD_DEFAULT_SOURCES[0];

export const boardError = (message, status = 400) => Object.assign(new Error(message), { boardSafe: true, status });
export const boardYearLabel = year => `FY${String(year).slice(-2)}`;
export const boardPeriodLabel = year => `July 1, ${year - 1} through June 30, ${year}`;
export const boardMoney = cents => Number.isSafeInteger(cents)
  ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100) : "Not reported";
export const boardPercent = rate => rate === null ? "Unavailable" :
  new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 }).format(rate);
export const boardCashStatus = row => !Number.isSafeInteger(row.cashCents) ? "Cash not reported" :
  row.cashCents > 0 ? "Participating" : "No positive cash";
export const boardSnapshotIsCurrent = snapshot => snapshot?.eligibility?.rule === BOARD_MEMBERSHIP_RULE;

export function boardParticipation(snapshot) {
  if (!snapshot) return { total: null, participants: null, unknown: 0, rate: null };
  const total = snapshot.trustees.length;
  const participants = snapshot.trustees.filter(row => Number.isSafeInteger(row.cashCents) && row.cashCents > 0).length;
  const unknown = snapshot.trustees.filter(row => !Number.isSafeInteger(row.cashCents)).length;
  return { total, participants, unknown,
    rate: boardSnapshotIsCurrent(snapshot) && !snapshot.eligibility.reviewCount && total > 0 && total === snapshot.trusteeCount && !unknown ? participants / total : null };
}

export function boardParticipationChange(entries, fiscalYear) {
  const rate = boardParticipation(entries.find(entry => entry.source.fiscalYear === fiscalYear)?.snapshot).rate;
  const previous = boardParticipation(entries.find(entry => entry.source.fiscalYear === fiscalYear - 1)?.snapshot).rate;
  // Compare unrounded rates, and only adjacent fiscal years with complete cash data.
  return rate === null || previous === null ? null : (rate - previous) * 100;
}

export function boardPointChange(points) {
  if (points === null) return "Unavailable";
  const rounded = Math.round(Math.abs(points) * 10) / 10;
  return `${rounded ? (points > 0 ? "+" : "-") : ""}${rounded} percentage points`;
}

export function boardYearStage(fiscalYear, refreshedAt) {
  const date = new Date(refreshedAt);
  if (!refreshedAt || !Number.isFinite(date.getTime())) return "Not refreshed";
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(date).map(part => [part.type, part.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  if (day < `${fiscalYear - 1}-07-01`) return "Before fiscal year";
  return day <= `${fiscalYear}-06-30` ? "Year to date" : "Completed fiscal year";
}

export function validateBoardTarget(input) {
  if (!input || !Number.isInteger(input.fiscalYear) || input.fiscalYear < 2000 || input.fiscalYear > 2100)
    throw boardError("Enter a fiscal year ending between 2000 and 2100, such as 2027 for FY27.");
  if (typeof input.queryId !== "string" || !/^[1-9]\d{0,9}$/.test(input.queryId))
    throw boardError("Enter the NXT query system record ID.");
  return { fiscalYear: input.fiscalYear, queryId: input.queryId };
}

export function validateBoardSource(input) {
  const target = validateBoardTarget(input);
  if (Object.keys(input).some(key => !["fiscalYear", "queryId", "queryName", "columns"].includes(key)) ||
      typeof input.queryName !== "string" || !input.queryName.trim() || input.queryName.length > 250)
    throw boardError("Load the fiscal-year query fields before saving.");
  const keys = ["name", "cash", "commitments", "code", "start", "end"];
  // Older saved mappings can be upgraded by loading fields; they cannot bypass service filtering on refresh.
  const expected = Object.keys(input.columns || {}).length === 3 ? keys.slice(0, 3) : keys;
  if (!input.columns || Array.isArray(input.columns) || Object.keys(input.columns).length !== expected.length ||
      expected.some(key => typeof input.columns[key] !== "string" || !input.columns[key].trim() || input.columns[key].length > 200) ||
      new Set(Object.values(input.columns)).size !== expected.length)
    throw boardError("Choose distinct name, cash, commitment, constituency code, start-date and end-date fields.");
  return { ...target, queryName: input.queryName.trim(), columns: { ...input.columns } };
}

export function suggestBoardColumns(fields, fiscalYear) {
  const fy = boardYearLabel(fiscalYear).toLowerCase();
  const choose = predicate => { const matches = fields.filter(predicate); return matches.length === 1 ? matches[0] : ""; };
  return {
    name: choose(name => /^(?:constituent )?name$/i.test(name)),
    cash: choose(name => name.toLowerCase().includes(fy) && /cash/i.test(name)),
    commitments: choose(name => name.toLowerCase().includes(fy) && /pledge/i.test(name) && /planned/i.test(name)),
    ...Object.fromEntries(Object.entries(BOARD_SERVICE_COLUMNS).map(([key, label]) => [key, choose(name => name.toLowerCase() === label.toLowerCase())])),
  };
}
