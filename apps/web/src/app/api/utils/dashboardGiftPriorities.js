import { createHash } from "node:crypto";
import sql from "./sql";
import { getReportRefreshUser } from "./reportRefresh";
import { societySourceScope, SOCIETY_SOURCE_VERSION } from "./societyGivingSource";
import { calendarDate, formatCalendarDate } from "@/utils/prospectActivity";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
import { dashboardReminderPolicy } from "@/utils/dashboardAssistantSettings";

export const GIFT_PRIORITY_LIMIT = 200;
const SOURCE_MAX_AGE = 36 * 60 * 60 * 1000;
const ASSIGNMENT_MAX_AGE = 72 * 60 * 60 * 1000;
// This first pass covers direct monetary receipts, not commitments, soft
// credits, or non-cash gifts whose valuation/realization needs more context.
const RECEIVED_TYPES = new Set(["cash", "donation", "paycash", "pledgepayment", "pledgepaycash",
  "recurringgiftpayment", "recurringgiftpaycash", "matchinggiftpayment", "matchinggiftpaycash"]);
const numericId = value => /^[1-9]\d*$/.test(String(value || ""));
const token = value => typeof value === "string" ? value.toLowerCase().replace(/[^a-z0-9]/g, "") : "";
const fresh = (value, now, age) => typeof value === "string" && Number.isFinite(Date.parse(value)) &&
  Date.parse(value) <= now.getTime() && now.getTime() - Date.parse(value) <= age;
