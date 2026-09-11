import { useEffect, useRef, useState } from "react";
import { quickImportCandidates } from "@/utils/newConstituentImport";
import { QUICK_IMPORT_PHASES, quickImportResumeCandidate } from "@/utils/quickImportWorkflow";

export default function QuickNewConstituentImport({ runId, rows, disabled, onReload, onBusyChange }) {
  const [running, setRunning] = useState(false);
  const [autoComplete, setAutoComplete] = useState(true);
  const [message, setMessage] = useState("");
  const [activeStep, setActiveStep] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [outcomes, setOutcomes] = useState([]);
  const stop = useRef(false);
  const busy = useRef(false);
  const newRows = quickImportCandidates(rows);
  const candidates = [...newRows, ...(autoComplete ? rows.filter(quickImportResumeCandidate) : [])];
  const created = rows.filter((row) => row.createdBlackbaudConstituentId).length;
  const complete = rows.filter((row) => row.quickImportWorkflow?.phase === "complete").length;
  const held = rows.filter((row) => row.quickCreateStatus === "review" || row.quickCreateStatus === "uncertain" || row.quickImportWorkflow?.phase === "review" || ["possible_duplicate", "needs_resolution"].includes(row.intentDisposition?.key)).length;
  useEffect(() => { stop.current = false; return () => { stop.current = true; }; }, []);
  useEffect(() => {
    if (!activeStep || !running) return;
    setElapsed(0);
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [activeStep, running]);

  async function reload() {
    const saved = await onReload(runId, { message: "", resetReviewDrafts: false, preload: false });
    if (!saved) throw new Error("Progress is saved, but the run could not be reloaded. Reopen it before resuming.");
  }

  async function start() {
    if (busy.current || disabled || !candidates.length) return;
    const consent = autoComplete
      ? "Create only clear nonmatches, add their valid contacts (including secondary contacts), constituency codes and education, then verify. CSV primary selections are honored. Replacements and ambiguous choices stay for individual review. Existing matched constituents will not be updated by this batch. Resume saved steps without repeating completed or uncertain writes."
      : "Create identity, one selected contact of each kind, and saved NXT table name formats only. Remaining details require separate review and send.";
    if (!window.confirm(`Process ${candidates.length} rows? ${consent} Possible matches and incomplete duplicate checks never authorize creation.`)) return;
    busy.current = true;
    stop.current = false;
    setRunning(true);
    setOutcomes([]);
    onBusyChange(true);
    let checked = 0;
    let sinceReload = 0;
    try {
      for (const row of candidates) {
        if (stop.current) break;
        let phase = row.quickImportWorkflow?.phase || "create";
        let finished = false;
        for (let step = 0; step < 12 && !stop.current; step += 1) {
          const label = `Row ${row.rowNumber}: ${QUICK_IMPORT_PHASES[phase] || phase}`;
          setActiveStep(label);
          setMessage(`${checked} of ${candidates.length} rows processed this session. Each finished step is saved.`);
          const endpoint = autoComplete ? "process" : "create?mode=clear_nonmatches";
          const response = await fetch(`/api/constituency-import/runs/${encodeURIComponent(runId)}/rows/${encodeURIComponent(row.id)}/${endpoint}`, { method: "POST" });
          let payload;
          try { payload = await response.json(); } catch {
            throw new Error(`${label}: the server response was interrupted. Reopen the saved run to check the last checkpoint. No write will be blindly retried.`);
          }
          if (payload.paused || (!response.ok && !payload.held)) throw new Error(`${label}: ${payload.error || "Processing paused. Check the saved row before resuming."}`);
          if (payload.held || !autoComplete || payload.done) {
            setOutcomes((items) => [...items, { rowNumber: row.rowNumber, held: Boolean(payload.held), message: payload.error || (autoComplete ? "Verified and complete" : "Created; remaining details need review") }]);
            finished = true;
            break;
          }
          if (!QUICK_IMPORT_PHASES[payload.next]) throw new Error(`${label}: progress could not be confirmed. Reopen the saved run before continuing.`);
          phase = payload.next;
        }
        if (!finished && !stop.current) throw new Error("Processing exceeded its step limit. Reopen the saved row; no uncertain writes will be repeated.");
        if (finished) { checked += 1; sinceReload += 1; }
        if (sinceReload >= 5) { await reload(); sinceReload = 0; }
      }
      await reload();
      setMessage(`${stop.current ? "Paused" : "Finished"}. ${checked} rows processed this session. Completed records need no further approval. Held rows remain available for individual review.`);
    } catch (error) {
      setMessage(`${error.message || "Import paused."} Saved progress will be checked before any continuation.`);
      await reload().catch(() => setMessage("Processing paused and saved progress could not be reloaded. Reopen this saved run before continuing; do not re-upload or resend it."));
    } finally {
      busy.current = false;
      setRunning(false);
      onBusyChange(false);
    }
  }

  return <section id="quick-constituent-import" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
    <h3 className="font-bold text-slate-900">Import clear new records</h3>
    <p className="text-sm text-slate-700">Checks NXT IDs, either email, first and last name, and similar address plus ZIP first five. Possible duplicates stay in review while clear rows continue. Nothing is merged.</p>
    <p className="font-semibold">{created} created / {complete} complete / {held} held for review / {candidates.length} available to process</p>
    <label className="flex items-start gap-2 text-sm font-semibold">
      <input type="checkbox" checked={autoComplete} disabled={disabled || running} onChange={(event) => setAutoComplete(event.target.checked)} />
      Complete safe additions and verify automatically
    </label>
    <p className="text-sm text-slate-700">Includes multiple valid contacts, constituency additions, education, and saved table-based name formats. Choose one primary per contact kind, or explicitly mark them non-primary. Ambiguous selections and replacements still need review. Only records created by this approved batch are completed automatically.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={disabled || running || !candidates.length} onClick={start} className="rounded-lg bg-emerald-700 px-4 py-3 font-bold text-white disabled:opacity-50">{created || held ? "Resume safe import" : "Check and import new records"}</button>
      {running && <button type="button" className="rounded-lg border bg-white px-4 py-3" onClick={() => { stop.current = true; setMessage("Pausing after the current step is saved..."); }}>Pause after this step</button>}
    </div>
    {running && <p className="text-sm font-semibold">{activeStep} ({elapsed}s){elapsed >= 30 ? ". Waiting for NXT; do not resend this row." : ""}</p>}
    <p role="status" aria-live="polite" className="text-sm text-slate-700">{message || "One constituent and one processing step at a time. Keep this page open; resume the saved run if interrupted."}</p>
    {outcomes.length > 0 && <details><summary className="cursor-pointer font-semibold">This session: {outcomes.filter((item) => !item.held).length} finished, {outcomes.filter((item) => item.held).length} held</summary>
      <ul className="mt-2 space-y-2 text-sm">{outcomes.map((item) => <li key={item.rowNumber}>Row {item.rowNumber}: {item.message}</li>)}</ul>
    </details>}
  </section>;
}
