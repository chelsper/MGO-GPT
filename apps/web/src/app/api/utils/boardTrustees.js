import { createHash, randomUUID } from "node:crypto";
import sql from "./sql";
import { getReportRefreshUser } from "./reportRefresh";
import { blackbaudApiFetch, getBlackbaudConnection } from "./blackbaud";
import { executeSavedQueryResults } from "./savedQueryExecution";
import { decodeResult, visitResultCsv } from "./dashboardQueryResults";
import { centsFromText } from "./fyRevenueGoals";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";
import { BOARD_MEMBERSHIP_RULE, BOARD_SERVICE_COLUMNS, boardError, boardPeriodLabel, suggestBoardColumns, validateBoardSource, validateBoardTarget } from "@/utils/boardTrustees";
import { evaluateBoardService } from "./boardTrusteeEligibility";

const CACHE_KEY = "report:board-of-trustees:v1";
export const BOARD_LIMITS = Object.freeze({ rows: 10000, trustees: 2000, years: 30, bytes: 4 * 1024 * 1024 });
const fieldLabel = entry => String(entry.user_alias || entry.query_field?.selected_field_name || "").trim();
const fieldName = entry => entry.query_field?.selected_field_name || "";

function queryFingerprint(query) {
  const definition = Object.fromEntries(["id", "type", "name", "select_fields", "filter_fields", "summary_fields",
    "gift_processing_options", "advanced_processing_options", "constituent_filters", "suppress_duplicates"].map(key => [key, query[key]]));
  return createHash("sha256").update(JSON.stringify(definition)).digest("hex");
}

