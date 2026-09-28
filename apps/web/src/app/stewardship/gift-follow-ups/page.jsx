"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, Gift, Search } from "lucide-react";
import useUser from "@/utils/useUser";
import WorkflowReturnLink from "@/components/WorkflowReturnLink";
import { useWorkspaceLabels } from "@/components/WorkspaceTerminology";

const defaults = { search: "", status: "Open", owner: "", due: "all" };
const button = "min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:border-emerald-600 disabled:cursor-not-allowed disabled:opacity-50";
const input = "mt-2 block min-h-11 w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-base font-normal text-gray-900";

async function loadFollowUps(params, viewerKey, signal) {
  const unavailable = "Gift follow-ups could not be loaded. Please try again.";
  try {
    const response = await fetch(`/api/stewardship/gift-follow-ups?${params}`, { signal, cache: "no-store" });
    if (!response.ok) {
      const message = response.status === 401 ? "Sign in to view gift follow-ups." : response.status === 403
        ? "Gift Follow-ups is available to Admin and Advancement Services users." : unavailable;
      throw Object.assign(new Error(message), { status: response.status });
    }
    const data = await response.json();
    if (data.viewerKey !== viewerKey) throw Object.assign(new Error("Your sign-in changed. Reload this page before continuing."), { status: 409 });
    if (!Array.isArray(data.items) || !Array.isArray(data.owners)) throw new Error(unavailable);
    return data;
  } catch (error) {
    if (signal.aborted || error.status) throw error;
    throw new Error(unavailable);
  }
}

function dateLabel(value) {
  if (!value) return null;
  const day = String(value).slice(0, 10);
  const date = new Date(`${day}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) return null;
  return date.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

function FollowUpCard({ item, asOf, fundraiserLabel }) {
  const done = item.status === "Done";
  const due = dateLabel(item.dueDate);
  const overdue = !done && due && item.dueDate < asOf;
  const today = !done && due && item.dueDate === asOf;
  const amount = typeof item.giftAmount === "number" && Number.isFinite(item.giftAmount)
    ? item.giftAmount.toLocaleString("en-US", { style: "currency", currency: "USD" }) : null;
  const giftDate = dateLabel(item.giftDate);
  return <li className="grid gap-5 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6 lg:grid-cols-[1.1fr_1.5fr_1fr]">
    <div className="min-w-0">
      <h2 className="break-words text-lg font-bold text-gray-900">{item.donorName || "Saved donor unavailable"}</h2>
      {item.constituentId && <p className="mt-1 text-xs text-gray-500">Constituent ID {item.constituentId}</p>}
      <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-700"><Gift size={16} aria-hidden="true" />
        <span>Saved gift{amount ? <> <strong className="text-emerald-800">{amount}</strong></> : " amount unavailable"}</span>
        {giftDate && <span>on {giftDate}</span>}
      </p>
      {item.linkedTaskCount > 1 && <p className="mt-2 text-xs text-gray-600">{item.linkedTaskCount} workspace follow-ups reference this gift.</p>}
    </div>
    <div className="min-w-0">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Follow-up</p>
      <p className="mt-2 break-words font-semibold text-gray-900">{item.title}</p>
      <p className="mt-2 break-words text-sm text-gray-600">{fundraiserLabel}: <span className="font-medium text-gray-800">{item.ownerName}</span>{item.ownerActive === false ? " (inactive account)" : ""}</p>
    </div>
    <div className="min-w-0 lg:border-l lg:border-gray-100 lg:pl-6">
      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${done ? "bg-emerald-50 text-emerald-800" : overdue ? "bg-amber-50 text-amber-900" : "bg-gray-100 text-gray-700"}`}>
        {done ? <CheckCircle2 size={16} aria-hidden="true" /> : <Clock3 size={16} aria-hidden="true" />}
        {done ? "Completed task" : overdue ? "Overdue" : today ? "Due today" : "Open"}
      </span>
      <p className="mt-2 text-sm text-gray-600">{due ? `Due ${due}` : "No due date"}</p>
      {done && <p className="mt-2 text-xs text-gray-500">Task complete; delivery is not tracked here.</p>}
    </div>
  </li>;
}

