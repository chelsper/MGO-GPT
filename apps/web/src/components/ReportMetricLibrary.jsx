import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, Plus, Save } from "lucide-react";
import QueryResultsTable from "./QueryResultsTable";
import styles from "./reportConfigurationEditor.module.css";

const blank = () => ({ title: "", description: "", sourceId: "", sourceFingerprint: "", format: "number", published: false });
const draftOf = (entry) => entry ? Object.fromEntries(Object.keys(blank()).map((key) => [key, entry[key]])) : blank();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const statusLabels = { source_missing: "Source unavailable", source_changed: "Review changed source", source_disabled: "Source dashboard disabled" };
const sourceLabels = { query_count: "Saved query count", query_table: "Saved query table", static: "Manual value" };

function MetricPreview({ id, onClose }) {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setPayload(null); setError("");
    fetch(`/api/reports/metrics/${encodeURIComponent(id)}?preview=1`, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || result?.metric?.id !== id) throw new Error("The saved preview could not be loaded.");
        if (!controller.signal.aborted) setPayload(result);
      }).catch(() => { if (!controller.signal.aborted) setError("The saved preview could not be loaded. Try again."); });
    return () => controller.abort();
  }, [id, attempt]);
  const result = payload?.result;
  const asOf = result?.asOf ? new Date(result.asOf).toLocaleString("en-US") : null;
  return <section className={styles.panel} aria-label="Saved metric preview">
    <div className={styles.sectionHeading}><h3>Saved preview</h3><button className={styles.button} onClick={onClose}>Close preview</button></div>
    <p className={styles.muted}>Reads the source report's saved result. No NXT query is run.</p>
    {error ? <div role="alert"><p>{error}</p><button className={styles.button} onClick={() => setAttempt((value) => value + 1)}>Retry preview</button></div>
      : !payload ? <p role="status">Loading saved result...</p>
      : !result ? <p>{statusLabels[payload.metric.status] || "Source unavailable"}. Review the source before using this metric.</p>
      : <>
        {result.status === "missing" ? <p>No compatible saved result yet. Use the source report's existing refresh controls when needed.</p>
          : result.type === "table" ? <QueryResultsTable title={payload.metric.title} headers={result.headers} rows={result.rows} columnSettings={result.columnSettings} />
          : <p className={styles.metricValue}>{new Intl.NumberFormat("en-US", payload.metric.format === "currency" ? { style: "currency", currency: "USD" } : { maximumFractionDigits: 6 }).format(result.value)}</p>}
        {asOf && <p className={styles.muted}>As of {asOf}</p>}
        {result.provenance === "manual" && <p className={styles.muted}>Manual value maintained in the source report.</p>}
        {result.refreshPolicy === "frozen" && <p className={styles.muted}>Frozen snapshot. It does not refresh automatically.</p>}
        {result.status === "stale" && <p role="status">Showing the last successful result; the source refresh needs attention.</p>}
      </>}
  </section>;
}

