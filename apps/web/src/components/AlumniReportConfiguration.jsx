import { useState } from "react";
import {
  ALUMNI_DONOR_ROW_REFRESH_POLICIES,
  getAlumniDonorCountRowFingerprint,
} from "@/app/api/utils/alumniDonorConfiguration";
import {
  DASHBOARD_LIMITS,
  validateDashboardQueryId,
} from "@/app/api/utils/dashboardConfiguration";
import ReportDashboardBuilder from "./ReportDashboardBuilder";
import ReportDashboardPanels from "./ReportDashboardPanels";
import styles from "./reportConfigurationEditor.module.css";

function uniqueKey(prefix) { return `${prefix}-${crypto.randomUUID().slice(0, 8)}`; }

function replaceGenericPanels(panels, nextGenericPanels) {
  let nextIndex = 0;
  const merged = panels.flatMap((panel) => {
    if (!panel.layout) return [panel];
    const replacement = nextGenericPanels[nextIndex];
    nextIndex += 1;
    return replacement ? [replacement] : [];
  });
  return [...merged, ...nextGenericPanels.slice(nextIndex)];
}

function QueryTest({ queryId }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  async function test() {
    const testedId = queryId;
    setBusy(true);
    setResult(null);
    try {
      const response = await fetch("/api/reports/dashboards/test-query", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queryId: testedId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload?.error || "Could not test this query.");
      if (!Number.isSafeInteger(payload?.count) || payload.count < 0 || String(payload?.queryId) !== String(testedId)) throw new Error("The test did not return a valid row count. No snapshot was changed.");
      setResult({ queryId: testedId, message: `${Number(payload.count).toLocaleString("en-US")} result rows. Test only; no snapshot changed.` });
    } catch (error) {
      setResult({ queryId: testedId, message: error.message, error: true });
    } finally { setBusy(false); }
  }
  return <div className={styles.sectionHeading}>
    <button type="button" className={styles.button} disabled={busy || Boolean(validateDashboardQueryId(queryId))} onClick={test}>{busy ? "Testing query..." : "Test query"}</button>
    {result?.queryId === queryId && <small role={result.error ? "alert" : "status"}>{result.message}</small>}
  </div>;
}

