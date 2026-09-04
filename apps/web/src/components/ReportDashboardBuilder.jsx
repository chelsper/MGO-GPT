"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  DASHBOARD_LIMITS,
  QUERY_RESULTS_LIMITS,
  isTechnicalDashboardQueryHeader,
  isValidDashboardTableData,
  validateDashboardQueryId,
} from "@/app/api/utils/dashboardConfiguration";
import QueryResultsTable from "./QueryResultsTable";
import { isQueryResultColumnVisible } from "./queryResultColumns";
import styles from "./reportDashboard.module.css";

let keySequence = 0;
function newKey(prefix) {
  keySequence += 1;
  return `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${keySequence}`}`;
}

function newValue(rowKey, columnKey) {
  return {
    key: newKey("value"),
    rowKey,
    columnKey,
    source: "static",
    queryId: "",
    refreshPolicy: "refreshable",
    staticValue: null,
    note: "",
  };
}

function newPanel() {
  const row = { key: newKey("row"), label: "Row 1" };
  const column = { key: newKey("column"), label: "Value" };
  return {
    key: newKey("panel"),
    title: "New panel",
    layout: "rows",
    width: "half",
    rows: [row],
    columns: [column],
    values: [newValue(row.key, column.key)],
  };
}

function newQueryPanel() {
  return {
    key: newKey("panel"),
    title: "Output Query",
    layout: "query_results",
    width: "full",
    queryId: "",
    refreshPolicy: "refreshable",
    columnSettings: [],
    rows: [],
    columns: [],
    values: [],
  };
}

function withMetricDimensions(panel) {
  if (panel.layout !== "metric" || (panel.rows.length && panel.columns.length))
    return panel;
  const rows = panel.rows.length
    ? panel.rows
    : [{ key: newKey("row"), label: "Row 1" }];
  const columns = panel.columns.length
    ? panel.columns
    : [{ key: newKey("column"), label: "Value" }];
  return {
    ...panel,
    rows,
    columns,
    values: panel.values.map((cell) => ({
      ...cell,
      rowKey: cell.rowKey || rows[0].key,
      columnKey: cell.columnKey || columns[0].key,
    })),
  };
}

function confirmRemoval(values, label) {
  const populated = values.filter(
    (cell) =>
      (cell.source === "query_count" && String(cell.queryId ?? "").trim()) ||
      (cell.source === "static" && typeof cell.staticValue === "number") ||
      String(cell.note ?? "").trim(),
  ).length;
  return (
    !populated ||
    window.confirm(
      `Remove ${label} and its ${populated} populated value${populated === 1 ? "" : "s"}? This changes only the draft until you save.`,
    )
  );
}

function CellEditor({
  cell,
  label,
  onChange,
  onUseQueryTable,
  disabled,
  canUseQuery,
}) {
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
      if (
        !response.ok ||
        !Number.isSafeInteger(result?.value) ||
        result.value < 0 ||
        String(result?.queryId) !== queryId
      ) {
        throw new Error("invalid_test_result");
      }
      // Only counts are displayed; never render upstream query payloads or URLs.
      setTest({ value: result.value });
    } catch (error) {
      if (!controller.signal.aborted)
        setTest({
          error:
            "Could not test this query. Check its ID and your access, then try again.",
        });
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
          <select
            value={cell.source || "static"}
            onChange={(event) => onChange({ source: event.target.value })}
          >
            <option value="static">Static value</option>
            <option
              value="query_count"
              disabled={!canUseQuery && cell.source !== "query_count"}
            >
              Saved query row count (number only)
            </option>
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
                aria-describedby={
                  queryError ? `${queryInputId}-error` : undefined
                }
                onChange={(event) => onChange({ queryId: event.target.value })}
              />
              {queryError ? (
                <span id={`${queryInputId}-error`} className={styles.help}>
                  {queryError}
                </span>
              ) : null}
            </div>
            <label className={styles.field}>
              Refresh policy
              <select
                value={cell.refreshPolicy || "refreshable"}
                onChange={(event) =>
                  onChange({ refreshPolicy: event.target.value })
                }
              >
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
              onChange={(event) =>
                onChange({
                  staticValue: Number.isFinite(event.target.valueAsNumber)
                    ? event.target.valueAsNumber
                    : null,
                })
              }
            />
          </label>
        )}
        <label className={`${styles.field} ${styles.cellNote}`}>
          Note
          <textarea
            maxLength={1000}
            rows={2}
            value={cell.note || ""}
            onChange={(event) => onChange({ note: event.target.value })}
          />
        </label>
      </div>
      {cell.source === "query_count" ? (
        <>
          <div className={styles.testActions}>
            <button
              className={styles.button}
              type="button"
              onClick={testQuery}
              disabled={disabled || Boolean(queryError) || test?.pending}
            >
              {test?.pending ? "Testing query..." : "Test query"}
            </button>
            {test?.pending ? (
              <span role="status">Running query {queryId}...</span>
            ) : null}
            {test?.value !== undefined ? (
              <span role="status" className={styles.success}>
                Test count: {test.value.toLocaleString("en-US")}. Not saved to
                the dashboard.
              </span>
            ) : null}
            {test?.error ? (
              <span role="alert" className={styles.error}>
                {test.error}
              </span>
            ) : null}
          </div>
          <p className={styles.help}>
            This value shows only the number of CSV data rows; it does not
            display the query&apos;s returned columns. Your query must output
            one constituent per row, and a single aggregate row counts as 1.
            Only Test query runs it here. Testing does not refresh or freeze a
            dashboard value.
          </p>
          {onUseQueryTable ? (
            <button
              className={styles.button}
              type="button"
              onClick={onUseQueryTable}
              disabled={disabled}
            >
              Show this query&apos;s rows and columns instead
            </button>
          ) : null}
        </>
      ) : null}
    </fieldset>
  );
}

function QueryTableEditor({ panel, onChange, disabled }) {
  const queryInputId = useId();
  const request = useRef(null);
  const [previewResult, setPreview] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const queryId = String(panel.queryId ?? "").trim();
  const preview =
    previewResult?.queryId === panel.queryId ? previewResult : null;
  const queryError = validateDashboardQueryId(queryId);
  const columnSettings = panel.columnSettings || [];
  const headers = [
    ...new Set([
      ...(preview?.headers || []),
      ...columnSettings.map((column) => column.header),
    ]),
  ].filter((header) => !isTechnicalDashboardQueryHeader(header));

  useEffect(() => {
    setPreview(null);
    setPending(false);
    setError("");
    return () => {
      request.current?.abort();
      request.current = null;
    };
  }, [panel.queryId]);
  useEffect(() => {
    if (disabled) {
      request.current?.abort();
      request.current = null;
      setPending(false);
    }
  }, [disabled]);

  function changeQueryId(nextId) {
    if (disabled || nextId === panel.queryId) return;
    if (
      columnSettings.length &&
      !window.confirm(
        "Change query ID and reset its column display settings? The previous preview will also be cleared. This changes only the draft until you save.",
      )
    )
      return;
    request.current?.abort();
    onChange({ queryId: nextId, columnSettings: [] });
  }

  function changeColumn(header, patch) {
    if (disabled) return;
    const existing = columnSettings.find((column) => column.header === header);
    if (!existing && columnSettings.length >= QUERY_RESULTS_LIMITS.columns)
      return;
    const next = { header, label: "", format: "text", ...existing, ...patch };
    onChange({
      columnSettings: existing
        ? columnSettings.map((column) =>
            column.header === header ? next : column,
          )
        : [...columnSettings, next],
    });
  }

  async function loadPreview() {
    if (disabled || queryError || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    setError("");
    try {
      const response = await fetch(
        "/api/reports/dashboards/test-query-results",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ queryId }),
          signal: controller.signal,
        },
      );
      const result = await response.json().catch(() => null);
      if (controller.signal.aborted) return;
      if (!response.ok) {
        // This endpoint sanitizes these errors; never surface thrown/network error text.
        const detail =
          [400, 401, 403, 413, 502].includes(response.status) &&
          typeof result?.error === "string"
            ? result.error.trim().slice(0, 500)
            : "";
        if (detail) {
          setError(detail);
          return;
        }
        throw new Error("query_preview_failed");
      }
      if (
        String(result?.queryId) !== queryId ||
        result?.dataSource !== "query-results-csv-v1" ||
        !isValidDashboardTableData(result)
      ) {
        throw new Error("invalid_query_preview");
      }
      // Returned cells stay in local state, never in the draft or dashboard snapshot.
      setPreview({
        queryId: panel.queryId,
        headers: result.headers,
        rows: result.rows,
      });
    } catch {
      if (!controller.signal.aborted)
        setError(
          "Could not load this query preview. Check its ID, access and result limits, then try again.",
        );
    } finally {
      if (request.current === controller) {
        request.current = null;
        setPending(false);
      }
    }
  }

  return (
    <div className={styles.queryEditor}>
      <p className={styles.warning}>
        Shared reports expose displayed query columns, including donor
        information, to the selected viewers. Review the query output, column
        visibility and report access before sharing. Blackbaud&apos;s technical
        QRECID column is never displayed.
      </p>
      <div className={styles.panelFields}>
        <div className={styles.field}>
          <label htmlFor={queryInputId}>Query ID</label>
          <input
            id={queryInputId}
            inputMode="numeric"
            maxLength={16}
            value={panel.queryId ?? ""}
            placeholder="30971"
            disabled={disabled}
            aria-invalid={Boolean(queryError)}
            aria-describedby={`${queryInputId}-help`}
            onChange={(event) => changeQueryId(event.target.value)}
          />
          <span id={`${queryInputId}-help`} className={styles.help}>
            {queryError || "Saved NXT query system record ID."}
          </span>
        </div>
        <label className={styles.field}>
          Refresh policy
          <select
            value={panel.refreshPolicy || "refreshable"}
            disabled={disabled}
            onChange={(event) =>
              onChange({ refreshPolicy: event.target.value })
            }
          >
            <option value="refreshable">Refreshable</option>
            <option value="frozen">Frozen</option>
          </select>
        </label>
      </div>
      <p className={styles.help}>
        Rows and columns come from the query automatically, with no manual axes.
        Limits: {QUERY_RESULTS_LIMITS.rows.toLocaleString("en-US")} rows,{" "}
        {QUERY_RESULTS_LIMITS.columns} columns,{" "}
        {QUERY_RESULTS_LIMITS.bytes.toLocaleString("en-US")} CSV bytes and{" "}
        {QUERY_RESULTS_LIMITS.cellCharacters.toLocaleString("en-US")} characters
        per cell. Only Load query preview runs the query here; preview data is
        not saved and does not refresh or freeze the dashboard.
      </p>
      <div className={styles.testActions}>
        <button
          type="button"
          className={styles.button}
          disabled={disabled || Boolean(queryError) || pending}
          onClick={loadPreview}
        >
          {pending ? "Loading query preview..." : "Load query preview"}
        </button>
        {pending ? <span role="status">Loading query {queryId}...</span> : null}
        {error ? (
          <span role="alert" className={styles.error}>
            {error}
            {preview ? " Showing the last successful preview." : ""}
          </span>
        ) : null}
      </div>
      {headers.length ? (
        <details className={styles.columnSettings}>
          <summary>Column display settings (optional)</summary>
          <p className={styles.help}>
            Settings match exact query headers. Text preserves NXT amounts as
            returned. Choose Number or Currency (USD) explicitly to format
            amounts; unrecognized values remain text. Only columns marked Show
            column appear in the report.
          </p>
          {headers.map((header) => {
            const setting = columnSettings.find(
              (column) => column.header === header,
            );
            const atLimit =
              !setting && columnSettings.length >= QUERY_RESULTS_LIMITS.columns;
            return (
              <fieldset
                key={header}
                className={styles.cellEditor}
                disabled={disabled || atLimit}
              >
                <legend>{header}</legend>
                {!preview?.headers.includes(header) ? (
                  <p className={styles.help}>
                    This saved header has not been confirmed in the current
                    preview.
                  </p>
                ) : null}
                <div className={styles.columnFields}>
                  <label className={styles.field}>
                    <span>Show column {header}</span>
                    <input
                      type="checkbox"
                      checked={isQueryResultColumnVisible(header, setting)}
                      onChange={(event) =>
                        changeColumn(header, { visible: event.target.checked })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    Display label for {header}
                    <input
                      maxLength={120}
                      value={setting?.label || ""}
                      placeholder={header}
                      onChange={(event) =>
                        changeColumn(header, { label: event.target.value })
                      }
                    />
                  </label>
                  <label className={styles.field}>
                    Format for {header}
                    <select
                      value={setting?.format || "text"}
                      onChange={(event) =>
                        changeColumn(header, { format: event.target.value })
                      }
                    >
                      <option value="text">Text (as returned)</option>
                      <option value="number">Number</option>
                      <option value="currency">Currency (USD)</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className={styles.button}
                    disabled={disabled || !setting}
                    aria-label={`Reset display settings for ${header}`}
                    onClick={() =>
                      onChange({
                        columnSettings: columnSettings.filter(
                          (column) => column.header !== header,
                        ),
                      })
                    }
                  >
                    Reset display
                  </button>
                </div>
              </fieldset>
            );
          })}
        </details>
      ) : (
        <p className={styles.help}>
          Load a preview to see the returned columns and customize their
          display.
        </p>
      )}
      {preview ? (
        <>
          <p className={styles.success} role="status">
            Query preview only. Not saved to the dashboard.
          </p>
          <QueryResultsTable
            title={`${panel.title || "Output Query"} preview`}
            headers={preview.headers}
            rows={preview.rows}
            columnSettings={columnSettings}
            disabled={disabled}
          />
        </>
      ) : null}
    </div>
  );
}

export default function ReportDashboardBuilder({
  value,
  onChange,
  disabled = false,
  panelLimit = DASHBOARD_LIMITS.panels,
}) {
  const panels = Array.isArray(value?.panels) ? value.panels : [];
  const maxPanels = Math.max(
    0,
    Math.min(DASHBOARD_LIMITS.panels, Number(panelLimit) || 0),
  );
  const allValues = panels.flatMap((panel) => panel.values || []);
  const tableCount = panels.filter(
    (panel) => panel.layout === "query_results",
  ).length;
  const queryCount =
    allValues.filter((cell) => cell.source === "query_count").length +
    tableCount;
  const canAddQueryTable =
    panels.length < maxPanels &&
    tableCount < QUERY_RESULTS_LIMITS.panels &&
    queryCount < DASHBOARD_LIMITS.queries;
  const canAddValues = (count) =>
    allValues.length + count <= DASHBOARD_LIMITS.values;

  function changePanels(nextPanels) {
    if (!disabled)
      onChange({
        ...value,
        version: 1,
        panels: nextPanels.map(withMetricDimensions),
      });
  }

  function updatePanel(panel, patch) {
    changePanels(
      panels.map((item) =>
        item.key === panel.key ? { ...item, ...patch } : item,
      ),
    );
  }

  function addDimension(panel, dimension) {
    const otherDimension = dimension === "rows" ? "columns" : "rows";
    if (
      panel.layout === "metric" ||
      (dimension === "columns" && panel.layout !== "table")
    )
      return;
    if (
      !canAddValues(panel[otherDimension].length) ||
      panel[dimension].length >= DASHBOARD_LIMITS.values
    )
      return;
    const entry = {
      key: newKey(dimension === "rows" ? "row" : "column"),
      label: `${dimension === "rows" ? "Row" : "Column"} ${panel[dimension].length + 1}`,
    };
    const cells = panel[otherDimension].map((other) =>
      dimension === "rows"
        ? newValue(entry.key, other.key)
        : newValue(other.key, entry.key),
    );
    updatePanel(panel, {
      [dimension]: [...panel[dimension], entry],
      values: [...panel.values, ...cells],
    });
  }

  function removeDimension(panel, dimension, entry) {
    if (disabled || panel[dimension].length <= 1) return;
    const reference = dimension === "rows" ? "rowKey" : "columnKey";
    if (
      !confirmRemoval(
        panel.values.filter((cell) => cell[reference] === entry.key),
        `${dimension === "rows" ? "row" : "column"} "${entry.label}"`,
      )
    )
      return;
    updatePanel(panel, {
      [dimension]: panel[dimension].filter((item) => item.key !== entry.key),
      values: panel.values.filter((cell) => cell[reference] !== entry.key),
    });
  }

  function removePanel(panel) {
    if (disabled) return;
    const confirmed =
      panel.layout === "query_results"
        ? window.confirm(
            `Remove query table "${panel.title}"? This changes only the draft until you save.`,
          )
        : confirmRemoval(panel.values, `panel "${panel.title}"`);
    if (!confirmed) return;
    changePanels(panels.filter((item) => item.key !== panel.key));
  }

  function editCell(panel, row, column, patch) {
    const cell = panel.values.find(
      (item) =>
        (item.rowKey || "") === row.key &&
        (item.columnKey || "") === column.key,
    );
    if (
      (!cell && !canAddValues(1)) ||
      (patch.source === "query_count" &&
        cell?.source !== "query_count" &&
        queryCount >= DASHBOARD_LIMITS.queries)
    )
      return;
    const next = { ...(cell || newValue(row.key, column.key)), ...patch };
    updatePanel(panel, {
      values: cell
        ? panel.values.map((item) => (item.key === cell.key ? next : item))
        : [...panel.values, next],
    });
  }

  function convertToQueryTable(panel, cell) {
    if (
      disabled ||
      panel.layout === "query_results" ||
      tableCount >= QUERY_RESULTS_LIMITS.panels
    )
      return;
    const confirmed = window.confirm(
      `Convert panel "${panel.title}" to an Output Query panel? Its manual rows, columns, values, and notes will be replaced. This changes only the draft until you save.`,
    );
    if (!confirmed) return;
    updatePanel(panel, {
      title: panel.title === "New panel" ? "Output Query" : panel.title,
      layout: "query_results",
      queryId: String(cell.queryId ?? ""),
      refreshPolicy: cell.refreshPolicy || "refreshable",
      columnSettings: [],
      rows: [],
      columns: [],
      values: [],
    });
  }

  function canUseLayout(panel, layout) {
    if (layout === "rows") return panel.columns.length <= 1;
    if (layout === "metric")
      return (
        panel.values.length <= 1 &&
        panel.rows.length <= 1 &&
        panel.columns.length <= 1
      );
    return true;
  }

  function changeLayout(panel, layout) {
    if (
      panel.layout === "query_results" ||
      !["rows", "table", "metric"].includes(layout)
    )
      return;
    if (!canUseLayout(panel, layout)) return;
    if (layout === "metric") {
      updatePanel(panel, { layout });
      return;
    }
    // Repair legacy missing dimensions without replacing source value keys.
    const rows = panel.rows.length
      ? panel.rows
      : [{ key: newKey("row"), label: "Row 1" }];
    const columns = panel.columns.length
      ? panel.columns
      : [{ key: newKey("column"), label: "Value" }];
    updatePanel(panel, {
      layout,
      rows,
      columns,
      values: panel.values.map((cell) => ({
        ...cell,
        rowKey: cell.rowKey || rows[0].key,
        columnKey: cell.columnKey || columns[0].key,
      })),
    });
  }

  function renderCellEditor(panel, row, column, label) {
    const cell = panel.values.find(
      (item) =>
        (item.rowKey || "") === row.key &&
        (item.columnKey || "") === column.key,
    );
    const canConvertToQueryTable =
      cell?.source === "query_count" &&
      panel.rows.length === 1 &&
      panel.columns.length === 1 &&
      panel.values.length === 1 &&
      tableCount < QUERY_RESULTS_LIMITS.panels;
    return (
      <CellEditor
        key={JSON.stringify([row.key, column.key])}
        cell={cell || { source: "static", staticValue: null }}
        label={label}
        disabled={disabled || (!cell && !canAddValues(1))}
        canUseQuery={queryCount < DASHBOARD_LIMITS.queries}
        onChange={(patch) => editCell(panel, row, column, patch)}
        onUseQueryTable={
          canConvertToQueryTable ? () => convertToQueryTable(panel, cell) : null
        }
      />
    );
  }

  return (
    <div className={styles.builder}>
      <div className={styles.toolbar}>
        <div>
          <h3>Dashboard panels</h3>
          <p className={styles.help}>
            Use a number/count panel for totals and static values. Use an Output
            Query panel to display a saved query&apos;s existing rows and
            columns automatically.
          </p>
        </div>
        <div className={styles.tableActions}>
          <button
            type="button"
            className={styles.primary}
            disabled={
              disabled ||
              panels.length >= maxPanels ||
              !canAddValues(1)
            }
            onClick={() => changePanels([...panels, newPanel()])}
          >
            Add number/count panel
          </button>
          <button
            type="button"
            className={styles.button}
            disabled={disabled || !canAddQueryTable}
            onClick={() => {
              if (canAddQueryTable) changePanels([...panels, newQueryPanel()]);
            }}
          >
            Add Output Query panel
          </button>
        </div>
      </div>
      <p className={styles.help}>
        {panels.length}/{maxPanels} panels; {allValues.length}/
        {DASHBOARD_LIMITS.values} values; {queryCount}/
        {DASHBOARD_LIMITS.queries} saved-query sources; {tableCount}/
        {QUERY_RESULTS_LIMITS.panels} query tables. Each query table uses one
        saved-query source. Leave a static value blank for unknown. Zero is a
        valid value.
      </p>
      {!panels.length ? (
        <p className={styles.empty}>
          Add a number/count panel for numeric rows, a table, or metrics, or add
          an Output Query panel for the columns and rows returned by a query.
        </p>
      ) : null}
      {panels.map((panel, panelIndex) => (
        <section
          key={panel.key}
          className={styles.editorPanel}
          aria-label={`Edit panel ${panelIndex + 1}`}
        >
          <div className={styles.panelHeading}>
            <strong>Panel {panelIndex + 1}</strong>
            <button
              type="button"
              className={styles.remove}
              disabled={disabled}
              onClick={() => removePanel(panel)}
            >
              Remove panel
            </button>
          </div>
          <div className={styles.panelFields}>
            <label className={styles.field}>
              Panel title
              <input
                maxLength={120}
                value={panel.title}
                disabled={disabled}
                onChange={(event) =>
                  updatePanel(panel, { title: event.target.value })
                }
              />
            </label>
            {panel.layout === "query_results" ? (
              <div className={styles.field}>
                Panel type<span className={styles.help}>Output Query</span>
              </div>
            ) : (
              <label className={styles.field}>
                Layout
                <select
                  value={panel.layout}
                  disabled={disabled}
                  onChange={(event) => changeLayout(panel, event.target.value)}
                >
                  <option value="rows" disabled={!canUseLayout(panel, "rows")}>
                    Rows
                  </option>
                  <option value="table">Table</option>
                  <option
                    value="metric"
                    disabled={!canUseLayout(panel, "metric")}
                  >
                    Metric
                  </option>
                </select>
              </label>
            )}
            <label className={styles.field}>
              Panel width
              <select
                value={panel.width}
                disabled={disabled}
                onChange={(event) =>
                  updatePanel(panel, { width: event.target.value })
                }
              >
                <option value="half">Half width</option>
                <option value="full">Full width</option>
              </select>
            </label>
          </div>
          {panel.layout === "query_results" ? (
            <QueryTableEditor
              panel={panel}
              disabled={disabled}
              onChange={(patch) => updatePanel(panel, patch)}
            />
          ) : (
            <>
              <p className={styles.help}>
                Rows use one column; a metric requires exactly one row, one
                column, and at most one value. Remove extra rows or columns
                before choosing a smaller layout. Layout changes never delete
                values.
              </p>
              <div className={styles.axes}>
                {["rows", "columns"].map((dimension) => {
                  const singular = dimension === "rows" ? "row" : "column";
                  const other = dimension === "rows" ? "columns" : "rows";
                  return (
                    <div className={styles.axis} key={dimension}>
                      <div className={styles.axisHeading}>
                        <h4>{dimension === "rows" ? "Rows" : "Columns"}</h4>
                        <button
                          type="button"
                          className={styles.button}
                          disabled={
                            disabled ||
                            panel.layout === "metric" ||
                            (dimension === "columns" &&
                              panel.layout !== "table") ||
                            !canAddValues(panel[other].length) ||
                            panel[dimension].length >= DASHBOARD_LIMITS.values
                          }
                          onClick={() => addDimension(panel, dimension)}
                        >
                          Add {singular}
                        </button>
                      </div>
                      {panel[dimension].map((entry, index) => (
                        <div key={entry.key} className={styles.axisItem}>
                          <label className={styles.field}>
                            {dimension === "rows" ? "Row" : "Column"}{" "}
                            {index + 1} label
                            <input
                              maxLength={120}
                              value={entry.label}
                              disabled={disabled}
                              onChange={(event) =>
                                updatePanel(panel, {
                                  [dimension]: panel[dimension].map((item) =>
                                    item.key === entry.key
                                      ? { ...item, label: event.target.value }
                                      : item,
                                  ),
                                })
                              }
                            />
                          </label>
                          <button
                            type="button"
                            className={styles.remove}
                            aria-label={`Remove ${singular} ${index + 1}`}
                            disabled={disabled || panel[dimension].length <= 1}
                            onClick={() =>
                              removeDimension(panel, dimension, entry)
                            }
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                      <p className={styles.help}>
                        Keep at least one {singular}. Removing one also removes
                        its values.
                      </p>
                    </div>
                  );
                })}
              </div>
              <div className={styles.cellEditors}>
                {panel.layout === "metric"
                  ? renderCellEditor(
                      panel,
                      {
                        key:
                          panel.values[0]?.rowKey || panel.rows[0]?.key || "",
                      },
                      {
                        key:
                          panel.values[0]?.columnKey ||
                          panel.columns[0]?.key ||
                          "",
                      },
                      "Metric value",
                    )
                  : panel.rows.flatMap((row, rowIndex) =>
                      panel.columns.map((column, columnIndex) =>
                        renderCellEditor(
                          panel,
                          row,
                          column,
                          `${row.label || `Row ${rowIndex + 1}`} / ${column.label || `Column ${columnIndex + 1}`}`,
                        ),
                      ),
                    )}
              </div>
            </>
          )}
        </section>
      ))}
    </div>
  );
}
