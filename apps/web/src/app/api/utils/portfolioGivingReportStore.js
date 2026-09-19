import { createHash, randomUUID } from "node:crypto";
import sql from "@/app/api/utils/sql";

export function portfolioReportKeys(workspaceUser, origin, period) {
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([
        origin,
        workspaceUser.id,
        workspaceUser.name,
        workspaceUser.blackbaud_constituent_id,
        workspaceUser.blackbaud_lookup_id,
        workspaceUser.blackbaud_fundraiser_alias_ids,
        period.startDate,
      ]),
    )
    .digest("hex");
  const snapshot = `portfolio-report-v1:${workspaceUser.id}:${fingerprint}`;
  return { snapshot, job: `${snapshot}:refresh` };
}

export async function readPortfolioReport(keys) {
  const rows = await sql`
    SELECT report_key, payload FROM report_snapshots_cache
    WHERE report_key = ANY(${[keys.snapshot, keys.job]})
  `;
  return {
    snapshot:
      rows.find((row) => row.report_key === keys.snapshot)?.payload || null,
    job: rows.find((row) => row.report_key === keys.job)?.payload || null,
  };
}

// A persisted lease and revision protect concurrent tabs and late responses.
// In-progress data never shares the published snapshot's key.
export async function claimPortfolioReport(
  keys,
  previous,
  next,
  now = Date.now(),
) {
  const claimed = {
    ...next,
    revision: randomUUID(),
    leaseUntil: now + 360_000,
  };
  const rows = await sql`
    INSERT INTO report_snapshots_cache (report_key, payload, updated_at)
    VALUES (${keys.job}, ${JSON.stringify(claimed)}::jsonb, NOW())
    ON CONFLICT (report_key) DO UPDATE
      SET payload = EXCLUDED.payload, updated_at = NOW()
      WHERE report_snapshots_cache.payload->>'revision' = ${previous?.revision || null}
        AND COALESCE((report_snapshots_cache.payload->>'leaseUntil')::bigint, 0) <= ${now}
    RETURNING report_key
  `;
  return rows.length ? claimed : null;
}

export async function checkpointPortfolioReport(
  keys,
  claimed,
  next,
  snapshot = null,
) {
  const checkpoint = { ...next, revision: randomUUID(), leaseUntil: 0 };
  const now = Date.now();
  if (snapshot) {
    // Publish and mark complete in the same statement, only for the lease owner.
    const rows = await sql`
      WITH finished AS (
        UPDATE report_snapshots_cache
        SET payload = ${JSON.stringify(checkpoint)}::jsonb, updated_at = NOW()
        WHERE report_key = ${keys.job}
          AND payload->>'revision' = ${claimed.revision}
          AND (payload->>'leaseUntil')::bigint > ${now}
        RETURNING report_key
      )
      INSERT INTO report_snapshots_cache (report_key, payload, updated_at)
      SELECT ${keys.snapshot}, ${JSON.stringify(snapshot)}::jsonb, NOW() FROM finished
      ON CONFLICT (report_key) DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()
      RETURNING report_key
    `;
    return rows.length > 0;
  }
  const rows = await sql`
    UPDATE report_snapshots_cache
    SET payload = ${JSON.stringify(checkpoint)}::jsonb, updated_at = NOW()
    WHERE report_key = ${keys.job}
      AND payload->>'revision' = ${claimed.revision}
      AND (payload->>'leaseUntil')::bigint > ${now}
    RETURNING report_key
  `;
  return rows.length > 0;
}

export function publicPortfolioReport({ snapshot, job }, period) {
  return {
    snapshot,
    period,
    refresh: job
      ? {
          id: job.id,
          status: job.status,
          stage: job.stage,
          checked: job.givingOffset || 0,
          total: job.people?.length || 0,
          profilesChecked: job.profileOffset || 0,
          profilesTotal: job.profileIds?.length || 0,
          message: job.message || "",
          retryAt: job.retryAt || null,
          busy: job.leaseUntil > Date.now(),
        }
      : null,
  };
}
