import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDashboardAssistantSettings } from "./WorkspaceTerminology";
import { buildOutreachDraft, draftFingerprint, draftLabel, draftModes, hasDraftPlaceholders } from "@/utils/outreachDrafts";
import "./OutreachDraft.css";

export default function OutreachDraft({ context, label = "Prepare a draft" }) {
  const { tone, thankYouMessage } = useDashboardAssistantSettings();
  const [open, setOpen] = useState(false);
  const launcher = useRef(null);
  if (!context) return null;
  return <>
    <button ref={launcher} type="button" className="outreach-draft-launcher" onClick={() => setOpen(true)}>{label}</button>
    {open && createPortal(<DraftDialog context={{ ...context, drafting: { tone, thankYouMessage } }} onClose={() => { setOpen(false); launcher.current?.focus(); }} />, document.body)}
  </>;
}

function DraftDialog({ context, onClose }) {
  const dialog = useRef(null);
  const id = useId();
  const [snapshot, setSnapshot] = useState(context);
  const [mode, setMode] = useState(draftModes(context)[0]);
  const [text, setText] = useState(() => buildOutreachDraft(context, draftModes(context)[0]));
  const [reviewed, setReviewed] = useState(false);
  const [copyState, setCopyState] = useState("");
  const [pendingAction, setPendingAction] = useState(null);
  const confirmation = useRef(null);
  const editor = useRef(null);
  const wasConfirming = useRef(false);
  const inFlight = useRef(false);
  const version = useRef(0);
  const mounted = useRef(false);
  const changed = draftFingerprint(context) !== draftFingerprint(snapshot);
  const starter = buildOutreachDraft(snapshot, mode);
  const dirty = text !== starter;
  const placeholders = hasDraftPlaceholders(text);
  const latest = useRef(null);
  latest.current = { changed, text, reviewed };

  useEffect(() => {
    const element = dialog.current;
    mounted.current = true;
    element.showModal();
    return () => { mounted.current = false; element.close(); };
  }, []);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    if (pendingAction) confirmation.current?.focus();
    else if (wasConfirming.current) editor.current?.focus();
    wasConfirming.current = Boolean(pendingAction);
  }, [pendingAction]);
  function close() {
    if (inFlight.current || pendingAction) return;
    if (dirty) { setPendingAction({ kind: "close" }); return; }
    onClose();
  }
  function restart(nextMode, nextContext = snapshot) {
    if (inFlight.current || pendingAction) return;
    if (dirty) { setPendingAction({ kind: "restart", mode: nextMode, context: nextContext }); return; }
    replaceDraft(nextMode, nextContext);
  }
  function replaceDraft(nextMode, nextContext) {
    version.current += 1;
    setSnapshot(nextContext); setMode(nextMode); setText(buildOutreachDraft(nextContext, nextMode)); setReviewed(false); setCopyState("");
  }
  function confirmDiscard() {
    if (pendingAction.kind === "close") onClose();
    else { replaceDraft(pendingAction.mode, pendingAction.context); setPendingAction(null); }
  }
  async function copy() {
    if (inFlight.current || pendingAction || !latest.current.reviewed || latest.current.changed || !text.trim() || placeholders) return;
    const copyingVersion = version.current;
    inFlight.current = true; setCopyState("copying");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      if (mounted.current && copyingVersion === version.current) setCopyState(latest.current.changed ? "" : "copied");
    } catch {
      if (mounted.current && copyingVersion === version.current) setCopyState("failed");
    } finally { inFlight.current = false; }
  }
  const busy = copyState === "copying" && inFlight.current;
  const locked = busy || Boolean(pendingAction);
  return <dialog ref={dialog} className="outreach-draft" aria-labelledby={`${id}-heading`} aria-describedby={`${id}-intro`}
    onCancel={event => { event.preventDefault(); if (pendingAction) setPendingAction(null); else close(); }}>
    <header className="outreach-draft-header">
      <div><span className="outreach-draft-eyebrow">A starting point, in your words</span><h2 id={`${id}-heading`}>{snapshot.name}</h2></div>
      <button type="button" autoFocus onClick={close} disabled={locked}>Close draft</button>
    </header>
    <p id={`${id}-intro`} className="outreach-draft-intro">Built from the saved details below, without an AI model or another NXT check. Make it your own before using it. Nothing is sent, saved, or logged.</p>
    {pendingAction && <div ref={confirmation} tabIndex={-1} role="alert" className="outreach-draft-warning">
      <p>{pendingAction.kind === "close" ? "Close this draft? Your edits are not saved in the app. Copy any text you want to keep first." : "Replace your edits with a new starter? This cannot be undone."}</p>
      <div className="outreach-draft-footer"><button type="button" onClick={() => setPendingAction(null)}>Keep editing</button>
        <button type="button" onClick={confirmDiscard}>{pendingAction.kind === "close" ? "Discard edits and close" : "Replace draft"}</button></div>
    </div>}
    {changed && <div role="alert" className="outreach-draft-warning">
      <p>The saved details or organization wording changed while this draft was open. Your edits are still here, but review a new starter before copying.</p>
      <button type="button" disabled={locked} onClick={() => restart(draftModes(context).includes(mode) ? mode : draftModes(context)[0], context)}>Use current details</button>
    </div>}
    <div className="outreach-draft-grid">
      <aside aria-label="Saved context" className="outreach-draft-context">
        <h3>What we're working from</h3>
        <dl>{snapshot.facts.map((fact, index) => <div key={index}><dt>{fact.title}</dt><dd><p>{fact.text}</p><small>{fact.source}</small></dd></div>)}</dl>
        <p>These records may not include recent changes. Missing information does not mean something never happened.</p>
        {snapshot.kind === "gift" && <p>Check prior acknowledgments and communication preferences before outreach. This is not a tax receipt or confirmation that a thank-you is due.</p>}
        {mode === "thank-you" && snapshot.drafting?.thankYouMessage && <p>This starter includes your organization's saved wording. Check that it fits this recipient and gift.</p>}
      </aside>
      <section className="outreach-draft-editor" aria-label="Draft editor">
        {draftModes(snapshot).length > 1 && <div className="outreach-draft-modes" aria-label="Draft type">{draftModes(snapshot).map(value =>
          <button key={value} type="button" aria-pressed={mode === value} disabled={changed || locked} onClick={() => { if (mode !== value) restart(value); }}>{draftLabel(value)}</button>)}</div>}
        <label htmlFor={`${id}-text`}>{draftLabel(mode)}<span>{mode === "meeting" ? "Internal preparation, not a record of a completed conversation." : "Adjust the greeting, wording, and signature for the recipient."}</span></label>
        <textarea ref={editor} id={`${id}-text`} value={text} maxLength={16000} spellCheck disabled={locked} onChange={event => {
          version.current += 1; setText(event.target.value); setReviewed(false); setCopyState("");
        }} />
        {placeholders && <p className="outreach-draft-hint">Replace [Preferred greeting] and [Your name] before copying. We don't guess names, titles, or household greetings.</p>}
        <label className="outreach-draft-review"><input type="checkbox" checked={reviewed} disabled={changed || locked} onChange={event => { setReviewed(event.target.checked); setCopyState(""); }} />
          <span>{mode === "meeting" ? "I've reviewed these notes and understand they use saved records, not a live history check." : "I've checked the recipient, gift details, greeting, and signature. I'll review contact preferences and prior thanks before sending."}</span></label>
        <div className="outreach-draft-footer">
          <button type="button" disabled={!reviewed || !text.trim() || placeholders || changed || locked} onClick={copy}>{busy ? "Copying..." : mode === "meeting" ? "Copy meeting notes" : "Copy thank-you draft"}</button>
          <button type="button" disabled={changed || locked} onClick={() => restart(mode)}>Reset starter</button>
        </div>
        {copyState === "copied" && !changed && <p role="status">Copied. Nothing was sent or recorded in the app or NXT.</p>}
        {copyState === "failed" && <p role="alert">Your browser couldn't copy the text. You can select it in the editor and copy it manually.</p>}
        <p className="outreach-draft-hint">Edits stay only in this open draft. Closing it or leaving the workspace clears them. Copied donor details should stay in approved organizational tools.</p>
      </section>
    </div>
  </dialog>;
}
