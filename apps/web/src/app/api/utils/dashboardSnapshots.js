import {
  DASHBOARD_LIMITS,
  getDashboardValueFingerprint,
} from "@/app/api/utils/dashboardConfiguration";
import sql from "@/app/api/utils/sql";
import {
  DASHBOARD_COUNT_SOURCE,
  runDashboardQueryCount,
} from "@/app/api/utils/dashboardQueryCount";

export const dashboardCacheKey = (reportKey) => `report:dashboard:${reportKey}`;

function compatibleValue(value, cached) {
  return (
    cached?.values?.find(
      (entry) =>
        entry.key === value.key &&
        entry.definitionFingerprint === getDashboardValueFingerprint(value) &&
        (entry.value === null || Number.isFinite(entry.value)) &&
        (value.source !== "query_count" ||
          (entry.countSource === DASHBOARD_COUNT_SOURCE &&
            (entry.value === null ||
              (Number.isSafeInteger(entry.value) && entry.value >= 0)))),
    ) || null
  );
}

function sourceFingerprint(configuration) {
  return JSON.stringify(
    configuration.panels
      .flatMap((panel) =>
        panel.values.map((cell) => [
          cell.key,
          getDashboardValueFingerprint(cell),
        ]),
      )
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

function remainingQueries(configuration, keys = []) {
  const remaining = new Set(keys);
  return new Set(
    configuration.panels.flatMap((panel) =>
      panel.values
        .filter((cell) => remaining.has(cell.key))
        .map((cell) => cell.queryId),
    ),
  ).size;
}

function reconcileRefreshState(configuration, cached) {
  const state = cached?.refreshState;
  if (!state?.remainingKeys?.length) return null;
  const fingerprint = sourceFingerprint(configuration);
  if (state.sourceFingerprint === fingerprint) return state;
  const previouslyPending = new Set(state.remainingKeys);
  const remainingKeys = configuration.panels.flatMap((panel) =>
    panel.values
      .filter((cell) => {
        if (cell.source !== "query_count") return false;
        const saved = compatibleValue(cell, cached);
        return (
          previouslyPending.has(cell.key) ||
          !saved ||
          saved.value === null ||
          Boolean(saved.error)
        );
      })
      .map((cell) => cell.key),
  );
  // A source edit does not restart successful, unchanged members of this cycle.
  return { ...state, sourceFingerprint: fingerprint, remainingKeys };
}

export function presentDashboardSnapshot(
  configuration,
  cached,
  staticValueProvenance = {},
) {
  const values = configuration.panels.flatMap((panel) =>
    panel.values.map((cell) => {
      const saved = compatibleValue(cell, cached);
      const value =
        cell.source === "static" ? cell.staticValue : (saved?.value ?? null);
      return {
        key: cell.key,
        panelKey: panel.key,
        source: cell.source,
        value,
        status: value === null ? "missing" : saved?.error ? "stale" : "ready",
        definitionFingerprint: getDashboardValueFingerprint(cell),
        refreshedAt: saved?.refreshedAt ?? null,
        frozenAt:
          cell.source === "query_count" && cell.refreshPolicy === "frozen"
            ? saved?.frozenAt || saved?.refreshedAt || null
            : null,
        asOf:
          cell.source === "static"
            ? staticValueProvenance[cell.key]?.updatedAt || saved?.asOf || null
            : saved?.refreshedAt || null,
        updatedBy:
          cell.source === "static"
            ? staticValueProvenance[cell.key]?.updatedBy ||
              saved?.updatedBy ||
              null
            : null,
        provenance: cell.source === "static" ? "manual" : "saved_query",
        error: saved?.error || null,
        countSource:
          cell.source === "static" ? "static" : DASHBOARD_COUNT_SOURCE,
      };
    }),
  );
  const hasMissing = values.some((cell) => cell.value === null);
  const refreshState = reconcileRefreshState(configuration, cached);
  const remainingQueryCount = remainingQueries(
    configuration,
    refreshState?.remainingKeys,
  );
  return {
    status:
      remainingQueryCount || values.some((cell) => cell.error)
        ? "partial"
        : hasMissing
          ? "refresh_required"
          : "complete",
    generatedAt: cached?.generatedAt || null,
    values,
    warnings: values
      .filter((cell) => cell.error)
      .map((cell) => ({ key: cell.key, error: cell.error })),
    refreshMetrics: cached?.refreshMetrics || {
      queryJobs: 0,
      frozenSnapshotsReused: 0,
    },
    refreshStatus: remainingQueryCount ? "pending" : "complete",
    remainingQueryCount,
  };
}

export async function refreshDashboardSnapshot({
  configuration,
  cached,
  user,
  origin,
  staticValueProvenance,
  executeQuery = runDashboardQueryCount,
}) {
  const snapshot = presentDashboardSnapshot(
    configuration,
    cached,
    staticValueProvenance,
  );
  const valuesByKey = new Map(snapshot.values.map((cell) => [cell.key, cell]));
  const refreshMetrics = { queryJobs: 0, frozenSnapshotsReused: 0 };
  const now = new Date().toISOString();
  const fingerprint = sourceFingerprint(configuration);
  const previousState = reconcileRefreshState(configuration, cached);
  const remainingKeys = new Set(
    previousState?.remainingKeys ||
      configuration.panels.flatMap((panel) =>
        panel.values
          .filter((cell) => cell.source === "query_count")
          .map((cell) => cell.key),
      ),
  );
  const queryResults = { ...previousState?.queryResults };
  for (const panel of configuration.panels) {
    for (const cell of panel.values) {
      const result = valuesByKey.get(cell.key);
      if (cell.source === "static") {
        result.refreshedAt = null;
        result.frozenAt = null;
        continue;
      }
      if (!remainingKeys.has(cell.key)) continue;
      if (cell.refreshPolicy === "frozen" && result.value !== null) {
        refreshMetrics.frozenSnapshotsReused += 1;
        remainingKeys.delete(cell.key);
        continue;
      }
      if (
        !queryResults[cell.queryId] &&
        refreshMetrics.queryJobs >= DASHBOARD_LIMITS.queriesPerRefresh
      )
        continue;
      try {
        if (!queryResults[cell.queryId]) {
          refreshMetrics.queryJobs += 1;
          try {
            const counted = await executeQuery({
              user,
              origin,
              queryId: cell.queryId,
            });
            queryResults[cell.queryId] = {
              value: counted.value,
              refreshedAt: new Date().toISOString(),
            };
          } catch {
            queryResults[cell.queryId] = { failed: true };
          }
        }
        const counted = queryResults[cell.queryId];
        if (!Number.isSafeInteger(counted.value) || counted.value < 0)
          throw new Error("Invalid query count.");
        Object.assign(result, {
          value: counted.value,
          countSource: DASHBOARD_COUNT_SOURCE,
          refreshedAt: counted.refreshedAt,
          asOf: counted.refreshedAt,
          frozenAt: cell.refreshPolicy === "frozen" ? now : null,
          error: null,
          status: "ready",
        });
      } catch {
        // Never expose provider errors: they can contain signed result URLs or result content.
        result.error =
          "Query refresh failed. Any compatible last successful count has been retained.";
        result.status = result.value === null ? "missing" : "stale";
      }
      remainingKeys.delete(cell.key);
    }
  }
  return {
    ...snapshot,
    status:
      remainingKeys.size || snapshot.values.some((cell) => cell.error)
        ? "partial"
        : snapshot.values.some((cell) => cell.value === null)
          ? "refresh_required"
          : "complete",
    generatedAt: now,
    refreshMetrics,
    refreshStatus: remainingKeys.size ? "pending" : "complete",
    remainingQueryCount: remainingQueries(configuration, remainingKeys),
    refreshState: {
      sourceFingerprint: fingerprint,
      remainingKeys: [...remainingKeys],
      queryResults: remainingKeys.size ? queryResults : {},
    },
    warnings: snapshot.values
      .filter((cell) => cell.error)
      .map((cell) => ({ key: cell.key, error: cell.error })),
  };
}

// Compare-and-swap avoids concurrent refreshes overwriting a newer checkpoint or frozen value.
export async function saveDashboardSnapshot(reportKey, payload, previous) {
  const rows = previous
    ? await sql`
    UPDATE report_snapshots_cache SET payload = ${JSON.stringify(payload)}::jsonb, updated_at = NOW()
    WHERE report_key = ${dashboardCacheKey(reportKey)} AND payload = ${JSON.stringify(previous)}::jsonb
    RETURNING report_key
  `
    : await sql`
    INSERT INTO report_snapshots_cache (report_key, payload, updated_at)
    VALUES (${dashboardCacheKey(reportKey)}, ${JSON.stringify(payload)}::jsonb, NOW())
    ON CONFLICT (report_key) DO NOTHING RETURNING report_key
  `;
  return Boolean(rows.length);
}

export function publicDashboardSnapshot(snapshot) {
  const { refreshState: _internal, ...publicSnapshot } = snapshot;
  return publicSnapshot;
}
