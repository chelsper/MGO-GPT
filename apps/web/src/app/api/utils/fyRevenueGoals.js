import { randomUUID } from "node:crypto";
import sql from "./sql";
import { getReportRefreshUser } from "./reportRefresh";
import { blackbaudApiFetch, getBlackbaudConnection } from "./blackbaud";
import { executeSavedQueryResults } from "./savedQueryExecution";
import { decodeResult, visitResultCsv } from "./dashboardQueryResults";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";
import { FY_REVENUE_QUERY_ID, projectionCents, revenueError, suggestRevenueColumns, validateRevenueSource } from "@/utils/fyRevenueGoals";

const CACHE_KEY = "report:fy-revenue-goals:v1";
export const REVENUE_LIMITS = { rows: 100000, bytes: 25 * 1024 * 1024 };

export function inspectRevenueQuery(query, source, queryId = FY_REVENUE_QUERY_ID) {
  if (String(query?.id) !== queryId || query.type !== "Gift" || query.can_execute === false || query.has_ask_fields)
    throw revenueError(`Query ${queryId} must be an executable Gift query without prompted criteria.`);
  const fields = (query.select_fields || []).map(entry => entry.query_field?.selected_field_name);
  if (!fields.length || fields.length > 25 || fields.some(name => typeof name !== "string" || !name.trim() || name.length > 200) || new Set(fields).size !== fields.length)
    throw revenueError(`Use 1-25 uniquely named output columns in query ${queryId}.`);
  if (source && (query.name !== source.queryName || Object.values(source.columns).filter(Boolean).some(name => !fields.includes(name))))
    throw revenueError("The query name or outputs changed. Reload the query fields before refreshing.", 409);
  return { queryId, queryName: String(query.name || ""), fields, suggested: suggestRevenueColumns(fields) };
}

export function centsFromText(value) {
  let text = String(value).trim();
  const negative = text.startsWith("(") && text.endsWith(")");
  if (negative) text = text.slice(1, -1);
  if (!/^-?\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text) || (negative && text.startsWith("-")))
    throw revenueError("A gift amount is blank or invalid. Check the mapped amount; no partial total was saved.", 422);
  const sign = negative || text.startsWith("-") ? -1n : 1n;
  const [whole, fraction = ""] = text.replace(/[-$,]/g, "").split(".");
  const valueInCents = sign * (BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")));
  const result = Number(valueInCents);
  if (!Number.isSafeInteger(result)) throw revenueError("A gift amount exceeds the supported reporting range.", 422);
  return result;
}

export function aggregateRevenueCsv(content, source, expectedRows) {
  if (!Number.isSafeInteger(expectedRows) || expectedRows < 0 || expectedRows > REVENUE_LIMITS.rows)
    throw revenueError("NXT did not return a verifiable completed row count. Previous totals are unchanged.", 422);
  const gifts = new Map();
  let total = 0n;
  const { rowCount } = visitResultCsv(content, {
    maxRows: REVENUE_LIMITS.rows,
    onHeaders(headers) {
      if (Object.values(source.columns).some(name => !headers.includes(name)))
        throw revenueError("A mapped column is missing from the result. Reload query fields; previous totals are unchanged.", 422);
    },
    onRow(row, headers) {
      const id = row[headers.indexOf(source.columns.giftId)].trim();
      if (!/^[1-9]\d{0,18}$/.test(id)) throw revenueError("A row is missing a valid gift system record ID. No IDs were guessed.", 422);
      const cents = centsFromText(row[headers.indexOf(source.columns.amount)]);
      if (gifts.has(id)) {
        if (gifts.get(id) !== cents) throw revenueError(`Gift ${id} has conflicting amounts. Use the whole-gift amount rather than split amounts. Previous totals are unchanged.`, 422);
        return;
      }
      gifts.set(id, cents);
      total += BigInt(cents);
    },
  });
  if (rowCount !== expectedRows) throw revenueError("The downloaded row count does not match the completed query. No partial total was saved.", 422);
  const receivedCents = Number(total);
  if (!Number.isSafeInteger(receivedCents)) throw revenueError("The total exceeds the supported reporting range.", 422);
  return { receivedCents, projectedCents: projectionCents(receivedCents, source.projection), giftCount: gifts.size,
    rawRows: rowCount, duplicateRows: rowCount - gifts.size };
}

export async function revenueTransport(origin, queryId = FY_REVENUE_QUERY_ID) {
  if (![FY_REVENUE_QUERY_ID, "31075"].includes(queryId)) throw revenueError("Unknown revenue query.");
  const user = await getReportRefreshUser();
  // getReportRefreshUser filters active accounts in SQL but omits active from its result.
  if (!user?.id || user.active === false || !canManageWorkspaceRole(user.role))
    throw revenueError("Connect an active Admin or Advancement Services shared reporting account first.", 409);
  const connection = await getBlackbaudConnection(user.id);
  if (!connection?.connected_at) throw revenueError("The shared reporting account needs an NXT connection.", 409);
  return {
    metadata: () => blackbaudApiFetch(`/query/queries/${queryId}`, { userId: user.id, authUserId: user.id,
      origin, maxRetries: 0, searchParams: { product: "RE", module: "None" } }),
    execute: () => executeSavedQueryResults({ user, origin, queryId, maxBytes: REVENUE_LIMITS.bytes }),
  };
}

export async function readRevenueState(db = sql, cacheKey = CACHE_KEY) {
  const rows = await db`SELECT payload FROM report_snapshots_cache WHERE report_key=${cacheKey} LIMIT 1`;
  return rows[0]?.payload || { revision: null, source: null, snapshot: null };
}

export async function publishRevenueState(previousRevision, state, db = sql, cacheKey = CACHE_KEY) {
  const rows = previousRevision === null
    ? await db`INSERT INTO report_snapshots_cache (report_key,payload,updated_at)
        VALUES (${cacheKey},${JSON.stringify(state)}::jsonb,NOW()) ON CONFLICT (report_key) DO NOTHING RETURNING report_key`
    : await db`UPDATE report_snapshots_cache SET payload=${JSON.stringify(state)}::jsonb,updated_at=NOW()
        WHERE report_key=${cacheKey} AND payload->>'revision'=${previousRevision} RETURNING report_key`;
  if (!rows.length) throw revenueError("Another refresh finished first. Reload saved totals before continuing.", 409);
  return state;
}

export async function refreshRevenue({ input, revision, user, transport, db = sql }) {
  const source = validateRevenueSource(input);
  const before = await readRevenueState(db);
  if (revision !== before.revision) throw revenueError("Saved totals changed. Reload before refreshing.", 409);
  inspectRevenueQuery(await transport.metadata(), source);
  const result = await transport.execute();
  const snapshot = aggregateRevenueCsv(decodeResult(result, { maxBytes: REVENUE_LIMITS.bytes }), source, result.queryJobRowCount);
  // Recheck the definition before publishing; setup and totals always move together.
  inspectRevenueQuery(await transport.metadata(), source);
  return publishRevenueState(revision, { revision: randomUUID(), source,
    snapshot: { ...snapshot, refreshedAt: new Date().toISOString() }, updatedBy: user.id }, db);
}

export const publicRevenueState = state => ({ revision: state.revision, source: state.source, snapshot: state.snapshot });
