import { randomUUID } from "node:crypto";
import sql from "./sql";
import { publishRevenueState, readRevenueState } from "./fyRevenueGoals";
import { UNRESTRICTED_GOAL_CONFIG } from "./fyUnrestrictedGoal";
import { revenueError } from "@/utils/fyRevenueGoals";
import { installmentDate } from "@/utils/fyBudgetPledges";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

export const MANUAL_GOAL_CACHE_KEY = "report:fy-revenue-goals:manual-cash:v1";
export const readManualGoalState = (db = sql) => readRevenueState(db, MANUAL_GOAL_CACHE_KEY);
export function adjustmentAmount(value) {
  if (typeof value !== "string" || !/^\d{1,13}(\.\d{1,2})?$/.test(value.trim())) throw revenueError("Enter a dollar amount with up to two decimal places.");
  const [whole, fraction = ""] = value.trim().split(".");
  const cents = Number(BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
  if (!Number.isSafeInteger(cents)) throw revenueError("That amount is outside the supported range.");
  return cents;
}
export function adjustmentReason(value) {
  if (typeof value !== "string" || !value.trim() || value.trim().length > 500) throw revenueError("Add a reason of up to 500 characters.");
  return value.trim();
}
export function adjustmentAudit(history = [], { operation, before, after, reason, user, now }) {
  if (history.length >= 10000) throw revenueError("This adjustment history is full. Ask an administrator to preserve the history before adding more changes.", 409);
  return [...history, { operation, before, after, reason, by: String(user.name || `User ${user.id}`).slice(0, 200), userId: user.id, at: now.toISOString() }];
}
const seedEntries = () => UNRESTRICTED_GOAL_CONFIG.fixedContributions.map(item => ({ ...item, receivedDate: null, origin: "initial", archived: false,
  reason: "Previously confirmed cash received, separate from budget-relieving cash query 31075." }));
function entriesFor(state) {
  if (state.entries && state.period !== UNRESTRICTED_GOAL_CONFIG.startsOn) throw revenueError("The saved manual entries belong to another fiscal year. Update the fiscal-year configuration before continuing.", 409);
  return state.entries || seedEntries();
}
export function manualGoalConfig(state) {
  const entries = entriesFor(state), active = entries.filter(item => !item.archived);
  const total = active.reduce((sum, item) => sum + BigInt(item.cents), 0n);
  if (!Number.isSafeInteger(Number(total))) throw revenueError("Manual cash entries exceed the supported reporting range.", 422);
  return { ...UNRESTRICTED_GOAL_CONFIG, fixedContributions: active.map(({ key, label, cents }) => ({ key, label, cents })),
    manual: { revision: state.revision, entries, history: (state.history || []).slice(-25).reverse(), historyCount: state.history?.length || 0 } };
}
export const readManualGoalConfig = async (db = sql) => manualGoalConfig(await readManualGoalState(db));

export async function saveManualGoalEntry({ operation, input, revision, user, db = sql, now = new Date() }) {
  const previous = await readManualGoalState(db), period = getStandingsPeriods(now).fiscalYear;
  if (previous.revision !== revision) throw revenueError("Manual entries changed. Reload them before saving so another person's changes are kept.", 409);
  if (period.startsOn !== UNRESTRICTED_GOAL_CONFIG.startsOn) throw revenueError("Update this dashboard's fiscal-year goal before changing manual cash entries.", 409);
  if (!input || Array.isArray(input) || Object.keys(input).some(key => !["key", "label", "amount", "receivedDate", "reason", "confirmed"].includes(key))) throw revenueError("Invalid manual cash entry.");
  if (!["save", "archive", "restore"].includes(operation)) throw revenueError("Unknown manual cash operation.");
  const entries = structuredClone(entriesFor(previous));
  const index = input.key ? entries.findIndex(item => item.key === input.key) : -1;
  if ((input.key && index < 0) || (operation !== "save" && index < 0)) throw revenueError("This cash entry was not found. Reload the entries.", 409);
  const before = index >= 0 ? entries[index] : null, reason = adjustmentReason(input.reason);
  if (operation !== "archive" && input.confirmed !== true) throw revenueError("Confirm this is received cash not already counted by either query or another manual entry.");
  let after;
  if (operation === "save") {
    if (before?.archived) throw revenueError("Restore the archived entry before editing it.", 409);
    if (!before && entries.length >= 1000) throw revenueError("This fiscal year supports up to 1,000 manual entries.", 422);
    if (typeof input.label !== "string" || !input.label.trim() || input.label.trim().length > 150) throw revenueError("Enter a description of up to 150 characters.");
    const cents = adjustmentAmount(input.amount);
    if (cents <= 0) throw revenueError("Received cash must be greater than zero. Archive an entry to remove it from the total.");
    const receivedDate = installmentDate(input.receivedDate);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
    if (!(before?.origin === "initial" && input.receivedDate === "") && (!receivedDate || receivedDate < period.startsOn || receivedDate > period.endsOn || receivedDate > today))
      throw revenueError("Use an actual receipt date in this fiscal year, no later than today.");
    after = { key: before?.key || randomUUID(), label: input.label.trim(), cents, receivedDate, origin: before?.origin || "manual", archived: false, reason };
  } else {
    if (before.archived === (operation === "archive")) throw revenueError("That entry already has this status. Reload the entries.", 409);
    after = { ...before, archived: operation === "archive", reason };
  }
  const normalized = value => value.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!after.archived && entries.some(item => item.key !== after.key && !item.archived && normalized(item.label) === normalized(after.label)))
    throw revenueError("An active entry already uses that description. Edit it instead, or use a distinct receipt reference.", 409);
  after.updatedAt = now.toISOString(); after.updatedBy = String(user.name || `User ${user.id}`).slice(0, 200);
  if (index < 0) entries.push(after); else entries[index] = after;
  const state = { revision: randomUUID(), period: period.startsOn, entries,
    history: adjustmentAudit(previous.history, { operation, before, after, reason, user, now }) };
  manualGoalConfig(state);
  await publishRevenueState(revision, state, db, MANUAL_GOAL_CACHE_KEY);
  return manualGoalConfig(state);
}
