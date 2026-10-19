import { randomUUID } from "node:crypto";
import sql from "./sql";
import { decodeResult, visitResultCsv } from "./dashboardQueryResults";
import { centsFromText, inspectRevenueQuery, publishRevenueState, readRevenueState, REVENUE_LIMITS } from "./fyRevenueGoals";
import { BUDGET_PLEDGE_QUERY_ID, installmentDate, suggestPledgeColumns, validateBudgetPledgeSource } from "@/utils/fyBudgetPledges";
import { revenueError } from "@/utils/fyRevenueGoals";
import { normalizeBudgetFundName } from "@/utils/fyBudgetCash";
import { normalizeInstallments, normalizePledge } from "@/utils/pledgePayments";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
import { adjustmentAmount, adjustmentAudit, adjustmentReason } from "./fyRevenueAdjustments";

export const BUDGET_PLEDGE_CACHE_KEY = "report:fy-revenue-goals:budget-pledges:v1";
export const readBudgetPledgeState = (db = sql) => readRevenueState(db, BUDGET_PLEDGE_CACHE_KEY);
const MAX_PLEDGES = 2000, MAX_INSTALLMENTS = 10000, PAGE_SIZE = 50;
const safeCents = value => {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw revenueError("The installment total exceeds the supported reporting range.", 422);
  return result;
};
export function inspectBudgetPledgeQuery(query, source) {
  return { ...inspectRevenueQuery(query, source, BUDGET_PLEDGE_QUERY_ID), suggested: suggestPledgeColumns((query.select_fields || []).map(field => field.query_field?.selected_field_name)) };
}

export function parseBudgetPledges(content, source, expectedRows, period) {
  if (!Number.isSafeInteger(expectedRows) || expectedRows < 0 || expectedRows > REVENUE_LIMITS.rows) throw revenueError("A completed query row count is required. Previous pledge totals are unchanged.", 422);
  const pledges = new Map(); let duplicateRows = 0, outsidePeriodRows = 0, uniqueRows = 0;
  const { rowCount } = visitResultCsv(content, { maxRows: REVENUE_LIMITS.rows,
    onHeaders(headers) {
      if (Object.values(source.columns).some(name => !headers.includes(name))) throw revenueError("A mapped installment column is missing. Reload query fields; previous totals are unchanged.", 422);
    },
    onRow(row, headers) {
      const value = key => row[headers.indexOf(source.columns[key])]?.trim() || "";
      const id = value("giftId"), date = installmentDate(value("dueDate"));
      if (!/^[1-9]\d{0,18}$/.test(id)) throw revenueError("Each installment row needs its pledge gift system record ID.", 422);
      if (!date) throw revenueError(`Pledge ${id} has an invalid installment due date. Use MM/DD/YYYY or YYYY-MM-DD.`, 422);
      const amountCents = centsFromText(value("amount"));
      if (amountCents < 0) throw revenueError(`Pledge ${id} has a negative scheduled installment amount. Check the query outputs.`, 422);
      const name = value("name"), fundName = value("fundName");
      if (name.length > 250 || !fundName || fundName.length > 250) throw revenueError(`Pledge ${id} needs a readable donor name and fund description (up to 250 characters).`, 422);
      if (date < period.startsOn || date > period.endsOn) { outsidePeriodRows++; return; }
      const previous = pledges.get(id);
      if (previous && (previous.name !== name || normalizeBudgetFundName(previous.fundName) !== normalizeBudgetFundName(fundName)))
        throw revenueError(`Pledge ${id} has conflicting names or funds. Return the primary donor and one fund per pledge; no amount was divided or counted twice.`, 422);
      const pledge = previous || { id, name, fundName, schedule: [] };
      if (pledge.schedule.some(item => item.date === date && item.amountCents === amountCents)) { duplicateRows++; return; }
      pledge.schedule.push({ date, amountCents }); pledges.set(id, pledge); uniqueRows++;
      if (pledges.size > MAX_PLEDGES || uniqueRows > MAX_INSTALLMENTS) throw revenueError("This refresh supports up to 2,000 pledges and 10,000 installments. Narrow query 31076; nothing was truncated.", 422);
    },
  });
  if (rowCount !== expectedRows) throw revenueError("The installment download count does not match the completed query. Previous totals are unchanged.", 422);
  return { pledges: [...pledges.values()], rawRows: rowCount, duplicateRows, outsidePeriodRows };
}