export default function ReportMetricLibrary({ initialPayload }) {
  const [payload, setPayload] = useState(initialPayload);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState(null);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState(false);
  const busy = useRef(false);
  const titleInput = useRef(null);
  const entry = payload.entries.find((item) => item.id === selected);
  const dirty = draft !== null && !same(draft, draftOf(entry));
  const source = payload.sources.find((item) => item.id === draft?.sourceId);
  const sourceChanged = source && source.fingerprint !== draft?.sourceFingerprint;
  const retiring = entry && draft?.published === false && draft.sourceId === entry.sourceId && draft.sourceFingerprint === entry.sourceFingerprint;
  const matches = payload.entries.filter((item) => `${item.title} ${item.description} ${item.source?.reportTitle || ""}`.toLowerCase().includes(search.trim().toLowerCase()));

  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);

  function choose(item) {
    if (busy.current || (dirty && !window.confirm("Discard unsaved metric changes? Source reports and saved results will not change."))) return;
    setSelected(item?.id || null); setDraft(draftOf(item)); setPreview(false); setError(""); setNotice("");
    requestAnimationFrame(() => titleInput.current?.focus());
  }
  function update(patch) { setDraft((value) => ({ ...value, ...patch })); setPreview(false); setError(""); setNotice(""); }

  async function save(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true; setSaving(true); setError(""); setNotice(""); setPreview(false);
    try {
      const response = await fetch("/api/reports/metrics", { method: entry ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, ...(entry ? { id: entry.id, revision: entry.revision } : {}) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(response.status < 500 ? result.error : "Could not save the metric. Your draft is retained.");
      if (!result.entry?.id || !result.entry?.revision || (entry && result.entry.id !== entry.id)) throw new Error("The server did not confirm the save. Reload the library before retrying.");
      setPayload((value) => ({ ...value, entries: [...value.entries.filter((item) => item.id !== result.entry.id), result.entry].sort((a, b) => a.title.localeCompare(b.title)) }));
      setSelected(result.entry.id); setDraft(draftOf(result.entry));
      setNotice("Metric saved. Source reports, access, and refresh schedules were not changed.");
    } catch (failure) { setError(failure.message || "Could not save the metric. Your draft is retained."); }
    finally { busy.current = false; setSaving(false); }
  }

  async function reload() {
    if (busy.current || (dirty && !window.confirm("Reload the library and discard unsaved metric changes?"))) return;
    busy.current = true; setReloading(true); setError(""); setNotice(""); setPreview(false);
    try {
      const response = await fetch("/api/reports/metrics?manage=1", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok || result.canManage !== true) throw new Error("The library could not be reloaded. Your draft is retained.");
      setPayload(result);
      setDraft(draft === null ? null : draftOf(result.entries.find((item) => item.id === selected)));
      if (!result.entries.some((item) => item.id === selected)) setSelected(null);
    } catch (failure) { setError(failure.message); }
    finally { busy.current = false; setReloading(false); }
  }

  return <main className={styles.page}><div className={styles.container}>
    <header className={styles.header}><div>
      <a href="/report-configurations" className={styles.button}><ArrowLeft size={16} /> Back to Report Access &amp; Configurations</a>
      <h1>Metric Library</h1><p className={styles.muted}>Define once. Reuse saved results without running another query.</p>
    </div><button className={`${styles.button} ${styles.primary}`} disabled={saving || reloading} onClick={() => choose(null)}><Plus size={17} /> Add metric</button></header>
    <div className={styles.guide}><strong>Connected to your existing reports</strong><p>Choose an existing count, manual figure, or query table. Access and refresh rules stay with its source report. Making a metric available never grants additional access. Personal dashboard assembly is the next phase.</p></div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    <div className={styles.toolbar} style={{ marginTop: 24 }}>
      <label className={`${styles.field} ${styles.search}`}>Find a metric<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <button className={styles.button} onClick={reload} disabled={saving || reloading}>{reloading ? "Reloading..." : "Reload library"}</button>
    </div>
    <div className={styles.grid}>
      <section className={`${styles.card} ${styles.stack}`} aria-label="Library entries" style={{ alignContent: "start" }}>
        <h2 style={{ margin: 0 }}>Your metrics <span className={styles.tag}>{payload.entries.length}</span></h2>
        {!payload.entries.length ? <div><BookOpen size={28} /><h3>Start with a saved metric</h3><p className={styles.muted}>Alumni &amp; Family Engagement and configured dashboards are available as sources. Nothing is published automatically.</p></div>
          : !matches.length ? <p>No metrics match your search.</p>
          : matches.map((item) => <button key={item.id} className={styles.metricEntry} aria-pressed={selected === item.id} disabled={saving || reloading} onClick={() => choose(item)}>
            <strong>{item.title}</strong><span>{item.source?.reportTitle || "Source unavailable"}</span>
            <small>{statusLabels[item.status] || (item.published ? "Available in library" : "Draft")}</small>
          </button>)}
      </section>
      <section className={styles.card} aria-label="Metric settings">
        {!draft ? <><h2>Choose or add a metric</h2><p className={styles.muted}>Published entries reference their source's saved result. They do not create a separate data pull.</p></>
          : <form onSubmit={save} className={styles.stack}>
            <h2 style={{ margin: 0 }}>{entry ? "Edit metric" : "New metric"}</h2>
            <fieldset disabled={saving || reloading} className={`${styles.editorFields} ${styles.stack}`}>
              <label className={styles.field}>Metric name<input ref={titleInput} value={draft.title} maxLength={120} required onChange={(event) => update({ title: event.target.value })} /></label>
              <div className={styles.field}><label htmlFor="metric-description">Description</label><textarea id="metric-description" aria-describedby="metric-description-help" value={draft.description} maxLength={1000} onChange={(event) => update({ description: event.target.value })} /><small id="metric-description-help">Explain what this result measures, including its fiscal year or reporting period.</small></div>
              <label className={styles.field}>Saved source<select required value={draft.sourceId} onChange={(event) => {
                const next = payload.sources.find((item) => item.id === event.target.value);
                update({ sourceId: next?.id || "", sourceFingerprint: next?.fingerprint || "", format: next?.sourceType === "query_table" ? "table" : "number" });
              }}><option value="">Choose an existing metric or table</option>
                {draft.sourceId && !source && <option value={draft.sourceId}>Source unavailable; select a replacement</option>}
                {payload.sources.map((item) => <option key={item.id} value={item.id}>{item.reportTitle} / {item.panelTitle} / {item.label}</option>)}
              </select></label>
              {source && <div className={styles.panel}>
                <strong>{sourceLabels[source.sourceType]}</strong>
                <p className={styles.muted}>{source.queryId ? `Saved NXT query ${source.queryId}. ` : ""}{source.refreshPolicy === "frozen" ? "Frozen: reuses its saved result." : source.refreshPolicy === "manual" ? "Updated manually in the source report." : "Updates on the source report's existing refresh schedule."}</p>
                <p className={styles.muted}>Audience: inherits {source.reportTitle}. Change access or refresh rules in <a href="/report-configurations">Report Access &amp; Configurations</a>.</p>
                {!source.enabled && <p>Source dashboard is disabled. This metric can only be saved as a draft.</p>}
                {sourceChanged && <div role="status"><p>The source definition changed. Review it before accepting the new definition.</p><button type="button" className={styles.button} onClick={() => update({ sourceFingerprint: source.fingerprint, format: source.sourceType === "query_table" ? "table" : "number" })}>Accept updated source</button></div>}
              </div>}
              <div className={styles.field}><label htmlFor="metric-format">Display format</label><select id="metric-format" aria-describedby="metric-format-help" value={draft.format} disabled={source?.sourceType !== "static"} onChange={(event) => update({ format: event.target.value })}>
                {source?.sourceType === "query_table" || draft.format === "table" ? <option value="table">Source table columns</option> : <><option value="number">Number</option>{source?.sourceType === "static" && <option value="currency">Currency (USD)</option>}</>}
              </select><small id="metric-format-help">Query row counts are never treated as gift amounts. Query tables keep their configured column formats.</small></div>
              <label className={styles.choice}><input type="checkbox" checked={draft.published} onChange={(event) => update({ published: event.target.checked })} /><span><strong>Make available in the library</strong><small>Only people authorized to view the source report can use this metric. Uncheck to retire it without deleting the source or its saved results.</small></span></label>
            </fieldset>
            <div className={styles.sectionHeading}>
              <button className={`${styles.button} ${styles.primary}`} type="submit" disabled={saving || reloading || ((!source || sourceChanged) && !retiring) || (!dirty && !!entry)}><Save size={17} />{saving ? "Saving..." : "Save metric"}</button>
              <button type="button" className={styles.button} disabled={!entry || dirty || saving || reloading || preview} onClick={() => setPreview(true)}>Preview saved result</button>
            </div>
            {!entry && <small className={styles.muted}>Save the metric before previewing its saved result.</small>}
          </form>}
      </section>
    </div>
    {preview && entry && <div style={{ marginTop: 24 }}><MetricPreview key={`${entry.id}:${entry.revision}`} id={entry.id} onClose={() => setPreview(false)} /></div>}
  </div></main>;
}
