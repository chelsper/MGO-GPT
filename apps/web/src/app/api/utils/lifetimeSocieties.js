import { createHash, randomUUID } from "node:crypto";
import sql from "./sql";
import { getReportRefreshUser } from "./reportRefresh";
import { blackbaudApiFetch, getBlackbaudConnection } from "./blackbaud";
import { executeSavedQueryResults } from "./savedQueryExecution";
import { decodeResult } from "./dashboardQueryResults";
import { listGivingSocietyConfigurations } from "./givingSocietyConfigurations";
import { aggregateLifetimeHistory, LIFETIME_LIMITS } from "./lifetimeSocietyHistory";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";
import { LIFETIME_FIELDS, LIFETIME_QUERY_ID, LIFETIME_RULE_VERSION, LIFETIME_SOCIETY_KEYS, lifetimeActiveGroupIds, lifetimeError, lifetimeSourceWarnings } from "@/utils/lifetimeSocieties";

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
      const path = field?.node_path?.map(node => node.name).join("/");
      const expectedPath = path === spec.path || (spec.path === "Spouse" && path === "Spouse/Spouse Information");
      return spec.names.includes(field?.available_field_name || field?.selected_field_name) && expectedPath &&
        (!field.one_to_many || spec.many) && !(spec.path === "Spouse" && field.node_path.some(node => node.node_type === "OneToMany"));
    });
    columns[key] = matches.length === 1 ? fieldLabel(matches[0]) : "";
    checks.push({ key, label: spec.label, required: !!spec.required, column: columns[key], ambiguous: matches.length > 1,
      help: key === "constituentId" ? "Optional when Constituent > Constituent ID is available. Gift and Integration IDs are never used as constituent system IDs." :
        `Choose ${spec.path} > ${spec.names[0]} in NXT. Give repeated output labels unique aliases.` });
  }
  const identityMode = columns.constituentId ? "system" : columns.lookupId ? "lookup" : null;
  const spouseIdentityMode = columns.spouseLookupId && columns.lookupId ? "lookup" : columns.spouseId && columns.constituentId ? "system" : null;
  const householdsReady = !!(spouseIdentityMode && columns.maritalStatus && columns.constituentType);
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
  if (!householdsReady) warnings.push("For automatic married households, add Spouse > Constituent ID and Constituent > Marital Status, alongside Constituent ID and Key Indicator. Until available, spouses are not guessed; gift history can still be imported.");
  if (!columns.constituentType) warnings.push("Add Constituent > Key Indicator to the query output to separate individuals and organizations. Until refreshed with that field, unclassified records remain visible in the combined view.");
  if (identityMode === "lookup") warnings.push("Records are grouped by the exact Constituent ID within this query, not by name. NXT system IDs are not inferred; no profile links or cross-report identity matches are created.");
  // A date/fund/type criterion can hide the beginning of a lifetime history.
  const restrictedHistory = (query.filter_fields || []).some(field => field.query_field?.node_path?.[0]?.name !== "Constituent");
  if (restrictedHistory) warnings.push("Gift-level criteria may omit lifetime history. Dates will be withheld until these restrictions are removed.");
  return { queryId: LIFETIME_QUERY_ID, queryName: query.name, columns, fields, checks, warnings, restrictedHistory, identityMode, spouseIdentityMode, householdsReady,
    fullRecognition: ["Both", "Recipient"].includes(query.gift_processing_options?.soft_credit_option) && query.gift_processing_options?.soft_credit_sub_option === "FullAmountToAll",
    ready: !!identityMode && checks.every(check => !check.required || check.column), fingerprint };
}

export async function readLifetimeRules(db = sql) {
  const all = await listGivingSocietyConfigurations(db);
  const societies = LIFETIME_SOCIETY_KEYS.map(key => all.find(item => item.key === key && item.active && item.basis === "lifetime"));
  if (societies.some(item => !item || !Number.isFinite(item.minimumAmount) || item.minimumAmount <= 0 ||
    !Number.isSafeInteger(Math.round(item.minimumAmount * 100))))
    throw lifetimeError("Configure active lifetime thresholds for 1934 Club and Frances Bartlett Kinne Society before using this report.", 409);
  // Report-specific clarification: 1934 includes recognized giving. Do not
  // mutate shared eligibility settings used by portfolios and society letters.
  return societies.map(({ key, name, minimumAmount, countSources }) => ({ key, name, minimumAmount,
    countSources: key === "1934_club" ? [...new Set([...countSources, "recognition_credit"])] : countSources }));
}
export async function readLifetimeState(db = sql) {
  const rows = await db`SELECT payload FROM report_snapshots_cache WHERE report_key=${CACHE_KEY} LIMIT 1`;
  return rows[0]?.payload || { revision: null, snapshot: null };
}
export function publicLifetimeState(state, societies) {
  const snapshot = state.snapshot;
  const current = !snapshot || (snapshot.ruleVersion === LIFETIME_RULE_VERSION && snapshot.rulesFingerprint === hash(societies));
  return { revision: state.revision, societies, snapshot: current ? snapshot : null, staleRules: !current,
    previousImport: !current ? { refreshedAt: snapshot.refreshedAt, peopleCount: snapshot.peopleCount } : null };
}