export function verifyBudgetPledge(candidate, gift, response) {
  if (gift?.type === "MatchingGiftPledge") throw revenueError(`Pledge ${candidate.id} is a matching-gift pledge. NXT's installment API does not support that type; a verified balance source is needed before including it.`, 422);
  let pledge, installments;
  try { pledge = normalizePledge(gift, candidate.id); installments = normalizeInstallments(response, pledge); }
  catch { throw revenueError(`Pledge ${candidate.id}'s schedule or remaining balance could not be reconciled. Refresh again after checking its NXT pledge record.`, 422); }
  // A whole installment balance cannot be allocated safely across multiple funds.
  if (!Array.isArray(gift.gift_splits) || gift.gift_splits.length !== 1 || !gift.gift_splits[0]?.fund_id)
    throw revenueError(`Pledge ${candidate.id} does not have one verified fund. Multi-fund pledges need installment-level fund allocations before they can be included.`, 422);
  const scheduledTotal = installments.reduce((sum, item) => sum + BigInt(item.amountCents), 0n);
  if (scheduledTotal !== BigInt(pledge.totalCents)) throw revenueError(`Pledge ${candidate.id}'s installment amounts do not reconcile to its full amount. Previous totals are unchanged.`, 422);
  for (const row of candidate.schedule) {
    if (!installments.some(item => item.date === row.date && item.amountCents === row.amountCents))
      throw revenueError(`Pledge ${candidate.id}'s schedule changed or its query amount is not the scheduled installment amount. Start a new refresh to read the latest query.`, 422);
  }
  // IDs from the verified schedule, not dates or names, identify actual installments.
  // This preserves separate installments even when two have the same date and amount.
  return installments.filter(item => candidate.schedule.some(row => row.date === item.date && row.amountCents === item.amountCents)).map(item => ({
    key: `${candidate.id}:${item.id}`, giftId: candidate.id, installmentId: item.id, name: candidate.name,
    fundName: candidate.fundName, dueDate: item.date, scheduledCents: item.amountCents, outstandingCents: item.balanceCents,
  }));
}

const save = (previous, changes, user, db) => publishRevenueState(previous.revision, { ...previous, ...changes, revision: randomUUID(), updatedBy: user.id }, db, BUDGET_PLEDGE_CACHE_KEY);
function completedSnapshot(job, now) {
  const rows = job.rows.filter(row => row.outstandingCents > 0).sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
  return { period: job.period, outstandingCents: safeCents(rows.reduce((sum, row) => sum + BigInt(row.outstandingCents), 0n)),
    installmentCount: rows.length, pledgeCount: new Set(rows.map(row => row.giftId)).size, checkedPledges: job.pledges.length,
    settledCount: job.rows.length - rows.length, rawRows: job.rawRows, duplicateRows: job.duplicateRows,
    outsidePeriodRows: job.outsidePeriodRows, refreshedAt: now.toISOString(), rows };
}
export async function startBudgetPledgeRefresh({ input, revision, user, transport, db = sql, now = new Date() }) {
  const source = validateBudgetPledgeSource(input), previous = await readBudgetPledgeState(db);
  if (revision !== previous.revision) throw revenueError("Pledge results changed. Reload saved status before refreshing.", 409);
  inspectBudgetPledgeQuery(await transport.metadata(), source);
  const result = await transport.execute(), period = getStandingsPeriods(now).fiscalYear;
  const parsed = parseBudgetPledges(decodeResult(result, { maxBytes: REVENUE_LIMITS.bytes }), source, result.queryJobRowCount, period);
  inspectBudgetPledgeQuery(await transport.metadata(), source);
  const job = { ...parsed, source, period, rows: [], cursor: 0, status: "running", error: null, resumeAfter: null, startedAt: now.toISOString() };
  if (!job.pledges.length) return save(previous, { source, snapshot: completedSnapshot(job, now), job: null }, user, db);
  return save(previous, { job }, user, db);
}

export async function continueBudgetPledgeRefresh({ revision, user, transport, db = sql, now = new Date(), maxPledges = 3 }) {
  const previous = await readBudgetPledgeState(db);
  if (revision !== previous.revision) throw revenueError("Pledge results changed. Reload saved status before continuing.", 409);
  if (!previous.job) return previous;
  const job = structuredClone(previous.job), period = getStandingsPeriods(now).fiscalYear;
  if (job.status === "blocked") throw revenueError("Correct the reported pledge issue, then start a new refresh. Saved totals are unchanged.", 409);
  if (job.period.startsOn !== period.startsOn || now.getTime() - Date.parse(job.startedAt) > 60 * 60 * 1000)
    throw revenueError("These balance checks are more than an hour old or belong to another fiscal year. Start a new refresh so the projection uses current balances.", 409);
  if (job.resumeAfter && Date.parse(job.resumeAfter) > now.getTime()) return previous;
  job.status = "running"; job.error = null; job.resumeAfter = null;
  const started = Date.now();
  let snapshot;
  try {
    for (let count = 0; job.cursor < job.pledges.length && count < maxPledges && Date.now() - started < 35000; count++) {
      const candidate = job.pledges[job.cursor];
      const gift = await transport.pledge(candidate.id, "gift");
      if (gift?.type === "MatchingGiftPledge") throw revenueError(`Pledge ${candidate.id} is a matching-gift pledge. NXT's installment API does not support that type; a verified balance source is needed before including it.`, 422);
      if (String(gift?.id) !== candidate.id || gift?.type !== "Pledge") throw revenueError(`System ID ${candidate.id} is not a verified pledge gift. Check the mapped System Record ID.`, 422);
      const schedule = await transport.pledge(candidate.id, "installments");
      job.rows.push(...verifyBudgetPledge(candidate, gift, schedule));
      if (job.rows.length > MAX_INSTALLMENTS) throw revenueError("More than 10,000 installments were returned. Narrow the query; no partial total was saved.", 422);
      job.cursor++;
    }
    if (job.cursor === job.pledges.length) {
      inspectBudgetPledgeQuery(await transport.metadata(), job.source);
      snapshot = completedSnapshot(job, now);
    }
  } catch (error) {
    if (error.revenueSafe) { job.status = "blocked"; job.error = error.message; }
    else {
      const throttled = error.httpStatus === 429 || Number(error.retryAfterMs) > 0;
      job.status = "paused";
      job.error = throttled ? "NXT asked us to wait. Balance checks can resume after the pause; saved totals are unchanged." : "NXT could not finish the balance check. Check the shared connection, then resume. Saved totals are unchanged.";
      if (throttled) job.resumeAfter = new Date(now.getTime() + Math.max(60000, Number(error.retryAfterMs) || 0)).toISOString();
    }
  }
  // Keep database/CAS failures outside the provider-error recovery path.
  if (snapshot) return save(previous, { source: job.source, snapshot, job: null }, user, db);
  return save(previous, { job }, user, db);
}

