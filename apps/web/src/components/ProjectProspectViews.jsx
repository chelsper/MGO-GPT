import { useEffect, useState } from "react";
import { decodeProjectViews, normalizeProjectView, projectViewProblem, projectViewStorageKey, PROJECT_VIEW_LIMIT } from "@/utils/projectProspectViews";
import styles from "./projectProspecting.module.css";
import shared from "./reportConfigurationEditor.module.css";

export default function ProjectProspectViews({ viewerId, projectKey, value, tags, sortOptions, disabled, onApply }) {
  const key = projectViewStorageKey(viewerId, projectKey);
  const [views, setViews] = useState([]);
  const [selected, setSelected] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [confirm, setConfirm] = useState("");
  useEffect(() => {
    try { setViews(decodeProjectViews(window.localStorage.getItem(key))); setLoaded(true); }
    catch { setMessage("Saved views are unavailable in this browser. You can still filter and sort the list normally."); }
    function changed(event) {
      if (event.key === key || event.key === null) {
        try { setViews(decodeProjectViews(window.localStorage.getItem(key))); setSelected(""); setConfirm(""); setLoaded(true); }
        catch { setLoaded(false); setMessage("Saved views changed in another tab and could not be read. Reload before saving a view."); }
      }
    }
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [key]);
  if (!key) return null;
  const blocked = disabled || !loaded;
  function persist(action) {
    try {
      // Re-read before a write so another tab's saved views are not overwritten.
      const current = decodeProjectViews(window.localStorage.getItem(key));
      const next = action(current);
      window.localStorage.setItem(key, JSON.stringify({ version: 1, views: next }));
      setViews(next); setConfirm(""); return true;
    } catch (error) { setMessage(error?.message?.startsWith("A view") || error?.message?.startsWith("You can save") ? error.message : "The view could not be saved in this browser. Your current list is unchanged."); return false; }
  }
  function save() {
    const label = name.trim();
    if (!label || label.length > 60) { setMessage("Enter a view name between 1 and 60 characters."); return; }
    const problem = projectViewProblem(value, tags, sortOptions);
    if (problem) { setMessage(problem); return; }
    const id = crypto.randomUUID();
    if (persist(current => {
      if (current.some(v => v.name.toLowerCase() === label.toLowerCase())) throw new Error("A view already has that name. Choose a different name.");
      if (current.length >= PROJECT_VIEW_LIMIT) throw new Error(`You can save up to ${PROJECT_VIEW_LIMIT} views. Delete an unused view first.`);
      return [...current, { id, name: label, settings: normalizeProjectView(value) }];
    })) { setSelected(id); setName(""); setMessage(`Saved "${label}". It is available only to you in this browser.`); }
  }
  return <details className={styles.savedViews}>
    <summary>My saved views (this browser){views.length ? ` / ${views.length}` : ""}</summary>
    <p className={styles.help}>Save tag filters, status, household display and sort. Search text, selected people and donor data are not saved. Applying a view clears search and selection. Other users' views stay unchanged.</p>
    <div className={styles.tools}>
      <label className={shared.field}>Saved view<select value={selected} disabled={blocked} onChange={e => { setSelected(e.target.value); setConfirm(""); setMessage(""); }}>
        <option value="">Choose a view</option>{views.map(view => <option key={view.id} value={view.id}>{view.name}</option>)}
      </select></label>
      <button className={shared.button} disabled={blocked || !selected} onClick={() => {
        const view = views.find(v => v.id === selected); const problem = projectViewProblem(view?.settings, tags, sortOptions);
        if (problem) { setMessage(problem); return; }
        onApply(view.settings); setConfirm(""); setMessage(`Applied "${view.name}".`);
      }}>Apply view</button>
      <button className={shared.button} disabled={blocked || !selected} onClick={() => setConfirm(selected)}>Delete view</button>
      <label className={shared.field}>New view name<input maxLength={60} value={name} disabled={blocked} onChange={e => setName(e.target.value)} /></label>
      <button className={shared.button} disabled={blocked} onClick={save}>Save current view</button>
    </div>
    {confirm && <div role="group" aria-label="Confirm deleting saved view"><p>Delete "{views.find(v => v.id === confirm)?.name}"? No tags or constituents will change.</p>
      <button className={shared.button} disabled={blocked} onClick={() => { if (persist(current => current.filter(v => v.id !== confirm))) { setSelected(""); setMessage("Saved view deleted. The current filters are unchanged."); } }}>Confirm delete view</button>
      <button className={shared.button} onClick={() => setConfirm("")}>Keep view</button></div>}
    {message && <p role="status">{message}</p>}
  </details>;
}
