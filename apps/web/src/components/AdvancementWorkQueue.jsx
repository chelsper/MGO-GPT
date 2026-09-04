"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp, RefreshCw, Search } from "lucide-react";
import {
  QUEUE_CATEGORIES, QUEUE_VIEWS, buildQueueItems, buildQueueMutation, filterQueueItems,
  formatQueueDate, formatQueueValue, getQueueActions, hasQueueSyncFailure, isQueueOverdue,
} from "@/utils/advancementQueue";
import styles from "./AdvancementWorkQueue.module.css";

const SOURCES = [
  ["data", "Data updates and research", "/api/data-requests?view=reviewer"],
  ["lists", "List requests", "/api/list-requests/all"],
  ["submissions", "Submission reviews", "/api/submissions/all"],
  ["imports", "Import batches", "/api/constituency-import/runs?queue=all&limit=50"],
];

async function readJson(url, signal) {
  const response = await fetch(url, { signal, cache: "no-store" });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || "Could not load this queue.");
  return payload;
}

export async function loadQueueSource(source, url, signal, onProgress = () => {}) {
  if (source !== "imports") {
    const rows = await readJson(url, signal);
    if (!Array.isArray(rows)) throw new Error("The queue returned an unexpected response. Please refresh.");
    return rows;
  }
  const rows = new Map();
  let cursor = null;
  const seen = new Set();
  do {
    const payload = await readJson(`${url}${cursor ? `&beforeId=${encodeURIComponent(cursor)}` : ""}`, signal);
    if (!Array.isArray(payload?.runs) || !(payload.nextCursor === null || /^[1-9]\d*$/.test(payload.nextCursor))) {
      throw new Error("Import batch listing is incomplete. Please refresh.");
    }
    payload.runs.forEach((row) => rows.set(String(row.id), row));
    onProgress(rows.size);
    cursor = payload.nextCursor;
    if (cursor && seen.has(cursor)) throw new Error("Import pagination did not advance. Please refresh.");
    seen.add(cursor);
  } while (cursor);
  return [...rows.values()];
}

function Detail({ label, value }) {
  if (value == null || value === "" || (Array.isArray(value) && !value.length)) return null;
  return <div><dt>{label}</dt><dd>{formatQueueValue(value)}</dd></div>;
}

function RequestDetails({ item }) {
  const r = item.record;
  if (item.source === "imports") return <>
    <dl className={styles.details}>
      <Detail label="Records in batch" value={r.rowCount} /><Detail label="Ready" value={r.readyCount} />
      <Detail label="Needs review" value={r.needsReviewCount} /><Detail label="Conflicts" value={r.conflictCount} />
      <Detail label="Failed" value={r.failedCount} /><Detail label="Applied" value={r.appliedCount} />
    </dl>
    <p>Continue with batch #{r.id} in the import workspace. No import changes are made from this queue.</p>
    <a className={styles.primary} href={`/constituency-import?queueRun=${encodeURIComponent(r.id)}`}>Open import workspace</a>
  </>;
  if (item.source === "lists") return <dl className={styles.details}>
    <Detail label="Purpose" value={r.purpose_other || r.purpose} />
    <Detail label="Delivery" value={r.output_type} />
    <Detail label="Include" value={[...(Array.isArray(r.who_included) ? r.who_included : [r.who_included]), r.who_included_other].filter(Boolean)} />
    <Detail label="Exclusions" value={[...(Array.isArray(r.exclusions) ? r.exclusions : [r.exclusions]), r.exclusions_other].filter(Boolean)} />
    <Detail label="Spreadsheet fields" value={[...(Array.isArray(r.excel_fields) ? r.excel_fields : [r.excel_fields]), r.excel_fields_other].filter(Boolean)} />
    <Detail label="Giving filter" value={[r.giving_level, r.giving_level_custom].filter(Boolean)} />
    <Detail label="Gift timeframe" value={r.gift_timeframe} />
    <Detail label="Custom date range" value={r.gift_timeframe_custom_start || r.gift_timeframe_custom_end ? `${formatQueueDate(r.gift_timeframe_custom_start)} to ${formatQueueDate(r.gift_timeframe_custom_end)}` : null} />
    <Detail label="Location" value={[r.location_filter, r.location_state, r.location_city, r.location_zip, r.location_radius_address, r.location_radius_miles ? `${r.location_radius_miles} mile radius` : null].filter(Boolean)} />
    <Detail label="Assigned MGO" value={r.assigned_mgo} />
    <Detail label="Instructions" value={r.special_instructions} />
    <Detail label="Requester's response" value={r.requester_response} />
  </dl>;
  return <>
    <dl className={styles.details}>
      <Detail label="Request" value={r.request_note || r.notes} />
      <Detail label="Provided information" value={r.provided_data} />
      <Detail label="Source" value={r.source_context} />
      <Detail label="NXT constituent ID" value={r.blackbaud_constituent_id} />
      <Detail label="Portfolio" value={r.owner_user_name} />
      <Detail label="Interaction" value={r.interaction_type} />
      <Detail label="Next step" value={r.next_step} />
    </dl>
    {item.source === "submissions" && <p><a href="/submissions?view=activity">Open detailed submission review and team follow-up</a></p>}
    {item.source === "submissions" && hasQueueSyncFailure(r) && <p className={styles.warning}>
      This NXT write needs follow-up. Reviewer notes do not repair or retry the NXT write; it stays in Open work until the sync issue is resolved.
    </p>}
  </>;
}

