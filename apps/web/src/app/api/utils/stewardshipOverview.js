import { letterDisposition, letterPeriod } from "@/utils/societyLetters";

export function stewardshipOverview(saved, now = new Date()) {
  const timeZone = saved.time_zone || "America/New_York";
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  let period = null;
  try {
    if (saved.settings) period = letterPeriod(saved.settings, today);
  } catch {
    /* Incomplete setup is not an empty holding list. */
  }
  const current = Boolean(period && saved.period?.key === period.key);
  const history = saved.history || [];
  const holding = current
    ? new Set(
        (saved.rows || [])
          .filter(
            (row) =>
              letterDisposition(row, history, saved.exclusions || []).status ===
              "ready",
          )
          .map((row) => row.householdId),
      ).size
    : null;
  const batches = new Set();
  let readyToMail = 0;
  for (const item of history) {
    if (
      !["prepared", "pending_email", "sending", "needs_review"].includes(
        item.status,
      )
    )
      continue;
    const receipts = item.letterAppeals;
    const confirmed =
      !receipts ||
      (receipts.status === "complete" &&
        receipts.members?.length > 0 &&
        receipts.members.every((member) => member.status === "verified"));
    if (item.status === "prepared" && item.channel === "post" && confirmed)
      readyToMail++;
    else batches.add(item.batchId);
  }
  return {
    holding,
    membershipSavedAt: current ? saved.generated_at || null : null,
    inProgress: batches.size + Number(saved.drafts || 0),
    hasDraft: Number(saved.drafts || 0) > 0,
    readyToMail,
    requests: {
      open: Number(saved.request_open || 0),
      inProgress: Number(saved.request_in_progress || 0),
      overdue: Number(saved.request_overdue || 0),
    },
  };
}

export async function readStewardshipOverview(db) {
  // Project IDs and statuses, never document bytes, addresses, or staff notes.
  const [saved] = await db`
    WITH state AS (SELECT settings, snapshot, exclusions FROM stewardship_letters WHERE id = 1),
    organization AS (SELECT COALESCE(time_zone, 'America/New_York') AS zone FROM organization_settings WHERE id = 1)
    SELECT (SELECT zone FROM organization) AS time_zone,
      (SELECT settings FROM state) AS settings,
      (SELECT snapshot->'period' FROM state) AS period,
      (SELECT snapshot->>'generatedAt' FROM state) AS generated_at,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'householdId', r->'householdId', 'members', r->'members', 'period', r->'period',
        'societyKey', r->'societyKey', 'rank', r->'rank'))
        FROM state, jsonb_array_elements(COALESCE(snapshot->'rows', '[]'::jsonb)) r), '[]'::jsonb) AS rows,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'householdId', e->'householdId', 'members', e->'members', 'period', e->'period', 'restoredAt', e->'restoredAt'))
        FROM state, jsonb_array_elements(COALESCE(exclusions, '[]'::jsonb)) e), '[]'::jsonb) AS exclusions,
      COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'householdId', d.household_id, 'batchId', d.batch_id, 'status', d.status,
        'channel', d.payload->'channel', 'members', d.payload->'members', 'period', d.payload->'period',
        'societyKey', d.society_key, 'rank', d.payload->'rank', 'coveredKeys', d.payload->'coveredKeys',
        'letterAppeals', CASE WHEN d.payload ? 'letterAppeals' THEN jsonb_build_object(
          'status', d.payload#>'{letterAppeals,status}',
          'members', (SELECT jsonb_agg(jsonb_build_object('status', m->'status'))
            FROM jsonb_array_elements(d.payload#>'{letterAppeals,members}') m)) ELSE NULL END))
        FROM stewardship_letter_deliveries d WHERE d.status <> 'cancelled'
          AND (d.period_key = (SELECT snapshot#>>'{period,key}' FROM state)
            OR d.status IN ('prepared', 'pending_email', 'sending', 'needs_review'))), '[]'::jsonb) AS history,
      (SELECT COUNT(*)::int FROM stewardship_letter_postal_batches WHERE status = 'draft') AS drafts,
      COUNT(*) FILTER (WHERE status = 'Open')::int AS request_open,
      COUNT(*) FILTER (WHERE status = 'In Progress')::int AS request_in_progress,
      COUNT(*) FILTER (WHERE status IN ('Open', 'In Progress') AND needed_by <
        (NOW() AT TIME ZONE COALESCE((SELECT zone FROM organization), 'America/New_York'))::date)::int AS request_overdue
    FROM data_change_requests WHERE source_pending_action_id IS NOT NULL
  `;
  if (!saved) throw new Error("Overview unavailable");
  return stewardshipOverview(saved);
}
