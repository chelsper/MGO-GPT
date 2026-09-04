"use client";

import { useEffect, useId, useRef, useState } from "react";
import { DASHBOARD_LIMITS, validateDashboardQueryId } from "@/app/api/utils/dashboardConfiguration";
import styles from "./reportDashboard.module.css";

let keySequence = 0;
function newKey(prefix) {
  keySequence += 1;
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${keySequence}`}`;
}

function newValue(rowKey, columnKey) {
  return { key: newKey("value"), rowKey, columnKey, source: "static", queryId: "", refreshPolicy: "refreshable", staticValue: null, note: "" };
}

function newPanel() {
  const row = { key: newKey("row"), label: "Row 1" };
  const column = { key: newKey("column"), label: "Value" };
  return { key: newKey("panel"), title: "New panel", layout: "rows", width: "half", rows: [row], columns: [column], values: [newValue(row.key, column.key)] };
}

function withMetricDimensions(panel) {
  if (panel.layout !== "metric" || (panel.rows.length && panel.columns.length)) return panel;
  const rows = panel.rows.length ? panel.rows : [{ key: newKey("row"), label: "Row 1" }];
  const columns = panel.columns.length ? panel.columns : [{ key: newKey("column"), label: "Value" }];
  return { ...panel, rows, columns, values: panel.values.map((cell) => ({ ...cell, rowKey: cell.rowKey || rows[0].key, columnKey: cell.columnKey || columns[0].key })) };
}

function confirmRemoval(values, label) {
  const populated = values.filter((cell) =>
    (cell.source === "query_count" && String(cell.queryId ?? "").trim()) ||
    (cell.source === "static" && typeof cell.staticValue === "number") ||
    String(cell.note ?? "").trim(),
  ).length;
  return !populated || window.confirm(`Remove ${label} and its ${populated} populated value${populated === 1 ? "" : "s"}? This changes only the draft until you save.`);
}

function CellEditor({ cell, label, onChange, disabled, canUseQuery }) {
  const queryInputId = useId();
  const [test, setTest] = useState(null);
  const request = useRef(null);
  const queryId = String(cell.queryId ?? "").trim();
  const queryError = validateDashboardQueryId(queryId);

  useEffect(() => {
    setTest(null);
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [cell.source, cell.queryId]);

  async function testQuery() {
    if (disabled || queryError || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setTest({ pending: true });
    try {
      const response = await fetch("/api/reports/dashboards/test-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queryId }),
        signal: controller.signal,
      });
      const result = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!response.ok || !Number.isSafeInteger(result?.value) || result.value < 0 || String(result?.queryId) !== queryId) {
        throw new Error("invalid_test_result");
      }
      // Only counts are displayed; never render upstream query payloads or URLs.
      setTest({ value: result.value });
    } catch (error) {
      if (!controller.signal.aborted) setTest({ error: "Could not test this query. Check its ID and your access, then try again." });
    } finally {
      if (request.current === controller) request.current = null;
    }
  }

  return (
    <fieldset className={styles.cellEditor} disabled={disabled}>
      <legend>{label}</legend>
      <div className={styles.cellFields}>
        <label className={styles.field}>
          Value source
          <select value={cell.source || "static"} onChange={(event) => onChange({ source: event.target.value })}>
            <option value="static">Static value</option>
            <option value="query_count" disabled={!canUseQuery && cell.source !== "query_count"}>Saved query count</option>
          </select>
        </label>
        {cell.source === "query_count" ? (
          <>
            <div className={styles.field}>
              <label htmlFor={queryInputId}>Query ID</label>
              <input
                id={queryInputId}
                value={cell.queryId ?? ""}
                inputMode="numeric"
                maxLength={16}
                aria-invalid={Boolean(queryError)}
                aria-describedby={queryError ? `${queryInputId}-error` : undefined}
                onChange={(event) => onChange({ queryId: event.target.value })}
              />
              {queryError ? <span id={`${queryInputId}-error`} className={styles.help}>{queryError}</span> : null}
            </div>
            <label className={styles.field}>
              Refresh policy
              <select value={cell.refreshPolicy || "refreshable"} onChange={(event) => onChange({ refreshPolicy: event.target.value })}>
                <option value="refreshable">Refreshable</option>
                <option value="frozen">Frozen</option>
              </select>
            </label>
          </>
        ) : (
          <label className={styles.field}>
            Static value
            <input
              type="number"
              step="any"
              value={cell.staticValue ?? ""}
              placeholder="Not refreshed"
              onChange={(event) => onChange({ staticValue: Number.isFinite(event.target.valueAsNumber) ? event.target.valueAsNumber : null })}
            />
          </label>
        )}
        <label className={`${styles.field} ${styles.cellNote}`}>
          Note
          <textarea maxLength={1000} rows={2} value={cell.note || ""} onChange={(event) => onChange({ note: event.target.value })} />
        </label>
      </div>
      {cell.source === "query_count" ? (
        <>
          <div className={styles.testActions}>
            <button className={styles.button} type="button" onClick={testQuery} disabled={disabled || Boolean(queryError) || test?.pending}>
              {test?.pending ? "Testing query..." : "Test query"}
            </button>
            {test?.pending ? <span role="status">Running query {queryId}...</span> : null}
            {test?.value !== undefined ? <span role="status" className={styles.success}>Test count: {test.value.toLocaleString("en-US")}. Not saved to the dashboard.</span> : null}
            {test?.error ? <span role="alert" className={styles.error}>{test.error}</span> : null}
          </div>
          <p className={styles.help}>Counts CSV data rows, not the sum of a result column. Your query must output one constituent per row; a single aggregate row counts as 1. Only Test query runs it here. Testing does not refresh or freeze a dashboard value.</p>
        </>
      ) : null}
    </fieldset>
  );
}