const adjustmentKey = (period, row) => `${period.startsOn}:${row.key}`;
export function countableInstallment(row, adjustment) {
  if (!adjustment) return { ...row, countableCents: row.outstandingCents, adjustment: null };
  const needsReview = adjustment.dueDate !== row.dueDate || adjustment.fundName !== row.fundName || adjustment.scheduledCents !== row.scheduledCents;
  // Preserve the excluded dollars after payments, and never raise the approved cap.
  const countableCents = needsReview ? 0 : Math.min(adjustment.approvedCents, Math.max(0, row.outstandingCents - adjustment.excludedCents));
  return { ...row, countableCents, adjustment: { ...adjustment, needsReview } };
}
export async function savePledgeAdjustment({ operation, input, revision, user, db = sql, now = new Date() }) {
  const previous = await readBudgetPledgeState(db), period = getStandingsPeriods(now).fiscalYear;
  if (revision !== previous.revision) throw revenueError("Pledge data changed. Reload saved installments before adjusting this amount.", 409);
  if (previous.job) throw revenueError("Finish the saved balance refresh before adjusting an installment.", 409);
  if (!previous.snapshot || previous.snapshot.period.startsOn !== period.startsOn) throw revenueError("Refresh installments for the current fiscal year first.", 409);
  if (!["adjust", "reset-adjustment"].includes(operation) || !input || Array.isArray(input) || Object.keys(input).some(key => !["key", "amount", "reason"].includes(key))) throw revenueError("Invalid installment adjustment.");
  const row = previous.snapshot.rows.find(item => item.key === input.key);
  if (!row) throw revenueError("This unpaid installment was not found. Reload the saved list.", 409);
  const reason = adjustmentReason(input.reason), key = adjustmentKey(period, row), adjustments = { ...previous.adjustments };
  const before = adjustments[key] || null;
  let after = null;
  if (operation === "adjust") {
    const approvedCents = adjustmentAmount(input.amount);
    if (approvedCents > row.outstandingCents) throw revenueError("The amount counted toward the goal cannot exceed the unpaid installment balance.");
    after = { approvedCents, excludedCents: row.outstandingCents - approvedCents, dueDate: row.dueDate, fundName: row.fundName,
      scheduledCents: row.scheduledCents, reason, updatedAt: now.toISOString(), updatedBy: String(user.name || `User ${user.id}`).slice(0, 200) };
    adjustments[key] = after;
  } else {
    if (!before) throw revenueError("This installment already uses its full unpaid balance.", 409);
    delete adjustments[key];
  }
  const history = adjustmentAudit(previous.adjustmentHistory, { operation, before: { key, value: before }, after: { key, value: after }, reason, user, now });
  return save(previous, { adjustments, adjustmentHistory: history }, user, db);
}

export function publicBudgetPledgeState(state, { page = 1, search = "" } = {}) {
  const { rows: savedRows = [], ...snapshot } = state.snapshot || {};
  const rows = savedRows.map(row => countableInstallment(row, state.adjustments?.[adjustmentKey(snapshot.period, row)]));
  if (state.snapshot) {
    snapshot.countableCents = safeCents(rows.reduce((sum, row) => sum + BigInt(row.countableCents), 0n));
    snapshot.adjustedCount = rows.filter(row => row.adjustment).length;
    snapshot.adjustmentsNeedingReview = rows.filter(row => row.adjustment?.needsReview).length;
  }
  const term = search.trim().toLocaleLowerCase("en-US");
  const matches = term ? rows.filter(row => `${row.name} ${row.fundName} ${row.giftId} ${row.dueDate}`.toLocaleLowerCase("en-US").includes(term)) : rows;
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE)), currentPage = Math.min(page, pages);
  return { revision: state.revision, source: state.source, snapshot: state.snapshot ? snapshot : null,
    rows: matches.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE), page: currentPage, pages, matchedCount: matches.length,
    job: state.job ? { status: state.job.status, completed: state.job.cursor, total: state.job.pledges.length,
      error: state.job.error, resumeAfter: state.job.resumeAfter, source: state.job.source, startedAt: state.job.startedAt } : null };
}
