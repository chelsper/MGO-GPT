import { createHash } from "node:crypto";
import sql from "./sql";
import { buildPipelineReport } from "@/utils/pipelineReport";
import { calendarDate, formatCalendarDate } from "@/utils/prospectActivity";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
import { dashboardReminderPolicy } from "@/utils/dashboardAssistantSettings";
import { readGiftFollowUpStatuses } from "./giftFollowUp";

export const PRIORITY_SOURCE_LIMIT = 1000;
export const priorityDay = (now = new Date()) => getStandingsPeriods(now).asOf;
export function addPriorityDays(day, days) {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
const clean = (value, fallback) => String(value || "").trim() || fallback;
const dayLabel = value => formatCalendarDate(value, { month: "short", day: "numeric", year: "numeric" });
const revision = facts => createHash("sha256").update(JSON.stringify(facts)).digest("hex");

export function buildDashboardPriorities({ actions = [], opportunities = [] }, now = new Date(), settings) {
  const policy = dashboardReminderPolicy(settings);
  const asOf = priorityDay(now);
  const followUpEnd = addPriorityDays(asOf, policy.followUpDays);
  const opportunityEnd = addPriorityDays(asOf, policy.opportunityDays);
  const items = [];
  for (const row of actions) {
    const dueDate = calendarDate(row.due_date);
    if (row.status !== "Open" || !dueDate || dueDate > followUpEnd || (row.prospect_status && row.prospect_status !== "Active")) continue;
    const title = clean(row.title, "Follow-up");
    const name = clean(row.prospect_name || row.constituent_name, "Constituent");
    items.push({
      key: `follow-up:${row.id}`, revision: revision([String(row.id), String(row.owner_user_id), title, name, dueDate, row.details || "", row.status]),
      kind: "follow-up", title, constituentName: name, dueDate,
      timing: dueDate < asOf ? "Overdue follow-up" : dueDate === asOf ? "Due today" : "Coming up",
      message: dueDate < asOf ? `This follow-up was due ${dayLabel(dueDate)}. Is it finished, or does it need a new date?`
        : dueDate === asOf ? "This follow-up is due today. Take a look when you're ready."
          : `This follow-up is due ${dayLabel(dueDate)}. Would it help to plan your next move?`,
      href: `/follow-ups?tab=next-steps&nextStepId=${encodeURIComponent(row.id)}&status=Open`,
      linkLabel: "Review follow-up", savedAt: row.updated_at || null,
    });
  }
  // Reuse pipeline identity collapse before filtering by date or open status,
  // so an older open copy cannot resurrect a newer closed opportunity.
  const pipeline = buildPipelineReport(opportunities, [], now);
  for (const item of pipeline.opportunities) {
    if (item.status !== "Active" || item.identityConflict || item.pendingChange || !item.expectedDate || item.expectedDate > opportunityEnd ||
        /\b(closed|funded|declined|withdrawn|archived|inactive|canceled|cancelled)\b/i.test(item.stage)) continue;
    const row = opportunities.find(row => String(row.id) === item.id);
    if (!row || row.prospect_status !== "Active" || Number(row.closed_amount) > 0) continue;
    const identity = item.nxtOpportunityId ? `nxt:${item.nxtOpportunityId}` : row.shared_opportunity_key ? `shared:${row.shared_opportunity_key}` : `local:${item.id}`;
    const stage = item.stage === "Stage not recorded" ? "" : item.stage;
    items.push({
      key: `opportunity:${identity}`, revision: revision([identity, item.title, item.constituentName, stage, item.expectedDate, item.amount, item.status]),
      kind: "opportunity", title: item.title, constituentName: item.constituentName, dueDate: item.expectedDate,
      timing: item.expectedDate < asOf ? "Expected date has passed" : `Expected within ${policy.opportunityDays} ${policy.opportunityDays === 1 ? "day" : "days"}`,
      message: `${stage ? `The saved stage is ${stage}, and the` : "The"} expected date is ${dayLabel(item.expectedDate)}. Does the timing still look right?`,
      href: `/my-top-prospects?prospectId=${encodeURIComponent(row.prospect_id)}`,
      linkLabel: "Review opportunity", savedAt: item.savedAt,
    });
  }
  return items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key));
}

export function applyPriorityPreferences(items, preferences, asOf) {
  const byKey = new Map(preferences.map(row => [row.item_key, row]));
  const visible = [], hidden = [];
  for (const item of items) {
    const preference = byKey.get(item.key);
    const until = calendarDate(preference?.snooze_until);
    const matches = preference?.item_revision === item.revision;
    if (matches && (preference.state === "dismissed" || (preference.state === "snoozed" && until > asOf))) {
      hidden.push({ ...item, hiddenReason: preference.state, snoozeUntil: until });
    } else visible.push(item);
  }
  return { items: visible, hidden };
}

