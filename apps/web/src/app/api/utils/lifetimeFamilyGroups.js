import { createHash, randomUUID } from "node:crypto";
import sql from "./sql";
import { lifetimeBaseGroupIds, lifetimeError } from "@/utils/lifetimeSocieties";
import { lifetimeDecisionIndexes, lifetimeRecordKey, lifetimeMilestoneKey } from "./lifetimeRecordDecisions";
import { combineLifetimeEvents } from "./lifetimeGiftReview";
import { analyzeReconciledLifetime, summarizeReconciledLifetime } from "./lifetimeLinkedHistory";
import { publicLifetimeState, readLifetimeState, readLifetimeRules } from "./lifetimeSocieties";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const CACHE_KEY = "report:lifetime-giving-societies:v1";
const member = ({ id, systemId, lookupId, name, constituentType }) => ({ id, systemId, lookupId, name, constituentType });

// Only explicit, exact saved identities participate. A missing member disables
// the entire family group; it must never silently become a smaller household.
export function materializeLifetimeFamilies(state) {
  const snapshot = state.snapshot;
  if (!snapshot) return;
  snapshot.sharedGroups = (snapshot.sharedGroups || []).filter(group => !group.family);
  const active = lifetimeBaseGroupIds(snapshot), byHousehold = new Map();
  const records = new Map(snapshot.rows.map(row => [lifetimeRecordKey(row), row]));
  const owners = new Map();
  for (const link of state.familyLinks || []) {
    if (!byHousehold.has(link.householdKey)) byHousehold.set(link.householdKey, []);
    byHousehold.get(link.householdKey).push(link);
    const previous = owners.get(link.organizationKey);
    owners.set(link.organizationKey, previous && previous !== link.householdKey ? "conflict" : link.householdKey);
  }
  const evidence = snapshot.giftReview;
  if (evidence?.version !== 1) return;
  const confirmations = lifetimeDecisionIndexes(state.recordDecisions).milestones;
  for (const [householdKey, links] of byHousehold) {
    const base = snapshot.sharedGroups.find(group => active.has(group.id) && lifetimeRecordKey(group.rows[0]) === householdKey);
    const organizations = links.map(link => records.get(link.organizationKey));
    if (!base || base.members.some(person => person.constituentType !== "individual") || organizations.some(person => !person || person.constituentType !== "organization") ||
      links.some(link => owners.get(link.organizationKey) !== householdKey) || new Set(links.map(link => link.organizationKey)).size !== links.length) continue;
    const members = [...base.members.map(member), ...organizations.map(member)].sort((a, b) => a.id.localeCompare(b.id));
    if (members.some(person => !Array.isArray(evidence.histories[person.id]))) continue;
    const id = hash(["family", householdKey, links.map(link => link.organizationKey).sort()]);
    const identity = { id: `family:${id}`, name: `${base.members.map(person => person.name).join(" & ")} + ${organizations.map(person => person.name).sort().join(" + ")}`,
      systemId: null, lookupId: "", constituentType: "mixed", groupBasis: "family", members };
    const history = [...combineLifetimeEvents(members.map(person => evidence.histories[person.id].map(event => ({ ...event, recipientIds: [person.id] })))).values()];
    const linked = evidence.linkedScopes?.[lifetimeRecordKey(identity)];
    const rows = snapshot.societies.map(society => {
      const row = { ...identity, societyKey: society.key, societyName: society.name, thresholdCents: Math.round(society.minimumAmount * 100) };
      const analysis = analyzeReconciledLifetime(history, { sources: society.countSources, fullRecognition: snapshot.source.fullRecognition, today: evidence.asOf }, linked?.checks || [], linked?.blockedChecks || []);
      if (snapshot.source.restrictedHistory) analysis.reasons.push("Gift-level criteria may exclude earlier qualifying gifts.");
      if (!society.countSources.includes("committed") || society.countSources.some(source => !["committed", "recognition_credit"].includes(source)))
        analysis.reasons.push("This society's saved recognition rule needs a separate historical calculation.");
      return { ...row, ...summarizeReconciledLifetime(analysis, row.thresholdCents, confirmations.has(lifetimeMilestoneKey(row))),
        giftCount: analysis.items.length, householdNote: "",
        constituentTypeNote: "Staff-linked family giving group: all imported qualifying gifts for the household and explicitly linked organizations, counted once per gift. This does not assign the organization's gifts to either spouse's individual record." };
    });
    snapshot.sharedGroups.push({ id, family: true, automatic: false, baseGroupId: base.id, householdKey, linkKeys: links.map(link => link.key), members, rows });
  }
}

