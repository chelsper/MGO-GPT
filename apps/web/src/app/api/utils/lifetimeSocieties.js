import { createHash, randomUUID } from "node:crypto";
import sql from "./sql";
import { getReportRefreshUser } from "./reportRefresh";
import { blackbaudApiFetch, getBlackbaudConnection } from "./blackbaud";
import { executeSavedQueryResults } from "./savedQueryExecution";
import { decodeResult } from "./dashboardQueryResults";
import { listGivingSocietyConfigurations } from "./givingSocietyConfigurations";
import { aggregateLifetimeHistory, LIFETIME_LIMITS } from "./lifetimeSocietyHistory";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";
import { LIFETIME_FIELDS, LIFETIME_QUERY_ID, LIFETIME_RULE_VERSION, LIFETIME_SOCIETY_KEYS, lifetimeError, lifetimeSourceWarnings } from "@/utils/lifetimeSocieties";

const CACHE_KEY = "report:lifetime-giving-societies:v1";
const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const fieldLabel = entry => String(entry.user_alias || entry.query_field?.selected_field_name || "").trim();
export function inspectLifetimeQuery(query) {
  if (String(query?.id) !== LIFETIME_QUERY_ID || query.type !== "Gift" || query.can_execute === false || query.has_ask_fields)
    throw lifetimeError("Use executable Gift query 31118 without prompted criteria.");
  const entries = query.select_fields || [], fields = entries.map(fieldLabel);
  if (!fields.length || fields.length > 40 || fields.some(field => !field || field.length > 200) || new Set(fields).size !== fields.length)
    throw lifetimeError("Use distinct output aliases and no more than 40 query outputs.");
  const columns = {}, checks = [];
  for (const [key, spec] of Object.entries(LIFETIME_FIELDS)) {
    const matches = entries.filter(entry => {
      const field = entry.query_field;
      return spec.names.includes(field?.selected_field_name) && field.node_path?.length === 1 &&
        field.node_path[0].name === spec.path && (!field.one_to_many || spec.many);
    });
    columns[key] = matches.length === 1 ? fieldLabel(matches[0]) : "";
    checks.push({ key, label: spec.label, required: !!spec.required, column: columns[key], ambiguous: matches.length > 1,
      help: key === "constituentId" ? "Optional when Constituent > Constituent ID is available. Gift and Integration IDs are never used as constituent system IDs." :
        `Choose ${spec.path} > ${spec.names[0]} in NXT. Give repeated output labels unique aliases.` });
  }
  const identityMode = columns.constituentId ? "system" : columns.lookupId ? "lookup" : null;
  for (const check of checks) {
    if (check.key === "lookupId" && !columns.constituentId) check.required = true;
    if (check.ambiguous) {
      check.required = true;
      check.help = `Keep only one output for ${check.label}; multiple copies cannot be matched safely.`;
    }
  }
  const fingerprint = hash(Object.fromEntries(["id", "name", "type", "select_fields", "filter_fields", "summary_fields", "gift_processing_options",
    "advanced_processing_options", "constituent_filters", "suppress_duplicates"].map(key => [key, query[key]])));
  const warnings = lifetimeSourceWarnings(query);
  if (identityMode === "lookup") warnings.push("Records are grouped by the exact Constituent ID within this query, not by name. NXT system IDs are not inferred; no profile links or cross-report identity matches are created.");
  // A date/fund/type criterion can hide the beginning of a lifetime history.
  const restrictedHistory = (query.filter_fields || []).some(field => field.query_field?.node_path?.[0]?.name !== "Constituent");
  if (restrictedHistory) warnings.push("Gift-level criteria may omit lifetime history. Dates will be withheld until these restrictions are removed.");
  return { queryId: LIFETIME_QUERY_ID, queryName: query.name, columns, fields, checks, warnings, restrictedHistory, identityMode,
    ready: !!identityMode && checks.every(check => !check.required || check.column), fingerprint };
}

