import { createHash, randomUUID } from "node:crypto";
import sql from "./sql";
import { getReportRefreshUser } from "./reportRefresh";
import { blackbaudApiFetch, getBlackbaudConnection } from "./blackbaud";
import { executeSavedQueryResults } from "./savedQueryExecution";
import { decodeResult } from "./dashboardQueryResults";
import { listGivingSocietyConfigurations } from "./givingSocietyConfigurations";
import { aggregateLifetimeHistory, LIFETIME_LIMITS } from "./lifetimeSocietyHistory";
import { applyLifetimeDecisions, lifetimeRecordKey, lifetimeMilestoneKey, publicLifetimeDecisions } from "./lifetimeRecordDecisions";
import { analyzeLifetimeGifts, combineLifetimeEvents } from "./lifetimeGiftReview";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";
import { lifetimeReconciliationCsv, lifetimeReconciliationNeeds, lifetimeReconciliationSummary } from "@/utils/lifetimeReconciliation";
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
export async function readLifetimeState(db = sql, includeEvidence = true) {
  const rows = includeEvidence ? await db`SELECT payload FROM report_snapshots_cache WHERE report_key=${CACHE_KEY} LIMIT 1`
    : await db`SELECT payload #- '{snapshot,giftReview}' AS payload FROM report_snapshots_cache WHERE report_key=${CACHE_KEY} LIMIT 1`;
  return rows[0]?.payload || { revision: null, snapshot: null };
}
export function publicLifetimeState(state, societies) {
  const snapshot = state.snapshot;
  const current = !snapshot || (snapshot.ruleVersion === LIFETIME_RULE_VERSION && snapshot.rulesFingerprint === hash(societies));
  const { giftReview, ...summary } = snapshot || {};
  return { revision: state.revision, societies, snapshot: current && snapshot ? applyLifetimeDecisions(summary, state.recordDecisions) : null, staleRules: !current,
    savedDecisions: publicLifetimeDecisions(state.recordDecisions, current ? snapshot : null),
    previousImport: !current ? { refreshedAt: snapshot.refreshedAt, peopleCount: snapshot.peopleCount } : null };
}

function lifetimeGiftReviewEvidence(state, societies, { milestoneKey, revision }) {
  if (revision !== state.revision) throw lifetimeError("Saved history changed. Reload the saved report before reviewing these gifts.", 409);
  const snapshot = publicLifetimeState(state, societies).snapshot;
  const active = lifetimeActiveGroupIds(snapshot);
  const row = [...(snapshot?.rows || []), ...(snapshot?.sharedGroups || []).filter(group => active.has(group.id)).flatMap(group => group.rows)]
    .find(row => row.milestoneKey === milestoneKey);
  if (!row) throw lifetimeError("This recipient or household is no longer in the current report. Reload saved results.", 409);
  const evidence = state.snapshot.giftReview;
  if (evidence?.version !== 1) return { available: false, items: [], message: "Gift details were not saved with this older import. An Admin or Advancement Services user can refresh gift history once to add them. Existing dates and archive choices stay saved." };
  const recipients = row.members || [row], names = new Map(recipients.map(member => [member.id, member.name]));
  const histories = recipients.map(member => Array.isArray(evidence.histories[member.id])
    ? evidence.histories[member.id].map(event => ({ ...event, recipientIds: [member.id] })) : null);
  if (histories.some(history => !Array.isArray(history))) throw lifetimeError("Saved gift details are incomplete. The report is unchanged; ask Advancement Services to refresh gift history.", 409);
  const society = state.snapshot.societies.find(society => society.key === row.societyKey);
  const analysis = analyzeLifetimeGifts(combineLifetimeEvents(histories).values(), {
    sources: society.countSources, fullRecognition: snapshot.source.fullRecognition, today: evidence.asOf,
  });
  const counts = { all: analysis.items.length, counted: 0, review: 0, excluded: 0 };
  for (const item of analysis.items) counts[item.outcome]++;
  const items = analysis.items.map(item => ({ ...item, crossingGift: row.crossingGiftIds.includes(item.giftId),
    credits: item.credits.map(({ recipientIds, ...credit }) => ({ ...credit, recipients: recipientIds.map(id => names.get(id)).filter(Boolean) })),
  }));
  return { available: true, counts, row, items, asOf: evidence.asOf, refreshedAt: snapshot.refreshedAt };
}

export function savedLifetimeGiftReview(state, societies, options) {
  const evidence = lifetimeGiftReviewEvidence(state, societies, options);
  if (!evidence.available) return evidence;
  const { page = 0, view = "all" } = options;
  const matches = evidence.items.filter(item => view === "all" || item.outcome === view)
    .sort((a, b) => (a.day || "9999").localeCompare(b.day || "9999") || a.giftId.localeCompare(b.giftId, "en", { numeric: true }));
  const pageSize = 25, pages = Math.max(1, Math.ceil(matches.length / pageSize)), current = Math.min(page, pages - 1);
  return { available: true, counts: evidence.counts, page: current, pages, pageSize, total: matches.length, asOf: evidence.asOf,
    reconciliation: lifetimeReconciliationSummary(evidence.items),
    items: matches.slice(current * pageSize, (current + 1) * pageSize).map(item => ({ ...item,
      reconciliation: lifetimeReconciliationNeeds(item),
    })) };
}

