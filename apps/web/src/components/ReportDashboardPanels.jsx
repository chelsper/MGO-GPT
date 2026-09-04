"use client";

import { useEffect, useId, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Columns2,
  GripVertical,
  Maximize2,
  Rows3,
  X,
} from "lucide-react";
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

export function reorderDashboardPanels(configuration, sourceKey, targetKey) {
  const panels = Array.isArray(configuration?.panels) ? configuration.panels : [];
  const sourceIndex = panels.findIndex((panel) => panel.key === sourceKey);
  const targetIndex = panels.findIndex((panel) => panel.key === targetKey);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return configuration;
  const nextPanels = [...panels];
  const [moved] = nextPanels.splice(sourceIndex, 1);
  nextPanels.splice(targetIndex, 0, moved);
  return { ...configuration, panels: nextPanels };
}

export function setDashboardPanelWidth(configuration, panelKey, width) {
  if (!["half", "full"].includes(width)) return configuration;
  const panels = Array.isArray(configuration?.panels) ? configuration.panels : [];
  if (!panels.some((panel) => panel.key === panelKey && panel.width !== width)) return configuration;
  return {
    ...configuration,
    panels: panels.map((panel) => panel.key === panelKey ? { ...panel, width } : panel),
  };
}

function DashboardPanel({
  panel,
  savedValues,
  savedTables,
  arrangeMode = false,
  panelIndex = 0,
  panelCount = 1,
  draggedPanelKey = "",
  onDragStart,
  onDragEnd,
  onMovePanel,
  onWidthChange,
  onExpand,
  expanded = false,
  disabled = false,
}) {
  const titleId = useId();
  const rows = Array.isArray(panel.rows) ? panel.rows : [];
  const columns = Array.isArray(panel.columns) ? panel.columns : [];
  const values = Array.isArray(panel.values) ? panel.values : [];
  const title = panel.title || "Untitled panel";
  const expandable = panel.layout === "query_results" || panel.layout === "table";
  const cells = new Map(values.map((value) => [JSON.stringify([value.rowKey, value.columnKey]), value]));
  const cellFor = (row, column) => cells.get(JSON.stringify([row.key, column.key]));
  const renderCell = (definition) => <DashboardValue definition={definition} saved={savedValues.get(definition?.key)} />;

  function dropPanel(event) {
    if (!arrangeMode || !draggedPanelKey || draggedPanelKey === panel.key) return;
    event.preventDefault();
    onMovePanel?.(draggedPanelKey, panel.key);
    onDragEnd?.();
  }

  return (
    <section
      aria-labelledby={titleId}
      className={`${styles.panel} ${expanded ? styles.expandedPanel : panel.width === "full" ? styles.full : styles.half} ${arrangeMode ? styles.arrangePanel : ""} ${draggedPanelKey && draggedPanelKey !== panel.key ? styles.dropTarget : ""}`}
      onDragOver={arrangeMode ? (event) => event.preventDefault() : undefined}
      onDrop={dropPanel}
    >
      <div className={styles.panelTitleBar}>
        <h3 id={titleId} className={styles.panelTitle}>{title}</h3>
        <div className={styles.panelActions}>
          {expandable && !expanded ? (
            <button
              type="button"
              className={styles.iconButton}
              disabled={disabled}
              onClick={() => onExpand?.(panel.key)}
              aria-label={`Open full view of ${title}`}
              title="Open full view"
            >
              <Maximize2 size={17} aria-hidden="true" />
            </button>
          ) : null}
          {arrangeMode && !expanded ? (
            <>
              <button
                type="button"
                className={`${styles.iconButton} ${styles.dragHandle}`}
                draggable
                onDragStart={(event) => {
                  if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", panel.key);
                  }
                  onDragStart?.(panel.key);
                }}
                onDragEnd={onDragEnd}
                aria-label={`Drag ${title} to reorder`}
                title="Drag to reorder"
              >
                <GripVertical size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => onMovePanel?.(panel.key, -1)}
                disabled={panelIndex === 0}
                aria-label={`Move ${title} earlier`}
                title="Move earlier"
              >
                <ArrowUp size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.iconButton}
                onClick={() => onMovePanel?.(panel.key, 1)}
                disabled={panelIndex === panelCount - 1}
                aria-label={`Move ${title} later`}
                title="Move later"
              >
                <ArrowDown size={17} aria-hidden="true" />
              </button>
              <button
                type="button"
                className={styles.widthButton}
                onClick={() => onWidthChange?.(panel.key, panel.width === "full" ? "half" : "full")}
                aria-label={`${panel.width === "full" ? "Use half width for" : "Use full width for"} ${title}`}
                title={panel.width === "full" ? "Use half width" : "Use full width"}
              >
                {panel.width === "full" ? <Columns2 size={17} aria-hidden="true" /> : <Rows3 size={17} aria-hidden="true" />}
                {panel.width === "full" ? "Half width" : "Full width"}
              </button>
            </>
          ) : null}
        </div>
      </div>
      <div className={`${styles.panelBody} ${expandable && !expanded ? styles.compactPanelBody : ""}`}>
        {panel.layout === "query_results" ? <DashboardQueryTable panel={panel} saved={savedTables.get(panel.key)} /> : panel.layout === "metric" ? (
          <dl className={styles.metrics}>
            <div className={styles.dataRow}>
              <dt>{rows.find((row) => row.key === values[0]?.rowKey)?.label || title || "Metric"}</dt>
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
      </div>
    </section>
  );
}

