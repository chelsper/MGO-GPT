import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowDown, ArrowUp, Eye, Plus, X, LockKeyhole } from "lucide-react";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import { personalRequest, savePersonalDashboards, usePersonalDashboards } from "@/app/reports/usePersonalDashboards";
import { MAX_PERSONAL_DASHBOARDS, MAX_DASHBOARD_METRICS, personalDashboardHref, movePersonalMetric } from "@/utils/personalDashboards";
import PersonalMetricCard from "./PersonalMetricCard";
import styles from "./personalDashboard.module.css";

function Header({ title, action }) {
  return <SharedReportHeader title={title} eyebrow="Private dashboard" description="Your layout. Shared saved results. No extra NXT data pulls."
    backHref="/reports/dashboards?browse=1" backLabel="Browse all dashboards" accessibleReports={[]} action={action} />;
}

function Preview({ id, onClose }) {
  const [state, setState] = useState({});
  useEffect(() => {
    const controller = new AbortController();
    setState({});
    personalRequest(`/api/reports/metrics/${id}`, { signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) setState(value?.metric?.id === id ? value : { error: "This saved preview is unavailable." });
    }).catch(() => { if (!controller.signal.aborted) setState({ error: "This saved preview is unavailable. Its access or source may have changed." }); });
    return () => controller.abort();
  }, [id]);
  return <section className={styles.preview} aria-label="Metric preview">
    <div className={styles.heading}><h3>Saved preview</h3><button type="button" className={styles.button} onClick={onClose}>Close preview</button></div>
    {state.error ? <p role="status">{state.error}</p> : state.metric ? <PersonalMetricCard card={{ metric: state.metric, result: state.result }} /> : <p role="status">Loading saved preview...</p>}
  </section>;
}

function Editor({ workspace, dashboardId, catalog, onSaved, onCancel }) {
  const existing = workspace.dashboards.find((item) => item.id === dashboardId);
  const [draft, setDraft] = useState(() => existing || { id: crypto.randomUUID(), title: "", metricIds: [] });
  const [isDefault, setIsDefault] = useState(workspace.defaultDashboardId === dashboardId);
  const [search, setSearch] = useState("");
  const [previewId, setPreviewId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const original = useRef(JSON.stringify({ draft, isDefault }));
  const dirty = JSON.stringify({ draft, isDefault }) !== original.current;
  const byId = new Map(catalog.entries.map((entry) => [entry.id, entry]));
  const filtered = catalog.entries.filter((entry) => `${entry.title} ${entry.description}`.toLowerCase().includes(search.trim().toLowerCase()));
  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);
  const cancel = () => { if (!busy.current && (!dirty || window.confirm("Discard unsaved dashboard changes?"))) onCancel(); };

  async function save(event) {
    event.preventDefault();
    if (busy.current) return;
    busy.current = true; setSaving(true); setError("");
    const dashboards = existing ? workspace.dashboards.map((item) => item.id === draft.id ? draft : item) : [...workspace.dashboards, draft];
    const defaultDashboardId = isDefault ? draft.id : workspace.defaultDashboardId === draft.id ? null : workspace.defaultDashboardId;
    try { onSaved(await savePersonalDashboards({ ...workspace, dashboards, defaultDashboardId }), draft.id); }
    catch (failure) { setError(failure.message); }
    finally { busy.current = false; setSaving(false); }
  }
  return <form onSubmit={save}>
    <Header title={existing ? "Edit your dashboard" : "Create dashboard"} />
    {!existing && workspace.dashboards.length >= MAX_PERSONAL_DASHBOARDS && <p className={styles.message}>You already have {MAX_PERSONAL_DASHBOARDS} dashboards. Browse your dashboards to edit an existing layout.</p>}
    {error && <div className={styles.message} role="alert"><p>{error}</p><p>Your draft is still here. Cancel to return without saving, then reopen to load the latest settings.</p></div>}
    <fieldset disabled={saving} className={styles.fields}>
      <section className={styles.settings}>
        <label className={styles.field}>Dashboard name<input required maxLength={120} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder="For example, My fundraising overview" /></label>
        <label className={styles.check}><input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />Open this dashboard by default in My Dashboards</label>
        <p className={styles.muted}><LockKeyhole size={15} aria-hidden="true" /> Only you can view or edit this layout. Metric access stays controlled by your administrator.</p>
      </section>
      <div className={styles.editorGrid}>
        <section className={styles.panel} aria-label="Your dashboard cards">
          <div className={styles.heading}><h2>Your cards</h2><span>{draft.metricIds.length} / {MAX_DASHBOARD_METRICS}</span></div>
          <p className={styles.muted}>Order these as you want them to appear. Query tables use a full row.</p>
          {!draft.metricIds.length && <p className={styles.empty}>Choose a metric from the library to get started.</p>}
          <ol className={styles.cardList}>
            {draft.metricIds.map((id, index) => <li key={id}>
              <strong>{byId.get(id)?.title || "Metric unavailable"}</strong>
              <div className={styles.controls}>
                <button type="button" className={styles.button} disabled={index === 0} aria-label={`Move card ${index + 1} up`} onClick={() => setDraft({ ...draft, metricIds: movePersonalMetric(draft.metricIds, id, -1) })}><ArrowUp size={16} /></button>
                <button type="button" className={styles.button} disabled={index === draft.metricIds.length - 1} aria-label={`Move card ${index + 1} down`} onClick={() => setDraft({ ...draft, metricIds: movePersonalMetric(draft.metricIds, id, 1) })}><ArrowDown size={16} /></button>
                <button type="button" className={styles.button} aria-label={`Remove card ${index + 1}`} onClick={() => setDraft({ ...draft, metricIds: draft.metricIds.filter((item) => item !== id) })}><X size={16} /> Remove</button>
              </div>
            </li>)}
          </ol>
        </section>
        <section className={styles.panel} aria-label="Available metric library">
          <h2>Available metrics</h2><p className={styles.muted}>Approved metrics shared with you. Preview their saved values before adding them.</p>
          <label className={styles.field}>Find a metric<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          {!catalog.entries.length && <p>No metrics have been made available to you yet. Ask your administrator to publish metrics and share their source reports with you.</p>}
          {catalog.entries.length > 0 && !filtered.length && <p>No matching metrics. Try another search.</p>}
          <div className={styles.library}>
            {filtered.map((metric) => {
              const added = draft.metricIds.includes(metric.id);
              const tableLimit = metric.format === "table" && draft.metricIds.filter((id) => byId.get(id)?.format === "table").length >= 4;
              return <article key={metric.id}><h3>{metric.title}</h3><p className={styles.muted}>{metric.description || (metric.format === "table" ? "Saved query table" : "Saved metric")}</p>
                <div className={styles.controls}>
                  <button type="button" className={styles.button} onClick={() => setPreviewId(metric.id)} aria-label={`Preview ${metric.title}`}><Eye size={16} /> Preview</button>
                  <button type="button" className={styles.button} disabled={added || tableLimit || draft.metricIds.length >= MAX_DASHBOARD_METRICS} onClick={() => setDraft({ ...draft, metricIds: [...draft.metricIds, metric.id] })} aria-label={`Add ${metric.title}`}><Plus size={16} />{added ? "Added" : "Add"}</button>
                </div>{tableLimit && !added && <small>Four query tables is the limit per dashboard.</small>}
                {previewId === metric.id && <Preview key={previewId} id={previewId} onClose={() => setPreviewId(null)} />}
              </article>;
            })}
          </div>
        </section>
      </div>
    </fieldset>
    <footer className={styles.footer}>
      <span className={styles.muted}>Saves your layout only. No report or NXT record is changed.</span>
      <div className={styles.controls}><button type="button" className={styles.button} disabled={saving} onClick={cancel}>Cancel</button><button className={`${styles.button} ${styles.primary}`} disabled={saving || !draft.title.trim() || (!existing && workspace.dashboards.length >= MAX_PERSONAL_DASHBOARDS)}>{saving ? "Saving..." : "Save dashboard"}</button></div>
    </footer>
  </form>;
}

