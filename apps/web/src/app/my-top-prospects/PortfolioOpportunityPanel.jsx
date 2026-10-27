import { useEffect, useId, useRef, useState } from "react";
import { DEFAULT_OPPORTUNITY_PURPOSE, PORTFOLIO_OPPORTUNITY_STAGES, portfolioOpportunityValidation } from "@/utils/portfolioOpportunity";
import { submitOpportunityUpdate } from "@/utils/submitOpportunityUpdate";
import { formatCalendarDate } from "@/utils/prospectActivity";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import { buildPortfolioUpdateHref } from "./prospectPresentation";
import "./portfolioActionPanel.css";

const initialDraft = { opportunityTitle: "", purpose: DEFAULT_OPPORTUNITY_PURPOSE, opportunityStage: "Cultivation",
  askAmount: "", expectedDate: "", askDate: "", notes: "" };
const currency = value => value == null ? "Amount not saved" : Number(value).toLocaleString("en-US", { style: "currency", currency: "USD" });

export default function PortfolioOpportunityPanel({ person, viewerId, workspaceId, onClose, onSaved }) {
  const titleId = useId();
  const dialog = useRef(null);
  const notice = useRef(null);
  const discard = useRef(null);
  const titleInput = useRef(null);
  const inFlight = useRef(false);
  const leaving = useRef(false);
  const resumeEditing = useRef(false);
  const [draft, setDraft] = useState(initialDraft);
  const [context, setContext] = useState(null);
  const [loadError, setLoadError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(null);
  const [pendingExit, setPendingExit] = useState(null);
  const storageKey = `portfolio-opportunity-attempt:${viewerId}:${workspaceId}:${person.constituentId}`;
  const [attempt, setAttempt] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(storageKey) || "null"); } catch { return null; }
  });
  const dirty = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const enabled = !!context && !loadError && !busy && !attempt && !saved && !pendingExit;
  const fullHref = buildPortfolioUpdateHref(person, "opportunity");

  useEffect(() => {
    const opener = document.activeElement;
    const element = dialog.current;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    element?.showModal();
    return () => { element?.close(); document.body.style.overflow = overflow; if (opener?.isConnected) opener.focus({ preventScroll: true }); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    setContext(null); setLoadError("");
    const params = new URLSearchParams({ viewerId, workspaceId, constituentId: person.constituentId });
    fetch(`/api/portfolio-opportunities?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Saved opportunities could not be loaded.");
        if (String(data.viewerId) !== String(viewerId) || String(data.workspaceId) !== String(workspaceId)
          || String(data.constituentId) !== String(person.constituentId) || !Array.isArray(data.opportunities))
          throw new Error("Your workspace changed. Close this draft and reopen Add opportunity.");
        if (!controller.signal.aborted) setContext(data);
      }).catch(reason => { if (!controller.signal.aborted) setLoadError(reason.message); });
    return () => controller.abort();
  }, [viewerId, workspaceId, person.constituentId, loadAttempt]);
  useEffect(() => {
    const guard = event => {
      if (!leaving.current && (busy || (dirty && !attempt && !saved))) { event.preventDefault(); event.returnValue = ""; }
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [busy, dirty, attempt, saved]);
  useEffect(() => { if (error || loadError || saved) notice.current?.focus(); }, [error, loadError, saved]);
  useEffect(() => {
    if (pendingExit) discard.current?.focus();
    else if (resumeEditing.current) { resumeEditing.current = false; titleInput.current?.focus(); }
  }, [pendingExit]);

  function remember(value) {
    setAttempt(value);
    // Store only receipt metadata, never names, amounts or draft content.
    try { if (value) sessionStorage.setItem(storageKey, JSON.stringify(value)); else sessionStorage.removeItem(storageKey); } catch { /* Server receipts remain authoritative. */ }
  }
  function close() {
    if (inFlight.current) return;
    if (pendingExit) { resumeEditing.current = true; setPendingExit(null); return; }
    if (dirty && !saved && !attempt) { setPendingExit("close"); return; }
    onClose();
  }
  async function save(event) {
    event.preventDefault();
    if (!enabled || inFlight.current) return;
    const body = { ...draft, opportunityTitle: draft.opportunityTitle.trim(), purpose: draft.purpose.trim(), notes: draft.notes.trim(),
      askAmount: draft.askAmount.trim() ? Number(draft.askAmount) : null, donorName: person.name,
      blackbaudConstituentId: person.constituentId, linkedProspectId: context.prospectId,
      createNewOpportunity: true, createNewConstituent: false,
      portfolioContext: { viewerId, workspaceId, constituentId: person.constituentId } };
    const validation = portfolioOpportunityValidation(body);
    if (validation) { setError(validation); return; }
    inFlight.current = true; setBusy(true); setError("");
    remember({ startedAt: new Date().toISOString() });
    let result = null;
    try {
      const data = await submitOpportunityUpdate(body);
      if (!/^[1-9]\d*$/.test(String(data.verifiedOpportunityId || "")) || data.blackbaudSync?.status !== "synced"
        || String(data.blackbaudConstituentId) !== String(person.constituentId)) throw new Error("The result was not verified.");
      setSaved({ id: data.verifiedOpportunityId, reconciled: true, warning: data.portfolioProspect ? "" : "The opportunity is saved. The card total will update on its next normal load." });
      remember(null); result = data;
    } catch (reason) {
      if (reason.notSubmitted && !reason.writeReceipt) { remember(null); setError(reason.message); }
      else {
        remember({ receiptId: reason.writeReceipt?.id || null });
        setError(reason.writeReceipt ? reason.message : "We could not confirm the result. The opportunity may already be saved. Check Saved NXT submissions before entering it again; this panel will not resend it.");
      }
    } finally { inFlight.current = false; setBusy(false); }
    if (result) onSaved?.(result);
  }
  async function checkSaved() {
    if (inFlight.current || !attempt?.receiptId) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/nxt-write-recovery", { cache: "no-store" });
      const data = await response.json();
      const receipt = data.receipts?.find(row => String(row.id) === String(attempt.receiptId)
        && row.kind === "opportunity" && String(row.constituentId) === String(person.constituentId));
      if (!response.ok || String(data.workspace?.id) !== String(workspaceId) || !receipt?.remoteId
        || !["complete", "verified"].includes(receipt.state)) throw new Error();
      setSaved({ id: receipt.remoteId, reconciled: receipt.state === "complete",
        warning: "Check the existing entry in Saved NXT submissions if the app still needs reconciliation. Nothing was resent." });
      remember(null);
    } catch { setError("No confirmed result is available here yet. Open Saved NXT submissions with an administrator. Nothing was resent."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  const change = key => event => setDraft(current => ({ ...current, [key]: event.target.value }));
  const sameName = context?.opportunities.some(row => row.title?.trim().toLowerCase() === draft.opportunityTitle.trim().toLowerCase());

  return <dialog ref={dialog} aria-labelledby={titleId} className="portfolio-action-panel" onCancel={event => { event.preventDefault(); close(); }}>
    <form onSubmit={save} className="portfolio-action-panel__form">
      <header className="portfolio-action-panel__header"><div><p className="portfolio-action-panel__eyebrow">MY PORTFOLIO</p><h2 id={titleId}>Add opportunity</h2></div>
        <button type="button" aria-label="Close Add opportunity" disabled={busy} onClick={close}>Close</button></header>
      <div className="portfolio-action-panel__body">
        {pendingExit && <section ref={discard} tabIndex={-1} role="alert" aria-label="Unsaved opportunity" className="portfolio-action-panel__feedback">
          <strong>Discard this unsaved opportunity?</strong><p>{pendingExit === "full" ? "Your draft will not transfer to the full form." : "Your changes have not been saved."}</p>
          <div className="portfolio-action-panel__discard"><button type="button" onClick={() => { resumeEditing.current = true; setPendingExit(null); }}>Keep editing</button>
            {pendingExit === "full" ? <a href={fullHref} onClick={() => { leaving.current = true; }}>Discard and open full form</a>
              : <button type="button" onClick={onClose}>Discard draft</button>}</div>
        </section>}
        <div className="portfolio-action-panel__identity"><h3>{person.name}</h3><p>NXT constituent {person.constituentId}</p>
          {context && <p>Recorded for <strong>{context.ownerName}</strong>{String(viewerId) !== String(workspaceId) && ` \u00b7 Entered by ${context.authorName}`}</p>}</div>
        {(error || loadError || saved) && <div ref={notice} tabIndex={-1} role={saved ? "status" : "alert"} className={`portfolio-action-panel__feedback${saved ? " portfolio-action-panel__feedback--saved" : ""}`}>
          {saved ? <><strong>{saved.reconciled ? "Opportunity saved in the app and NXT." : "Existing NXT opportunity verified."}</strong><p>Opportunity {saved.id}.</p>{saved.warning && <p>{saved.warning}</p>}</> : loadError || error}
        </div>}
        {!context && !loadError && <p role="status">Checking your workspace and saved opportunities...</p>}
        {loadError && !attempt && <button type="button" onClick={() => setLoadAttempt(n => n + 1)}>Try loading again</button>}
        {attempt && !saved && <section className="portfolio-action-panel__recovery" aria-label="Submission recovery">
          <p>{busy ? "Saving and verifying in NXT. Please keep this panel open." : "Check the existing submission instead of creating another opportunity."}</p>
          {attempt.receiptId && <button type="button" disabled={busy} onClick={checkSaved}>Check saved status</button>}
          <a href="/nxt-write-recovery" target="_blank" rel="noreferrer">Open Saved NXT submissions (new tab)</a>
        </section>}
        {context && !saved && <section className="portfolio-opportunity-existing" aria-label="Existing opportunities">
          <h3>Saved open opportunities {context.opportunities.length > 0 && `(${context.opportunities.length}${context.truncated ? "+" : ""})`}</h3>
          {context.opportunities.length ? <ul>{context.opportunities.map(row => <li key={row.id}><strong>{row.title || "Untitled opportunity"}</strong>
            <span>{row.current_stage}{" \u00b7 "}{currency(row.estimated_amount)}{row.expected_date && ` \u00b7 Expected ${formatCalendarDate(row.expected_date)}`}</span></li>)}</ul>
            : <p>No open opportunities are saved for this MGO and constituent.</p>}
          <p className="portfolio-action-panel__hint">Saved app data, not a live NXT check. Other fundraisers' opportunities and recent NXT-only changes may not appear here. <a href={buildBlackbaudConstituentProfileUrl(person.constituentId)} target="_blank" rel="noreferrer">View constituent in NXT</a>.</p>
        </section>}
        {!saved && <fieldset disabled={!enabled}><legend className="sr-only">New opportunity details</legend>
          <label>Opportunity name<input ref={titleInput} required maxLength={255} value={draft.opportunityTitle} onChange={change("opportunityTitle")} /></label>
          {sameName && <p role="status" className="portfolio-action-panel__feedback">An open opportunity already uses this name. Check it above before creating a separate opportunity.</p>}
          <div className="portfolio-action-panel__row"><label>Amount ($)<input type="number" required min="0" max="999999999999.99" step="0.01" value={draft.askAmount} onChange={change("askAmount")} /></label>
            <label>Expected date<input type="date" required value={draft.expectedDate} onChange={change("expectedDate")} /></label></div>
          <label>Stage<select value={draft.opportunityStage} onChange={change("opportunityStage")}>{PORTFOLIO_OPPORTUNITY_STAGES.map(value => <option key={value}>{value}</option>)}</select></label>
          <details><summary>Purpose, ask date &amp; notes</summary><label>Purpose<input maxLength={255} value={draft.purpose} onChange={change("purpose")} /></label>
            <label>Ask date (optional)<input type="date" value={draft.askDate} onChange={change("askDate")} /></label>
            <label>App notes (optional)<textarea rows={4} maxLength={10000} value={draft.notes} onChange={change("notes")} /></label>
            <p className="portfolio-action-panel__hint">Notes are saved in the app, not sent to NXT.</p></details>
          <p className="portfolio-action-panel__hint">Purpose: {draft.purpose || "Not entered"}. Saving creates a new opportunity; it does not edit an existing one.{context && !context.prospectId && " This also adds the constituent to Top Prospects."}</p>
        </fieldset>}
        {!attempt && !saved && !pendingExit && <p className="portfolio-action-panel__hint">For joint solicitations, editing, or closed opportunities, <a href={fullHref} onClick={event => {
          if (inFlight.current) event.preventDefault(); else if (dirty) { event.preventDefault(); setPendingExit("full"); }
        }}>use the full opportunity form</a>.</p>}
      </div>
      <footer className="portfolio-action-panel__footer"><button type="button" disabled={busy} onClick={close}>{saved ? "Back to portfolio" : "Cancel"}</button>
        {!saved && <button type="submit" className="portfolio-action-panel__save" disabled={!enabled}>{busy ? "Saving..." : "Create opportunity in NXT"}</button>}</footer>
    </form>
  </dialog>;
}
