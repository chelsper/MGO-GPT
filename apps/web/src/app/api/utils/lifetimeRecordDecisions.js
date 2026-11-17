import { createHash } from "node:crypto";
import { lifetimeActiveGroupIds } from "@/utils/lifetimeSocieties";

const hash = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
// Query-local identities are not a canonical crosswalk. A changed name/type/ID
// leaves the old decision saved for review rather than attaching it by guesswork.
const identity = row => [row.id, row.systemId || null, row.lookupId || "", row.name, row.constituentType || "unknown"];
export const lifetimeRecordKey = row => hash(row.members
  ? ["household", row.groupBasis, row.members.map(identity).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))]
  : ["constituent", identity(row)]);
export const lifetimeMilestoneKey = row => hash([lifetimeRecordKey(row), row.societyKey]);

export function lifetimeDecisionIndexes(decisions = {}) {
  return { archives: new Map((decisions.archives || []).map(entry => [entry.key, entry])),
    milestones: new Map((decisions.milestones || []).map(entry => [entry.key, entry])) };
}

export function applyLifetimeDecisions(snapshot, decisions = {}) {
  if (!snapshot) return null;
  const { archives, milestones } = lifetimeDecisionIndexes(decisions);
  function decorate(row) {
    const recordKey = lifetimeRecordKey(row), milestoneKey = lifetimeMilestoneKey(row);
    const confirmation = milestones.get(milestoneKey);
    const members = row.members?.map(member => ({ ...member, recordKey: lifetimeRecordKey(member), archived: archives.has(lifetimeRecordKey(member)) }));
    return { ...row, recordKey, milestoneKey, ...(members ? { members } : {}),
      archived: members ? members.every(member => member.archived) : archives.has(recordKey),
      ...(confirmation ? { date: confirmation.date, status: "confirmed", confirmedAt: confirmation.at,
        crossingGiftIds: confirmation.crossingGiftIds,
        confirmationNote: confirmation.rulesFingerprint !== snapshot.rulesFingerprint || confirmation.ruleVersion !== snapshot.ruleVersion
          ? "Society calculation rules have changed since confirmation. The staff-confirmed date is preserved; review it if needed."
          : "Staff-confirmed entry date. Refreshes do not change this date." }
        : row.calculationSkipped ? { date: null, status: "review", crossingGiftIds: [],
          reasons: [...row.reasons, "Date review reopened. Refresh gift history to calculate a new provisional date."] } : {}) };
  }
  return { ...snapshot, rows: snapshot.rows.map(decorate),
    sharedGroups: (snapshot.sharedGroups || []).map(group => ({ ...group, rows: group.rows.map(decorate) })) };
}

export function publicLifetimeDecisions(decisions = {}, snapshot) {
  const active = lifetimeActiveGroupIds(snapshot);
  const rows = [...(snapshot?.rows || []), ...(snapshot?.sharedGroups || []).filter(group => active.has(group.id)).flatMap(group => group.rows)];
  const records = new Set(rows.filter(row => !row.members).map(lifetimeRecordKey));
  const milestones = new Set(rows.map(lifetimeMilestoneKey));
  return {
    archives: (decisions.archives || []).map(({ key, name, constituentType, lookupId, systemId, at }) =>
      ({ key, name, constituentType, lookupId, systemId, at, matched: records.has(key) })),
    milestones: (decisions.milestones || []).map(({ key, name, societyName, date, at }) =>
      ({ key, name, societyName, date, at, matched: milestones.has(key) })),
  };
}