export function GiftFollowUpQueue({ viewerKey }) {
  const { mgo: fundraiserLabel } = useWorkspaceLabels();
  const [draft, setDraft] = useState(defaults);
  const [filters, setFilters] = useState(defaults);
  const [page, setPage] = useState(1);
  const query = useQuery({
    queryKey: ["stewardship-gift-follow-ups", viewerKey, filters, page],
    queryFn: async ({ signal }) => {
      const params = new URLSearchParams({ ...filters, page: String(page) });
      return loadFollowUps(params, viewerKey, signal);
    },
    retry: false, staleTime: 0, gcTime: 0, refetchOnMount: "always", refetchOnWindowFocus: false, refetchOnReconnect: false,
  });
  const data = !query.isFetching && !query.isError ? query.data : null;
  const owners = query.data?.owners || [];
  const filtered = filters.search || filters.owner || filters.due !== "all" || filters.status !== "Open";
  function change(key, value) { setDraft(current => ({ ...current, [key]: value })); }
  function apply(event) {
    event.preventDefault();
    setPage(1);
    const next = { ...draft, search: draft.search.trim() };
    setDraft(next); setFilters(next);
    if (page === 1 && JSON.stringify(next) === JSON.stringify(filters)) query.refetch();
  }
  if (query.isError && [401, 403].includes(query.error.status)) return <div role="alert" className="rounded-2xl border border-gray-200 bg-white p-6 text-gray-700">
    {query.error.message}{query.error.status === 401 && <a href="/account/signin" className="ml-2 font-semibold text-emerald-800 underline">Sign in</a>}
  </div>;
  return <>
    <form onSubmit={apply} className="grid gap-4 rounded-2xl border border-gray-200 bg-white p-5 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]">
      <label className="min-w-0 text-sm font-semibold text-gray-700">Search follow-ups
        <input type="search" maxLength={200} value={draft.search} onChange={event => change("search", event.target.value)} placeholder="Donor, task, owner or constituent ID" className={input} />
      </label>
      <label className="min-w-0 text-sm font-semibold text-gray-700">{fundraiserLabel}
        <select value={draft.owner} onChange={event => change("owner", event.target.value)} className={input}>
          <option value="">All workspaces</option>
          {draft.owner && !owners.some(owner => owner.id === draft.owner) && <option value={draft.owner}>Selected workspace</option>}
          {owners.map(owner => <option key={owner.id} value={owner.id}>{owner.name}{owner.active === false ? " (inactive)" : ""}</option>)}
        </select>
      </label>
      <label className="min-w-0 text-sm font-semibold text-gray-700">Task status
        <select value={draft.status} onChange={event => { change("status", event.target.value); if (event.target.value === "Done") change("due", "all"); }} className={input}>
          <option value="Open">Open</option><option value="Done">Completed</option><option value="all">All tasks</option>
        </select>
      </label>
      <label className="min-w-0 text-sm font-semibold text-gray-700">Due date
        <select value={draft.due} disabled={draft.status === "Done"} onChange={event => change("due", event.target.value)} className={`${input} disabled:bg-gray-50 disabled:text-gray-500`}>
          <option value="all">Any date</option><option value="overdue">Overdue</option><option value="today">Due today</option>
          <option value="upcoming">Next 7 days</option><option value="undated">No due date</option>
        </select>
      </label>
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4">
        <button type="submit" disabled={query.isFetching} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"><Search size={16} aria-hidden="true" />Apply filters</button>
        <button type="button" className={button} disabled={query.isFetching} onClick={() => { setDraft(defaults); setFilters(defaults); setPage(1); }}>Reset filters</button>
        <p className="text-xs text-gray-500 sm:ml-auto">Due-date filters apply to open tasks.</p>
      </div>
    </form>
    <details className="text-sm text-gray-600">
      <summary className="w-fit cursor-pointer font-medium">About this saved view</summary>
      <p className="mt-2 max-w-3xl">Gift details are saved when a follow-up is created. Reload checks the latest task progress in the app, not NXT. Counts are tasks, not unique gifts or letters.</p>
    </details>
    {query.isFetching ? <p role="status" className="py-8 text-center text-gray-600">Loading saved follow-ups...</p> : query.isError ?
      <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">{query.error.message} <button className={`${button} mt-3 block`} onClick={() => query.refetch()}>Try again</button></div> : data && <>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p role="status" className="font-semibold text-gray-800">{data.total} {data.total === 1 ? "follow-up" : "follow-ups"}{filtered ? " matching your filters" : " open"}</p>
            <p className="mt-1 text-xs text-gray-500">Saved tasks across all workspaces. Due dates use {data.timeZone}.</p></div>
          <button type="button" className={button} onClick={() => query.refetch()}>Reload saved tasks</button>
        </div>
        {data.items.length ? <ul aria-label="Gift follow-ups" className="space-y-3">{data.items.map(item => <FollowUpCard key={item.id} item={item} asOf={data.asOf} fundraiserLabel={fundraiserLabel} />)}</ul> :
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
            <h2 className="text-lg font-bold text-gray-900">{filtered ? "No follow-ups match these filters" : "No open gift follow-ups yet"}</h2>
            <p className="mx-auto mt-2 max-w-xl text-gray-600">{filtered ? "Try another owner, date or task status." : "Gift follow-ups created from the dashboard helper appear here. They stay in the owner's Next Steps; nothing needs to be copied."}</p>
          </div>}
        {data.total > 0 && <nav aria-label="Gift follow-up pages" className="flex flex-wrap items-center justify-between gap-3 py-2">
          <p className="text-sm text-gray-600">Showing {(data.page - 1) * data.pageSize + 1}-{Math.min(data.page * data.pageSize, data.total)}</p>
          <div className="flex items-center gap-3"><button type="button" className={button} disabled={data.page <= 1} onClick={() => setPage(data.page - 1)}>Previous</button>
            <span className="text-sm text-gray-600">Page {data.page} of {data.pages}</span>
            <button type="button" className={button} disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)}>Next</button></div>
        </nav>}
      </>}
  </>;
}

export default function GiftFollowUpsPage() {
  const { data: user, loading } = useUser();
  const viewerKey = user ? String(user.id || user.email) : "";
  return <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-8">
    <WorkflowReturnLink href="/stewardship" />
    <header className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-white p-6 sm:p-8">
      <div className="flex flex-wrap items-center gap-3"><p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Stewardship</p><span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold text-emerald-800">Read-only</span></div>
      <h1 className="mt-3 text-3xl font-bold text-gray-900">Gift Follow-ups</h1>
      <p className="mt-3 max-w-3xl text-gray-600">See who is following up on a gift, what they have planned, and when it is due.</p>
      <p className="mt-2 max-w-3xl text-sm text-gray-600">These are the same tasks in each owner's Next Steps. Completing a task does not confirm that a letter was sent or a donor was thanked.</p>
      <a href="/stewardship/requests" className="mt-4 inline-flex min-h-11 items-center font-semibold text-emerald-800 underline">Manage assistance requests</a>
    </header>
    {loading ? <p role="status">Checking access...</p> : !user ? <p><a href="/account/signin" className="font-semibold text-emerald-800 underline">Sign in to view gift follow-ups</a></p> : <GiftFollowUpQueue key={viewerKey} viewerKey={viewerKey} />}
  </main>;
}
