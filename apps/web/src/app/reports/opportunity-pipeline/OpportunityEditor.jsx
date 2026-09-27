"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./pipeline.module.css";

const stages = ["Identification", "Qualification", "Cultivation", "Solicitation", "Solicitation - Verbal", "Stewardship", "Funded", "Declined", "Withdrawn"];

async function requestEditor(id, method = "GET", body, signal) {
  const response = await fetch(`/api/reports/opportunity-pipeline/${encodeURIComponent(id)}`, {
    method, cache: "no-store", signal,
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw Object.assign(new Error(payload?.error || "Could not confirm the change. Check sync status before trying again."), { status: response.status });
  if (!payload?.state) throw new Error("The response was incomplete. Check sync status before trying again.");
  return payload;
}

export default function OpportunityEditor({ row, operation, onClose, onSaved }) {
  const dialog = useRef(null);
  const [context, setContext] = useState(null);
  const [fields, setFields] = useState({});
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const archive = operation === "archive";
  const pending = uncertain || context?.state === "pending";
  const close = () => { if (!busy && (!dirty || window.confirm("Discard your unsaved opportunity edits?"))) onClose(); };

  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element.showModal();
    const controller = new AbortController();
    requestEditor(row.id, "GET", null, controller.signal).then(value => {
      setContext(value); setFields(value.fields || {});
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => { controller.abort(); element.close(); previous?.focus?.(); };
  }, [row.id]);

  async function save(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const changed = Object.fromEntries(Object.entries(fields).filter(([key, value]) => key !== "inactive" && value !== context.fields[key]));
      const result = await requestEditor(row.id, "PATCH", { operation, version: context.version, fields: changed, confirmArchive: confirmed });
      setDirty(false); setContext(result);
      await onSaved(result);
      if (result.state !== "pending") onClose();
    } catch (err) {
      setError(err.message);
      // Explicit validation/provider rejections are known not to have applied.
      // Keep the draft editable so the user can correct it without a recovery round trip.
      if ([400, 422].includes(err.status)) return;
      // Even a lost HTTP response can follow a successful NXT write. Require a
      // status check and a fresh editor, never offer a blind repeat submission.
      setUncertain(true);
      await onSaved({ state: "pending" });
    } finally { setBusy(false); }
  }

  async function verify() {
    setBusy(true); setError("");
    try {
      const result = await requestEditor(row.id, "POST");
      setContext(result); setUncertain(false); setDirty(false);
      await onSaved(result);
      if (result.state === "complete") onClose();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  const input = (key, label, type = "text") => <label>{label}<input type={type} value={fields[key] ?? ""}
    maxLength={key === "name" ? 255 : 1000} min={type === "number" ? 0 : undefined} step={type === "number" ? "0.01" : undefined}
    required={key === "name"} disabled={busy} onChange={event => { setFields({ ...fields, [key]: event.target.value }); setDirty(true); }} /></label>;

  return <dialog ref={dialog} className={styles.editor} aria-labelledby="pipeline-editor-title" onCancel={event => { event.preventDefault(); close(); }}>
    <form onSubmit={save}>
      <header><div><p className={styles.eyebrow}>{row.constituentName}</p><h2 id="pipeline-editor-title">{pending ? "Check opportunity sync" : archive ? "Archive opportunity" : "Edit opportunity"}</h2></div>
        <button type="button" className={styles.button} onClick={close} disabled={busy}>Close</button></header>
      <div className={styles.editorBody}>
        {busy && !context && <p role="status">Checking current NXT values...</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        {pending ? <div className={styles.notice}><p>{context?.message || "The save result needs checking. No repeat submission will be sent."}</p><button type="button" className={styles.button} onClick={verify} disabled={busy}>{busy ? "Checking..." : "Check sync status"}</button></div> : context?.state === "ready" && <>
          <p className={styles.source}>Current NXT values. A verified save updates all {context.copyCount} linked app {context.copyCount === 1 ? "record" : "records"}. Assignments, local notes, and gift links are retained.</p>
          {archive ? <div className={styles.notice}><h3>{row.title}</h3><p>This marks the opportunity inactive in NXT and moves it to Closed &amp; archived here. It does not delete the opportunity or its history.</p>
            <label className={styles.confirm}><input type="checkbox" checked={confirmed} disabled={busy} onChange={event => setConfirmed(event.target.checked)} />Archive this opportunity in NXT and all linked workspaces.</label></div>
            : context.fields.inactive ? <p role="status">This opportunity is inactive in NXT. Reactivate it there before editing.</p> : <div className={styles.editFields}>
              {input("name", "Opportunity title")}
              <label>Stage / NXT status<select value={fields.status || ""} disabled={busy} onChange={event => { setFields({ ...fields, status: event.target.value }); setDirty(true); }}>
                {[...new Set([context.fields.status, ...stages])].map(value => <option key={value}>{value}</option>)}
              </select></label>
              {input("purpose", "Purpose")}{input("ask_amount", "Ask amount", "number")}
              {input("ask_date", "Ask date", "date")}{input("expected_date", "Expected date", "date")}
              {input("funded_amount", "Funded amount", "number")}{input("funded_date", "Funded date", "date")}
              <p className={styles.source}>Ask amount is the pipeline amount, not revenue received. Funded fields do not create gifts. To clear an existing amount or date, change it in NXT first.</p>
            </div>}
        </>}
      </div>
      {!pending && context?.state === "ready" && <footer><button type="button" className={styles.button} onClick={close} disabled={busy}>Cancel</button>
        <button className={styles.primary} type="submit" disabled={busy || (archive ? !confirmed : !dirty || context.fields.inactive)}>{busy ? "Saving and verifying..." : archive ? "Archive in NXT and app" : "Save to NXT and app"}</button></footer>}
    </form>
  </dialog>;
}