export default function AdvancementWorkQueue({ initialCategory = "all" }) {
  const [sources, setSources] = useState({ data: [], lists: [], submissions: [], imports: [] });
  const [loads, setLoads] = useState({});
  const [sourceErrors, setSourceErrors] = useState({});
  const [refreshKey, setRefreshKey] = useState(0);
  const [importProgress, setImportProgress] = useState(0);
  const [category, setCategory] = useState(initialCategory);
  const [view, setView] = useState("active");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("priority");
  const [expanded, setExpanded] = useState({});
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);
  const [rowErrors, setRowErrors] = useState({});
  const [message, setMessage] = useState("");
  const savingRef = useRef(false);
  const hasDrafts = Object.keys(drafts).length > 0;

  useEffect(() => {
    if (!hasDrafts) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasDrafts]);

  useEffect(() => {
    const controller = new AbortController();
    setLoads(Object.fromEntries(SOURCES.map(([key]) => [key, true])));
    setImportProgress(0);
    for (const [key, , url] of SOURCES) {
      loadQueueSource(key, url, controller.signal, setImportProgress)
        .then((rows) => {
          if (controller.signal.aborted) return;
          setSources((current) => ({ ...current, [key]: rows }));
          setSourceErrors((current) => ({ ...current, [key]: "" }));
        })
        .catch((err) => {
          if (!controller.signal.aborted) setSourceErrors((current) => ({ ...current, [key]: err.message }));
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoads((current) => ({ ...current, [key]: false }));
        });
    }
    return () => controller.abort();
  }, [refreshKey]);

  const busy = Object.keys(loads).length === 0 || Object.values(loads).some(Boolean);
  const incomplete = busy || Object.values(sourceErrors).some(Boolean);
  const items = buildQueueItems(sources);
  const visible = filterQueueItems(items, { category, view, search, sort });
  const viewCounts = Object.fromEntries(QUEUE_VIEWS.map(([key]) => [key, items.filter((item) => item.group === key).length]));

  function changeView(next) {
    setView(next);
    setMessage("");
  }

  function updateDraft(item, value) {
    setDrafts((current) => ({ ...current, [item.key]: { ...current[item.key], ...value } }));
  }

  async function save(item, status) {
    if (savingRef.current || busy) return;
    const draft = drafts[item.key] || {};
    setRowErrors((current) => ({ ...current, [item.key]: "" }));
    setMessage("");
    try {
      const mutation = buildQueueMutation(item, { ...draft, status });
      savingRef.current = true;
      setSaving(item.key);
      const response = await fetch(mutation.url, {
        method: mutation.method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(mutation.body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.id) throw new Error(payload?.error || "Could not save this request. Your notes are still here.");
      const updated = { ...item.record, ...payload };
      setSources((current) => ({ ...current, [item.source]: current[item.source].map((row) => String(row.id) === String(item.record.id) ? updated : row) }));
      setDrafts((current) => { const next = { ...current }; delete next[item.key]; return next; });
      const result = buildQueueItems({ [item.source]: [updated] })[0];
      const destination = QUEUE_VIEWS.find(([key]) => key === result.group)?.[1];
      setMessage(`${item.title}: ${status ? result.status : "notes saved"}.${result.group !== view ? ` Moved to ${destination}.` : ""}`);
    } catch (err) {
      setRowErrors((current) => ({ ...current, [item.key]: err.message }));
    } finally {
      savingRef.current = false;
      setSaving(null);
    }
  }

  return <main className={styles.page}>
    <a className={styles.back} href="/"><ArrowLeft size={16} />Back to dashboard</a>
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>Advancement Services</p><h1>Work Queue</h1>
        <p>Requests that need a person, all in one place. Successful direct-to-NXT activity stays in History.</p></div>
      <button className={styles.secondary} disabled={busy || Boolean(saving)} onClick={() => setRefreshKey((n) => n + 1)}><RefreshCw size={16} />{busy ? "Refreshing..." : "Refresh queues"}</button>
    </header>

    <nav className={styles.views} aria-label="Work queue views">
      {QUEUE_VIEWS.map(([key, label]) => <button key={key} aria-pressed={view === key} onClick={() => changeView(key)}>
        <span>{label}</span><strong>{viewCounts[key]}{incomplete ? "+" : ""}</strong>
        <small>{key === "active" ? "New requests, in progress, and exceptions" : key === "waiting" ? "Clarification requested; waiting for a reply" : "Completed, declined, and successful NXT activity"}</small>
      </button>)}
    </nav>
    {busy && <p role="status" className={styles.notice}>Loading saved queue records{loads.imports && importProgress > 0 ? ` (${importProgress} import batches checked)` : ""}. Counts are provisional until all queues finish loading.</p>}
    {SOURCES.filter(([key]) => sourceErrors[key]).map(([key, label]) => <p key={key} role="alert" className={styles.warning}>
      <strong>{label} could not refresh.</strong> {sourceErrors[key]} Last loaded records are retained; counts may be incomplete. Use Refresh queues to retry.
    </p>)}
    {message && <p className={styles.success} role="status">{message}</p>}

    <section className={styles.workspace} aria-label="Queue requests">
      <div className={styles.toolbar}>
        <label className={styles.search}><Search size={17} /><span className={styles.srOnly}>Search requests</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name, requester, type, or request ID" /></label>
        <label className={styles.sort}>Sort by <select value={sort} onChange={(event) => setSort(event.target.value)}><option value="priority">Priority, then overdue</option><option value="oldest">Oldest first</option><option value="newest">Newest first</option></select></label>
      </div>
      <nav className={styles.categories} aria-label="Request type">
        {QUEUE_CATEGORIES.map(([key, label]) => <button key={key} aria-pressed={category === key} onClick={() => setCategory(key)}>
          {label} <span>{items.filter((item) => item.group === view && (key === "all" || item.category === key)).length}{incomplete ? "+" : ""}</span>
        </button>)}
      </nav>
      <div className={styles.resultHeading}><h2>{QUEUE_CATEGORIES.find(([key]) => key === category)?.[1] || "Requests"}</h2><span>{visible.length} shown{incomplete ? " so far" : ""} · Imports count batches, not people</span></div>
      {!visible.length && <div className={styles.empty}>
        <h3>{busy ? "Loading this view..." : incomplete ? "This view may be incomplete" : view === "active" ? "No open work in this view" : "No requests in this view"}</h3>
        <p>{view === "active" && viewCounts.history > 0 ? "Completed requests are in History, not mixed in with today's work." : "Try another request type or clear your search."}</p>
        {(category !== "all" || search) && <button className={styles.secondary} onClick={() => { setCategory("all"); setSearch(""); }}>Show all request types</button>}
      </div>}
      <div className={styles.rows}>
        {visible.map((item) => {
          const open = Boolean(expanded[item.key]);
          const draft = drafts[item.key] || {};
          const disabled = busy || Boolean(saving);
          return <article className={styles.row} key={item.key}>
            <button className={styles.rowToggle} aria-expanded={open} aria-controls={`details-${item.key}`} onClick={() => setExpanded((current) => ({ ...current, [item.key]: !open }))}>
              <span className={styles.identity}><small>{item.type} · #{item.record.id}</small><strong>{item.title}</strong><span>Requested by {item.requester}</span></span>
              <span className={styles.timing}><span>{item.due ? `Due ${formatQueueDate(item.due)}` : `Received ${formatQueueDate(item.created)}`}</span><small>{item.source === "lists" ? ["", "Urgent", "Normal priority", "Backlog"][item.priority] : ""}{isQueueOverdue(item) ? " · Overdue" : ""}</small></span>
              <span className={styles.rowStatus}><span className={item.category === "exceptions" || isQueueOverdue(item) ? styles.alertBadge : styles.badge}>{item.status}</span>{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
            </button>
            {open && <div className={styles.expanded} id={`details-${item.key}`}>
              <RequestDetails item={item} />
              {item.source !== "imports" && <div className={styles.review}>
                <div className={styles.reviewHeader}><h3>Review this request</h3><span>These controls update the app queue, not NXT.</span></div>
                {item.source === "lists" && <label>Priority<select aria-label={`Priority for ${item.title}`} disabled={disabled} value={draft.queuePriority ?? item.priority} onChange={(event) => updateDraft(item, { queuePriority: Number(event.target.value) })}><option value={1}>Urgent</option><option value={2}>Normal</option><option value={3}>Backlog</option></select></label>}
                <label>Reviewer notes<textarea rows={3} aria-label={`Reviewer notes for ${item.title}`} disabled={disabled} value={draft.reviewerNotes ?? item.record.reviewer_notes ?? ""} onChange={(event) => updateDraft(item, { reviewerNotes: event.target.value })} placeholder="Add the next step, completion details, or a clarification question." /></label>
                {item.record.reviewed_by_name || item.record.reviewer_name ? <p>Last reviewed by {item.record.reviewed_by_name || item.record.reviewer_name}</p> : null}
                {rowErrors[item.key] && <p className={styles.warning} role="alert">{rowErrors[item.key]}</p>}
                <div className={styles.actions}>
                  <button className={styles.secondary} disabled={disabled} onClick={() => save(item)}>{saving === item.key ? "Saving..." : item.source === "lists" ? "Save notes & priority" : "Save notes"}</button>
                  {getQueueActions(item).map(([status, label]) => <button className={status === "Declined" ? styles.danger : styles.primary} disabled={disabled} key={status} onClick={() => save(item, status)}>{label}</button>)}
                  {drafts[item.key] && <span className={styles.unsaved}>Unsaved changes</span>}
                </div>
              </div>}
            </div>}
          </article>;
        })}
      </div>
    </section>
    <footer className={styles.footer}>Portfolio assignments and family imports keep their dedicated workspaces. <a href="/prospect-pool">Prospect Pool</a><a href="/family-import">Family Import</a><a href="/submissions?view=activity">Detailed submission review</a></footer>
  </main>;
}