// Configuration is the draft dataConfiguration, never the snapshot's saved layout.
export default function ReportDashboardPanels({
  configuration,
  snapshot = null,
  arrangeMode = false,
  onMovePanel,
  onWidthChange,
  disabled = false,
}) {
  const panels = Array.isArray(configuration?.panels) ? configuration.panels : [];
  const [draggedPanelKey, setDraggedPanelKey] = useState("");
  const [expandedPanelKey, setExpandedPanelKey] = useState("");
  const savedValues = new Map((Array.isArray(snapshot?.values) ? snapshot.values : []).map((value) => [value.key, value]));
  const savedTables = new Map((Array.isArray(snapshot?.tables) ? snapshot.tables : []).map((table) => [table.key, table]));
  const expandedPanel = panels.find((panel) => panel.key === expandedPanelKey) || null;

  useEffect(() => {
    if (!expandedPanel) return undefined;
    function closeOnEscape(event) {
      if (event.key === "Escape") setExpandedPanelKey("");
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [expandedPanel]);

  function movePanel(sourceKey, target) {
    if (typeof target === "number") {
      const sourceIndex = panels.findIndex((panel) => panel.key === sourceKey);
      const targetPanel = panels[sourceIndex + target];
      if (targetPanel) onMovePanel?.(sourceKey, targetPanel.key);
      return;
    }
    onMovePanel?.(sourceKey, target);
  }

  if (!panels.length) return <p className={styles.empty}>No panels yet. Add a panel to build this dashboard.</p>;

  return (
    <>
      <div className={styles.dashboard} aria-hidden={expandedPanel ? "true" : undefined}>
        {panels.map((panel, index) => (
          <DashboardPanel
            key={panel.key}
            panel={panel}
            savedValues={savedValues}
            savedTables={savedTables}
            arrangeMode={arrangeMode}
            panelIndex={index}
            panelCount={panels.length}
            draggedPanelKey={draggedPanelKey}
            onDragStart={setDraggedPanelKey}
            onDragEnd={() => setDraggedPanelKey("")}
            onMovePanel={movePanel}
            onWidthChange={onWidthChange}
            onExpand={setExpandedPanelKey}
            disabled={disabled}
          />
        ))}
      </div>
      {expandedPanel ? (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={() => setExpandedPanelKey("")}>
          <div
            className={styles.expandedDialog}
            role="dialog"
            aria-modal="true"
            aria-label={`${expandedPanel.title || "Panel"} full view`}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className={`${styles.iconButton} ${styles.closeButton}`}
              onClick={() => setExpandedPanelKey("")}
              aria-label="Close full view"
              autoFocus
            >
              <X size={20} aria-hidden="true" />
            </button>
            <DashboardPanel
              panel={expandedPanel}
              savedValues={savedValues}
              savedTables={savedTables}
              expanded
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