export async function updateLifetimeGroup({ revision, groupId, operation, user, db = sql, rules = readLifetimeRules }) {
  const before = await readLifetimeState(db), societies = await rules(db);
  if (before.revision !== revision || !publicLifetimeState(before, societies).snapshot)
    throw lifetimeError("Saved history changed. Reload the report before confirming a group.", 409);
  const groups = before.snapshot.sharedGroups || [], candidate = groups.find(group => group.id === groupId);
  if (!candidate || !["confirm-group", "remove-group"].includes(operation))
    throw lifetimeError("Choose a shared-giving suggestion from the current report.", 422);
  const confirmed = new Set(before.snapshot.confirmedGroupIds || []);
  const separate = new Set(before.snapshot.separateGroupIds || []);
  if (operation === "confirm-group") {
    if (candidate.members.some(member => member.constituentType !== "individual"))
      throw lifetimeError("Organizations are separate credit sources, not household members. Refresh the report before continuing.", 409);
    const members = new Set(candidate.members.map(member => member.id));
    const active = lifetimeActiveGroupIds(before.snapshot);
    if (groups.some(group => group.id !== groupId && active.has(group.id) && group.members.some(member => members.has(member.id))))
      throw lifetimeError("A member already belongs to a confirmed group. Undo that group before choosing another; histories were not combined twice.", 409);
    if (candidate.automatic) separate.delete(groupId);
    else confirmed.add(groupId);
  } else {
    confirmed.delete(groupId);
    if (candidate.automatic) separate.add(groupId);
  }
  const state = { ...before, revision: randomUUID(), updatedBy: user.id,
    snapshot: { ...before.snapshot, confirmedGroupIds: [...confirmed], separateGroupIds: [...separate] },
    groupAudit: [...(before.groupAudit || []), { operation, groupId, userId: user.id, at: new Date().toISOString() }].slice(-100) };
  const published = await db`UPDATE report_snapshots_cache SET payload=${JSON.stringify(state)}::jsonb,updated_at=NOW()
    WHERE report_key=${CACHE_KEY} AND payload->>'revision'=${revision} RETURNING report_key`;
  if (!published.length) throw lifetimeError("Saved history changed. Reload before confirming a group.", 409);
  return { state, societies };
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
  // Lookup IDs are not canonical identities: carry a confirmation only when
  // source, member identity and the exact shared-gift evidence remain identical.
  const sameSource = before.snapshot?.ruleVersion === history.ruleVersion && before.snapshot?.rulesFingerprint === rulesFingerprint && before.snapshot?.source?.fingerprint === checked.fingerprint;
  const retained = sameSource ? (before.snapshot.confirmedGroupIds || []).filter(id => history.sharedGroups.some(group => group.id === id && !group.automatic)) : [];
  state.snapshot.confirmedGroupIds = retained;
  state.snapshot.separateGroupIds = sameSource ? (before.snapshot.separateGroupIds || []).filter(id => history.sharedGroups.some(group => group.id === id && group.automatic)) : [];
  state.snapshot.groupsToReconfirm = (before.snapshot?.confirmedGroupIds || []).length - retained.length;
  state.groupAudit = before.groupAudit || [];
  const published = revision === null
    ? await db`INSERT INTO report_snapshots_cache (report_key,payload,updated_at) VALUES (${CACHE_KEY},${JSON.stringify(state)}::jsonb,NOW())
        ON CONFLICT (report_key) DO NOTHING RETURNING report_key`
    : await db`UPDATE report_snapshots_cache SET payload=${JSON.stringify(state)}::jsonb,updated_at=NOW()
        WHERE report_key=${CACHE_KEY} AND payload->>'revision'=${revision} RETURNING report_key`;
  if (!published.length) throw lifetimeError("Another refresh finished first. Reload saved results before continuing.", 409);
  return { state, societies };
}
