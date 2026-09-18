import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ACTION_CATEGORIES, INTERACTION_TYPES, validActionDate, validNextStepActionDate } from "@/utils/actionEntryOptions";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import { formatNextStepDate } from "@/utils/nextStepWorklist";
import WorkflowNotice, { actionNoticeKind } from "./WorkflowNotice";
import { useWorkspaceLabels } from "./WorkspaceTerminology";

const fieldClass = "min-h-11 min-w-0 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-base font-normal text-gray-900";
const buttonClass = "min-h-11 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50";

export default function NextStepActionDialog({ item, viewerId, workspaceId, onClose, onSaved }) {
  const { mgo: fundraiserLabel } = useWorkspaceLabels();
  const dialogRef = useRef(null);
  const inFlight = useRef(false);
  const initialDraft = useRef(null);
  const actionDates = useRef({});
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const resultRef = useRef(null);
  const endpoint = `/api/pending-actions/${item.id}/log-action`;
  const query = useQuery({
    queryKey: ["next-step-action-context", viewerId, workspaceId, item.id],
    queryFn: async ({ signal }) => {
      const response = await fetch(`${endpoint}?workspaceId=${encodeURIComponent(workspaceId)}`, { signal, cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Action details could not be loaded.");
      if (String(payload?.workspace?.id) !== String(workspaceId) || String(payload?.viewer?.id) !== String(viewerId)
        || String(payload?.task?.id) !== String(item.id)) throw new Error("The workspace changed. Close this dialog and reload the page.");
      return payload;
    },
    retry: false, staleTime: 0, gcTime: 0, refetchOnWindowFocus: false,
  });
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  useEffect(() => {
    if (!query.data || initialDraft.current) return;
    const task = query.data.task;
    actionDates.current = { completed: query.data.today,
      planned: validActionDate(task.dueDate) && task.dueDate >= query.data.today ? task.dueDate : query.data.today };
    const value = { actionIntent: "", actionDate: "", actionCategory: "", interactionType: task.category === "Stewardship" ? "Stewardship" : "Cultivation",
      summary: task.title || "", notes: task.details || "", completeReminder: false, sourceToken: task.sourceToken };
    initialDraft.current = value;
    setDraft(value);
  }, [query.data]);
  const receipt = result || query.data?.receipt;
  const dirty = draft && JSON.stringify(draft) !== JSON.stringify(initialDraft.current);
  useEffect(() => {
    if ((!dirty && !busy) || receipt) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy, receipt]);
  useEffect(() => { if (receipt || error) resultRef.current?.focus(); }, [receipt, error]);
  function close() {
    if (inFlight.current) return;
    if (dirty && !receipt && !attempted && !window.confirm("Discard this unsaved action draft?")) return;
    onClose();
  }
  function change(key, value) { setDraft(current => ({ ...current, [key]: value })); }
  function chooseIntent(value) {
    if (draft.actionIntent) actionDates.current[draft.actionIntent] = draft.actionDate;
    setDraft(current => ({ ...current, actionIntent: value, actionDate: actionDates.current[value], completeReminder: false }));
    setError("");
  }
  async function submit(event) {
    event.preventDefault();
    if (inFlight.current || attempted || receipt || !draft) return;
    if (!validNextStepActionDate(draft.actionIntent, draft.actionDate, query.data.today)
      || draft.actionIntent === "planned" && draft.completeReminder) {
      setError("Choose planned or completed and a valid date. Planned actions must be today or later; completed actions cannot be in the future.");
      return;
    }
    inFlight.current = true; setBusy(true); setAttempted(true); setError("");
    let rejectedBeforeWrite = false;
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, expectedWorkspaceId: workspaceId }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.receipt) {
        // Only explicit pre-write rejections can be retried with this draft.
        if (payload?.error && [400, 401, 403, 404, 409, 502].includes(response.status)) {
          rejectedBeforeWrite = true;
          setAttempted(false);
        }
        throw new Error(payload?.error || "The save result is unknown. Reload submission status before doing anything else in NXT; do not log the action again.");
      }
      setResult(payload.receipt);
      onSaved(payload.receipt);
    } catch (failure) {
      setError(rejectedBeforeWrite ? failure.message : "The save result is unknown. Reload submission status before doing anything else in NXT; do not log the action again.");
    } finally { inFlight.current = false; setBusy(false); }
  }
  async function verifyExisting() {
    if (inFlight.current || query.isFetching || receipt?.state !== "review" || !receipt.actionId) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedWorkspaceId: workspaceId, actionId: receipt.actionId }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.receipt?.actionId !== receipt.actionId
        || payload?.receipt?.constituentId !== receipt.constituentId || payload?.receipt?.state !== "saved") {
        throw new Error(payload?.error || "Verification could not be confirmed. Reload submission status. No action was sent again.");
      }
      setResult(payload.receipt);
      onSaved(payload.receipt);
    } catch (failure) { setError(failure.message || "Verification could not finish. No action was sent again."); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function reloadStatus() {
    if (inFlight.current || query.isFetching) return;
    inFlight.current = true; setBusy(true);
    try {
      const refreshed = await query.refetch();
      if (refreshed.isError) { setError(refreshed.error.message); return; }
      if (refreshed.data?.receipt) { setResult(refreshed.data.receipt); setError(""); onSaved(refreshed.data.receipt); }
    } finally { inFlight.current = false; setBusy(false); }
  }
  const task = query.data?.task;
  const planned = draft?.actionIntent === "planned";
  const reminderStatus = receipt?.reminderStatus || (receipt?.reminderCompleted ? "Done" : !result ? task?.status : null);
  const constituentId = receipt?.constituentId || task?.constituentId;
  const blocked = task && (!task.constituentId || task.status !== "Open");
  return <dialog ref={dialogRef} aria-labelledby="next-step-action-heading" onCancel={event => { event.preventDefault(); close(); }}
    className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-gray-900/40">
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div><h2 id="next-step-action-heading" className="text-xl font-bold">{receipt ? "NXT action submission" : "Add NXT action"}</h2>
          <p className="mt-1 break-words text-sm text-gray-600">{task?.constituentName || item.constituent_name || item.prospect_name || "Next-step follow-up"}</p></div>
        <button type="button" autoFocus className={buttonClass} onClick={close} disabled={busy}>Close</button>
      </div>
      {query.isLoading && <p role="status" className="mt-4">Loading saved action details...</p>}
      {query.isError && <p role="alert" className="mt-4 text-sm text-red-800">{query.error.message}</p>}
      {constituentId && <a className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-indigo-700 underline"
        href={buildBlackbaudConstituentProfileUrl(constituentId)} target="_blank" rel="noopener noreferrer">Open constituent in NXT</a>}
      {receipt ? <WorkflowNotice ref={resultRef} tabIndex={-1} kind={actionNoticeKind(receipt)} className="mt-4">
        <p>{receipt.message}</p>
        {receipt.actionIntent && <p className="mt-2">Submitted as: {receipt.actionIntent === "planned" ? "Planned action" : "Completed action"}{receipt.actionDate ? ` for ${formatNextStepDate(receipt.actionDate)}` : ""}.</p>}
        {receipt.actionId && <details className="mt-2"><summary className="min-h-11 cursor-pointer content-center font-semibold">Technical details</summary><p className="break-all">NXT action ID: {receipt.actionId}</p></details>}
        {reminderStatus && <p className="mt-2 font-semibold">Next step: {reminderStatus === "Done" ? "Completed" : "Open"}.</p>}
        {receipt.actionIntent === "planned" && receipt.state === "saved"
          ? <p className="mt-2">Complete or reschedule this same action in NXT. Mark complete in this app only closes the reminder; it does not complete the NXT action.</p>
          : reminderStatus === "Open" && receipt.state === "saved" && <p className="mt-2">If this follow-up is finished, close this dialog and use Mark complete.</p>}
      </WorkflowNotice> : blocked ? <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">
        {task.status !== "Open" ? "This next step is no longer open. Close this dialog and reload the saved list."
          : "This next step does not have a single confirmed NXT constituent link. Review its prospect link before logging an action."}
      </p> : draft && !query.isError && <form onSubmit={submit} className="mt-4 grid gap-4">
        <p className="break-words rounded-xl bg-blue-50 p-3 text-sm text-blue-900">{fundraiserLabel} credit: <strong>{query.data.workspace.name}</strong>. Entered by {query.data.viewer.name}.
          {" "}Choose whether you are planning work or recording something that already happened.</p>
        {task.opportunityTitle && <p className="text-sm text-gray-600">Opportunity: {task.opportunityTitle}{task.willLinkOpportunity ? " (will be linked in NXT)" : " (local reference only; no NXT link)"}.</p>}
        <fieldset disabled={busy || attempted} className="grid min-w-0 gap-4">
          <legend className="mb-2 text-sm font-semibold">What would you like to do?</legend>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2">
            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${planned ? "border-indigo-400 bg-indigo-50" : "border-gray-200"}`}>
              <input type="radio" name="action-intent" value="planned" checked={planned} onChange={() => chooseIntent("planned")} className="mt-1 h-4 w-4 shrink-0" aria-label="Schedule planned action" />
              <span><strong className="text-sm">Schedule planned action</strong><span className="mt-1 block text-xs text-gray-600">Not done yet. Keeps the app reminder open.</span></span></label>
            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${draft.actionIntent === "completed" ? "border-indigo-400 bg-indigo-50" : "border-gray-200"}`}>
              <input type="radio" name="action-intent" value="completed" checked={draft.actionIntent === "completed"} onChange={() => chooseIntent("completed")} className="mt-1 h-4 w-4 shrink-0" aria-label="Log completed action" />
              <span><strong className="text-sm">Log completed action</strong><span className="mt-1 block text-xs text-gray-600">Record an interaction that already happened.</span></span></label>
          </div>
          {draft.actionIntent && <>
          <p className={`rounded-xl p-3 text-sm ${planned ? "bg-blue-50 text-blue-900" : "bg-emerald-50 text-emerald-900"}`}>
            {planned ? "This creates an incomplete action in NXT. It does not mark the work done or change the app reminder's date. Later, complete or reschedule this same action in NXT."
              : "This records a completed action in NXT. Review the notes to describe what actually happened, not the original plan."}</p>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <label className="grid min-w-0 gap-2 text-sm font-semibold">{planned ? "Planned action date" : "Completed action date"}
              <input type="date" required min={planned ? query.data.today : undefined} max={planned ? undefined : query.data.today} className={fieldClass} value={draft.actionDate} onChange={event => change("actionDate", event.target.value)} /></label>
            <label className="grid min-w-0 gap-2 text-sm font-semibold">Category
              <select required className={fieldClass} value={draft.actionCategory} onChange={event => change("actionCategory", event.target.value)}>
                <option value="">{planned ? "Choose the planned activity" : "Choose what happened"}</option>{ACTION_CATEGORIES.map(value => <option key={value}>{value}</option>)}
              </select></label>
          </div>
          <label className="grid gap-2 text-sm font-semibold">Action type
            <select className={fieldClass} value={draft.interactionType} onChange={event => change("interactionType", event.target.value)}>{INTERACTION_TYPES.map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="grid gap-2 text-sm font-semibold">Summary
            <input required maxLength={255} className={fieldClass} value={draft.summary} onChange={event => change("summary", event.target.value)} /></label>
          <label className="grid gap-2 text-sm font-semibold">Action notes
            <textarea rows={4} maxLength={10000} className={fieldClass} value={draft.notes} onChange={event => change("notes", event.target.value)} /></label>
          {!planned && <label className="flex min-h-11 items-start gap-3 text-sm font-semibold">
            <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={draft.completeReminder} onChange={event => change("completeReminder", event.target.checked)} />
            Complete this next step after NXT confirms the action</label>}
          <p className="text-xs text-gray-600">Linked discussions will not change. An uncertain NXT result will leave the next step open and block a duplicate submission.</p>
          <button type="submit" disabled={!draft.actionCategory || !draft.summary.trim() || !validNextStepActionDate(draft.actionIntent, draft.actionDate, query.data.today)} className={`${buttonClass} !border-indigo-600 !bg-indigo-600 !text-white`}>
            {busy ? "Saving and verifying in NXT..." : planned ? "Schedule NXT action" : draft.completeReminder ? "Log completed action and complete next step" : "Log completed action; keep next step open"}</button>
          </>}
        </fieldset>
      </form>}
      {error && <p ref={resultRef} tabIndex={-1} role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {receipt?.state === "review" && receipt.actionId && <div className="mt-4">
        <button type="button" className={`${buttonClass} !border-indigo-600 !bg-indigo-600 !text-white`} disabled={busy || query.isFetching} onClick={verifyExisting}>
          {busy ? "Checking submission..." : "Verify existing NXT action"}</button>
        <p className="mt-2 text-xs text-gray-600">Reads this action in NXT and checks it against the original submission. Does not send it again or change the next step.</p>
      </div>}
      {(query.isError || attempted || receipt) && <button type="button" className={`${buttonClass} mt-4`} disabled={busy || query.isFetching}
        onClick={reloadStatus}>Reload submission status</button>}
    </div>
  </dialog>;
}
