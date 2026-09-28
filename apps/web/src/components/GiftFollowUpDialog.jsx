import { useEffect, useId, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import NextStepFields from "./NextStepFields";
import GiftFollowUpSource from "./GiftFollowUpSource";
import { formatNextStepDate } from "@/utils/nextStepWorklist";

const buttonClass = "min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50";
const initialDraft = { title: "Plan a stewardship follow-up", details: "", dueDate: "" };

export default function GiftFollowUpDialog({ item, viewerId, workspaceId, onClose }) {
  const id = useId();
  const dialogRef = useRef(null);
  const noticeRef = useRef(null);
  const inFlight = useRef(false);
  const client = useQueryClient();
  const [draft, setDraft] = useState(initialDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsCheck, setNeedsCheck] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [result, setResult] = useState(null);
  const endpoint = `/api/dashboard-gift-follow-up?workspaceId=${encodeURIComponent(workspaceId)}`;
  function verifyScope(payload) {
    if (payload?.viewerId !== String(viewerId) || payload.workspaceUserId !== String(workspaceId) ||
        payload.key !== item.key || payload.revision !== item.revision ||
        (payload.task && String(payload.task.owner_user_id) !== String(workspaceId))) {
      throw new Error("The workspace changed. Close this dialog and reload your dashboard.");
    }
    return payload;
  }
  const query = useQuery({
    queryKey: ["gift-follow-up", viewerId, workspaceId, item.key, item.revision],
    queryFn: async ({ signal }) => {
      const response = await fetch(`${endpoint}&${new URLSearchParams({ key: item.key, revision: item.revision })}`, { signal, cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Saved follow-up details could not be loaded.");
      return verifyScope(payload);
    },
    retry: false, gcTime: 0, staleTime: Infinity, refetchOnWindowFocus: false,
  });
  const task = result?.task || query.data?.task;
  const dirty = !task && JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const gift = query.data?.gift;
  const snapshot = task?.source_gift_snapshot || (gift && { constituentName: gift.constituentName, amount: gift.giftAmount, date: gift.dueDate });
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  useEffect(() => {
    if (!dirty && !busy) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  useEffect(() => { if (task || error || discard) noticeRef.current?.focus(); }, [task, error, discard]);
  function close() {
    if (inFlight.current) return;
    if (dirty) { setDiscard(true); return; }
    onClose();
  }
  async function checkSaved() {
    setError("");
    const check = await query.refetch();
    if (!check.isError) setNeedsCheck(false);
  }
  async function submit(event) {
    event.preventDefault();
    if (inFlight.current || task || needsCheck || !gift || query.isError || query.isFetching || !draft.title.trim()) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: item.key, revision: item.revision, ...draft }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "The save could not be confirmed. Check saved status before trying again.");
      verifyScope(payload);
      if (!payload.task?.id) throw new Error("The save could not be confirmed. Check saved status before trying again.");
      setResult(payload);
      // Invalidate only: do not start other components' provider-backed reads.
      for (const key of ["next-step-worklist", "pending-actions", "stewardship-actions", "worklist", "dashboard-priorities"]) {
        void client.invalidateQueries({ queryKey: [key], refetchType: "none" });
      }
    } catch (failure) { setError(failure.message); setNeedsCheck(true); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <dialog ref={dialogRef} aria-labelledby={`${id}-heading`} onCancel={event => { event.preventDefault(); close(); }}
    className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-gray-900/40">
    <div className="grid gap-4 p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 id={`${id}-heading`} className="text-xl font-bold">Stewardship follow-up</h2>
        <button autoFocus type="button" className={buttonClass} disabled={busy} onClick={close}>Close</button>
      </div>
      <p className="text-sm text-gray-600">Make a plan to follow up on this gift. Nothing is sent or added to NXT, and the primary next step stays unchanged.</p>
      {query.isPending && <p role="status">Checking saved follow-ups...</p>}
      {query.isError && <p role="alert" className="text-sm text-red-800">{query.error.message}</p>}
      {!query.isError && <GiftFollowUpSource snapshot={snapshot} />}
      {task && !query.isError ? <div ref={noticeRef} tabIndex={-1} role="status" className="grid gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
        <p className="font-semibold">{result && !result.alreadyExists ? "Follow-up created." : "This gift already has a follow-up in this workspace."}</p>
        <p>{task.title}</p>
        <p>Owner: {result?.ownerName || query.data.ownerName}. {task.status === "Done" ? "Completed" : "Open"}{task.due_date ? `; due ${formatNextStepDate(task.due_date)}` : "; no due date"}.</p>
        <a className="inline-flex min-h-11 items-center font-semibold underline" href={`/follow-ups?tab=next-steps&nextStepId=${encodeURIComponent(task.id)}&status=${encodeURIComponent(task.status)}`}>View follow-up</a>
        <p>Edit, reschedule, or reopen it there instead of creating another. No thank-you or NXT action was sent.</p>
      </div> : gift && !query.isError && <form className="grid gap-4" onSubmit={submit}>
        <NextStepFields {...draft} ownerName={query.data.ownerName} disabled={busy || needsCheck || query.isFetching || discard} titleMaxLength={255} detailsMaxLength={10000}
          onTitleChange={title => setDraft(value => ({ ...value, title }))}
          onDetailsChange={details => setDraft(value => ({ ...value, details }))}
          onDueDateChange={dueDate => setDraft(value => ({ ...value, dueDate }))} />
        <p className="text-xs text-gray-500">One follow-up per gift in this workspace. To use a different owner, close this dialog and select their workspace first.</p>
        <button type="submit" className={`${buttonClass} !border-emerald-700 !bg-emerald-700 !text-white`} disabled={busy || needsCheck || query.isFetching || discard || !draft.title.trim()}>
          {busy ? "Saving follow-up..." : "Create follow-up"}
        </button>
      </form>}
      {error && <p ref={noticeRef} tabIndex={-1} role="alert" className="text-sm text-red-800">{error}</p>}
      {(needsCheck || query.isError) && <button type="button" className={buttonClass} disabled={busy || query.isFetching} onClick={checkSaved}>Check saved status</button>}
      {discard && <div ref={noticeRef} tabIndex={-1} role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p>Discard your unsaved edits?</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={() => setDiscard(false)}>Keep editing</button>
          <button type="button" className={buttonClass} onClick={onClose}>Discard edits</button>
        </div>
      </div>}
    </div>
  </dialog>;
}
