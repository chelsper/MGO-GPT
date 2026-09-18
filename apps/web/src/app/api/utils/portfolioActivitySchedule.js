import { createHash } from "node:crypto";
import { ACTIVITY_FRESH_MS } from "./portfolioActivityData";

export const ACTIVITY_QUEUE_LIMIT = 20;
const STAGGER_MS = 6 * 60 * 60 * 1000;
const SLOTS = ["priority", "priority", "routine", "priority", "retry", "routine", "priority", "routine"];

// Reserve room for ongoing coverage and retries while first-fill work progresses.
export function selectActivityRows(candidates) {
  const queues = { priority: [], routine: [], retry: [] };
  for (const row of candidates) queues[row.queue_lane]?.push(row);
  const selected = [];
  for (let i = 0; i < ACTIVITY_QUEUE_LIMIT; i++) {
    const preferred = queues[SLOTS[i % SLOTS.length]];
    const queue = preferred.length ? preferred : Object.values(queues).find(items => items.length);
    if (!queue) break;
    selected.push(queue.shift());
  }
  return selected;
}

export function activityNextCheckAt(row, checkedAt) {
  const checked = Date.parse(checkedAt);
  if (!Number.isFinite(checked)) throw new Error("invalid_activity_check_time");
  const key = JSON.stringify([row.origin, String(row.workspace_user_id), row.constituent_id, row.kind]);
  const stagger = createHash("sha256").update(key).digest().readUInt32BE(0) % (STAGGER_MS + 1);
  return new Date(checked + ACTIVITY_FRESH_MS + stagger).toISOString();
}
