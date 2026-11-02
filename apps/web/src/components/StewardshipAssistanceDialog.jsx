import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import GiftFollowUpSource from "./GiftFollowUpSource";
import { ASSISTANCE_TYPES } from "@/utils/stewardshipAssistance";
import { formatNextStepDate } from "@/utils/nextStepWorklist";
import { GiftChoice, SavedGiftPreference } from "./StewardshipGiftChoice";
import StewardshipRequestContext from "./StewardshipRequestContext";
import { validAssistanceKey } from "@/utils/stewardshipAssistance";

const button = "min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 disabled:opacity-50";
const input = "min-h-11 w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-base font-normal text-gray-900";
const initial = { type: "", instructions: "", neededBy: "", giftItemId: null };

export default function StewardshipAssistanceDialog(props) {
  const { item, source, viewerId, workspaceId } = props;
  return <AssistanceForm key={`${viewerId}:${workspaceId}:${item?.id || ""}:${source?.constituentId || ""}:${source?.opportunityId || ""}:${source?.requestId || ""}`} {...props} />;
}

function requestKey(storageKey, fresh = false) {
  try {
    const saved = sessionStorage.getItem(storageKey);
    if (!fresh && validAssistanceKey(saved)) return { value: saved };
    const value = crypto.randomUUID();
    sessionStorage.setItem(storageKey, value);
    return { value };
  } catch { return { error: "This browser could not save request recovery information. Allow session storage and reopen the form before submitting." }; }
}

