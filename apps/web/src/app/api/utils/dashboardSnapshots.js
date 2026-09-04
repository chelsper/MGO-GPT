import {
  DASHBOARD_LIMITS,
  getDashboardValueFingerprint,
  getDashboardTableFingerprint,
  isValidDashboardTableData,
} from "@/app/api/utils/dashboardConfiguration";
import sql from "@/app/api/utils/sql";
import {
  DASHBOARD_COUNT_SOURCE,
  runDashboardQueryCount,
} from "@/app/api/utils/dashboardQueryCount";
import { runDashboardQueryResults } from "@/app/api/utils/dashboardQueryResults";

const TABLE_SOURCE = "query-results-csv-v1";

export const dashboardCacheKey = (reportKey) => `report:dashboard:${reportKey}`;

function queryTargets(configuration) {
  return configuration.panels.flatMap((panel) =>
    panel.layout === "query_results"
      ? [
          {
            ...panel,
            key: `table:${panel.key}`,
            panelKey: panel.key,
            table: true,
          },
        ]
      : panel.values.filter((cell) => cell.source === "query_count"),
  );
}

const executionKey = (target) =>
  target.table ? `table:${target.queryId}` : target.queryId;

function compatibleTable(panel, cached) {
  return (
    cached?.tables?.find(
      (table) =>
        table.key === panel.key &&
        table.definitionFingerprint === getDashboardTableFingerprint(panel) &&
        table.dataSource === TABLE_SOURCE &&
        (table.rows === null || isValidDashboardTableData(table)),
    ) || null
  );
}

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
        panel.layout === "query_results"
          ? [[`table:${panel.key}`, getDashboardTableFingerprint(panel)]]
          : panel.values.map((cell) => [
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
    queryTargets(configuration)
      .filter((cell) => remaining.has(cell.key))
      .map(executionKey),
  ).size;
}

function reconcileRefreshState(configuration, cached) {
  const state = cached?.refreshState;
  if (!state?.remainingKeys?.length) return null;
  const fingerprint = sourceFingerprint(configuration);
  if (state.sourceFingerprint === fingerprint) return state;
  const previouslyPending = new Set(state.remainingKeys);
  const remainingKeys = queryTargets(configuration)
    .filter((cell) => {
      const saved = cell.table
        ? compatibleTable({ ...cell, key: cell.panelKey }, cached)
        : compatibleValue(cell, cached);
      return (
        previouslyPending.has(cell.key) ||
        !saved ||
        (cell.table ? saved.rows === null : saved.value === null) ||
        Boolean(saved.error)
      );
    })
    .map((cell) => cell.key);
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
  const tables = configuration.panels
    .filter((panel) => panel.layout === "query_results")
    .map((panel) => {
      const saved = compatibleTable(panel, cached);
      const rows = saved?.rows ?? null;
      return {
        key: panel.key,
        panelKey: panel.key,
        queryId: panel.queryId,
        headers: rows === null ? [] : saved.headers,
        rows,
        status: rows === null ? "missing" : saved?.error ? "stale" : "ready",
        definitionFingerprint: getDashboardTableFingerprint(panel),
        dataSource: TABLE_SOURCE,
        refreshedAt: saved?.refreshedAt || null,
        frozenAt:
          panel.refreshPolicy === "frozen"
            ? saved?.frozenAt || saved?.refreshedAt || null
            : null,
        error: saved?.error || null,
      };
    });
  const hasMissing =
    values.some((cell) => cell.value === null) ||
    tables.some((table) => table.rows === null);
  const refreshState = reconcileRefreshState(configuration, cached);
  const remainingQueryCount = remainingQueries(
    configuration,
    refreshState?.remainingKeys,
  );
  return {
    status:
      remainingQueryCount || [...values, ...tables].some((cell) => cell.error)
        ? "partial"
        : hasMissing
          ? "refresh_required"
          : "complete",
    generatedAt: cached?.generatedAt || null,
    values,
    tables,
    warnings: [...values, ...tables]
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
  executeTableQuery = runDashboardQueryResults,
}) {
  const snapshot = presentDashboardSnapshot(
    configuration,
    cached,
    staticValueProvenance,
  );
  const valuesByKey = new Map(snapshot.values.map((cell) => [cell.key, cell]));
  for (const table of snapshot.tables)
    valuesByKey.set(`table:${table.key}`, table);
  const refreshMetrics = { queryJobs: 0, frozenSnapshotsReused: 0 };
  const now = new Date().toISOString();
  const fingerprint = sourceFingerprint(configuration);
  const previousState = reconcileRefreshState(configuration, cached);
  const remainingKeys = new Set(
    previousState?.remainingKeys ||
      queryTargets(configuration).map((cell) => cell.key),
  );
  const queryResults = { ...previousState?.queryResults };
  // Both count and table sources share one bounded refresh budget and checkpoint.
  for (const cell of queryTargets(configuration)) {
    const result = valuesByKey.get(cell.key);
    const cacheKey = executionKey(cell);
    if (!remainingKeys.has(cell.key)) continue;
    if (
      cell.refreshPolicy === "frozen" &&
      (cell.table ? result.rows !== null : result.value !== null)
    ) {
      refreshMetrics.frozenSnapshotsReused += 1;
      remainingKeys.delete(cell.key);
      continue;
    }
    if (
      !queryResults[cacheKey] &&
      refreshMetrics.queryJobs >= DASHBOARD_LIMITS.queriesPerRefresh
    )
      continue;
    try {
      if (!queryResults[cacheKey]) {
        refreshMetrics.queryJobs += 1;
        try {
          const counted = await (cell.table ? executeTableQuery : executeQuery)(
            {
              user,
              origin,
              queryId: cell.queryId,
            },
          );
          if (cell.table && !isValidDashboardTableData(counted))
            throw new Error("Invalid query table.");
          queryResults[cacheKey] = {
            ...(cell.table
              ? { headers: counted.headers, rows: counted.rows }
              : { value: counted.value }),
            refreshedAt: new Date().toISOString(),
          };
        } catch {
          queryResults[cacheKey] = { failed: true };
        }
      }
      const counted = queryResults[cacheKey];
      if (
        cell.table
          ? !isValidDashboardTableData(counted)
          : !Number.isSafeInteger(counted.value) || counted.value < 0
      )
        throw new Error("Invalid query result.");
      Object.assign(result, {
        ...(cell.table
          ? {
              headers: counted.headers,
              rows: counted.rows,
              dataSource: TABLE_SOURCE,
            }
          : { value: counted.value, countSource: DASHBOARD_COUNT_SOURCE }),
        refreshedAt: counted.refreshedAt,
        asOf: counted.refreshedAt,
        frozenAt: cell.refreshPolicy === "frozen" ? now : null,
        error: null,
        status: "ready",
      });
    } catch {
      // Never expose provider errors: they can contain signed result URLs or result content.
      result.error = cell.table
        ? "Query table refresh failed or exceeded its safety limits. Any compatible last successful table has been retained. Use Load query preview in Configure to check the query."
        : "Query refresh failed. Any compatible last successful count has been retained.";
      result.status = (
        cell.table ? result.rows === null : result.value === null
      )
        ? "missing"
        : "stale";
    }
    remainingKeys.delete(cell.key);
  }
  return {
    ...snapshot,
    status:
      remainingKeys.size ||
      [...snapshot.values, ...snapshot.tables].some((cell) => cell.error)
        ? "partial"
        : snapshot.values.some((cell) => cell.value === null) ||
            snapshot.tables.some((cell) => cell.rows === null)
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
    warnings: [...snapshot.values, ...snapshot.tables]
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