export default function ReportDashboardBuilder({ value, onChange, disabled = false }) {
  const panels = Array.isArray(value?.panels) ? value.panels : [];
  const allValues = panels.flatMap((panel) => panel.values || []);
  const queryCount = allValues.filter((cell) => cell.source === "query_count").length;
  const canAddValues = (count) => allValues.length + count <= DASHBOARD_LIMITS.values;

  function changePanels(nextPanels) {
    if (!disabled) onChange({ ...value, version: 1, panels: nextPanels.map(withMetricDimensions) });
  }

  function updatePanel(panel, patch) {
    changePanels(panels.map((item) => item.key === panel.key ? { ...item, ...patch } : item));
  }

  function addDimension(panel, dimension) {
    const otherDimension = dimension === "rows" ? "columns" : "rows";
    if (panel.layout === "metric" || (dimension === "columns" && panel.layout !== "table")) return;
    if (!canAddValues(panel[otherDimension].length) || panel[dimension].length >= DASHBOARD_LIMITS.values) return;
    const entry = { key: newKey(dimension === "rows" ? "row" : "column"), label: `${dimension === "rows" ? "Row" : "Column"} ${panel[dimension].length + 1}` };
    const cells = panel[otherDimension].map((other) => dimension === "rows" ? newValue(entry.key, other.key) : newValue(other.key, entry.key));
    updatePanel(panel, { [dimension]: [...panel[dimension], entry], values: [...panel.values, ...cells] });
  }

  function removeDimension(panel, dimension, entry) {
    if (disabled || panel[dimension].length <= 1) return;
    const reference = dimension === "rows" ? "rowKey" : "columnKey";
    if (!confirmRemoval(panel.values.filter((cell) => cell[reference] === entry.key), `${dimension === "rows" ? "row" : "column"} "${entry.label}"`)) return;
    updatePanel(panel, { [dimension]: panel[dimension].filter((item) => item.key !== entry.key), values: panel.values.filter((cell) => cell[reference] !== entry.key) });
  }

  function removePanel(panel) {
    if (disabled || !confirmRemoval(panel.values, `panel "${panel.title}"`)) return;
    changePanels(panels.filter((item) => item.key !== panel.key));
  }

  function editCell(panel, row, column, patch) {
    const cell = panel.values.find((item) => (item.rowKey || "") === row.key && (item.columnKey || "") === column.key);
    if ((!cell && !canAddValues(1)) || (patch.source === "query_count" && cell?.source !== "query_count" && queryCount >= DASHBOARD_LIMITS.queries)) return;
    const next = { ...(cell || newValue(row.key, column.key)), ...patch };
    updatePanel(panel, { values: cell ? panel.values.map((item) => item.key === cell.key ? next : item) : [...panel.values, next] });
  }

  function canUseLayout(panel, layout) {
    if (layout === "rows") return panel.columns.length <= 1;
    if (layout === "metric") return panel.values.length <= 1 && panel.rows.length <= 1 && panel.columns.length <= 1;
    return true;
  }

  function changeLayout(panel, layout) {
    if (!canUseLayout(panel, layout)) return;
    if (layout === "metric") {
      updatePanel(panel, { layout });
      return;
    }
    // Repair legacy missing dimensions without replacing source value keys.
    const rows = panel.rows.length ? panel.rows : [{ key: newKey("row"), label: "Row 1" }];
    const columns = panel.columns.length ? panel.columns : [{ key: newKey("column"), label: "Value" }];
    updatePanel(panel, { layout, rows, columns, values: panel.values.map((cell) => ({ ...cell, rowKey: cell.rowKey || rows[0].key, columnKey: cell.columnKey || columns[0].key })) });
  }

  function renderCellEditor(panel, row, column, label) {
    const cell = panel.values.find((item) => (item.rowKey || "") === row.key && (item.columnKey || "") === column.key);
    return (
      <CellEditor
        key={JSON.stringify([row.key, column.key])}
        cell={cell || { source: "static", staticValue: null }}
        label={label}
        disabled={disabled || (!cell && !canAddValues(1))}
        canUseQuery={queryCount < DASHBOARD_LIMITS.queries}
        onChange={(patch) => editCell(panel, row, column, patch)}
      />
    );
  }

  return (
    <div className={styles.builder}>
      <div className={styles.toolbar}>
        <div>
          <h3>Dashboard panels</h3>
          <p className={styles.help}>Edit layout and values without running queries. Preview uses this draft.</p>
        </div>
        <button
          type="button"
          className={styles.primary}
          disabled={disabled || panels.length >= DASHBOARD_LIMITS.panels || !canAddValues(1)}
          onClick={() => changePanels([...panels, newPanel()])}
        >Add panel</button>
      </div>
      <p className={styles.help}>{panels.length}/{DASHBOARD_LIMITS.panels} panels; {allValues.length}/{DASHBOARD_LIMITS.values} values; {queryCount}/{DASHBOARD_LIMITS.queries} saved-query values. Leave a static value blank for unknown. Zero is a valid value.</p>
      {!panels.length ? <p className={styles.empty}>Add a panel, then choose rows, a table, or metrics.</p> : null}
      {panels.map((panel, panelIndex) => (
        <section key={panel.key} className={styles.editorPanel} aria-label={`Edit panel ${panelIndex + 1}`}>
          <div className={styles.panelHeading}>
            <strong>Panel {panelIndex + 1}</strong>
            <button type="button" className={styles.remove} disabled={disabled} onClick={() => removePanel(panel)}>Remove panel</button>
          </div>
          <div className={styles.panelFields}>
            <label className={styles.field}>
              Panel title
              <input maxLength={120} value={panel.title} disabled={disabled} onChange={(event) => updatePanel(panel, { title: event.target.value })} />
            </label>
            <label className={styles.field}>
              Layout
              <select value={panel.layout} disabled={disabled} onChange={(event) => changeLayout(panel, event.target.value)}>
                <option value="rows" disabled={!canUseLayout(panel, "rows")}>Rows</option>
                <option value="table">Table</option>
                <option value="metric" disabled={!canUseLayout(panel, "metric")}>Metric</option>
              </select>
            </label>
            <label className={styles.field}>
              Panel width
              <select value={panel.width} disabled={disabled} onChange={(event) => updatePanel(panel, { width: event.target.value })}>
                <option value="half">Half width</option><option value="full">Full width</option>
              </select>
            </label>
          </div>
          <p className={styles.help}>Rows use one column; a metric requires exactly one row, one column, and at most one value. Remove extra rows or columns before choosing a smaller layout. Layout changes never delete values.</p>
          <div className={styles.axes}>
            {["rows", "columns"].map((dimension) => {
              const singular = dimension === "rows" ? "row" : "column";
              const other = dimension === "rows" ? "columns" : "rows";
              return (
                <div className={styles.axis} key={dimension}>
                  <div className={styles.axisHeading}>
                    <h4>{dimension === "rows" ? "Rows" : "Columns"}</h4>
                    <button type="button" className={styles.button} disabled={disabled || panel.layout === "metric" || (dimension === "columns" && panel.layout !== "table") || !canAddValues(panel[other].length) || panel[dimension].length >= DASHBOARD_LIMITS.values} onClick={() => addDimension(panel, dimension)}>Add {singular}</button>
                  </div>
                  {panel[dimension].map((entry, index) => (
                    <div key={entry.key} className={styles.axisItem}>
                      <label className={styles.field}>
                        {dimension === "rows" ? "Row" : "Column"} {index + 1} label
                        <input maxLength={120} value={entry.label} disabled={disabled} onChange={(event) => updatePanel(panel, { [dimension]: panel[dimension].map((item) => item.key === entry.key ? { ...item, label: event.target.value } : item) })} />
                      </label>
                      <button type="button" className={styles.remove} aria-label={`Remove ${singular} ${index + 1}`} disabled={disabled || panel[dimension].length <= 1} onClick={() => removeDimension(panel, dimension, entry)}>Remove</button>
                    </div>
                  ))}
                  <p className={styles.help}>Keep at least one {singular}. Removing one also removes its values.</p>
                </div>
              );
            })}
          </div>
          <div className={styles.cellEditors}>
            {panel.layout === "metric"
              ? renderCellEditor(panel, { key: panel.values[0]?.rowKey || panel.rows[0]?.key || "" }, { key: panel.values[0]?.columnKey || panel.columns[0]?.key || "" }, "Metric value")
              : panel.rows.flatMap((row, rowIndex) => panel.columns.map((column, columnIndex) => renderCellEditor(panel, row, column, `${row.label || `Row ${rowIndex + 1}`} / ${column.label || `Column ${columnIndex + 1}`}`)))}
          </div>
        </section>
      ))}
    </div>
  );
}
