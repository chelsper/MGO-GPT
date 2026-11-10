import { useEffect, useRef, useState } from "react";
import QueryResultsTable from "./QueryResultsTable";
import ListColumnEditor from "./ListColumnEditor";
import { orderedListColumns } from "@/utils/listQueryConfiguration";
import { normalizeProjectTag, projectIdentity, projectCsv, PROJECT_SELECTION_LIMIT } from "@/utils/projectProspecting";
import { requestProjectTags } from "@/utils/projectTagRequest";
import styles from "./projectProspecting.module.css";
import shared from "./reportConfigurationEditor.module.css";

export default function ProjectProspectResults({ report, snapshot, refreshing = false, onReload }) {
  const [settings, setSettings] = useState(report.dataConfiguration.columns || []);
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [selected, setSelected] = useState([]);
  const [chosenTag, setChosenTag] = useState("");
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const writing = useRef(false);
  const controller = useRef(null);
  const endpoint = `/api/reports/lists/${encodeURIComponent(report.key)}/tags`;
  const identity = projectIdentity(snapshot, report.dataConfiguration);

  async function loadTags(signal) {
    const data = await requestProjectTags(endpoint, { signal });
    if (data.revision !== report.revision || data.snapshotAt !== snapshot.generatedAt ||
      !Array.isArray(data.tags) || !Array.isArray(data.assignments))
      throw new Error("The project changed. Reload the project to see its current list and tags.");
    if (!signal.aborted) setSaved(data);
  }
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    loadTags(current.signal).catch(error => { if (!current.signal.aborted) setError(error.message); })
      .finally(() => { if (!current.signal.aborted) setLoading(false); });
    return () => current.abort();
  }, [endpoint, report.revision, snapshot.generatedAt]);

  const tags = saved?.tags || [];
  const assignments = new Map();
  for (const item of saved?.assignments || []) {
    if (!assignments.has(item.constituentId)) assignments.set(item.constituentId, new Set());
    assignments.get(item.constituentId).add(item.tagId);
  }
  const columns = orderedListColumns(snapshot.headers, settings);
  const indexes = columns.map(column => snapshot.headers.indexOf(column.header));
  const filtered = snapshot.tableRows.map((row, index) => ({ row, id: identity.rowIds?.[index] || null }))
    .filter(({ row, id }) => row.some(cell => cell.toLowerCase().includes(search.trim().toLowerCase())) &&
      (!filterTag || (filterTag === "__untagged" ? !assignments.get(id)?.size : assignments.get(id)?.has(filterTag))));
  const filteredIds = [...new Set(filtered.map(item => item.id).filter(Boolean))];
  const rows = filtered.map(({ row }) => indexes.map(index => row[index]));
  const busy = loading || saving || refreshing;
  const ready = saved && !error && !identity.error;

  function toggle(id) {
    setSelected(current => current.includes(id) ? current.filter(value => value !== id)
      : current.length < PROJECT_SELECTION_LIMIT ? [...current, id] : current);
  }

  async function changeTags(action, event) {
    event?.preventDefault();
    if (writing.current || busy || !saved || error || (action !== "create" && (!ready || !selected.length || !chosenTag))) return;
    const tag = normalizeProjectTag(name);
    if (action === "create" && !tag) { setNotice("Enter a tag name between 1 and 50 characters."); return; }
    writing.current = true; setSaving(action);
    setNotice(action === "create" ? "Creating tag..." : action === "apply" ? "Applying tag..." : "Removing tag...");
    let confirmed = false;
    const signal = controller.current.signal;
    try {
      const data = await requestProjectTags(endpoint, { method: "POST", signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, revision: report.revision, snapshotAt: snapshot.generatedAt,
          ...(action === "create" ? { name: tag.name } : { tagId: chosenTag, constituentIds: selected }) }) });
      confirmed = true;
      if (signal.aborted) return;
      if (action === "create") { setChosenTag(data.tag.id); setName(""); }
      else setSelected([]);
      setNotice("Tag changes saved. Updating the list...");
      await loadTags(signal);
      if (!signal.aborted) setNotice(action === "create" ? `Tag "${data.tag.name}" is ready to use.`
        : `${data.changed} constituent${data.changed === 1 ? "" : "s"} updated. Nothing changed in NXT.`);
    } catch (error) {
      if (!signal.aborted) {
        setNotice("");
        setError(confirmed ? "Your changes were saved, but tags could not be reloaded. Reload the project before continuing." : error.message);
      }
    } finally { writing.current = false; if (!signal.aborted) setSaving(false); }
  }

  async function reloadProject() {
    if (writing.current || loading) return;
    setLoading(true);
    const signal = controller.current.signal;
    try {
      await onReload();
      if (signal.aborted) return;
      await loadTags(signal);
      if (!signal.aborted) { setError(""); setSelected([]); }
    } catch (error) { if (!signal.aborted) setError(error.message); }
    finally { if (!signal.aborted) setLoading(false); }
  }

  function exportCsv() {
    const visible = columns.filter(column => column.visible);
    const values = filtered.map(({ row, id }) => [
      ...visible.map(column => row[snapshot.headers.indexOf(column.header)]),
      tags.filter(tag => assignments.get(id)?.has(tag.id)).map(tag => tag.name).join("; "),
    ]);
    const blob = new Blob([projectCsv([...visible.map(column => column.label || column.header), "Project tags"], values)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `${report.title.replace(/[^a-z0-9-]+/gi, "-").slice(0, 100)}.csv`;
    document.body.appendChild(link);
    link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <section className={styles.panel} aria-label="Project prospects and tags" aria-busy={Boolean(loading || saving)}>
    <div className={styles.heading}><div><h2>{identity.error ? `${snapshot.total} query rows` : `${identity.ids.length} people`}</h2>
      <p>Tags are shared with this project's viewers and saved in the app only.</p></div>
      <div className={styles.tools}><ListColumnEditor headers={snapshot.headers} value={settings} onChange={setSettings} compact />
        <button className={shared.button} disabled={busy || !saved || Boolean(error)} onClick={exportCsv}>Export filtered CSV</button></div></div>
    {identity.error && <p className={shared.notice}>{identity.error} {report.canConfigure && <a href={`/report-configurations?report=${encodeURIComponent(report.key)}`}>Project settings</a>}</p>}
    {identity.invalidRows > 0 && <p className={shared.notice}>{identity.invalidRows} rows have no valid constituent system ID. They remain visible but cannot be tagged.</p>}
    {identity.ids.length < snapshot.total && !identity.error && <p className={styles.help}>Query rows may repeat a person. A tag applies once per constituent system ID and appears on each of that person's rows.</p>}
    {loading && <p role="status">Loading project tags...</p>}
    {error && <div role="alert" className={shared.notice}>{error} <button className={shared.button} disabled={saving || loading} onClick={reloadProject}>Reload project</button></div>}
    <div className={styles.tools}>
      <label className={shared.field}>Search this project<input type="search" value={search} onChange={event => { setSearch(event.target.value); setSelected([]); }} /></label>
      <label className={shared.field}>Filter by tag<select value={filterTag} disabled={!saved || busy} onChange={event => { setFilterTag(event.target.value); setSelected([]); }}>
        <option value="">All people</option><option value="__untagged">No tags yet</option>
        {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
      </select></label>
      <span className={styles.help}>{filtered.length} of {snapshot.total} query rows shown</span>
    </div>
    <div className={styles.tagBar}>
      <div className={styles.tools}>
        <button className={shared.button} disabled={busy || !ready || !filteredIds.length} onClick={() => setSelected(filteredIds.slice(0, PROJECT_SELECTION_LIMIT))}>Select up to 100 people</button>
        <button className={shared.button} disabled={busy || !selected.length} onClick={() => setSelected([])}>Clear selection</button>
        <span role="status">{selected.length} selected</span>
        <label className={shared.field}>Tag to apply or remove<select value={chosenTag} disabled={busy || !saved || Boolean(error)} onChange={event => setChosenTag(event.target.value)}>
          <option value="">Choose a tag</option>{tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
        </select></label>
        <button className={`${shared.button} ${shared.primary}`} disabled={busy || !ready || !selected.length || !chosenTag} onClick={() => changeTags("apply")}>Apply tag</button>
        <button className={shared.button} disabled={busy || !ready || !selected.length || !chosenTag} onClick={() => changeTags("remove")}>Remove tag</button>
      </div>
      <details><summary>Create a tag</summary><form className={styles.tools} onSubmit={event => changeTags("create", event)}>
        <label className={shared.field}>New tag name<input value={name} maxLength={50} disabled={busy} placeholder="e.g. Leadership interest" onChange={event => setName(event.target.value)} /></label>
        <button className={shared.button} disabled={busy || !saved || Boolean(error) || !normalizeProjectTag(name)}>{saving === "create" ? "Creating tag..." : "Create tag"}</button>
      </form></details>
      {notice && <p role="status">{notice}</p>}
    </div>
    <QueryResultsTable headers={columns.map(column => column.header)} rows={rows} columnSettings={columns} title={report.title} compact
      leadingColumn={{ title: "Select", render: (row, index) => {
        const id = filtered[index].id;
        return <input type="checkbox" aria-label={`Select constituent ${id || "unavailable"}`} checked={Boolean(id && selected.includes(id))}
          disabled={busy || !ready || !id || (!selected.includes(id) && selected.length >= PROJECT_SELECTION_LIMIT)} onChange={() => toggle(id)} />;
      } }}
      trailingColumn={{ title: "Project tags", render: (row, index) => <div className={styles.tags}>
        {tags.filter(tag => assignments.get(filtered[index].id)?.has(tag.id)).map(tag => <span className={styles.tag} key={tag.id}>{tag.name}</span>)}
        {!assignments.get(filtered[index].id)?.size && <span className={styles.help}>{loading ? "Loading..." : error ? "Unavailable" : "No tags"}</span>}
      </div> }} />
  </section>;
}