function dateParts(value) {
  if (value && typeof value === "object") return `${value.year}-${value.month}-${value.day}`;
  const us = String(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (us) return `${Number(us[3])}-${Number(us[1])}-${Number(us[2])}`;
  const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return iso ? `${Number(iso[1])}-${Number(iso[2])}-${Number(iso[3])}` : "";
}

function validateAnnualSummary(query, entry, fiscalYear) {
  const summary = (query.summary_fields || []).find(item => String(item.query_field_id) === String(entry.query_field?.id) &&
    item.summary_instance === entry.summary_instance);
  const filters = summary?.filter_fields || [];
  const dates = filters.filter(item => fieldName(item) === "Gift Date");
  if (entry.query_field?.value_type !== "Summary" || dates.length !== 1 || dates[0].operator !== "Between" ||
      JSON.stringify((dates[0].filter_values || []).map(dateParts)) !== JSON.stringify([`${fiscalYear - 1}-7-1`, `${fiscalYear}-6-30`]) ||
      filters.some(item => !["None", "And"].includes(item.compare_type)))
    throw boardError(`The mapped giving summaries must be limited to ${boardPeriodLabel(fiscalYear)}. Check their Gift Date filters in NXT; previous results are unchanged.`, 422);
}

export function inspectBoardQuery(query, target, source = null) {
  validateBoardTarget(target);
  if (String(query?.id) !== target.queryId || query.type !== "Constituent" || query.can_execute === false || query.has_ask_fields)
    throw boardError("Use an executable Constituent query with annual giving summaries and no prompted criteria.");
  const fields = (query.select_fields || []).map(fieldLabel);
  if (!fields.length || fields.length > 24 || fields.some(name => !name || name.length > 200) || new Set(fields).size !== fields.length)
    throw boardError("Use distinct output aliases for the annual giving summaries (up to 24 output fields).");
  if (typeof query.name !== "string" || !query.name.trim() || query.name.length > 250) throw boardError("NXT did not return a valid query name.");
  if (source) {
    if (Object.keys(BOARD_SERVICE_COLUMNS).some(key => !source.columns[key] || !fields.includes(source.columns[key])))
      throw boardError("Add Constituency Code, Constituency Date From and Constituency Date To to this fiscal year's query outputs, then load its fields. The service-date rule cannot run without them.", 422);
    if (query.name !== source.queryName || Object.values(source.columns).some(name => !fields.includes(name)))
      throw boardError("The query name or output fields changed. Load the query fields again before refreshing.", 409);
    const nameEntry = query.select_fields.find(item => fieldLabel(item) === source.columns.name);
    if (nameEntry.query_field?.one_to_many || nameEntry.query_field?.value_type !== "Text")
      throw boardError("Use the constituent's name, not a related contact or a gift field.");
    for (const key of ["cash", "commitments"]) validateAnnualSummary(query, query.select_fields.find(item => fieldLabel(item) === source.columns[key]), target.fiscalYear);
    const serviceFields = Object.entries(BOARD_SERVICE_COLUMNS).map(([key, label]) => {
      const field = query.select_fields.find(item => fieldLabel(item) === source.columns[key])?.query_field;
      if (field?.selected_field_name !== label || !field.one_to_many ||
          field.value_type !== (key === "code" ? "TableEntry" : "FuzzyDate") || !field.node_path?.length)
        throw boardError("Map the constituency code and its own Date From / Date To fields, not unrelated dates.", 422);
      return field;
    });
    if (new Set(serviceFields.map(field => JSON.stringify(field.node_path.map(node => node.id)))).size !== 1)
      throw boardError("The constituency code and service dates must come from the same constituency output group.", 422);
  }
  const warnings = [];
  if ((query.filter_fields || []).some(item => /Constituency Date To/i.test(fieldName(item)) && item.operator === "Blank"))
    warnings.push("This query requires an open-ended constituency record. A trustee whose service ended during this fiscal year may be missing even if they served six months. Include dated Trustee records so the app can apply the service-date rule.");
  const credit = query.gift_processing_options || {};
  return { ...target, queryName: query.name, fields, suggested: suggestBoardColumns(fields, target.fiscalYear), warnings,
    credit: { soft: credit.soft_credit_option || "Query-defined", matching: credit.matching_gift_credit_option || "Query-defined" },
    fingerprint: queryFingerprint(query) };
}

export function aggregateBoardCsv(content, source, expectedRows) {
  if (!Number.isSafeInteger(expectedRows) || expectedRows < 0 || expectedRows > BOARD_LIMITS.rows)
    throw boardError("NXT did not return a verifiable completed row count. Previous results are unchanged.", 422);
  if (Object.keys(BOARD_SERVICE_COLUMNS).some(key => !source.columns[key]))
    throw boardError("Load the constituency code and service-date fields before refreshing.", 422);
  const candidates = new Map();
  let indexes;
  const amount = value => {
    if (!value.trim()) return null;
    try { return centsFromText(value); }
    catch { throw boardError("A trustee giving amount is invalid. Check the summary outputs; previous results are unchanged.", 422); }
  };
  const { rowCount } = visitResultCsv(content, { maxRows: BOARD_LIMITS.rows,
    onHeaders(headers) {
      const identity = headers.findIndex(name => /^_?QRECID$/i.test(name));
      if (identity < 0 || Object.values(source.columns).some(name => !headers.includes(name)))
        throw boardError("The result is missing a mapped summary or NXT's constituent record ID (QRECID). No identities were guessed.", 422);
      indexes = { identity, ...Object.fromEntries(Object.entries(source.columns).map(([key, name]) => [key, headers.indexOf(name)])) };
    },
    onRow(row) {
      const id = row[indexes.identity].trim(), name = row[indexes.name].trim();
      if (!/^[1-9]\d{0,18}$/.test(id) || !name || name.length > 300)
        throw boardError("A trustee row is missing a valid identity or name. Previous results are unchanged.", 422);
      const trustee = { id, name, cashCents: amount(row[indexes.cash]), commitmentCents: amount(row[indexes.commitments]) };
      const previous = candidates.get(id);
      if (previous && JSON.stringify(previous.trustee) !== JSON.stringify(trustee))
        throw boardError(`Constituent ${id} has conflicting annual summary rows. Correct the query before refreshing.`, 422);
      const service = { code: row[indexes.code].trim(), start: row[indexes.start].trim(), end: row[indexes.end].trim() };
      if (!service.code || Object.values(service).some(value => value.length > 200))
        throw boardError("A constituency code or service-date output is missing or invalid. Previous results are unchanged.", 422);
      const candidate = previous || { trustee, records: new Map() };
      candidate.records.set(JSON.stringify(service), service);
      candidates.set(id, candidate);
      if (candidates.size > BOARD_LIMITS.trustees) throw boardError("This query exceeds 2,000 trustees. Narrow the query; no rows were truncated.", 413);
    },
  });
  if (rowCount !== expectedRows) throw boardError("The completed query and downloaded row counts do not match. Previous results are unchanged.", 422);
  const rows = [], excluded = [], needsReview = [];
  let openAndFormerCount = 0;
  for (const { trustee, records } of candidates.values()) {
    const serviceRecords = [...records.values()];
    const decision = evaluateBoardService(serviceRecords, source.fiscalYear);
    if (decision.status === "included") {
      const openAndFormer = serviceRecords.some(row => row.code.toLowerCase() === "trustee" && !row.end) &&
        serviceRecords.some(row => row.code.toLowerCase() === "trustee-former");
      if (openAndFormer) openAndFormerCount++;
      rows.push({ ...trustee, serviceReason: decision.reason, serviceRecords, openAndFormer });
    } else (decision.status === "review" ? needsReview : excluded).push({ id: trustee.id, name: trustee.name, ...decision, serviceRecords });
  }
  for (const list of [rows, excluded, needsReview]) list.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  function total(key) {
    if (needsReview.length || rows.some(row => row[key] === null)) return null;
    const sum = Number(rows.reduce((value, row) => value + BigInt(row[key]), 0n));
    if (!Number.isSafeInteger(sum)) throw boardError("The trustee total exceeds the supported reporting range.", 422);
    return sum;
  }
  return { trustees: rows, trusteeCount: rows.length, cashCents: total("cashCents"), commitmentCents: total("commitmentCents"),
    missingAmountCount: rows.filter(row => row.cashCents === null || row.commitmentCents === null).length,
    rawRows: rowCount, duplicateRows: rowCount - candidates.size,
    eligibility: { rule: BOARD_MEMBERSHIP_RULE, candidateCount: candidates.size, includedCount: rows.length,
      excludedCount: excluded.length, reviewCount: needsReview.length, openAndFormerCount, excluded, needsReview } };
}

export async function boardTransport(origin, queryId) {
  validateBoardTarget({ fiscalYear: 2027, queryId });
  const user = await getReportRefreshUser();
  if (!user?.id || user.active === false || !canManageWorkspaceRole(user.role) || !(await getBlackbaudConnection(user.id))?.connected_at)
    throw boardError("Connect an active Admin or Advancement Services shared reporting account to NXT first.", 409);
  return {
    metadata: () => blackbaudApiFetch(`/query/queries/${queryId}`, { userId: user.id, authUserId: user.id, origin, maxRetries: 0,
      searchParams: { product: "RE", module: "None" } }),
    execute: () => executeSavedQueryResults({ user, origin, queryId, maxBytes: BOARD_LIMITS.bytes }),
  };
}

export async function readBoardState(db = sql) {
  const rows = await db`SELECT payload FROM report_snapshots_cache WHERE report_key=${CACHE_KEY} LIMIT 1`;
  return rows[0]?.payload || { revision: null, years: [] };
}

export const publicBoardState = state => ({ revision: state.revision,
  years: state.years.map(({ source, snapshot }) => ({ source, snapshot })) });

export async function refreshBoardYear({ input, revision, user, transport, db = sql }) {
  let source = validateBoardSource(input);
  const before = await readBoardState(db);
  if (revision !== before.revision) throw boardError("Saved results changed. Reload saved results before refreshing.", 409);
  if (before.years.some(year => year.source.queryId === source.queryId && year.source.fiscalYear !== source.fiscalYear))
    throw boardError("Use a separate query for each fiscal year's trustee roster and giving.", 409);
  if (before.years.length >= BOARD_LIMITS.years && !before.years.some(year => year.source.fiscalYear === source.fiscalYear))
    throw boardError("This dashboard supports up to 30 fiscal years.");
  const query = await transport.metadata();
  const suggested = suggestBoardColumns((query.select_fields || []).map(fieldLabel), source.fiscalYear);
  // Upgrade pre-service-rule saved mappings without asking users to repeat valid financial mappings.
  source = { ...source, columns: { ...source.columns, ...Object.fromEntries(Object.keys(BOARD_SERVICE_COLUMNS)
    .map(key => [key, source.columns[key] || suggested[key]])) } };
  const metadata = inspectBoardQuery(query, source, source);
  const result = await transport.execute();
  const totals = aggregateBoardCsv(decodeResult(result, { maxBytes: BOARD_LIMITS.bytes }), source, result.queryJobRowCount);
  const checked = inspectBoardQuery(await transport.metadata(), source, source);
  if (checked.fingerprint !== metadata.fingerprint) throw boardError("The query definition changed during the refresh. Previous results are unchanged; try again.", 409);
  const entry = { source, snapshot: { ...totals, warnings: checked.warnings, credit: checked.credit,
    refreshedAt: new Date().toISOString(), definitionFingerprint: checked.fingerprint }, updatedBy: user.id };
  const state = { revision: randomUUID(), years: [...before.years.filter(year => year.source.fiscalYear !== source.fiscalYear), entry]
    .sort((a, b) => b.source.fiscalYear - a.source.fiscalYear) };
  const published = revision === null
    ? await db`INSERT INTO report_snapshots_cache (report_key,payload,updated_at) VALUES (${CACHE_KEY},${JSON.stringify(state)}::jsonb,NOW())
        ON CONFLICT (report_key) DO NOTHING RETURNING report_key`
    : await db`UPDATE report_snapshots_cache SET payload=${JSON.stringify(state)}::jsonb,updated_at=NOW()
        WHERE report_key=${CACHE_KEY} AND payload->>'revision'=${revision} RETURNING report_key`;
  if (!published.length) throw boardError("Another refresh finished first. Reload saved results before continuing.", 409);
  return state;
}
