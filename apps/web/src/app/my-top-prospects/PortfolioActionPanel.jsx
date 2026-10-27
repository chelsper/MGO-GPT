import { useEffect, useId, useRef, useState } from "react";
import { ACTION_CATEGORIES, INTERACTION_TYPES, validNextStepActionDate } from "@/utils/actionEntryOptions";
import { canEditWorkspace } from "@/utils/workspaceRoles";
import { submitActionUpdate } from "@/utils/submitActionUpdate";
import { buildPortfolioUpdateHref } from "./prospectPresentation";
import "./portfolioActionPanel.css";

const today = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
};

export default function PortfolioActionPanel({ person, viewerId, workspaceId, onClose, onSaved }) {
  const titleId = useId();
  const dialog = useRef(null);
  const feedback = useRef(null);
  const discardPrompt = useRef(null);
  const summaryInput = useRef(null);
  const inFlight = useRef(false);
  const leaving = useRef(false);
  const initial = useRef({ actionDate: today(), actionCategory: "Meeting", interactionType: "Cultivation", summary: "", notes: "" });
  const [draft, setDraft] = useState(initial.current);
  const [profile, setProfile] = useState(null);
  const [contextError, setContextError] = useState("");
  const [contextAttempt, setContextAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null);
  const [pendingExit, setPendingExit] = useState(null);
  const storageKey = `portfolio-action-attempt:${viewerId}:${workspaceId}:${person.constituentId}`;
  const [attempt, setAttempt] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) || "null"); } catch { return null; }
  });
  const dirty = JSON.stringify(initial.current) !== JSON.stringify(draft);
  const enabled = Boolean(profile) && !contextError && !busy && !attempt && !saved && !pendingExit;

  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => {
      element?.close();
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setProfile(null);
    setContextError("");
    fetch("/api/users/profile", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Could not check your workspace. No action has been submitted.");
        const data = await response.json();
        if (String(data.user?.id) !== String(viewerId) || String(data.workspaceUser?.id) !== String(workspaceId)
          || !canEditWorkspace({ sessionUser: data.user, workspaceUser: data.workspaceUser, isActing: Boolean(data.actingAsUser) })) {
          throw new Error("This workspace has changed or is read-only. Close this draft and return to an editable portfolio.");
        }
        if (!controller.signal.aborted) setProfile(data);
      }).catch(reason => { if (!controller.signal.aborted) setContextError(reason.message); });
    return () => controller.abort();
  }, [viewerId, workspaceId, contextAttempt]);

  useEffect(() => {
    const guard = event => {
      if (!leaving.current && (busy || (dirty && !saved && !attempt))) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [busy, dirty, saved, attempt]);
  useEffect(() => { if (saved || error || contextError) feedback.current?.focus(); }, [saved, error, contextError]);
  useEffect(() => {
    if (pendingExit) discardPrompt.current?.focus();
    else summaryInput.current?.focus();
  }, [pendingExit]);

  function rememberAttempt(value) {
    setAttempt(value);
    // Only receipt metadata is retained, never donor names or draft notes.
    try {
      if (value) sessionStorage.setItem(storageKey, JSON.stringify(value));
      else sessionStorage.removeItem(storageKey);
    } catch { /* The server's durable receipt still prevents duplicate NXT creates. */ }
  }
  function close() {
    if (inFlight.current) return;
    if (pendingExit) { setPendingExit(null); return; }
    if (dirty && !saved && !attempt) { setPendingExit("close"); return; }
    onClose();
  }
  function fullForm(event) {
    if (inFlight.current || attempt || saved) { event.preventDefault(); return; }
    if (dirty) { event.preventDefault(); setPendingExit("full"); }
  }
  async function save(event) {
    event.preventDefault();
    if (!enabled || inFlight.current) return;
    if (!validNextStepActionDate("completed", draft.actionDate, today()) || !draft.summary.trim()) {
      setError("Enter an action date no later than today and a short summary.");
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError("");
    const pending = { startedAt: new Date().toISOString() };
    rememberAttempt(pending);
    let completed = null;
    try {
      const result = await submitActionUpdate({
        ...draft, summary: draft.summary.trim(), notes: draft.notes.trim(),
        donorName: person.name, blackbaudConstituentId: person.constituentId,
        createNewConstituent: false,
        portfolioContext: { viewerId, workspaceId, constituentId: person.constituentId },
      }, { prospectId: person.prospectId || null });
      const action = result.action?.blackbaudAction;
      const remoteId = action?.verifiedActionId;
      if (!remoteId || action?.error) throw new Error("The save did not return a verified NXT action.");
      const receipt = { id: String(remoteId), warning: action.syncWarning || "" };
      setSaved(receipt);
      rememberAttempt(null);
      completed = receipt;
    } catch (reason) {
      if (reason.notSubmitted) {
        rememberAttempt(null);
        setError(reason.message);
      } else {
        rememberAttempt({ ...pending, receiptId: reason.writeReceipt?.id || null });
        setError(reason.writeReceipt ? reason.message
          : "We could not confirm the result. The action may already be saved. Check Saved NXT submissions before entering it again; this form will not resend it.");
      }
    } finally { inFlight.current = false; setBusy(false); }
    if (completed) onSaved?.(completed);
  }
  async function checkSavedStatus() {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    let completed = null;
    try {
      const response = await fetch("/api/nxt-write-recovery", { cache: "no-store" });
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (String(data.workspace?.id) !== String(workspaceId)) throw new Error();
      const matches = (data.receipts || []).filter(receipt => receipt.kind === "action"
        && String(receipt.constituentId) === String(person.constituentId)
        && (attempt.receiptId ? String(receipt.id) === String(attempt.receiptId)
          : Date.parse(receipt.createdAt) >= Date.parse(attempt.startedAt) - 5000));
      if (matches.length !== 1 || !["complete", "verified"].includes(matches[0].state)) throw new Error();
      const receipt = { id: matches[0].remoteId, warning: matches[0].state === "verified"
        ? "The NXT record is verified. An administrator may still need to reconcile the app's saved activity." : "" };
      setSaved(receipt);
      rememberAttempt(null);
      completed = receipt;
    } catch {
      setError("There is no confirmed result available here yet. Open Saved NXT submissions to check the existing record with an administrator. Nothing was resent.");
    } finally { inFlight.current = false; setBusy(false); }
    if (completed) onSaved?.(completed);
  }
  const change = key => event => setDraft(current => ({ ...current, [key]: event.target.value }));

  return <dialog ref={dialog} aria-labelledby={titleId} className="portfolio-action-panel" onCancel={event => { event.preventDefault(); close(); }}>
    <form onSubmit={save} className="portfolio-action-panel__form">
      <header className="portfolio-action-panel__header">
        <div><p className="portfolio-action-panel__eyebrow">MY PORTFOLIO</p><h2 id={titleId}>Log action</h2></div>
        <button type="button" className="portfolio-action-panel__close" aria-label="Close Log action" disabled={busy} onClick={close}>Close</button>
      </header>
      <div className="portfolio-action-panel__body">
        {pendingExit && <section ref={discardPrompt} tabIndex={-1} role="alert" aria-label="Unsaved action" className="portfolio-action-panel__feedback">
          <strong>Discard this unsaved action?</strong>
          <p>{pendingExit === "full" ? "Your draft will not transfer to the full action form." : "Your changes have not been saved."}</p>
          <div className="portfolio-action-panel__discard">
            <button type="button" onClick={() => setPendingExit(null)}>Keep editing</button>
            {pendingExit === "full" ? <a href={buildPortfolioUpdateHref(person, "action")} onClick={() => { leaving.current = true; }}>Discard and open full form</a>
              : <button type="button" onClick={onClose}>Discard draft</button>}
          </div>
        </section>}
        <div className="portfolio-action-panel__identity">
          <h3>{person.name}</h3><p>NXT constituent {person.constituentId}</p>
          {profile ? <p>Credited to <strong>{profile.workspaceUser.name}</strong>{String(viewerId) !== String(workspaceId) && <>{" \u00b7 Entered by "}{profile.user.name}</>}</p>
            : !contextError && <p role="status">Checking your workspace...</p>}
        </div>
        {(contextError || error || saved) && <div ref={feedback} tabIndex={-1}
          role={saved ? "status" : "alert"} className={`portfolio-action-panel__feedback${saved ? " portfolio-action-panel__feedback--saved" : ""}`}>
          {saved ? <><strong>Action saved in NXT.</strong><p>Action {saved.id}. Your portfolio position is unchanged.</p>{saved.warning && <p>{saved.warning}</p>}</> : contextError || error}
        </div>}
        {contextError && !attempt && <button type="button" onClick={() => setContextAttempt(value => value + 1)}>Check workspace again</button>}
        {attempt && !saved && <section className="portfolio-action-panel__recovery" aria-label="Submission recovery">
          <p>{busy ? "Saving and verifying in NXT. Please keep this panel open." : "Check the existing submission instead of creating another action."}</p>
          <button type="button" disabled={busy} onClick={checkSavedStatus}>Check saved status</button>
          <a href="/nxt-write-recovery" target="_blank" rel="noreferrer">Open Saved NXT submissions (new tab)</a>
        </section>}
        {!saved && <fieldset disabled={!enabled}>
          <legend className="sr-only">Completed action details</legend>
          <p className="portfolio-action-panel__hint">Record a completed interaction. Existing next steps and reminders stay unchanged.</p>
          <div className="portfolio-action-panel__row">
            <label>Action date<input autoFocus type="date" required max={today()} value={draft.actionDate} onChange={change("actionDate")} /></label>
            <label>Category<select value={draft.actionCategory} onChange={change("actionCategory")}>{ACTION_CATEGORIES.map(value => <option key={value}>{value}</option>)}</select></label>
          </div>
          <label>Interaction type<select value={draft.interactionType} onChange={change("interactionType")}>{INTERACTION_TYPES.map(value => <option key={value}>{value}</option>)}</select></label>
          <label>Summary<input ref={summaryInput} required maxLength={255} value={draft.summary} onChange={change("summary")} placeholder="For example, discussed scholarship plans" /></label>
          <details><summary>Notes (optional)</summary><label>Action notes<textarea rows={6} maxLength={10000} value={draft.notes} onChange={change("notes")} /></label></details>
        </fieldset>}
        {!attempt && !saved && !pendingExit && <p className="portfolio-action-panel__hint">Need dictation, additional fundraiser credit, an opportunity link, or a new reminder? <a href={buildPortfolioUpdateHref(person, "action")} onClick={fullForm}>Use the full action form instead</a>.</p>}
      </div>
      <footer className="portfolio-action-panel__footer">
        <button type="button" onClick={close} disabled={busy}>{saved ? "Back to portfolio" : "Cancel"}</button>
        {!saved && <button type="submit" className="portfolio-action-panel__save" disabled={!enabled}>{busy ? "Saving..." : "Save action in NXT"}</button>}
      </footer>
    </form>
  </dialog>;
}
