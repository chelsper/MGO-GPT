import { useEffect, useRef, useState } from "react";
import { quickImportCandidates } from "@/utils/newConstituentImport";

export default function QuickNewConstituentImport({ runId, rows, disabled, onReload, onBusyChange }) {
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState("");
  const stop = useRef(false);
  const busy = useRef(false);
  const candidates = quickImportCandidates(rows);
  const created = rows.filter((row) => row.createdBlackbaudConstituentId).length;
  const held = rows.filter((row) => row.quickCreateStatus === "review" || row.quickCreateStatus === "uncertain" || ["possible_duplicate", "needs_resolution"].includes(row.intentDisposition?.key)).length;
  useEffect(() => () => { stop.current = true; }, []);

  async function start() {
    if (busy.current || disabled || !candidates.length) return;
    if (!window.confirm(`Check ${candidates.length} unmatched rows and create only clear nonmatches in NXT? Each new record includes identity, selected single email/phone/address, and saved NXT table name formats. Possible matches and incomplete checks stay for review. Additional staged updates still require review and send.`)) return;
    busy.current = true;
    stop.current = false;
    setRunning(true);
    onBusyChange(true);
    let checked = 0;
    try {
      for (const row of candidates) {
        if (stop.current) break;
        setMessage(`Checking row ${row.rowNumber}: ${checked} of ${candidates.length} checked this session.`);
        const response = await fetch(`/api/constituency-import/runs/${encodeURIComponent(runId)}/rows/${encodeURIComponent(row.id)}/create?mode=clear_nonmatches`, { method: "POST" });
        const payload = await response.json();
        if (payload.paused || (!response.ok && !payload.held)) {
          throw new Error(payload.error || "Import paused. Reopen the run to check this row before resuming.");
        }
        checked += 1;
        // The server saves every result. Reload without rerunning preview or
        // any successful creation, including after a client/network failure.
        const saved = await onReload(runId, { message: "", resetReviewDrafts: false, preload: false });
        if (!saved) throw new Error("Progress is saved, but the run could not be reloaded. Reopen it before resuming.");
      }
      setMessage(`${stop.current ? "Paused" : "Finished"}. ${checked} rows checked this session. Created records and review items are saved. Review and send any remaining staged updates below.`);
    } catch (error) {
      setMessage(error.message || "Import paused. Reload the saved run to see confirmed progress.");
      await onReload(runId, { message: "", resetReviewDrafts: false, preload: false });
    } finally {
      busy.current = false;
      setRunning(false);
      onBusyChange(false);
    }
  }

  return <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
    <h3 className="font-bold text-slate-900">Create clear nonmatches</h3>
    <p className="text-sm text-slate-700">Checks NXT IDs, either email, first and last name, and similar address plus ZIP first five. Any possible match stays in review while other rows continue. Nothing is merged or overwritten.</p>
    <p className="font-semibold">{created} created / {held} held for review / {candidates.length} unchecked</p>
    <p className="text-sm text-slate-700">Creates identity, the selected single contact of each kind, and saved table-based name formats. Multiple contacts or incomplete checks need individual review. Constituencies, relationships, and other staged changes still use Review and send.</p>
    <div className="flex flex-wrap gap-2">
      <button type="button" disabled={disabled || running || !candidates.length} onClick={start} className="rounded-lg bg-emerald-700 px-4 py-3 font-bold text-white disabled:opacity-50">{created || held ? "Resume unchecked rows" : "Check and create new records"}</button>
      {running && <button type="button" className="rounded-lg border bg-white px-4 py-3" onClick={() => { stop.current = true; setMessage("Pausing after the current row is saved..."); }}>Pause after this row</button>}
    </div>
    <p role="status" aria-live="polite" className="text-sm text-slate-700">{message || "Runs one constituent at a time. Keep this page open; reopen the saved run to resume later."}</p>
  </section>;
}
