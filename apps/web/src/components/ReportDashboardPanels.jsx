"use client";

import { useId } from "react";
import { getDashboardTableFingerprint, getDashboardValueFingerprint, isValidDashboardTableData } from "@/app/api/utils/dashboardConfiguration";
import QueryResultsTable from "./QueryResultsTable";
import styles from "./reportDashboard.module.css";

function formatTime(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function DashboardValue({ definition, saved }) {
  const isStatic = definition?.source === "static";
  const matches = definition && saved?.definitionFingerprint === getDashboardValueFingerprint(definition);
  const candidate = isStatic ? definition.staticValue : matches ? saved.value : null;
  const known = typeof candidate === "number" && Number.isFinite(candidate);
  const asOf = matches ? formatTime(saved?.asOf || (isStatic ? null : saved?.frozenAt || saved?.refreshedAt)) : null;
  const updatedBy = isStatic && matches && typeof saved?.updatedBy?.name === "string" ? saved.updatedBy.name.trim() : "";
  const frozen = !isStatic && definition?.refreshPolicy === "frozen";

  return (
    <div className={styles.value}>
      <strong className={known ? styles.number : styles.unknown}>
        {known ? candidate.toLocaleString("en-US") : "Not refreshed"}
      </strong>
      <div className={styles.valueStatus}>
        {isStatic ? <span className={styles.badge}>Static value</span> : null}
        {frozen ? <span className={styles.badge}>Frozen</span> : null}
        {asOf ? <span>As of {asOf}</span> : null}
        {updatedBy ? <span>Updated by {updatedBy}</span> : null}
        {!isStatic && matches && saved?.status === "stale" ? <span>Last successful value; refresh failed</span> : null}
        {!isStatic && matches && !known && saved?.error ? <span>Query refresh failed</span> : null}
      </div>
      {definition?.note ? <p className={styles.note}>{definition.note}</p> : null}
    </div>
  );
}

function DashboardQueryTable({ panel, saved }) {
  const fingerprint = getDashboardTableFingerprint(panel);
  const matches = saved?.key === panel.key && saved?.panelKey === panel.key &&
    String(saved?.queryId) === String(panel.queryId) && saved?.dataSource === "query-results-csv-v1" &&
    saved?.definitionFingerprint === fingerprint;
  const known = matches && ["ready", "stale"].includes(saved.status) && isValidDashboardTableData(saved);
  const asOf = known ? formatTime(saved.frozenAt || saved.refreshedAt) : null;

  return (
    <div className={styles.queryResults}>
      <div className={styles.valueStatus}>
        {panel.refreshPolicy === "frozen" ? <span className={styles.badge}>Frozen</span> : null}
        {asOf ? <span>As of {asOf}</span> : null}
        {known && saved.status === "stale" ? <span>Last successful table; refresh failed</span> : null}
        {matches && !known && saved.error ? <span>Query refresh failed</span> : null}
      </div>
      {known ? <QueryResultsTable key={fingerprint} title={panel.title || "Untitled panel"} headers={saved.headers} rows={saved.rows} columnSettings={panel.columnSettings || []} /> : <p className={styles.unknown}>Not refreshed</p>}
    </div>
  );
}

function DashboardPanel({ panel, savedValues, savedTables }) {
  const titleId = useId();
  const rows = Array.isArray(panel.rows) ? panel.rows : [];
  const columns = Array.isArray(panel.columns) ? panel.columns : [];
  const values = Array.isArray(panel.values) ? panel.values : [];
  const cells = new Map(values.map((value) => [JSON.stringify([value.rowKey, value.columnKey]), value]));
  const cellFor = (row, column) => cells.get(JSON.stringify([row.key, column.key]));
  const renderCell = (definition) => <DashboardValue definition={definition} saved={savedValues.get(definition?.key)} />;

  return (
    <section
      aria-labelledby={titleId}
      className={`${styles.panel} ${panel.width === "full" ? styles.full : styles.half}`}
    >
      <h3 id={titleId} className={styles.panelTitle}>{panel.title || "Untitled panel"}</h3>
      {panel.layout === "query_results" ? <DashboardQueryTable panel={panel} saved={savedTables.get(panel.key)} /> : panel.layout === "metric" ? (
        <dl className={styles.metrics}>
          <div className={styles.dataRow}>
            <dt>{rows.find((row) => row.key === values[0]?.rowKey)?.label || panel.title || "Metric"}</dt>
            <dd>{renderCell(values[0])}</dd>
          </div>
        </dl>
      ) : !rows.length || !columns.length ? <p className={styles.help}>Add rows and columns to this panel.</p> : panel.layout === "table" ? (
        <>
        <p className={styles.scrollHint}>Scroll across the table to see additional columns.</p>
        <div className={styles.tableScroll} role="region" aria-labelledby={titleId} tabIndex={0}>
          <table className={styles.table} aria-labelledby={titleId}>
            <thead>
              <tr>
                <th scope="col">Label</th>
                {columns.map((column) => <th key={column.key} scope="col">{column.label}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}>
                  <th scope="row">{row.label}</th>
                  {columns.map((column) => <td key={column.key}>{renderCell(cellFor(row, column))}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <dl className={styles.rows}>
          {rows.flatMap((row) => columns.map((column) => (
            <div className={styles.dataRow} key={JSON.stringify([row.key, column.key])}>
              <dt>{row.label}{columns.length > 1 ? <span className={styles.columnLabel}>{column.label}</span> : null}</dt>
              <dd>{renderCell(cellFor(row, column))}</dd>
            </div>
          )))}
        </dl>
      )}
    </section>
  );
}

// Configuration is the draft dataConfiguration, never the snapshot's saved layout.
export default function ReportDashboardPanels({ configuration, snapshot = null }) {
  const panels = Array.isArray(configuration?.panels) ? configuration.panels : [];
  const savedValues = new Map((Array.isArray(snapshot?.values) ? snapshot.values : []).map((value) => [value.key, value]));
  const savedTables = new Map((Array.isArray(snapshot?.tables) ? snapshot.tables : []).map((table) => [table.key, table]));

  if (!panels.length) return <p className={styles.empty}>No panels yet. Add a panel to build this dashboard.</p>;

  return (
    <div className={styles.dashboard}>
      {panels.map((panel) => <DashboardPanel key={panel.key} panel={panel} savedValues={savedValues} savedTables={savedTables} />)}
    </div>
  );
}
