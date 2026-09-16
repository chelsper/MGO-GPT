import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown } from "lucide-react";
import NextStepFields from "./NextStepFields";
import { buildNextStepGroups, formatNextStepCompletion, formatNextStepDate, nextStepDay, nextStepName, pageNextStepGroups } from "@/utils/nextStepWorklist";

const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600";

export default function NextStepsWorklist({ viewerId, workspaceId, active = true }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("Open");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [editor, setEditor] = useState(null);
  const [notice, setNotice] = useState("");
  const saveInFlight = useRef(false);
  const query = useQuery({
    queryKey: ["next-step-worklist", viewerId, workspaceId, status],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/follow-ups?status=${status}`, { signal, cache: "no-store" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Next steps could not be loaded.");
      if (!Array.isArray(payload?.items) || !payload.asOf || String(payload.workspace?.id) !== String(workspaceId) || String(payload.viewerId) !== String(viewerId)) {
        throw new Error("The workspace changed or its data is unavailable. Reload this page before continuing.");
      }
      return payload;
    },
    enabled: active, gcTime: 0, staleTime: Infinity, refetchOnWindowFocus: false, retry: false,
  });
  const dirty = Boolean(editor && (editor.title !== (editor.source.title || "") || editor.details !== (editor.source.details || "") || editor.dueDate !== nextStepDay(editor.source.due_date)));
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = useMutation({
    mutationFn: async draft => {
      const response = await fetch(`/api/pending-actions/${draft.source.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: draft.title.trim(), details: draft.details.trim() || null, dueDate: draft.dueDate || null,
          expectedWorkspaceId: workspaceId, expectedUpdatedAt: draft.source.updated_at || null,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Your next step could not be saved. Your draft is still here.");
      return payload;
    },
    onSuccess: () => {
      saveInFlight.current = false;
      setEditor(null);
      setNotice("Next step saved. No NXT action was created.");
      for (const key of ["next-step-worklist", "pending-actions", "stewardship-actions", "worklist", "prospect", "prospects", "team-discussion"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
    onError: () => { saveInFlight.current = false; },
  });

  function discardEditor() {
    if (saveInFlight.current || save.isPending) return false;
    if (dirty && !window.confirm("Discard your unsaved next-step changes?")) return false;
    setEditor(null);
    save.reset();
    return true;
  }
  function edit(item) {
    if (!discardEditor()) return;
    setNotice("");
    setEditor({ source: item, title: item.title || "", details: item.details || "", dueDate: nextStepDay(item.due_date) });
  }
  function changeStatus(value) {
    if (value === status || !discardEditor()) return;
    setStatus(value); setPage(1); setNotice("");
  }

  const items = query.data?.items || [];
  const workspace = query.data?.workspace;
  const groups = buildNextStepGroups(items, query.data?.asOf, status, search);
  const total = groups.reduce((count, group) => count + group.items.length, 0);
  const pages = Math.max(1, Math.ceil(total / 25));
  const currentPage = Math.min(page, pages);
  const pageGroups = pageNextStepGroups(groups, currentPage);
  const busy = save.isPending || query.isFetching;

  return <div className="space-y-5">
    <section className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5" aria-label="Next-step controls">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Next steps</h2>
          <p className="mt-1 max-w-3xl text-sm leading-relaxed text-gray-600">All saved follow-ups for this workspace. These reminders are separate from NXT actions.</p>
        </div>
        <a href="/my-top-prospects" className={buttonClass}>My Prospects</a>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2" role="group" aria-label="Next-step status">
        {[{ value: "Open", label: "Open next steps", shortLabel: "Open" }, { value: "Done", label: "Completed history", shortLabel: "Completed" }].map(option => (
          <button key={option.value} type="button" aria-label={option.label} aria-pressed={status === option.value} onClick={() => changeStatus(option.value)} disabled={save.isPending}
            className={`${buttonClass} ${status === option.value ? "!border-indigo-600 !bg-indigo-50 !text-indigo-800" : ""}`}><span className="sm:hidden">{option.shortLabel}</span><span className="hidden sm:inline">{option.label}</span></button>
        ))}
        <button type="button" disabled={busy} className={buttonClass} onClick={() => { if (discardEditor()) query.refetch(); }}>Reload saved list</button>
      </div>
      <label className="mt-4 grid max-w-xl gap-2 text-sm font-semibold text-gray-700">
        Find a next step
        <input type="search" value={search} disabled={Boolean(editor)} onChange={event => { setSearch(event.target.value); setPage(1); }}
          placeholder="Search constituent, task, notes, or opportunity" className="min-h-11 min-w-0 rounded-xl border border-gray-300 px-3 text-base font-normal disabled:bg-gray-100" />
      </label>
      {editor && <p className="mt-2 text-xs text-gray-500">Save or cancel your edit to search or change pages. Switching tabs keeps your draft.</p>}
      {workspace && !workspace.canEdit && <p className="mt-3 text-sm font-medium text-gray-600">Next steps are read-only in this selected workspace.</p>}
    </section>

    {query.isLoading || query.isFetching ? <p role="status">Loading saved next steps...</p> : query.isError ? (
      <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
        {query.error.message} <button type="button" className="underline" onClick={() => query.refetch()}>Try again</button>
      </div>
    ) : <>
      {notice && <p role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-600">
        <p>{total} {status === "Done" ? "completed" : "open"} next {total === 1 ? "step" : "steps"}{search ? ` matching your search (${items.length} total)` : ""}. Grouped as of {formatNextStepDate(query.data?.asOf)} (Eastern).</p>
        {total > 25 && <nav aria-label="Next steps pagination" className="flex items-center gap-3">
          <button type="button" className={buttonClass} disabled={currentPage === 1 || Boolean(editor)} onClick={() => setPage(currentPage - 1)}>Previous</button>
          <span>Page {currentPage} of {pages}</span>
          <button type="button" className={buttonClass} disabled={currentPage === pages || Boolean(editor)} onClick={() => setPage(currentPage + 1)}>Next</button>
        </nav>}
      </div>
      {!total && <div className="rounded-xl border border-gray-200 bg-white p-5 text-gray-600">
        {search ? "No next steps match your search." : status === "Done" ? "No completed next steps yet." : "No open next steps. Add one from My Prospects when you have a follow-up to track."}
      </div>}
      {pageGroups.map(group => <section key={group.key} aria-labelledby={`next-step-group-${group.key.replaceAll(" ", "-")}`}>
        <h3 id={`next-step-group-${group.key.replaceAll(" ", "-")}`} className={`mb-3 text-base font-bold ${group.key === "Overdue" ? "text-amber-800" : "text-gray-800"}`}>{group.label} <span className="font-normal text-gray-500">({group.total})</span></h3>
        <div className="space-y-3">{group.items.map(item => {
          const isEditing = editor?.source.id === item.id;
          return <article key={item.id} aria-label={`${nextStepName(item)}: ${item.title}`} className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 basis-64 break-words">
                <p className="text-sm font-semibold text-indigo-700">{nextStepName(item)}</p>
                <h4 className="mt-1 text-base font-bold text-gray-900">{item.title}</h4>
                <p className="mt-2 text-sm text-gray-600">{workspace?.name || "Workspace owner"} · {status === "Done" ? formatNextStepCompletion(item.completed_at) : item.due_date ? `Due ${formatNextStepDate(item.due_date)}` : "No due date"}</p>
                {item.category === "Stewardship" && <span className="mt-2 inline-block rounded-full bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">Stewardship</span>}
              </div>
              {workspace?.canEdit && status === "Open" && !isEditing && <button type="button" className={buttonClass} onClick={() => edit(item)} disabled={save.isPending}>Edit next step</button>}
            </div>
            <details className="mt-3 text-sm text-gray-600">
              <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-gray-700">Details <ChevronDown size={15} aria-hidden="true" /></summary>
              <div className="space-y-3 pb-1">
                {item.details ? <p className="whitespace-pre-wrap break-words">{item.details}</p> : <p>No additional notes.</p>}
                {item.opportunity_title && <p>Opportunity: <strong>{item.opportunity_title}</strong></p>}
                {item.prospect_id && <a className="block font-semibold text-indigo-700 underline" href={`/my-top-prospects?prospectId=${encodeURIComponent(item.prospect_id)}&panel=next-step`}>Open prospect workspace</a>}
                {item.discussion_item_id && <p><a className="font-semibold text-indigo-700 underline" href={`/team-discussion?discussionId=${encodeURIComponent(item.discussion_item_id)}&status=${encodeURIComponent(item.discussion_status || "Open")}`}>Open linked discussion</a> ({item.discussion_status === "Resolved" ? "Resolved" : "Open"}). Discussion and task completion are separate.</p>}
              </div>
            </details>
            {isEditing && <form aria-label={`Edit next step for ${nextStepName(item)}`} className="mt-3 grid gap-4 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4" onSubmit={event => {
              event.preventDefault();
              if (!editor.title.trim() || !workspace?.canEdit || saveInFlight.current) return;
              saveInFlight.current = true;
              save.mutate(editor);
            }}>
              <NextStepFields title={editor.title} details={editor.details} dueDate={editor.dueDate} ownerName={workspace?.name}
                onTitleChange={title => setEditor(current => ({ ...current, title }))}
                onDetailsChange={details => setEditor(current => ({ ...current, details }))}
                onDueDateChange={dueDate => setEditor(current => ({ ...current, dueDate }))} disabled={save.isPending} autoFocus />
              {save.isError && <p role="alert" className="text-sm text-red-800">{save.error.message}</p>}
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={save.isPending || !editor.title.trim()} className={`${buttonClass} !border-indigo-600 !bg-indigo-600 !text-white`}>{save.isPending ? "Saving..." : "Save next step"}</button>
                <button type="button" disabled={save.isPending} className={buttonClass} onClick={discardEditor}>Cancel edit</button>
              </div>
            </form>}
          </article>;
        })}</div>
      </section>)}
    </>}
  </div>;
}
