"use client";

import { useEffect, useRef, useState } from "react";
import PledgePaymentList, { pledgeMoney } from "@/components/PledgePaymentList";
import { OPEN_PLEDGE_QUERY_ID, pledgeWorklist } from "@/utils/pledgePayments";
import { formatCalendarDate } from "@/utils/prospectActivity";

const button = "min-h-11 rounded-xl border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 disabled:cursor-not-allowed disabled:opacity-50";
const queryErrors = {
  query_missing_gift_system_id: "The query must output individual gift records with QRECID. A Total Records count cannot identify pledges. Correct the output, then cancel and refresh.",
  query_submission_uncertain: "Blackbaud may have accepted the query, but its job ID could not be saved. Automatic resubmission was stopped. Cancel this refresh before starting a new one.",
  query_still_running: "Blackbaud is still executing the saved query. Resume checks the same query job; it does not submit a new one.",
  query_execution_failed: "Blackbaud could not complete this query job. Check query 12033 in NXT, then cancel and refresh.",
  query_row_count_mismatch: "The downloaded query rows do not match Blackbaud's reported count. No partial manifest was accepted. Resume to retry the result download.",
  query_not_executable_gift_query: "Query 12033 must be an executable Gift query without prompts. Check the query and your Query API access.",
  query_not_csv: "The query result was not a valid CSV response. No cached values were replaced. Resume to retry.",
  query_malformed_csv: "The query CSV is malformed or exceeds the supported row/column limits. No partial manifest was accepted.",
  query_result_too_large: "The query result exceeds the 10 MB download limit. Reduce unnecessary output columns; no query criteria were changed.",
};
export default function PledgePaymentsPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [automatic, setAutomatic] = useState(false);
  const [tab, setTab] = useState("pastDue");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const inFlight = useRef(false);

  async function load() {
    setError("");
    try {
      const response = await fetch("/api/pledge-payments", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not load pledge payments.");
      setData(payload);
    } catch (err) { setError(err.message); }
  }
  useEffect(() => { load(); }, []);

  async function execute(action, continueBatches = false) {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    if (continueBatches) setAutomatic(true);
    if (action === "cancel") setAutomatic(false);
    try {
      const response = await fetch("/api/pledge-payments", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, jobId: data?.job?.id }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Refresh stopped. Resume to continue.");
      setData(payload);
      if (!["discovering", "running"].includes(payload.job?.status)) setAutomatic(false);
    } catch (err) { setError(err.message); setAutomatic(false); }
    finally { inFlight.current = false; setBusy(false); }
  }
  useEffect(() => {
    if (!automatic || busy || !["discovering", "running"].includes(data?.job?.status)) return;
    const delay = Math.max(800, Math.min(15000, Date.parse(data?.job?.nextPollAt || "") - Date.now() || 0));
    const timer = setTimeout(() => execute("resume"), delay);
    return () => clearTimeout(timer);
  }, [automatic, busy, data]);

  const job = data?.job;
  const legacySource = data?.requiresQueryRefresh;
  const resumable = !legacySource && ["discovering", "running", "paused"].includes(job?.status);
  const lists = pledgeWorklist(data?.records || [], data?.today);
  const selected = lists[tab];
  const filtered = selected.filter((row) => `${row.name} ${row.lookupId}`.toLowerCase().includes(search.toLowerCase()));
  const currentPage = Math.min(page, Math.max(0, Math.ceil(filtered.length / 50) - 1));
  const visible = filtered.slice(currentPage * 50, (currentPage + 1) * 50);
  const changeTab = (value) => { setTab(value); setPage(0); };
  const incomplete = job && (legacySource || job.status !== "completed");
  return <main className="mx-auto w-full max-w-[1800px] space-y-6 px-4 py-6 text-gray-900 sm:px-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-sm font-semibold uppercase tracking-wide text-gray-500">Advancement Services</p>
        <h1 className="mt-2 text-3xl font-bold">Pledge Payments</h1>
        <p className="mt-2 max-w-3xl text-gray-600">Track unpaid installments for pledges returned by saved NXT query {OPEN_PLEDGE_QUERY_ID}. One row per pledge, with the full payment schedule one click away.</p>
        <p className="mt-1 max-w-3xl text-sm text-gray-500">The query's existing amount, date, status, and missed-payment criteria determine which pledges are included. Repeated installment rows are counted as one pledge.</p></div>
      {data && !resumable && <button className={`${button} !bg-indigo-600 !text-white`} disabled={busy} onClick={() => execute("start", true)}>{busy ? "Starting..." : legacySource ? `Use query ${OPEN_PLEDGE_QUERY_ID}` : job ? "Refresh from NXT" : "Load pledge payments"}</button>}
    </header>
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-800"><p>{error}</p><button onClick={load} disabled={busy} className="mt-2 underline">Reload saved progress</button></div>}
    {!data && !error && <p role="status">Loading saved worklist...</p>}
    {data && <>
      {legacySource && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900">These cached results came from the previous all-pledges source. Select Use query {OPEN_PLEDGE_QUERY_ID} to replace that scan with your saved query. Previous values remain visible until the query manifest is verified; nothing is changed in NXT.</div>}
      {!job && <div className="rounded-xl border border-blue-200 bg-blue-50 p-5 text-blue-900">No worklist has been loaded yet. Select Load pledge payments to read schedules from your connected NXT account. This does not change NXT records.</div>}
      {job && <section aria-label="Refresh progress" className="rounded-xl border border-gray-200 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="status"><p className="font-semibold">{job.status === "discovering" && !legacySource ? `Finding pledges with query ${OPEN_PLEDGE_QUERY_ID}: ${job.queryStage === "download" ? "Validating result file" : job.queryStage === "poll" ? "Waiting for Blackbaud" : "Preparing query"}` : `${job.success + job.failed} / ${job.total} pledges checked`}</p>
            <p className="mt-1 text-sm text-gray-600">{job.success} verified (including settled pledges) / {job.failed} need review. {busy ? "Processing a small batch..." : job.status === "completed" ? "Refresh complete." : job.status === "cancelled" ? "Refresh cancelled; saved results retained." : job.status === "paused" ? "Refresh paused." : automatic ? "Continuing..." : "Progress saved."}</p></div>
          <div className="flex flex-wrap gap-2">
            {resumable && !automatic && <button disabled={busy} className={button} onClick={() => execute("resume", true)}>Resume</button>}
            {automatic && <button className={button} onClick={() => setAutomatic(false)}>Pause after this batch</button>}
            {!legacySource && job.failed > 0 && job.discoveryComplete && <button disabled={busy || automatic} className={button} onClick={() => execute("retry_failed", true)}>Retry failed pledges</button>}
            {resumable && <button disabled={busy || automatic} className={button} onClick={() => execute("cancel")}>Cancel refresh</button>}
          </div>
        </div>
        {!legacySource && job.queryRowCount != null && <p className="mt-2 text-sm text-gray-600">Query {OPEN_PLEDGE_QUERY_ID}: {job.queryRowCount} output rows / {job.total} unique pledges.</p>}
        {!legacySource && job.status === "paused" && <p className="mt-3 text-sm text-amber-900">{job.resumeAfter ? `Blackbaud throttling: resume after ${new Date(job.resumeAfter).toLocaleString()}.` : queryErrors[job.error?.code] || "The NXT response could not be verified. Check your Blackbaud connection and Query/Gift API permissions, then resume."} Previously saved values remain available.</p>}
        <p className="mt-3 text-xs text-gray-500">{job.completedAt ? `Finished ${new Date(job.completedAt).toLocaleString()}. ` : ""}Refresh continues in small batches while this page stays open. Leaving pauses the work; Resume does not restart verified pledges. Opening this page or switching tabs does not refresh NXT.</p>
      </section>}
      {incomplete && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">This worklist is incomplete or still refreshing. Totals cover the verified rows shown, with older saved values retained where available. Unverified pledges without saved data are not included.</div>}
      <section className="min-w-0 overflow-hidden rounded-2xl border border-gray-200 bg-white">
        <div className="space-y-4 border-b border-gray-200 p-5">
          <div role="tablist" aria-label="Pledge payment timing" className="flex flex-wrap gap-2">
            {[["pastDue", "Pledge Payments Past Due"], ["upcoming", "Upcoming Pledge Payments"]].map(([value, label]) => <button key={value}
              id={`tab-${value}`} role="tab" aria-selected={tab === value} aria-controls="pledge-payment-results" tabIndex={tab === value ? 0 : -1}
              onKeyDown={(event) => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); const next = event.key === "Home" ? "pastDue" : event.key === "End" ? "upcoming" : tab === "pastDue" ? "upcoming" : "pastDue"; changeTab(next); document.getElementById(`tab-${next}`)?.focus(); } }}
              className={`${button} ${tab === value ? "!border-indigo-600 !bg-indigo-600 !text-white" : ""}`} onClick={() => changeTab(value)}>{label} ({lists[value].length})</button>)}
          </div>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div><p className="text-sm text-gray-600">{tab === "pastDue" ? "Includes all unpaid payments due through today, oldest due date first." : "Unpaid future installments, ordered by the next due date. Amount due is for that next date only."}</p>
              <p className="mt-1 text-xs text-gray-500">As of {formatCalendarDate(data.today)} (Eastern). A pledge with arrears and future installments can appear in both tabs.</p></div>
            <label className="w-full text-sm font-semibold sm:w-72">Find a constituent or pledge<input type="search" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 font-normal" /></label>
          </div>
          <p className="text-sm text-gray-600">{filtered.length} pledges shown / {tab === "pastDue" ? "Total due through today" : "Total of next payments"}: <strong className="text-gray-900">{pledgeMoney(filtered.reduce((sum, row) => sum + row.amountDueCents, 0))}</strong>. Amounts in USD.</p>
        </div>
        <div id="pledge-payment-results" role="tabpanel" aria-labelledby={`tab-${tab}`} tabIndex={0}>
          <PledgePaymentList rows={visible} upcoming={tab === "upcoming"} today={data.today} />
          {!visible.length && <p className="p-6 text-gray-600">{!job ? "Load the worklist to see payments." : incomplete ? "No verified payments match this view yet. Check refresh progress and review items." : "No unpaid payments match this view."}</p>}
        </div>
        {filtered.length > 50 && <nav aria-label="Pledge payment pages" className="flex items-center justify-between gap-3 border-t border-gray-200 p-4">
          <button className={button} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</button>
          <span className="text-sm">Page {currentPage + 1} of {Math.ceil(filtered.length / 50)}</span>
          <button className={button} disabled={(currentPage + 1) * 50 >= filtered.length} onClick={() => setPage(currentPage + 1)}>Next</button>
        </nav>}
      </section>
      {data.issues.length > 0 && <details className="rounded-xl border border-amber-200 bg-amber-50 p-5">
        <summary className="cursor-pointer font-semibold text-amber-900">{data.issues.length} pledges need review</summary>
        <p className="my-3 text-sm text-amber-900">Missing or inconsistent data is never treated as zero. Retry failed pledges after checking NXT; previously verified pledges are not recalculated.</p>
        <ul className="max-h-72 space-y-2 overflow-y-auto text-sm">{data.issues.map((issue) => <li key={issue.pledgeId}>Pledge {issue.pledgeId}: {issue.stage.replaceAll("_", " ")} / {issue.code.replaceAll("_", " ")}{issue.httpStatus ? ` (HTTP ${issue.httpStatus})` : ""}. {issue.hasCachedData ? "Previous values retained." : "Not included in totals."}</li>)}</ul>
      </details>}
    </>}
  </main>;
}