export function savedLifetimeReconciliationCsv(state, societies, options) {
  const evidence = lifetimeGiftReviewEvidence(state, societies, options);
  if (!evidence.available) throw lifetimeError(evidence.message, 409);
  if (!evidence.counts.review) throw lifetimeError("This recipient has no unresolved gift records to export. Other report-level review notes may still need attention.", 409);
  evidence.items.sort((a, b) => (a.day || "9999").localeCompare(b.day || "9999") || a.giftId.localeCompare(b.giftId, "en", { numeric: true }));
  return "\uFEFF" + lifetimeReconciliationCsv(evidence, LIFETIME_LIMITS.bytes);
}

export async function updateLifetimeRecord({ revision, recordKey, milestoneKey, operation, user, db = sql, rules = readLifetimeRules }) {
  const before = await readLifetimeState(db), societies = await rules(db);
  if (before.revision !== revision) throw lifetimeError("Saved history changed. Reload the report before saving this decision.", 409);
  const snapshot = publicLifetimeState(before, societies).snapshot;
  const decisions = before.recordDecisions || {}, at = new Date().toISOString();
  let archives = [...(decisions.archives || [])], milestones = [...(decisions.milestones || [])];
  let previous = null, next = null;
  if (operation === "archive-record") {
    const row = snapshot?.rows.find(row => lifetimeRecordKey(row) === recordKey);
    if (!row || row.members) throw lifetimeError("Choose a constituent from the current report to archive.", 409);
    if (archives.some(entry => entry.key === recordKey)) throw lifetimeError("This record is already archived. Reload the report.", 409);
    next = { key: recordKey, name: row.name, constituentType: row.constituentType, lookupId: row.lookupId, systemId: row.systemId, at, userId: user.id };
    archives.push(next);
  } else if (operation === "restore-record") {
    previous = archives.find(entry => entry.key === recordKey);
    if (!previous) throw lifetimeError("This archive decision is no longer saved. Reload the report.", 409);
    archives = archives.filter(entry => entry.key !== recordKey);
  } else if (operation === "confirm-date") {
    const activeGroups = lifetimeActiveGroupIds(snapshot);
    const row = [...(snapshot?.rows || []), ...(snapshot?.sharedGroups || []).filter(group => activeGroups.has(group.id)).flatMap(group => group.rows)]
      .find(row => lifetimeMilestoneKey(row) === milestoneKey);
    if (!row || row.archived || row.status !== "provisional" || !row.date || row.reasons.length)
      throw lifetimeError("Only an active record's supported provisional date can be confirmed. Review its history first.", 409);
    if (milestones.some(entry => entry.key === milestoneKey)) throw lifetimeError("This date is already confirmed. Reopen date review before changing it.", 409);
    next = { key: milestoneKey, recordKey: lifetimeRecordKey(row), name: row.name, societyKey: row.societyKey, societyName: row.societyName,
      date: row.date, crossingGiftIds: row.crossingGiftIds, ruleVersion: snapshot.ruleVersion, rulesFingerprint: snapshot.rulesFingerprint,
      sourceFingerprint: snapshot.source.fingerprint, at, userId: user.id };
    milestones.push(next);
  } else if (operation === "reopen-date") {
    previous = milestones.find(entry => entry.key === milestoneKey);
    if (!previous) throw lifetimeError("This confirmed date is no longer saved. Reload the report.", 409);
    milestones = milestones.filter(entry => entry.key !== milestoneKey);
  } else throw lifetimeError("Unknown saved-record action.", 400);
  if (archives.length > 20000 || milestones.length > 40000) throw lifetimeError("The saved-decision limit was reached. Existing decisions are unchanged.", 413);
  const state = { ...before, revision: randomUUID(), updatedBy: user.id, recordDecisions: { archives, milestones,
    audit: [...(decisions.audit || []), { operation, previous, next, at, userId: user.id }].slice(-500) } };
  const published = await db`UPDATE report_snapshots_cache SET payload=${JSON.stringify(state)}::jsonb,updated_at=NOW()
    WHERE report_key=${CACHE_KEY} AND payload->>'revision'=${revision} RETURNING report_key`;
  if (!published.length) throw lifetimeError("Saved history changed. Reload before saving this decision.", 409);
  return { state, societies };
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
  const history = aggregateLifetimeHistory(decodeResult(result, { maxBytes: LIFETIME_LIMITS.bytes }), inspection, societies, result.queryJobRowCount, new Date(), before.recordDecisions);
  const checked = inspectLifetimeQuery(await transport.metadata());
  if (inspection.fingerprint !== checked.fingerprint || rulesFingerprint !== hash(await rules(db)))
    throw lifetimeError("The query or society rules changed during refresh. Previous results are unchanged; check the source and try again.", 409);
  const state = { ...before, revision: randomUUID(), updatedBy: user.id, snapshot: { ...history, societies, rulesFingerprint,
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
