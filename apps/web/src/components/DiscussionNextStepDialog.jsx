import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import NextStepFields from "./NextStepFields";
import WorkflowNotice from "./WorkflowNotice";
import { nextStepDay, formatNextStepDate } from "@/utils/nextStepWorklist";

const buttonClass = "min-h-11 rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50";
const fieldClass = "min-h-11 min-w-0 w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-base font-normal";

export default function DiscussionNextStepDialog({ item, viewerId, workspaceId, onClose, onSaved }) {
  const dialogRef = useRef(null);
  const inFlight = useRef(false);
  const initialDraft = useRef(null);
  const resultRef = useRef(null);
  const [draft, setDraft] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const endpoint = `/api/discussion-items/${item.id}/next-step`;
  const query = useQuery({
    queryKey: ["discussion-next-step-context", viewerId, workspaceId, item.id],
    queryFn: async ({ signal }) => {
      const response = await fetch(`${endpoint}?workspaceId=${encodeURIComponent(workspaceId)}`, { signal, cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Next-step details could not be loaded.");
      if (String(payload?.workspaceId) !== String(workspaceId) || String(payload.viewerId) !== String(viewerId)
        || String(payload.discussion?.id) !== String(item.id)) throw new Error("The workspace changed. Close this dialog and reload the page.");
      return payload;
    },
    retry: false, gcTime: 0, staleTime: Infinity, refetchOnWindowFocus: false,
  });
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  useEffect(() => {
    if (!query.data || initialDraft.current) return;
    const data = query.data;
    const value = { title: data.discussion.subject || "", details: data.discussion.body || "", dueDate: nextStepDay(data.discussion.dueDate),
      ownerId: String(data.owners.find(owner => String(owner.id) === String(workspaceId))?.id || data.owners[0]?.id || ""),
      topicKey: data.topics.length === 1 ? data.topics[0].key : "", expectedUpdatedAt: data.discussion.version };
    initialDraft.current = value;
    setDraft(value);
  }, [query.data, workspaceId]);
  const owner = query.data?.owners.find(value => String(value.id) === draft?.ownerId);
  const topic = query.data?.topics.find(value => value.key === draft?.topicKey);
  const existing = query.data?.tasks.find(task => String(task.owner_user_id) === draft?.ownerId && task.source_topic_key === draft?.topicKey);
  const savedTask = result?.task || existing;
  const unavailableTopic = topic?.ownerId && String(topic.ownerId) !== draft?.ownerId;
  const dirty = draft && !savedTask && JSON.stringify(draft) !== JSON.stringify(initialDraft.current);
  useEffect(() => {
    if ((!dirty && !busy) || result) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy, result]);
  useEffect(() => { if (result || error) resultRef.current?.focus(); }, [result, error]);
  function close() {
    if (inFlight.current) return;
    if (dirty && !result && !window.confirm("Discard this unsaved next step?")) return;
    onClose();
  }
  function change(key, value) { setDraft(current => ({ ...current, [key]: value })); }
  async function submit(event) {
    event.preventDefault();
    if (inFlight.current || savedTask || !draft || !owner || !topic || unavailableTopic) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, expectedWorkspaceId: workspaceId }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.task) throw new Error(payload?.error || "The save could not be confirmed. Close and reopen this dialog to check saved status. Retrying will not create a duplicate follow-up.");
      setResult(payload); onSaved(payload);
    } catch (failure) { setError(failure.message); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <dialog ref={dialogRef} aria-labelledby="discussion-next-step-heading" onCancel={event => { event.preventDefault(); close(); }}
    className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-gray-900/40">
    <div className="p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <h2 id="discussion-next-step-heading" className="text-xl font-bold">Create next step</h2>
        <button autoFocus type="button" className={buttonClass} onClick={close} disabled={busy}>Close</button>
      </div>
      <p className="mt-3 text-sm text-gray-600">Create an additional follow-up, not a replacement for the primary next step. Completing it will not resolve this discussion.</p>
      {query.isLoading && <p role="status" className="mt-4">Loading saved discussion details...</p>}
      {query.isError && <p role="alert" className="mt-4 text-sm text-red-800">{query.error.message}</p>}
      {draft && !query.isError && <form onSubmit={submit} className="mt-4 grid gap-4">
        <fieldset disabled={busy || Boolean(result)} className="grid min-w-0 gap-4">
          <legend className="sr-only">Follow-up assignment</legend>
          <label className="grid min-w-0 gap-2 text-sm font-semibold">Responsible owner
            <select className={fieldClass} required value={draft.ownerId} onChange={event => change("ownerId", event.target.value)}>
              {!query.data.owners.length && <option value="">No eligible owners</option>}
              {query.data.owners.map(value => <option key={value.id} value={value.id}>{value.name}</option>)}
            </select></label>
          <p className="text-xs text-gray-600">Only owners whose workspace you may edit and who already have access to this discussion are listed. Admins can assign to participating MGOs; other users create their own follow-ups.</p>
          <label className="grid min-w-0 gap-2 text-sm font-semibold">Constituent topic
            <select className={fieldClass} required value={draft.topicKey} onChange={event => change("topicKey", event.target.value)}>
              <option value="">Choose one topic</option>
              {query.data.topics.map(value => <option key={value.key} value={value.key}>{value.name}</option>)}
            </select></label>
          {unavailableTopic && <p role="alert" className="text-sm text-amber-900">This local-only constituent belongs to another workspace. Choose its owner or add a confirmed NXT constituent to the discussion first.</p>}
        </fieldset>
        {savedTask ? <WorkflowNotice ref={resultRef} tabIndex={-1} kind="app">
          <p>{result?.message || "A next step already exists for this owner and topic. Edit or reopen it instead of creating a duplicate."}</p>
          <p className="mt-2">{savedTask.owner_name || owner?.name} · {savedTask.status === "Done" ? "Completed" : "Open"}{savedTask.due_date ? ` · Due ${formatNextStepDate(savedTask.due_date)}` : ""}</p>
          {String(savedTask.owner_user_id) === String(workspaceId) ? <a className="mt-2 inline-flex min-h-11 items-center font-semibold underline"
            href={`/follow-ups?tab=next-steps&nextStepId=${savedTask.id}&status=${savedTask.status}`}>View next step</a>
            : <p className="mt-2">This follow-up is in {savedTask.owner_name || owner?.name}'s workspace.</p>}
          <p className="mt-2">This is an app follow-up. No NXT action was created.</p>
        </WorkflowNotice> : <>
          <NextStepFields title={draft.title} details={draft.details} dueDate={draft.dueDate} ownerName={owner?.name} disabled={busy}
            onTitleChange={value => change("title", value)} onDetailsChange={value => change("details", value)} onDueDateChange={value => change("dueDate", value)} />
          <p className="text-xs text-gray-600">The owner, due date, and completion status will be visible to everyone in this discussion. Follow-up notes stay in the owner's workspace. No NXT records or actions will be created.</p>
          <button type="submit" disabled={busy || !owner || !topic || Boolean(unavailableTopic) || !draft.title.trim()} className={`${buttonClass} !border-indigo-600 !bg-indigo-600 !text-white`}>
            {busy ? "Creating next step..." : "Create additional next step"}</button>
        </>}
      </form>}
      {error && <p ref={resultRef} tabIndex={-1} role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    </div>
  </dialog>;
}