function AssistanceForm({ item, source, viewerId, workspaceId, onClose }) {
  const direct = Boolean(source);
  const storageKey = `stewardship-request:${viewerId}:${workspaceId}:${source?.constituentId}:${source?.opportunityId || "portfolio"}`;
  const [recovery, setRecovery] = useState(() => direct && !source.requestId ? requestKey(storageKey) : {});
  const id = useId();
  const dialog = useRef(null);
  const inFlight = useRef(false);
  const [draft, setDraft] = useState(initial);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [needsCheck, setNeedsCheck] = useState(false);
  const [discard, setDiscard] = useState(false);
  const params = new URLSearchParams({ viewerId: String(viewerId), workspaceId: String(workspaceId) });
  if (direct) {
    params.set("constituentId", source.constituentId);
    if (source.opportunityId) params.set("opportunityId", source.opportunityId);
    if (source.requestId) params.set("requestId", source.requestId);
    else if (recovery.value) params.set("requestKey", recovery.value);
  }
  const endpoint = direct ? `/api/stewardship/direct-request?${params}`
    : `/api/pending-actions/${encodeURIComponent(item.id)}/stewardship-request?${params}`;
  function verify(data) {
    if (data?.viewerId !== String(viewerId) || data.workspaceId !== String(workspaceId) ||
        (direct ? String(data.context?.constituentId) !== String(source.constituentId)
          || (source.requestId ? String(data.request?.id) !== String(source.requestId)
            : String(data.context?.opportunityId || "") !== String(source.opportunityId || ""))
          : String(data.task?.id) !== String(item.id))) throw new Error("Your workspace changed. Close this form and reload the page.");
    return data;
  }
  const query = useQuery({
    queryKey: ["stewardship-request", viewerId, workspaceId, endpoint],
    queryFn: async ({ signal }) => {
      const response = await fetch(endpoint, { signal, cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "Saved request details could not be loaded.");
      return verify(data);
    },
    enabled: !recovery.error, retry: false, gcTime: 0, staleTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const saved = result || (!query.isError ? query.data : null);
  const task = saved?.task;
  const request = direct ? saved?.request : task?.request;
  const canSubmit = direct ? Boolean(saved?.contextVersion) : task?.status === "Open";
  const dirty = !request && JSON.stringify(draft) !== JSON.stringify(initial);
  useEffect(() => { dialog.current.showModal(); const element = dialog.current; return () => element.close(); }, []);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  function close() { if (inFlight.current) return; if (dirty) setDiscard(true); else onClose(); }
  async function reload() {
    setError(""); setResult(null);
    const next = await query.refetch();
    if (!next.isError) setNeedsCheck(false);
  }
  function startAnother() {
    setRecovery(requestKey(storageKey, true)); setResult(null); setDraft(initial); setError(""); setNeedsCheck(false);
  }
  async function submit(event) {
    event.preventDefault();
    if (inFlight.current || request || needsCheck || recovery.error || query.isFetching || query.isError || !canSubmit || !draft.type || !draft.instructions.trim()) return;
    inFlight.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: draft.type, instructions: draft.instructions, neededBy: draft.neededBy,
          ...(draft.type === "gift" && draft.giftItemId ? { giftItemId: draft.giftItemId } : {}),
          ...(direct ? { contextVersion: saved.contextVersion } : { expectedUpdatedAt: task.updated_at }) }) });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error(data?.error || "The request could not be confirmed. Reload saved status before trying again.");
      verify(data);
      if (!(direct ? data.request?.id : data.task?.request?.id)) throw new Error("The request could not be confirmed. Reload saved status before trying again.");
      setResult(data);
    } catch (failure) { setError(failure.message); setNeedsCheck(true); }
    finally { inFlight.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} aria-labelledby={`${id}-heading`} onCancel={event => { event.preventDefault(); close(); }}
    className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-gray-900/40">
    <div className="grid gap-5 p-5 sm:p-7">
      <div className="flex items-start justify-between gap-3">
        <h2 id={`${id}-heading`} className="text-xl font-bold">{request ? "Stewardship request" : "Request stewardship assistance"}</h2>
        <button type="button" autoFocus className={button} disabled={busy} onClick={close}>Close</button>
      </div>
      <p className="text-sm text-gray-600">Ask Advancement Services to help with a letter, personal gift, or another way to recognize this donor. Your request goes to Stewardship &gt; Assistance Requests.</p>
      {query.isFetching && !result && <p role="status">Loading saved request details...</p>}
      {query.isError && !result && <p role="alert" className="text-red-800">{query.error.message}</p>}
      {recovery.error && <p role="alert" className="text-red-800">{recovery.error}</p>}
      {direct && <StewardshipRequestContext context={saved?.context} />}
      {task && <GiftFollowUpSource snapshot={task.source_gift_snapshot} />}
      {task?.source_gift_snapshot?.constituentId && <a className="text-sm font-semibold text-emerald-800 underline" href={`/stewardship/inventory/recipients?${new URLSearchParams({ constituentId: task.source_gift_snapshot.constituentId, returnTo: `/follow-ups?tab=next-steps&nextStepId=${item.id}` })}`}>View recorded received items</a>}
      {request ? <section aria-label="Saved stewardship request" className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
        <p role="status" className="font-semibold text-emerald-900">{result && !result.alreadyExists ? "Request submitted to Advancement Services." : direct ? "Your saved stewardship request." : "This follow-up already has a request."}</p>
        <p className="font-semibold">{request.request_type} <span className="font-normal">#{request.id}</span></p>
        <p>Status: <strong>{request.status}</strong>{request.needed_by ? ` · Needed by ${formatNextStepDate(request.needed_by)}` : ""}</p>
        <p className="whitespace-pre-wrap break-words text-sm">{request.request_note}</p>
        <SavedGiftPreference request={request} />
        {request.reviewer_notes && <div className="border-t border-emerald-200 pt-3 text-sm"><p className="font-semibold">Staff update</p><p className="mt-1 whitespace-pre-wrap break-words">{request.reviewer_notes}</p></div>}
        <p className="text-sm text-gray-600">The Stewardship team manages this same request in Assistance Requests. {direct ? "You can track it in your Work Queue's Stewardship tab. Completion does not confirm delivery." : "Completing it does not mark your reminder complete or confirm delivery."}</p>
        <button type="button" className={button} disabled={query.isFetching} onClick={reload}>Reload request status</button>
        {direct && !source.requestId && <button type="button" className={button} disabled={query.isFetching} onClick={startAnother}>Start a separate request</button>}
      </section> : saved && !query.isFetching && !query.isError && !recovery.error && (!canSubmit ? <p>Reopen this follow-up before requesting assistance.</p> : <form onSubmit={submit} className="grid gap-4">
        <fieldset disabled={busy || needsCheck || discard} className="grid min-w-0 gap-4">
          <label className="grid gap-2 text-sm font-semibold">What would you like help with?
            <select required className={input} value={draft.type} onChange={event => setDraft(value => ({ ...value, type: event.target.value, giftItemId: null }))}>
              <option value="">Choose assistance</option>{Object.entries(ASSISTANCE_TYPES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {draft.type === "gift" && <GiftChoice choices={query.data?.giftChoices} value={draft.giftItemId} onChange={giftItemId => setDraft(value => ({ ...value, giftItemId }))} />}
          <label className="grid gap-2 text-sm font-semibold">What do you have in mind?
            <textarea required rows={4} maxLength={4000} className={input} value={draft.instructions} placeholder="Share the occasion, who it is for, and any preferences. It's fine to ask for ideas."
              onChange={event => setDraft(value => ({ ...value, instructions: event.target.value }))} />
          </label>
          <label className="grid max-w-xs gap-2 text-sm font-semibold">Needed by (optional)
            <input type="date" min="1900-01-01" max="2200-12-31" className={input} value={draft.neededBy} onChange={event => setDraft(value => ({ ...value, neededBy: event.target.value }))} />
          </label>
        </fieldset>
        <p className="text-sm text-gray-600">{direct ? "The same request appears in Stewardship and your Work Queue. Nothing is sent, no NXT record is changed, and inventory is not reserved or deducted." : "One request stays linked to this follow-up. No letter, email, gift, or NXT update is sent, and the reminder stays open."}</p>
        <button type="submit" className={`${button} !border-emerald-700 !bg-emerald-700 !text-white`} disabled={busy || needsCheck || discard || !draft.type || !draft.instructions.trim()}>{busy ? "Submitting..." : "Submit request"}</button>
      </form>)}
      {error && <p role="alert" className="text-sm text-red-800">{error}</p>}
      {(needsCheck || query.isError) && <button type="button" disabled={busy || query.isFetching} className={button} onClick={reload}>Reload saved status</button>}
      {discard && <div role="alert" className="grid gap-3 rounded-xl bg-amber-50 p-4"><p>Discard your unsent request?</p><div className="flex flex-wrap gap-2">
        <button type="button" className={button} onClick={() => setDiscard(false)}>Keep editing</button><button type="button" className={button} onClick={onClose}>Discard draft</button>
      </div></div>}
    </div>
  </dialog>;
}