export default function PersonalDashboard({ dashboardId, create = false }) {
  const workspace = usePersonalDashboards();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(create);
  const [catalog, setCatalog] = useState(null);
  const [saved, setSaved] = useState(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [notice, setNotice] = useState("");
  useEffect(() => { setEditing(create); setNotice(""); }, [dashboardId, create]);
  useEffect(() => {
    const controller = new AbortController();
    setError(""); setCatalog(null); setSaved(null);
    const path = editing || create ? "/api/reports/metrics" : `/api/reports/personal-dashboards/${encodeURIComponent(dashboardId)}`;
    personalRequest(path, { signal: controller.signal }).then((data) => {
      if (controller.signal.aborted) return;
      if (editing || create) {
        if (!Array.isArray(data?.entries)) throw new Error("Metric library is unavailable.");
        setCatalog(data);
      } else {
        if (data?.dashboard?.id !== dashboardId || !Array.isArray(data.cards)) throw new Error("Saved dashboard is unavailable.");
        setSaved(data);
      }
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [dashboardId, create, editing, attempt]);
  const current = workspace.data?.dashboards.find((item) => item.id === dashboardId);
  const workspaceUnavailable = workspace.error || (!workspace.isPending && !create && !current);
  let content;
  if (workspaceUnavailable || error) content = <><Header title="My dashboard" /><div className={styles.message} role="alert"><p>{error || "Your dashboard could not be loaded or is unavailable."}</p><button className={styles.button} onClick={() => { workspace.refetch(); setAttempt((n) => n + 1); }}>Try again</button></div></>;
  else if (workspace.isPending || ((editing || create) ? !catalog : !saved)) content = <><Header title={create ? "Create dashboard" : "My dashboard"} /><p role="status">Loading saved dashboard...</p></>;
  else if (editing || create) content = <Editor key={dashboardId || "new"} workspace={workspace.data} dashboardId={dashboardId} catalog={catalog}
    onCancel={() => { if (create) navigate("/reports/dashboards?browse=1"); else setEditing(false); }}
    onSaved={(next, id) => { workspace.setData(next); setNotice("Dashboard saved. Only your private layout changed."); setEditing(false); if (create) navigate(personalDashboardHref(id), { replace: true }); }} />;
  else content = <>
    <Header title={saved.dashboard.title} action={<button className={styles.button} onClick={() => setEditing(true)}>Edit dashboard</button>} />
    {notice && <p role="status" className={styles.muted}>{notice}</p>}
    <div className={styles.heading}><p className={styles.muted}>Saved report results. Opening this page never starts an NXT refresh.</p><button className={styles.button} onClick={() => { workspace.refetch(); setAttempt((n) => n + 1); }}>Reload saved values</button></div>
    {!saved.cards.length ? <section className={styles.panel}><h2>No cards yet</h2><p>Add approved metrics to make this dashboard your own.</p><button className={styles.button} onClick={() => setEditing(true)}>Choose metrics</button></section>
      : <div className={styles.metricGrid}>{saved.cards.map((card) => <PersonalMetricCard key={card.id} card={card} />)}</div>}
  </>;
  return <main className={styles.page}><div className={styles.content}>{content}</div></main>;
}
