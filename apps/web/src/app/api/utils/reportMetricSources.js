import { createHash } from "node:crypto";
import {
  getAlumniDonorCountRows, getAlumniDonorCountRowFingerprint,
  getAlumniGenericDashboard, normalizeAlumniFamilyEngagementDashboard,
} from "./alumniDonorConfiguration";
import {
  normalizeDashboardConfiguration, getDashboardValueFingerprint,
  getDashboardTableFingerprint,
} from "./dashboardConfiguration";
import { canUserViewReport, normalizeReportVisibility, parseReportSpecificUserIds } from "./reportAccess";
import { canUserViewDashboard } from "./dashboardConfigurations";
import { getReportDefinition, getReportHref } from "./reportRegistry";
import { presentDashboardSnapshot } from "./dashboardSnapshots";

export const METRIC_ALUMNI_KEY = "alumni-family-engagement";
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const date = (value) => value && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;

// Source references carry no copied query results or independent refresh job.
export function buildMetricSources(records, user) {
  const sources = [];
  const alumni = records.find((record) => record.report_key === METRIC_ALUMNI_KEY);
  const reports = [alumni || { report_key: METRIC_ALUMNI_KEY }, ...records.filter((record) => record.configuration_kind === "dashboard" && record.report_key !== METRIC_ALUMNI_KEY)];
  for (const record of reports) {
    const builtIn = record.report_key === METRIC_ALUMNI_KEY;
    const users = parseReportSpecificUserIds(record.specific_user_ids);
    const canView = user?.active === true && (builtIn
      ? canUserViewReport({ user, visibility: normalizeReportVisibility(record.visibility), specificUserIds: users })
      : canUserViewDashboard({ user, active: record.active, specificUserIds: users }));
    const base = {
      reportKey: record.report_key,
      reportTitle: record.title || getReportDefinition(record.report_key)?.title || "Dashboard",
      reportHref: getReportHref({ key: record.report_key, configurationSchema: builtIn ? undefined : "query-count-dashboard-v1" }),
      enabled: builtIn || record.active === true,
      canView,
      cacheKey: builtIn ? "report:alumni-family-engagement" : `report:dashboard:${record.report_key}`,
      builtIn,
      provenance: record.value_provenance || {},
    };
    try {
      const dashboard = builtIn ? normalizeAlumniFamilyEngagementDashboard(record.data_configuration) : null;
      const generic = builtIn ? getAlumniGenericDashboard(dashboard) : normalizeDashboardConfiguration(record.data_configuration);
      function add(kind, panelKey, valueKey, label, definition, fingerprint, panel, configuration) {
        const id = [record.report_key, kind, panelKey, valueKey].join(":");
        sources.push({ ...base, id, kind, panelKey, valueKey, label,
          panelTitle: panel?.title || definition.panelTitle,
          sourceType: kind === "table" ? "query_table" : kind === "alumni_count" ? "query_count" : definition.source,
          queryId: definition.queryId || null,
          refreshPolicy: definition.source === "static" ? "manual" : definition.refreshPolicy || "refreshable",
          fingerprint: hash([record.id || "built-in", id, fingerprint]),
          definition, panel, configuration, dashboard,
        });
      }
      if (builtIn) {
        for (const row of getAlumniDonorCountRows(dashboard))
          add("alumni_count", row.panelKey, row.key, row.label, row, getAlumniDonorCountRowFingerprint(dashboard, row));
      }
      for (const panel of generic.panels) {
        if (panel.layout === "query_results") {
          add("table", panel.key, "", panel.title, panel, getDashboardTableFingerprint(panel), panel, generic);
        } else for (const value of panel.values) {
          const row = panel.rows.find((entry) => entry.key === value.rowKey)?.label;
          const column = panel.columns.find((entry) => entry.key === value.columnKey)?.label;
          const label = panel.layout === "metric" ? panel.title : [row, panel.columns.length > 1 ? column : null].filter(Boolean).join(" / ");
          // Manual values may change normally; changing the source kind still invalidates the reference.
          add("value", panel.key, value.key, label, value,
            value.source === "static" ? "static" : getDashboardValueFingerprint(value), panel, generic);
        }
      }
    } catch {
      // Malformed sources are unavailable, never guessed or silently converted.
      continue;
    }
  }
  return sources;
}

export function metricSourceMetadata(source) {
  if (!source) return null;
  return Object.fromEntries(["id", "reportKey", "reportTitle", "reportHref", "enabled", "label", "panelTitle", "sourceType", "queryId", "refreshPolicy", "fingerprint"].map((key) => [key, source[key]]));
}

export function presentMetricResult(source, cached) {
  if (source.kind === "alumni_count") {
    const saved = cached?.totals?.find((row) => row.key === source.valueKey && row.panelKey === source.panelKey);
    const compatible = saved?.countSource === "query-result-csv-row-count-v3" &&
      saved.definitionFingerprint === getAlumniDonorCountRowFingerprint(source.dashboard, source.definition) &&
      Number.isSafeInteger(saved.total) && saved.total >= 0;
    return { type: "number", value: compatible ? saved.total : null,
      status: compatible ? (saved.error ? "stale" : "ready") : "missing",
      asOf: compatible ? date(saved.frozenAt || cached.generatedAt) : null,
      provenance: "saved_query", refreshPolicy: source.refreshPolicy };
  }
  const snapshot = presentDashboardSnapshot(source.configuration, source.builtIn ? cached?.genericSnapshot : cached, source.provenance);
  if (source.kind === "table") {
    const saved = snapshot.tables.find((table) => table.key === source.panelKey);
    return { type: "table", status: saved.status, headers: saved.headers, rows: saved.rows,
      columnSettings: source.panel.columnSettings, asOf: date(saved.frozenAt || saved.refreshedAt),
      provenance: "saved_query", refreshPolicy: source.refreshPolicy };
  }
  const saved = snapshot.values.find((value) => value.key === source.valueKey);
  return { type: "number", value: saved.value, status: saved.status, asOf: date(saved.frozenAt || saved.asOf),
    provenance: saved.provenance, refreshPolicy: source.refreshPolicy };
}
