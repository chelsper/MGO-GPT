import { letterDisposition } from "./societyLetters";
import {
  completeLetterAppealMembers,
  settledLetterAppealMember,
  relationshipOnlyReceipt,
} from "./societyLetterAppealMembers";

const memberIds = (row) => [
  ...new Set((row.members || []).map(String).filter(Boolean)),
];
const periodId = (row) => `${row.period?.start || ""}:${row.period?.end || ""}`;

// Freeze counts, not other recipients' identities. These counts never authorize delivery.
export function letterSelectionSummary(state, selected) {
  const periods = new Set(selected.map(periodId));
  const ids = new Set(selected.map((r) => `${periodId(r)}:${r.householdId}`));
  const counts = {
    version: 1,
    total: 0,
    selected: 0,
    notSelected: 0,
    excluded: 0,
    covered: 0,
    reserved: 0,
  };
  const seen = new Set();
  for (const row of state.snapshot?.rows || []) {
    const key = `${periodId(row)}:${row.householdId}`;
    if (!periods.has(periodId(row)) || seen.has(key)) continue;
    seen.add(key);
    counts.total++;
    if (ids.has(key)) {
      counts.selected++;
      continue;
    }
    const disposition = letterDisposition(
      row,
      state.history || [],
      state.exclusions || [],
    ).status;
    const bucket = {
      ready: "notSelected",
      held: "reserved",
      excluded: "excluded",
      covered: "covered",
    }[disposition];
    counts[bucket]++;
  }
  return counts;
}

export function savedLetterSelection(items) {
  const value = items[0]?.selectionSummary;
  const keys = ["selected", "notSelected", "excluded", "covered", "reserved"];
  if (
    value?.version !== 1 ||
    !["total", ...keys].every(
      (key) => Number.isSafeInteger(value[key]) && value[key] >= 0,
    ) ||
    value.selected !== items.length ||
    value.total !== keys.reduce((sum, key) => sum + value[key], 0) ||
    items.some(
      (item) => JSON.stringify(item.selectionSummary) !== JSON.stringify(value),
    )
  )
    return null;
  return value;
}

export function letterBatchSummary(items) {
  const counts = {
    letters: items.length,
    joint: 0,
    single: 0,
    other: 0,
    constituents: 0,
    prepared: 0,
    mailed: 0,
    emailSent: 0,
    delivered: 0,
    queued: 0,
    attention: 0,
    cancelled: 0,
  };
  const societies = new Map();
  const appeals = new Map();
  const constituents = new Set();
  let unrecordedAppeals = 0;
  for (const item of items) {
    const members = memberIds(item);
    counts[
      members.length === 1 ? "single" : members.length === 2 ? "joint" : "other"
    ]++;
    members.forEach((id) => constituents.add(id));
    const societyKey = JSON.stringify([
      periodId(item),
      item.societyKey,
      item.societyName,
    ]);
    const society = societies.get(societyKey) || {
      key: societyKey,
      name: item.societyName || item.societyKey || "Society not recorded",
      period: item.period,
      letters: 0,
    };
    society.letters++;
    societies.set(societyKey, society);

    const receipt = item.letterAppeals;
    const complete =
      receipt?.status === "complete" &&
      members.length > 0 &&
      receipt.members?.length === members.length &&
      completeLetterAppealMembers(receipt.members) &&
      members.every((id) =>
        receipt.members.some(
          (m) => String(m.id) === id && settledLetterAppealMember(m),
        ),
      );
    if (item.status === "cancelled") counts.cancelled++;
    else if (receipt && !complete) counts.attention++;
    else if (item.channel === "post" && item.status === "prepared")
      counts.prepared++;
    else if (item.channel === "post" && item.status === "mailed")
      counts.mailed++;
    else if (
      item.channel === "email" &&
      ["emailed", "delivered"].includes(item.status)
    ) {
      counts.emailSent++;
      if (item.status === "delivered") counts.delivered++;
    } else if (item.channel === "email" && item.status === "pending_email")
      counts.queued++;
    else counts.attention++;

    if (!receipt?.appeal?.id) {
      unrecordedAppeals++;
      continue;
    }
    const key = JSON.stringify([
      societyKey,
      receipt.appeal.id,
      receipt.appeal.lookupId,
      receipt.appeal.description,
      receipt.date,
    ]);
    const appeal = appeals.get(key) || {
      key,
      society: society.name,
      period: item.period,
      ...receipt.appeal,
      date: receipt.date,
      confirmed: 0,
      total: 0,
    };
    appeal.total += members.filter(
      (id) =>
        !receipt.members?.some(
          (m) => String(m.id) === id && relationshipOnlyReceipt(m),
        ),
    ).length;
    appeal.confirmed += members.filter((id) =>
      receipt.members?.some(
        (m) => String(m.id) === id && m.status === "verified",
      ),
    ).length;
    appeals.set(key, appeal);
  }
  counts.constituents = constituents.size;
  return {
    counts,
    societies: [...societies.values()],
    appeals: [...appeals.values()],
    unrecordedAppeals,
  };
}