const unavailable = () => ({ items: [], truncated: false, coverage: { status: "unavailable" } });
export function giftPriorityRevision(gift) {
  return createHash("sha256").update(JSON.stringify([String(gift.id), String(gift.constituent_id),
    calendarDate(gift.date), gift.amount?.value, token(gift.type)])).digest("hex");
}
export function giftPriorityWindow(now = new Date(), settings) {
  const end = getStandingsPeriods(now).asOf;
  const start = new Date(`${end}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() - (dashboardReminderPolicy(settings).recentGiftDays - 1));
  return { start: start.toISOString().slice(0, 10), end };
}

export function buildGiftPriorities(saved, now = new Date(), settings) {
  const policy = dashboardReminderPolicy(settings);
  const source = saved?.active_metadata;
  const window = giftPriorityWindow(now, policy);
  const start = calendarDate(source?.startDate), end = calendarDate(source?.endDate);
  if (source?.version !== SOCIETY_SOURCE_VERSION || !fresh(source?.checkedAt, now, SOURCE_MAX_AGE) ||
      !fresh(saved?.assignments_checked_at, now, ASSIGNMENT_MAX_AGE) || !start || !end || start > end ||
      start > window.end || end < window.start || end > now.toISOString().slice(0, 10) ||
      !Array.isArray(saved?.gifts)) return unavailable();
  const coverage = { status: start > window.start || end < window.end ? "partial" : "ready",
    startDate: start > window.start ? start : window.start, endDate: end < window.end ? end : window.end,
    checkedAt: source.checkedAt, assignmentsCheckedAt: saved.assignments_checked_at };
  const byId = new Map(), conflicts = new Set();
  for (const row of saved.gifts) {
    const gift = row?.gift;
    if (!numericId(gift?.id)) continue;
    const id = String(gift.id), constituentId = String(gift.constituent_id || "");
    const date = calendarDate(gift.date), amount = gift.amount?.value, type = token(gift.type);
    const valid = numericId(constituentId) && constituentId === String(row.constituent_id) && date &&
      date >= coverage.startDate && date <= coverage.endDate && typeof amount === "number" &&
      Number.isFinite(amount) && amount > policy.giftMinimum && RECEIVED_TYPES.has(type);
    if (!valid) { conflicts.add(id); continue; }
    const revision = giftPriorityRevision(gift);
    if (byId.has(id) && byId.get(id).revision !== revision) conflicts.add(id);
    const name = String(row.name || "").trim().slice(0, 200) || "Portfolio constituent";
    const value = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(amount);
    const params = new URLSearchParams({ mode: "action", actionType: "Stewardship", donor: name,
      blackbaudConstituentId: constituentId, returnTo: "/" });
    byId.set(id, {
      key: `gift:${id}`, revision, kind: "gift", title: `${value} gift`, constituentName: name,
      constituentId, giftId: id, giftAmount: amount, dueDate: date, timing: "A chance to say thank you",
      message: `A ${value} gift was recorded on ${formatCalendarDate(date, { month: "short", day: "numeric", year: "numeric" })}. Would a thank-you or another stewardship touch be helpful?`,
      href: `/action-opportunity-update?${params}`, linkLabel: "Log stewardship action", savedAt: source.checkedAt,
    });
  }
  const items = [...byId.entries()].filter(([id]) => !conflicts.has(id)).map(([, item]) => item)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate) || a.key.localeCompare(b.key));
  return { items: items.slice(0, GIFT_PRIORITY_LIMIT), truncated: saved.truncated === true || items.length > GIFT_PRIORITY_LIMIT, coverage };
}

export async function readSavedPortfolioGifts({ scopeKey, workspaceId, now = new Date(), db = sql, settings }) {
  const policy = dashboardReminderPolicy(settings);
  const window = giftPriorityWindow(now, policy);
  // Read the published generation and its gifts in one MVCC statement. Do not
  // read pending pages, start refreshes, or fall back to a provider request.
  const rows = await db`
    WITH portfolio AS (
      SELECT u.blackbaud_portfolio_cached_at AS checked_at, person
      FROM users u CROSS JOIN LATERAL jsonb_array_elements(
        CASE WHEN jsonb_typeof(u.blackbaud_portfolio_cache->'leadSolicitor') = 'array'
          THEN u.blackbaud_portfolio_cache->'leadSolicitor' ELSE '[]'::jsonb END ||
        CASE WHEN jsonb_typeof(u.blackbaud_portfolio_cache->'supportingSolicitor') = 'array'
          THEN u.blackbaud_portfolio_cache->'supportingSolicitor' ELSE '[]'::jsonb END
      ) person WHERE u.id = ${workspaceId} AND u.active = TRUE
    ), source AS (
      SELECT * FROM society_giving_sources WHERE scope_key = ${scopeKey}
    ), gifts AS MATERIALIZED (
      SELECT gift FROM society_giving_source_pages p JOIN source s
        ON p.scope_key = s.scope_key AND p.generation = s.active_generation
      CROSS JOIN LATERAL jsonb_array_elements(p.gifts) gift
    ), candidates AS (
      SELECT gift->>'id' AS id, MAX(gift->>'date') AS latest_date FROM gifts
      WHERE EXISTS (SELECT 1 FROM portfolio WHERE person->>'constituentId' = gift->>'constituent_id')
        AND LEFT(gift->>'date', 10) >= ${window.start} AND LEFT(gift->>'date', 10) <= ${window.end}
        AND CASE WHEN jsonb_typeof(gift #> '{amount,value}') = 'number'
          THEN (gift #>> '{amount,value}')::numeric > ${policy.giftMinimum} ELSE FALSE END
        AND regexp_replace(LOWER(gift->>'type'), '[^a-z0-9]', '', 'g')
          IN (SELECT jsonb_array_elements_text(${JSON.stringify([...RECEIVED_TYPES])}::jsonb))
      GROUP BY gift->>'id' ORDER BY latest_date DESC, id LIMIT ${GIFT_PRIORITY_LIMIT + 1}
    )
    SELECT s.active_metadata,
      (SELECT MAX(checked_at) FROM portfolio) AS assignments_checked_at,
      (SELECT COUNT(*) > ${GIFT_PRIORITY_LIMIT} FROM candidates) AS truncated,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('gift', g.gift,
        'constituent_id', (SELECT person->>'constituentId' FROM portfolio
          WHERE person->>'constituentId' = g.gift->>'constituent_id' LIMIT 1), 'name',
        (SELECT person->>'name' FROM portfolio WHERE person->>'constituentId' = g.gift->>'constituent_id' LIMIT 1)))
        FROM gifts g JOIN candidates c ON c.id = g.gift->>'id'), '[]'::jsonb) AS gifts
    FROM source s
  `;
  const row = rows[0];
  if (row?.assignments_checked_at instanceof Date) row.assignments_checked_at = row.assignments_checked_at.toISOString();
  return row;
}

export async function loadDashboardGifts({ workspaceId, origin, now = new Date(), db = sql,
  refreshUser = getReportRefreshUser, resolveScope = societySourceScope, settings }) {
  try {
    const account = await refreshUser();
    if (!account || !String(account.role || "").toLowerCase().split(",").some(role => ["admin", "advancement_services"].includes(role.trim()))) return unavailable();
    const scopeKey = await resolveScope({ authUserId: account.id, origin, db });
    return buildGiftPriorities(await readSavedPortfolioGifts({ scopeKey, workspaceId, now, db, settings }), now, settings);
  } catch {
    // Missing schema/cache, reconnection, and read failures affect gift hints
    // only. Never disclose raw provider or database diagnostics to the helper.
    return unavailable();
  }
}