export default function AlumniReportConfiguration({ value, onChange, disabled = false }) {
  const panels = value?.panels || [];
  const donorPanels = panels.filter((panel) => panel.type === "alumni_donor_count");
  const genericDashboard = {
    version: 1,
    panels: panels.filter((panel) => panel.layout),
  };
  function updatePanel(key, patch) {
    onChange({ ...value, panels: panels.map((panel) => panel.key === key ? { ...panel, ...patch } : panel) });
  }
  function updateRow(panel, rowKey, patch) {
    updatePanel(panel.key, { rows: panel.rows.map((row) => row.key === rowKey ? { ...row, ...patch } : row) });
  }
  return <section className={styles.stack} aria-label="Alumni dashboard panels">
    <div className={styles.notice}>Choose the panel that matches the result you need. Alumni count panels show one saved-query row count per labeled period. Number/count panels can combine query counts and static numbers. Output Query panels display the saved query&apos;s returned rows and columns.</div>
    <div className={styles.sectionHeading}><div><h3 style={{ margin: 0 }}>Alumni donor-count panels</h3><p className={styles.muted} style={{ margin: "5px 0 0" }}>Preserves the existing fiscal-year donor totals and frozen snapshots.</p></div><button type="button" className={styles.button} disabled={disabled || panels.length >= DASHBOARD_LIMITS.panels} onClick={() => onChange({ ...value, panels: [...panels, { key: uniqueKey("panel"), type: "alumni_donor_count", title: "New donor-count panel", width: "half", rows: [] }] })}>Add Alumni count panel</button></div>
    {donorPanels.map((panel, index) => <section className={`${styles.panel} ${styles.stack}`} key={panel.key}>
      <div className={styles.sectionHeading}><h3>Panel {index + 1}</h3><button type="button" className={styles.button} onClick={() => {
        if (window.confirm(`Remove ${panel.title} from this dashboard? This takes effect only after saving.`)) onChange({ ...value, panels: panels.filter((item) => item.key !== panel.key) });
      }} disabled={disabled}>Remove panel</button></div>
      <div className={styles.grid}>
        <label className={styles.field}>Panel title<input value={panel.title} maxLength={160} onChange={(event) => updatePanel(panel.key, { title: event.target.value })} /></label>
        <label className={styles.field}>Panel width<select value={panel.width || "half"} onChange={(event) => updatePanel(panel.key, { width: event.target.value })}><option value="half">Half width</option><option value="full">Full width</option></select></label>
      </div>
      {panel.rows.map((row, rowIndex) => <section key={row.key} className={`${styles.row} ${styles.stack}`} aria-label={`Count row ${rowIndex + 1}`}>
        <div className={styles.sectionHeading}><strong>Count row {rowIndex + 1}</strong><button type="button" className={styles.button} onClick={() => {
          if (window.confirm(`Remove ${row.label}? This takes effect only after saving.`)) updatePanel(panel.key, { rows: panel.rows.filter((item) => item.key !== row.key) });
        }}>Remove row</button></div>
        <div className={styles.grid}>
          <label className={styles.field}>Row label<input value={row.label} maxLength={120} onChange={(event) => updateRow(panel, row.key, { label: event.target.value })} /></label>
          <label className={styles.field}>Saved NXT query ID<input inputMode="numeric" value={row.queryId} maxLength={40} onChange={(event) => updateRow(panel, row.key, { queryId: event.target.value })} /></label>
          <label className={styles.field}>Query name (optional)<input value={row.queryName || ""} maxLength={200} onChange={(event) => updateRow(panel, row.key, { queryName: event.target.value })} /></label>
          <label className={styles.field}>Snapshot policy<select value={row.refreshPolicy} onChange={(event) => updateRow(panel, row.key, { refreshPolicy: event.target.value })}>{ALUMNI_DONOR_ROW_REFRESH_POLICIES.map((policy) => <option key={policy.key} value={policy.key}>{policy.label}</option>)}</select><small>{ALUMNI_DONOR_ROW_REFRESH_POLICIES.find((policy) => policy.key === row.refreshPolicy)?.description}</small></label>
        </div>
        <QueryTest queryId={row.queryId} />
      </section>)}
      <div><button type="button" className={styles.button} disabled={disabled || panel.rows.length >= 12} onClick={() => updatePanel(panel.key, { rows: [...panel.rows, { key: uniqueKey("count"), label: `Count ${panel.rows.length + 1}`, queryId: "", queryName: "", refreshPolicy: "refreshable" }] })}>Add query-count row</button></div>
    </section>)}
    {!donorPanels.length && <p className={styles.muted}>No Alumni donor-count panels are configured.</p>}
    <ReportDashboardBuilder
      value={genericDashboard}
      disabled={disabled}
      panelLimit={DASHBOARD_LIMITS.panels - donorPanels.length}
      onChange={(next) => onChange({
        ...value,
        panels: replaceGenericPanels(panels, next.panels),
      })}
    />
  </section>;
}

export function AlumniReportPreview({ configuration, snapshot }) {
  const donorPanels = (configuration?.panels || []).filter((panel) => panel.type === "alumni_donor_count");
  const genericDashboard = {
    version: 1,
    panels: (configuration?.panels || []).filter((panel) => panel.layout),
  };
  return <div className={styles.stack}>
    <div className={styles.grid}>
    {donorPanels.map((panel) => <section className={`${styles.panel} ${styles.stack}`} key={panel.key} style={{ gridColumn: panel.width === "full" ? "1 / -1" : "span 1" }}>
      <h3>{panel.title}</h3>
      {panel.rows.map((row) => {
        const fingerprint = getAlumniDonorCountRowFingerprint(configuration, { ...row, panelKey: panel.key, panelType: panel.type });
        const total = snapshot?.totals?.find((item) => item.definitionFingerprint === fingerprint);
        return <div className={styles.rowPreview} key={row.key}><div>{row.label}<small className={styles.muted} style={{ display: "block" }}>Query {row.queryId || "not set"} / {row.refreshPolicy === "frozen" ? "Frozen snapshot" : "Refresh with report"}</small></div><strong>{typeof total?.total === "number" ? total.total.toLocaleString("en-US") : "Not refreshed"}</strong></div>;
      })}
      {!panel.rows.length && <p className={styles.muted}>Add query-count rows in Configure.</p>}
    </section>)}
    </div>
    {genericDashboard.panels.length ? (
      <ReportDashboardPanels
        configuration={genericDashboard}
        snapshot={snapshot?.genericSnapshot}
      />
    ) : null}
    {!donorPanels.length && !genericDashboard.panels.length ? (
      <p className={styles.muted}>No dashboard panels are configured.</p>
    ) : null}
  </div>;
}