export async function readLifetimeRules(db = sql) {
  const all = await listGivingSocietyConfigurations(db);
  const societies = LIFETIME_SOCIETY_KEYS.map(key => all.find(item => item.key === key && item.active && item.basis === "lifetime"));
  if (societies.some(item => !item || !Number.isFinite(item.minimumAmount) || item.minimumAmount <= 0 ||
    !Number.isSafeInteger(Math.round(item.minimumAmount * 100))))
    throw lifetimeError("Configure active lifetime thresholds for 1934 Club and Frances Bartlett Kinne Society before using this report.", 409);
  return societies.map(({ key, name, minimumAmount, countSources }) => ({ key, name, minimumAmount, countSources }));
}
export async function readLifetimeState(db = sql) {
  const rows = await db`SELECT payload FROM report_snapshots_cache WHERE report_key=${CACHE_KEY} LIMIT 1`;
  return rows[0]?.payload || { revision: null, snapshot: null };
}
export function publicLifetimeState(state, societies) {
  const snapshot = state.snapshot;
  const current = !snapshot || (snapshot.ruleVersion === LIFETIME_RULE_VERSION && snapshot.rulesFingerprint === hash(societies));
  return { revision: state.revision, societies, snapshot: current ? snapshot : null, staleRules: !current };
}

export async function lifetimeTransport(origin) {
  const user = await getReportRefreshUser();
  if (!user?.id || user.active === false || !canManageWorkspaceRole(user.role) || !(await getBlackbaudConnection(user.id))?.connected_at)
    throw lifetimeError("Connect an active Admin or Advancement Services shared reporting account to NXT first.", 409);
  return {
    metadata: () => blackbaudApiFetch(`/query/queries/${LIFETIME_QUERY_ID}`, { userId: user.id, authUserId: user.id, origin,
      maxRetries: 0, searchParams: { product: "RE", module: "None" } }),
    execute: () => executeSavedQueryResults({ user, origin, queryId: LIFETIME_QUERY_ID, maxBytes: LIFETIME_LIMITS.bytes }),
  };
}

export async function refreshLifetimeHistory({ revision, user, transport, db = sql, rules = readLifetimeRules }) {
  const before = await readLifetimeState(db);
  if (before.revision !== revision) throw lifetimeError("Saved results changed. Reload before refreshing.", 409);
  const societies = await rules(db), rulesFingerprint = hash(societies);
  const inspection = inspectLifetimeQuery(await transport.metadata());
  if (!inspection.ready) throw lifetimeError("Add the missing query outputs shown in Source readiness before importing gift history.");
  const result = await transport.execute();
  const history = aggregateLifetimeHistory(decodeResult(result, { maxBytes: LIFETIME_LIMITS.bytes }), inspection, societies, result.queryJobRowCount);
  const checked = inspectLifetimeQuery(await transport.metadata());
  if (inspection.fingerprint !== checked.fingerprint || rulesFingerprint !== hash(await rules(db)))
    throw lifetimeError("The query or society rules changed during refresh. Previous results are unchanged; check the source and try again.", 409);
  const state = { revision: randomUUID(), updatedBy: user.id, snapshot: { ...history, societies, rulesFingerprint,
    source: checked, refreshedAt: new Date().toISOString() } };
  const published = revision === null
    ? await db`INSERT INTO report_snapshots_cache (report_key,payload,updated_at) VALUES (${CACHE_KEY},${JSON.stringify(state)}::jsonb,NOW())
        ON CONFLICT (report_key) DO NOTHING RETURNING report_key`
    : await db`UPDATE report_snapshots_cache SET payload=${JSON.stringify(state)}::jsonb,updated_at=NOW()
        WHERE report_key=${CACHE_KEY} AND payload->>'revision'=${revision} RETURNING report_key`;
  if (!published.length) throw lifetimeError("Another refresh finished first. Reload saved results before continuing.", 409);
  return { state, societies };
}
