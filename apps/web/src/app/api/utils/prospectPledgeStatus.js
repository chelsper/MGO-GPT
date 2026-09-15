import sql from "./sql";
import { pledgeScope } from "./pledgePaymentStore";
import { isPledgeQueryJob } from "./pledgeQuerySource";
import { isReviewerRole } from "@/utils/workspaceRoles";
import { calendarDate } from "@/utils/prospectActivity";
import { OPEN_PLEDGE_QUERY_ID } from "@/utils/pledgePayments";

const validId = (value) => /^[1-9]\d{0,19}$/.test(String(value ?? ""));

export function pledgePresence(items, allowedIds, job) {
  const byConstituentId = {};
  const seen = new Set();
  for (const item of items) {
    const record = item.payload;
    const id = String(record?.constituentId ?? "");
    if (
      !allowedIds.has(id) ||
      item.run_id !== job.id ||
      !validId(record?.id) ||
      String(item.pledge_id) !== record.id ||
      seen.has(record.id) ||
      !Number.isSafeInteger(record.balanceCents) ||
      record.balanceCents <= 0 ||
      !Number.isFinite(Date.parse(record.refreshedAt)) ||
      !Array.isArray(record.installments)
    )
      continue;
    const schedule = record.installments;
    if (
      schedule.some(
        (entry) =>
          !entry ||
          !calendarDate(entry.date) ||
          !Number.isSafeInteger(entry.balanceCents) ||
          entry.balanceCents < 0,
      ) ||
      schedule.reduce((sum, entry) => sum + entry.balanceCents, 0) !==
        record.balanceCents
    )
      continue;
    // Positive unpaid installments put a verified pledge in one or both report
    // tabs. Count the gift once, not once per installment or report tab.
    seen.add(record.id);
    const previous = byConstituentId[id];
    const verifiedAt = new Date(record.refreshedAt).toISOString();
    byConstituentId[id] = {
      count: (previous?.count || 0) + 1,
      verifiedAt:
        previous && previous.verifiedAt < verifiedAt
          ? previous.verifiedAt
          : verifiedAt,
      stale: Boolean(previous?.stale || item.status !== "success"),
    };
  }
  return byConstituentId;
}

export async function readProspectPledgeStatus({ workspaceUserId, origin }) {
  const empty = {
    queryId: OPEN_PLEDGE_QUERY_ID,
    available: false,
    byConstituentId: {},
  };
  // This is an intentionally narrow shared projection, not access to another
  // user's report/connection. Only active reviewers' same-origin query jobs
  // qualify, and only the selected workspace's existing constituent IDs leave.
  const jobs = await sql`
    SELECT j.scope_key, j.user_id, j.job, j.updated_at, u.role
    FROM pledge_payment_jobs j JOIN users u ON u.id = j.user_id
    WHERE u.active = TRUE AND j.job IS NOT NULL
  `;
  const source = jobs
    .filter(
      (row) =>
        isReviewerRole(row.role) &&
        row.scope_key === pledgeScope(row.user_id, origin) &&
        isPledgeQueryJob(row.job) &&
        typeof row.job.id === "string" &&
        Number.isFinite(Date.parse(row.job.startedAt)),
    )
    .sort(
      (a, b) =>
        Date.parse(b.job.startedAt) - Date.parse(a.job.startedAt) ||
        String(a.scope_key).localeCompare(String(b.scope_key)),
    )[0];
  // Do not combine different report runs or resurrect a pledge removed from
  // the latest manifest. Discovery must finish before sharing presence.
  if (!source || source.job.discoveryComplete !== true) return empty;
  const [workspace] = await sql`
    SELECT blackbaud_portfolio_cache FROM users WHERE id = ${workspaceUserId} AND active = TRUE
  `;
  if (!workspace) return empty;
  const prospects = await sql`
    SELECT COALESCE(NULLIF(p.blackbaud_constituent_id, ''), c.blackbaud_constituent_id) AS constituent_id
    FROM prospects p LEFT JOIN constituents c ON c.id = p.constituent_id
    WHERE p.user_id = ${workspaceUserId}
  `;
  const portfolio = workspace?.blackbaud_portfolio_cache;
  const allowedIds = new Set(
    [
      ...prospects.map((row) => row.constituent_id),
      ...(Array.isArray(portfolio?.leadSolicitor)
        ? portfolio.leadSolicitor
        : []
      ).map((row) => row.constituentId),
      ...(Array.isArray(portfolio?.supportingSolicitor)
        ? portfolio.supportingSolicitor
        : []
      ).map((row) => row.constituentId),
    ]
      .filter(validId)
      .map(String),
  );
  const items = allowedIds.size
    ? await sql`
    SELECT pledge_id, run_id, status, payload FROM pledge_payment_items
    WHERE scope_key = ${source.scope_key} AND run_id = ${source.job.id}
      AND payload->>'constituentId' = ANY(${[...allowedIds]}::text[])
  `
    : [];
  return {
    queryId: OPEN_PLEDGE_QUERY_ID,
    available: true,
    incomplete:
      source.job.status !== "completed" || Number(source.job.failed || 0) > 0,
    byConstituentId: pledgePresence(items, allowedIds, source.job),
  };
}