export async function readPriorityCandidates(workspaceId, now = new Date(), sqlClient = sql, giftData = null, settings) {
  const policy = dashboardReminderPolicy(settings);
  const actions = await sqlClient`
    SELECT pa.id, pa.owner_user_id, pa.title, pa.details, pa.due_date, pa.status, pa.updated_at,
      p.status AS prospect_status, p.prospect_name, c.name AS constituent_name
    FROM pending_actions pa
    LEFT JOIN prospects p ON p.id = pa.prospect_id
    LEFT JOIN constituents c ON c.id = pa.constituent_id
    WHERE pa.owner_user_id = ${workspaceId} AND pa.status = 'Open'
      AND (pa.prospect_id IS NULL OR (p.user_id = ${workspaceId} AND p.status = 'Active'))
      AND pa.due_date <= ${addPriorityDays(priorityDay(now), policy.followUpDays)}::date
    ORDER BY pa.due_date ASC, pa.id ASC LIMIT ${PRIORITY_SOURCE_LIMIT + 1}
  `;
  const opportunities = await sqlClient`
    SELECT po.id, po.prospect_id, po.title, po.current_stage, po.opportunity_status,
      po.blackbaud_opportunity_id, po.shared_opportunity_key, po.expected_date,
      po.estimated_amount, po.closed_amount, po.close_date, po.updated_at, po.nxt_checked_at,
      po.pipeline_change_id, p.user_id, p.status AS prospect_status, p.prospect_name,
      p.blackbaud_constituent_id
    FROM prospect_opportunities po JOIN prospects p ON p.id = po.prospect_id
    WHERE p.user_id = ${workspaceId}
    ORDER BY GREATEST(po.updated_at, po.nxt_checked_at) DESC, po.id DESC LIMIT ${PRIORITY_SOURCE_LIMIT + 1}
  `;
  return {
    candidates: [...buildDashboardPriorities({ actions: actions.slice(0, PRIORITY_SOURCE_LIMIT), opportunities: opportunities.slice(0, PRIORITY_SOURCE_LIMIT) }, now, policy), ...(giftData?.items || [])],
    truncated: actions.length > PRIORITY_SOURCE_LIMIT || opportunities.length > PRIORITY_SOURCE_LIMIT || giftData?.truncated === true,
  };
}

export async function readDashboardPriorities(viewerId, workspaceId, now = new Date(), sqlClient = sql, giftData = null, settings) {
  const { candidates, truncated } = await readPriorityCandidates(workspaceId, now, sqlClient, giftData, settings);
  const preferences = candidates.length ? await sqlClient`
    SELECT item_key, item_revision, state, snooze_until FROM dashboard_priority_preferences
    WHERE viewer_user_id = ${viewerId} AND workspace_user_id = ${workspaceId}
      AND item_key IN (SELECT jsonb_array_elements_text(${JSON.stringify(candidates.map(item => item.key))}::jsonb))
  ` : [];
  const followUps = await readGiftFollowUpStatuses(workspaceId, candidates.filter(item => item.kind === "gift"), sqlClient);
  const withProgress = candidates.map(item => item.kind === "gift"
    ? { ...item, followUp: followUps.get(item.giftId) || null } : item);
  return { ...applyPriorityPreferences(withProgress, preferences, priorityDay(now)), asOf: priorityDay(now), truncated,
    ...(giftData ? { giftCoverage: giftData.coverage } : {}) };
}

export async function savePriorityPreference({ viewerId, workspaceId, item, action, days, now = new Date(), sqlClient = sql }) {
  if (action === "restore") {
    await sqlClient`DELETE FROM dashboard_priority_preferences
      WHERE viewer_user_id = ${viewerId} AND workspace_user_id = ${workspaceId}
        AND item_key = ${item.key} AND item_revision = ${item.revision}`;
    return;
  }
  const until = action === "snooze" ? addPriorityDays(priorityDay(now), days) : null;
  await sqlClient`
    INSERT INTO dashboard_priority_preferences (viewer_user_id, workspace_user_id, item_key, item_revision, state, snooze_until)
    VALUES (${viewerId}, ${workspaceId}, ${item.key}, ${item.revision}, ${action === "snooze" ? "snoozed" : "dismissed"}, ${until}::date)
    ON CONFLICT (viewer_user_id, workspace_user_id, item_key) DO UPDATE SET
      item_revision = EXCLUDED.item_revision, state = EXCLUDED.state,
      snooze_until = EXCLUDED.snooze_until, updated_at = NOW()
  `;
}