export function publicLifetimeFamilyLinks(state, snapshot) {
  const matched = new Set((snapshot?.sharedGroups || []).filter(group => group.family).flatMap(group => group.linkKeys));
  return (state.familyLinks || []).map(({ key, householdKey, organizationKey, householdName, organizationName, at }) =>
    ({ key, householdKey, organizationKey, householdName, organizationName, at, matched: matched.has(key) }));
}

export async function updateLifetimeFamily({ revision, householdKey, recordKey, familyLinkKey, operation, user, db = sql, rules = readLifetimeRules }) {
  const before = await readLifetimeState(db), societies = await rules(db);
  if (revision !== before.revision) throw lifetimeError("Saved history changed. Reload before changing a family giving group.", 409);
  const snapshot = publicLifetimeState(before, societies).snapshot;
  let links = [...(before.familyLinks || [])], changed;
  if (operation === "link-family") {
    const active = lifetimeBaseGroupIds(snapshot);
    const base = snapshot?.sharedGroups.find(group => active.has(group.id) && lifetimeRecordKey(group.rows[0]) === householdKey);
    const organization = snapshot?.rows.find(row => lifetimeRecordKey(row) === recordKey);
    if (!base || base.rows[0].archived || base.members.some(person => person.constituentType !== "individual") || !organization || organization.constituentType !== "organization")
      throw lifetimeError("Choose a current active household and an organization from this saved report. No names or IDs are guessed.", 409);
    if (before.snapshot.giftReview?.version !== 1) throw lifetimeError("Refresh gift history once to save the evidence needed for a family giving group.", 409);
    if (links.some(link => link.organizationKey === recordKey)) throw lifetimeError("This organization already has a saved family link. Unlink it before assigning it again.", 409);
    if (links.length >= 1000 || links.filter(link => link.householdKey === householdKey).length >= 10)
      throw lifetimeError("The family-link limit was reached. Existing groups are unchanged.", 413);
    changed = { key: hash([householdKey, recordKey]), householdKey, organizationKey: recordKey, householdName: base.rows[0].name,
      organizationName: organization.name, at: new Date().toISOString(), userId: user.id };
    links.push(changed);
  } else if (operation === "unlink-family") {
    changed = links.find(link => link.key === familyLinkKey);
    if (!changed) throw lifetimeError("This family link is no longer saved. Reload the report.", 409);
    links = links.filter(link => link.key !== familyLinkKey);
  } else throw lifetimeError("Unknown family group action.", 400);
  const state = structuredClone(before);
  state.familyLinks = links;
  materializeLifetimeFamilies(state);
  if (operation === "link-family" && !state.snapshot.sharedGroups.some(group => group.family && group.linkKeys.includes(changed.key)))
    throw lifetimeError("This household's saved member history is incomplete or changed. Existing groups are unchanged; reload and review the saved links.", 409);
  if (hash(societies) !== hash(await rules(db))) throw lifetimeError("Society rules changed. Reload before changing family groups.", 409);
  state.revision = randomUUID(); state.updatedBy = user.id;
  state.familyAudit = [...(before.familyAudit || []), { operation, link: changed, at: new Date().toISOString(), userId: user.id }].slice(-200);
  const published = await db`UPDATE report_snapshots_cache SET payload=${JSON.stringify(state)}::jsonb,updated_at=NOW()
    WHERE report_key=${CACHE_KEY} AND payload->>'revision'=${revision} RETURNING report_key`;
  if (!published.length) throw lifetimeError("Saved history changed. Reload before changing family groups.", 409);
  return { state, societies };
}
