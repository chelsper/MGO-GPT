import { useEffect, useRef, useState } from "react";
import QueryResultsTable, { displayCell } from "./QueryResultsTable";
import ListColumnEditor from "./ListColumnEditor";
import { LIST_QUERY_MAX_COLUMNS, orderedListColumns } from "@/utils/listQueryConfiguration";
import { normalizeProjectTag, projectIdentity, projectProspectRows, projectCsv, PROJECT_SELECTION_LIMIT } from "@/utils/projectProspecting";
import { requestProjectTags } from "@/utils/projectTagRequest";
import { projectDisplayColumns, projectHouseholds, projectPersonName, projectExportData, projectSolicitors } from "@/utils/projectProspectingDisplay";
import styles from "./projectProspecting.module.css";
import shared from "./reportConfigurationEditor.module.css";

export default function ProjectProspectResults({ report, snapshot, refreshing = false, onReload }) {
  const [settings, setSettings] = useState(report.dataConfiguration.columns || []);
  const [search, setSearch] = useState("");
  const [filterTag, setFilterTag] = useState("");
  const [status, setStatus] = useState("active");
  const [groupSpouses, setGroupSpouses] = useState(true);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [confirmation, setPendingConfirmation] = useState(null);
  const confirmationRef = useRef(null);
  const returnFocus = useRef(null);
  function setConfirmation(value) {
    if (value) returnFocus.current = document.activeElement;
    setPendingConfirmation(value);
  }
  useEffect(() => {
    if (confirmation) {
      confirmationRef.current?.focus();
      confirmationRef.current?.scrollIntoView?.({ block: "nearest" });
    } else if (returnFocus.current?.isConnected) returnFocus.current.focus();
  }, [confirmation]);
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
  const prospects = projectProspectRows(snapshot, identity);
  const duplicateRows = snapshot.tableRows.length - prospects.length;

  async function loadTags(signal) {
    const data = await requestProjectTags(endpoint, { signal });
    if (data.revision !== report.revision || data.snapshotAt !== snapshot.generatedAt ||
      !Array.isArray(data.tags) || !Array.isArray(data.assignments) || !Array.isArray(data.archivedIds))
      throw new Error("The project changed. Reload the project to see its current list and tags.");
    if (!signal.aborted) setSaved(data);
  }
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    setSaved(null); setError(""); setSelected([]); setConfirmation(null);
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
  const display = projectDisplayColumns(snapshot.headers, report.dataConfiguration);
  const solicitors = projectSolicitors(snapshot, identity, display);
  const archivedIds = new Set(saved?.archivedIds || []);
  const statusPeople = prospects.filter(p => status === "all" || (status === "archived") === archivedIds.has(p.id));
  const searchTerm = search.trim().toLowerCase();
  const filtered = statusPeople
    .filter(({ values, id }) => (!searchTerm || values.some(cells => cells.some(cell => cell.toLowerCase().includes(searchTerm)))) &&
      (!filterTag || (filterTag === "__untagged" ? !assignments.get(id)?.size : assignments.get(id)?.has(filterTag))));
  const filteredIds = [...new Set(filtered.map(item => item.id).filter(Boolean))];
  const matchedPeople = new Set(filtered);
  const households = projectHouseholds(statusPeople, display, groupSpouses);
  const groups = households.rows.filter(group => group.members.some(p => matchedPeople.has(p)));
  const peopleHeader = snapshot.headers[display.name] || "__project_people";
  const tableColumns = [...(display.name < 0 ? [] : [{ header: peopleHeader, label: "People & tags", visible: true, format: "text" }]),
    ...columns.filter(column => snapshot.headers.indexOf(column.header) !== display.name)];
  const rows = groups.map(group => tableColumns.map(column => column.header === peopleHeader ? group.members[0].row[display.name] || "Constituent" : group.members[0].row[snapshot.headers.indexOf(column.header)]));
  const busy = loading || saving || refreshing;
  const ready = saved && !error && !identity.error;
  const canApply = selected.filter(id => !assignments.get(id)?.has(chosenTag));
  const canRemove = selected.filter(id => assignments.get(id)?.has(chosenTag));

  function toggle(id) {
    setSelected(current => current.includes(id) ? current.filter(value => value !== id)
      : current.length < PROJECT_SELECTION_LIMIT ? [...current, id] : current);
  }

  async function changeTags(action, event, target = {}) {
    event?.preventDefault();
    const ids = target.ids || (action === "apply" ? canApply : canRemove);
    const tagId = target.tagId || chosenTag;
    const archive = action === "archive" || action === "restore";
    if (writing.current || busy || !saved || error || (action !== "create" && (!ready || !ids.length || (!archive && !tagId)))) return;
    const tag = normalizeProjectTag(name);
    if (action === "create" && !tag) { setNotice("Enter a tag name between 1 and 50 characters."); return; }
    writing.current = true; setSaving(action);
    setNotice(action === "create" ? "Creating tag..." : "Saving project changes...");
    let confirmed = false;
    const signal = controller.current.signal;
    try {
      const data = await requestProjectTags(endpoint, { method: "POST", signal, headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, revision: report.revision, snapshotAt: snapshot.generatedAt,
          ...(action === "create" ? { name: tag.name } : { ...(!archive ? { tagId } : {}), constituentIds: ids }) }) });
      confirmed = true;
      if (signal.aborted) return;
      if (action === "create") { setChosenTag(data.tag.id); setName(""); }
      else { setSelected([]); setConfirmation(null); }
      setNotice("Changes saved. Updating the list...");
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

  function exportCsv(everyone = false) {
    const people = everyone ? prospects.filter(p => includeArchived || !archivedIds.has(p.id)) : filtered;
    const exportGroups = everyone ? projectHouseholds(people, display, groupSpouses).rows : households.rows;
    const data = projectExportData({ people, households: exportGroups, columns: columns.filter(c => c.visible),
      headers: snapshot.headers, tags, assignments, archivedIds, display });
    const blob = new Blob([projectCsv(data.headers, data.rows)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url; link.download = `${report.title.replace(/[^a-z0-9-]+/gi, "-").slice(0, 100)}-${everyone ? "everyone" : "filtered"}.csv`;
    document.body.appendChild(link);
    link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function renderPeople(index) {
    const group = groups[index];
    return <div className={styles.people}>{group.members.length > 1 && <span className={styles.help}>Married household / {group.members.length} separate records</span>}
      {group.members.map((p, memberIndex) => <div key={p.id || memberIndex} className={styles.person}>
        <label className={styles.personName}><input type="checkbox" aria-label={`Select constituent ${p.id || "unavailable"}`} checked={Boolean(p.id && selected.includes(p.id))}
          disabled={busy || !ready || !p.id || !matchedPeople.has(p) || (!selected.includes(p.id) && selected.length >= PROJECT_SELECTION_LIMIT)} onChange={() => toggle(p.id)} />
          <strong>{projectPersonName(p, display)}</strong></label>
        {p.values[display.name]?.length > 1 && <details className={styles.cellValues}><summary>Other names in query</summary><ul>{p.values[display.name].slice(1).map((value, i) => <li key={i}>{value}</li>)}</ul></details>}
        {archivedIds.has(p.id) && <span className={styles.help}>Archived</span>}
        {!matchedPeople.has(p) && <p className={styles.help}>Spouse context only: outside current filter; not selected or exported.</p>}
        <p className={styles.help}>Saved solicitor assignment: {(solicitors.get(p.id) || []).filter(s => s.status === "Current in saved data" || s.status === "Dates not verified").map(s => s.type ? `${s.name} (${s.type})` : s.name).filter((v, i, a) => a.indexOf(v) === i).join("; ") || (solicitors.has(p.id) ? "No current assignment in saved data" : "Not in saved query")}</p>
        {solicitors.has(p.id) && <details className={styles.cellValues}><summary>Assignment details</summary><ul>{solicitors.get(p.id).map((s, i) => <li key={i}>{s.name}{s.type ? ` (${s.type})` : ""}: {s.status}. {s.from || "No start date"} to {s.to || "No end date"}</li>)}</ul></details>}
        <div className={styles.tags}>{tags.filter(tag => assignments.get(p.id)?.has(tag.id)).map(tag => <span className={styles.tag} key={tag.id}>{tag.name}
          <button type="button" aria-label={`Remove ${tag.name} from ${projectPersonName(p, display)}`} disabled={busy || !ready || !matchedPeople.has(p)} onClick={() => setConfirmation({ action: "remove", ids: [p.id], tagId: tag.id })}>x</button>
        </span>)}{!assignments.get(p.id)?.size && <span className={styles.help}>{loading ? "Loading..." : error ? "Unavailable" : "No tags"}</span>}</div>
        <button className={styles.textButton} disabled={busy || !ready || !p.id || !matchedPeople.has(p)} onClick={() => setConfirmation({ action: archivedIds.has(p.id) ? "restore" : "archive", ids: [p.id] })}>{archivedIds.has(p.id) ? "Restore" : "Archive"} {projectPersonName(p, display)}</button>
      </div>)}
    </div>;
  }

  return <section className={styles.panel} aria-label="Project prospects and tags" aria-busy={Boolean(loading || saving)}>
    <div className={styles.heading}><div><h2>{identity.error ? `${snapshot.total} query rows` : `${identity.ids.length} constituents`}</h2>
      <p>Tags are shared with this project's viewers and saved in the app only.</p></div>
      <div className={styles.tools}><ListColumnEditor headers={snapshot.headers} value={settings} onChange={setSettings} compact />
        <button className={shared.button} disabled={busy || !saved || Boolean(error)} onClick={() => exportCsv()}>Export filtered CSV</button>
        <details><summary>Export everyone</summary><p className={styles.help}>Ignores search and tag filters.</p>
          <label><input type="checkbox" checked={includeArchived} onChange={event => setIncludeArchived(event.target.checked)} /> Include archived people</label>
          <button className={shared.button} disabled={busy || !saved || Boolean(error)} onClick={() => exportCsv(true)}>Export everyone CSV</button>
        </details></div></div>
    <p className={styles.help}>CSV: one row per person, household context, and a separate Yes/blank column for every tag. Tags never transfer between spouses.</p>
    {identity.error && <p className={shared.notice}>{identity.error} {report.canConfigure && <a href={`/report-configurations?report=${encodeURIComponent(report.key)}`}>Project settings</a>}</p>}
    {identity.invalidRows > 0 && <p className={shared.notice}>{identity.invalidRows} rows have no valid constituent system ID. They remain visible but cannot be tagged.</p>}
    {duplicateRows > 0 && <p className={styles.help}>Showing each constituent once. {duplicateRows} repeated query {duplicateRows === 1 ? "row was" : "rows were"} combined; additional field values remain available and are included in CSV exports. Amounts are not added together.</p>}
    {households.missing && <p className={styles.help}>Showing individuals until Spouse ID, Marital Status and matching constituent ID fields are available. {report.canConfigure && !identity.error && <a href={`/report-configurations?report=${encodeURIComponent(report.key)}`}>Project settings</a>}</p>}
    {households.warnings > 0 && <p className={styles.help}>Some relationships are ambiguous or not confirmed married; those records stay separate.</p>}
    {loading && <p role="status">Loading project tags...</p>}
    {error && <div role="alert" className={shared.notice}>{error} <button className={shared.button} disabled={saving || loading} onClick={reloadProject}>Reload project</button></div>}
    <div className={styles.tools}>
      <label className={shared.field}>Search this project<input type="search" value={search} onChange={event => { setSearch(event.target.value); setSelected([]); setConfirmation(null); }} /></label>
      <label className={shared.field}>Filter by tag<select value={filterTag} disabled={!saved || busy} onChange={event => { setFilterTag(event.target.value); setSelected([]); setConfirmation(null); }}>
        <option value="">All people</option><option value="__untagged">No tags yet</option>
        {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
      </select></label>
      <label className={shared.field}>Project status<select value={status} disabled={busy} onChange={event => { setStatus(event.target.value); setSelected([]); setConfirmation(null); }}>
        <option value="active">Active</option><option value="archived">Archived ({archivedIds.size})</option><option value="all">Active and archived</option>
      </select></label>
      <label className={shared.field}>Display<select value={groupSpouses ? "households" : "people"} onChange={event => { setGroupSpouses(event.target.value === "households"); setSelected([]); }}>
        <option value="households">Married households</option><option value="people">Individual people / organizations</option>
      </select></label>
      <span className={styles.help}>{filtered.length} of {prospects.length} {identity.error ? "query rows" : identity.invalidRows ? "entries" : "constituents"} shown</span>
    </div>
    <div className={styles.tagBar}>
      <div className={styles.tools}>
        <button className={shared.button} disabled={busy || !ready || !filteredIds.length} onClick={() => setSelected(filteredIds.slice(0, PROJECT_SELECTION_LIMIT))}>Select up to 100 people</button>
        <button className={shared.button} disabled={busy || !selected.length} onClick={() => setSelected([])}>Clear selection</button>
        <span role="status">{selected.length} selected</span>
        <label className={shared.field}>Tag to apply or remove<select value={chosenTag} disabled={busy || !saved || Boolean(error)} onChange={event => setChosenTag(event.target.value)}>
          <option value="">Choose a tag</option>{tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
        </select></label>
        <button className={`${shared.button} ${shared.primary}`} disabled={busy || !ready || !canApply.length || !chosenTag} onClick={() => changeTags("apply")}>Apply tag</button>
        <button className={shared.button} disabled={busy || !ready || !canRemove.length || !chosenTag} onClick={() => setConfirmation({ action: "remove", ids: canRemove, tagId: chosenTag })}>Remove tag</button>
        <button className={shared.button} disabled={busy || !ready || !selected.some(id => !archivedIds.has(id))} onClick={() => setConfirmation({ action: "archive", ids: selected.filter(id => !archivedIds.has(id)) })}>Archive selected</button>
        <button className={shared.button} disabled={busy || !ready || !selected.some(id => archivedIds.has(id))} onClick={() => setConfirmation({ action: "restore", ids: selected.filter(id => archivedIds.has(id)) })}>Restore selected</button>
      </div>
      {selected.length > 0 && chosenTag && <p className={styles.help}>{canRemove.length} selected already have this tag. Apply only adds it where missing.</p>}
      <details><summary>Create a tag</summary><form className={styles.tools} onSubmit={event => changeTags("create", event)}>
        <label className={shared.field}>New tag name<input value={name} maxLength={50} disabled={busy} placeholder="e.g. Leadership interest" onChange={event => setName(event.target.value)} /></label>
        <button className={shared.button} disabled={busy || !saved || Boolean(error) || !normalizeProjectTag(name)}>{saving === "create" ? "Creating tag..." : "Create tag"}</button>
      </form></details>
      {notice && <p role="status">{notice}</p>}
    </div>
    {confirmation && <section ref={confirmationRef} tabIndex={-1} role="region" aria-label="Confirm project change" className={styles.confirmation}>
      <h3>{confirmation.action === "remove" ? `Remove ${tags.find(t => t.id === confirmation.tagId)?.name}?` : confirmation.action === "archive" ? "Archive from this project?" : "Restore to this project?"}</h3>
      <p>{confirmation.ids.length} constituent{confirmation.ids.length === 1 ? "" : "s"}: {prospects.filter(p => confirmation.ids.includes(p.id)).map(p => projectPersonName(p, display)).join(", ")}</p>
      <p>{confirmation.action === "archive" ? "Hides these people from the active list. Their tags are retained and they can be restored." : confirmation.action === "restore" ? "Returns these people to the active list with their saved tags." : "Removes only this tag from the named people."} Spouses are not changed unless selected. NXT records and outreach assignments are unchanged.</p>
      <div className={styles.tools}><button className={shared.button} disabled={busy || !ready} onClick={() => changeTags(confirmation.action, null, confirmation)}>Confirm {confirmation.action}</button>
        <button className={shared.button} disabled={saving} onClick={() => setConfirmation(null)}>Cancel</button></div>
    </section>}
    {!groups.length && prospects.length > 0 ? <div role="status"><p>No people match these filters. Your saved project list is unchanged.</p>
      <button className={shared.button} onClick={() => { setSearch(""); setFilterTag(""); setStatus("active"); setSelected([]); setConfirmation(null); }}>Show active people</button>
    </div> : <QueryResultsTable headers={tableColumns.map(column => column.header)} rows={rows} columnSettings={tableColumns} title={report.title} compact maxColumns={LIST_QUERY_MAX_COLUMNS}
      leadingColumn={display.name < 0 ? { title: "People & tags", render: (_, index) => renderPeople(index) } : undefined}
      renderCell={(value, column, index) => {
        const group = groups[index];
        if (display.name >= 0 && column.header === peopleHeader) return renderPeople(index);
        return group.members.map((p, memberIndex) => {
          const values = p.values[snapshot.headers.indexOf(column.header)];
          return <div key={p.id || memberIndex} className={styles.memberValue}>
            {group.members.length > 1 && <span className={styles.help}>{projectPersonName(p, display)}: </span>}
            {values.length <= 1 ? displayCell(values[0] || "", column.format) : <details className={styles.cellValues}>
              <summary>{displayCell(values[0], column.format)} <span className={styles.help}>+{values.length - 1} more</span></summary>
              <ul aria-label={`Additional ${column.label || column.header} values`}>{values.slice(1).map((value, i) => <li key={i}>{displayCell(value, column.format)}</li>)}</ul>
            </details>}
          </div>;
        });
      }} />}
  </section>;
}
