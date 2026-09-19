"use client";

import { useEffect, useState } from "react";
import { Activity, ArrowUpRight, RefreshCw, ShieldCheck } from "lucide-react";

const button = "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50";
const tones = { quiet: "border-emerald-200 bg-emerald-50 text-emerald-900", notice: "border-gray-200 bg-gray-50 text-gray-700",
  wait: "border-amber-200 bg-amber-50 text-amber-900", review: "border-red-200 bg-red-50 text-red-900" };

function when(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return "Not recorded";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "America/New_York" }).format(new Date(value));
}

function Badge({ level = "notice", children }) {
  return <span className={`inline-block rounded-full border px-3 py-1 text-xs font-bold ${tones[level] || tones.notice}`}>{children}</span>;
}

function Section({ id, title, description, available, children }) {
  return <section aria-labelledby={id} className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5 sm:p-6">
    <h2 id={id} className="text-xl font-bold text-gray-900">{title}</h2>
    <p className="mb-5 mt-2 max-w-4xl text-sm leading-relaxed text-gray-600">{description}</p>
    {available ? children : <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">This section could not be read. Its status is unknown, not clear. Reload saved status; if this persists, ask a developer to inspect the app database.</p>}
  </section>;
}

function Limited({ total, shown }) {
  return total > shown ? <p className="mt-3 text-sm font-semibold text-amber-900">Showing {shown} of {total}. Additional records are not shown; use the original workspace to investigate.</p> : null;
}

function Details({ children }) {
  return <details className="mt-3 text-sm text-gray-600"><summary className="min-h-11 cursor-pointer content-center rounded font-semibold focus-visible:outline-2 focus-visible:outline-emerald-700">Saved check details</summary><div className="space-y-1 pb-2">{children}</div></details>;
}

export default function IntegrationHealthPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let timedOut = false;
    setLoading(true);
    setError("");
    // Clear the prior response on reload, including when an Admin's access has
    // changed. No shared cache, localStorage, polling, or provider status request.
    setData(null);
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 20_000);
    fetch("/api/admin/integration-health", { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const payload = await response.json();
        if (!response.ok) {
          const message = response.status === 401 ? "Sign in to view integration health."
            : response.status === 403 ? "Integration health is available to active Admin users only."
              : "Saved status could not be loaded. No NXT checks or changes were started.";
          throw new Error(message);
        }
        if (!payload?.readAt || !payload.sections || !payload.viewerId) throw new Error("The saved status response was incomplete. Reload to try again.");
        if (active) setData(payload);
      })
      .catch(err => { if (active) setError(timedOut ? "The saved status read timed out. No NXT checks or changes were started. Try again." : err.name === "AbortError" ? "The read was cancelled." : "" + (err.message || "Saved status could not be loaded.")); })
      .finally(() => { clearTimeout(timer); if (active) setLoading(false); });
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [attempt]);
  const { quota, connections, portfolios, activity, verifications } = data?.sections || {};
  const connectionItems = connections?.items || [];
  const portfolioItems = portfolios?.items || [];
  const verificationItems = verifications?.items || [];

  return <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 text-gray-900 sm:px-8">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div className="max-w-3xl">
        <p className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-emerald-800"><ShieldCheck size={18} aria-hidden="true" />Admin operations</p>
        <h1 className="text-3xl font-bold">Integration Health</h1>
        <p className="mt-2 leading-relaxed text-gray-600">See what is waiting, what needs investigation, and what can be left alone. This is saved operational evidence, not a live NXT test or an approval queue.</p>
      </div>
      <button className={button} disabled={loading} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />{loading ? "Reading saved status..." : "Reload saved status"}</button>
    </header>
    <div className="rounded-xl border border-emerald-200 bg-gradient-to-r from-emerald-50 to-white p-4 text-sm text-emerald-950">
      Opening or reloading this page does not contact Blackbaud, reconnect accounts, restart refreshes, or resend submissions. Times are Eastern. Routine successes need no action.
      {data && <p className="mt-2 font-semibold">Saved status read {when(data.readAt)}</p>}
    </div>
    {loading && <p role="status">Loading saved integration status...</p>}
    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900"><p>{error}</p><a href="/" className="mt-3 inline-block min-h-11 content-center font-semibold underline">Return home</a></div>}
    {data && <>
      <Section id="health-quota" title="Blackbaud cooldown" available={quota?.available}
        description="A subscription-wide pause affects multiple users. Reconnecting an account does not replenish API capacity.">
        <Badge level={quota?.paused ? "wait" : "quiet"}>{quota?.paused ? "Wait before more NXT reads" : "No active saved cooldown"}</Badge>
        <p className="mt-3 text-sm leading-relaxed text-gray-700">{quota?.paused
          ? `Wait until ${when(quota.blockedUntil)} before resuming paused reads in their original workflow. Existing schedules and checkpoints remain unchanged.`
          : "No current subscription cooldown is recorded. This does not guarantee live API availability; individual jobs may have their own pause."}</p>
      </Section>

      <Section id="health-connections" title="Connections" available={connections?.available}
        description="Active accounts with saved connections, plus your account. Not every MGO needs a personal connection; scheduled work can use the configured shared account.">
        {!connections?.credentialsPresent && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Required application credentials are missing from this environment. Ask the deployment owner to check configuration. This page does not display credentials.</p>}
        <p className="mb-4 text-sm text-gray-700">Scheduled connection selection: <strong>{connections?.scheduledOwner?.name || "No eligible saved connection found"}</strong>. This identifies the current selection, not proof that cron is running or NXT access is valid.</p>
        <div className="grid gap-3 md:grid-cols-2">
          {connectionItems.map(item => <article key={item.id} className="min-w-0 rounded-xl border border-gray-200 p-4">
            <h3 className="mb-2 break-words font-bold">{item.name}{item.isViewer ? " (you)" : ""}</h3>
            <Badge level={item.level}>{item.label}</Badge><p className="mt-3 text-sm leading-relaxed text-gray-600">{item.guidance}</p>
            <Details><p>Saved connection updated: {when(item.updatedAt)}</p><p>Access token expiry: {when(item.expiresAt)}</p></Details>
            {item.isViewer && <a className={button} href="/settings">My Account & Connections<ArrowUpRight size={16} aria-hidden="true" /></a>}
          </article>)}
        </div>
        <Limited total={connections?.total} shown={connectionItems.length} />
      </Section>

      <Section id="health-portfolios" title="Portfolio maintenance" available={portfolios?.available}
        description="Current assigned constituents only. Summary and giving backlogs overlap and must not be added together. Missing snapshots are unknown, not zero activity.">
        <div className="mb-4 flex flex-wrap gap-3"><a className={button} href="/my-top-prospects?tab=portfolio">Open portfolios</a><a className={button} href="/access-management">Security & Access</a></div>
        <p className="mb-4 text-sm text-gray-600">Select the named MGO in My Prospects before inspecting a job. This page never changes your selected workspace.</p>
        {!portfolioItems.length && <p className="text-sm text-gray-600">No active MGO workspaces were found.</p>}
        <div className="space-y-3">{portfolioItems.map(item => <article key={item.id} className="rounded-xl border border-gray-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{item.name}</h3><Badge level={item.level}>{item.label}</Badge></div>
          <p className="mt-3 text-sm text-gray-600">{item.total === null ? "No saved assignment counts available." : `${item.total} assigned / ${item.summaryDue} summaries due / ${item.givingDue} giving checks due / ${item.failed} summaries with errors`}</p>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">{item.guidance}</p>
          <Details><p>Assignments checked: {when(item.assignmentsCheckedAt)}</p><p>Most recent successful summary check: {when(item.lastSummaryCheck)}</p><p>Most recent successful giving check: {when(item.lastGivingCheck)}</p>
            <p>These are the most recent individual checks, not confirmation that the entire portfolio was refreshed.</p>
            {item.job && <><p>Latest job: {item.job.processed} / {item.job.total} processed; {item.job.completed} completed; {item.job.failed} failed.</p><p>Job updated: {when(item.job.updatedAt)}</p>{item.job.pausedUntil && <p>Saved pause ends: {when(item.job.pausedUntil)}</p>}</>}
          </Details>
        </article>)}</div>
        <Limited total={portfolios?.total} shown={portfolioItems.length} />
      </Section>

      <Section id="health-activity" title="Last gift / action enrichment" available={activity?.available}
        description="The overnight activity worker checks saved portfolio assignments in bounded batches. Gift and action checks are separate items, not people.">
        {!activity?.enabled ? <p className="text-sm text-gray-700">Not enabled for this environment/origin. Check the activity enrollment configuration if overnight checks are expected.</p> : <>
          <div className="flex items-center gap-2 text-emerald-800"><Activity size={18} aria-hidden="true" /><strong>Budgeted activity checks</strong></div>
          <p className="mt-3 text-sm text-gray-700">{activity.enrollmentMode === "active_mgos" ? "Automatic enrollment: active MGOs" : "Selected-workspace enrollment"}. {activity.workspaceCount ?? "Unknown"} enrolled workspaces.</p>
          {activity.enrollmentMode === "active_mgos" && <p className="mt-2 text-sm text-gray-600">New active MGOs join automatically after fundraiser mapping and initial portfolio assignment sync. Inactive accounts and configured exclusions are not checked.</p>}
          {activity.awaitingAssignments > 0 && <p className="mt-2 text-sm text-amber-900">{activity.awaitingAssignments} enrolled workspaces still need an initial assignment snapshot. Check their setup in Security &amp; Access and My Prospects.</p>}
          <p className="mt-3 text-sm text-gray-700">{activity.total} checks / {activity.neverChecked} never verified / {activity.due} eligible now.</p>
          <p className="mt-2 text-sm text-gray-700">{activity.callsToday} of {activity.dailyBudget} reserved API calls today. This is this worker's budget, not the subscription's remaining quota.</p>
          {activity.connectionErrors > 0 && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-900">{activity.connectionErrors} saved connection errors. Have the scheduled account owner check access/permissions; reconnect only if authorization requires it.</p>}
          {activity.throttled > 0 && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{activity.throttled} checks last encountered throttling. Let cooldowns and the daily budget control retries; do not restart each portfolio.</p>}
          {activity.otherErrors > 0 && <p className="mt-3 text-sm text-amber-900">{activity.otherErrors} checks have unverified responses. Investigate the worker if these persist; saved dates remain in place.</p>}
          <p className="mt-3 text-sm text-gray-600">A backlog can take multiple overnight windows. Normal queued work does not need approval.</p>
          <Details><p>Most recent successful individual check: {when(activity.lastCheckedAt)}</p><p>Next allowed worker time: {when(activity.nextAllowedAt)}</p><p>Saved worker lease ends: {when(activity.leaseUntil)}</p><p>Eligibility is not a promised execution time; the overnight schedule and budgets still apply.</p></Details>
        </>}
      </Section>

      <Section id="health-verifications" title="NXT action verification" available={verifications?.available}
        description="Reminder-linked submissions only. These are saved or uncertain write outcomes to investigate, not approvals. Import results remain in Import History, not this list.">
        <p className="mb-4 text-sm text-gray-700">Never log the same action again to clear a warning. Select the named owner's workspace in Follow-ups, open the reminder's NXT submission, and use Verify existing NXT action when available. Verification reads the existing action; it does not resend it.</p>
        {!verificationItems.length && <p className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">No reminder-linked submissions are processing or awaiting verification. No action required.</p>}
        <div className="space-y-3">{verificationItems.map(item => <article key={item.id} className="rounded-xl border border-gray-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">{item.ownerName} / Reminder #{item.id}</h3><Badge level={item.state === "review" ? "review" : "wait"}>{item.state === "review" ? "Needs verification" : "Submission processing or interrupted"}</Badge></div>
          <p className="mt-3 text-sm text-gray-600">Last saved update: {when(item.updatedAt)}</p>
          <p className="mt-2 text-sm text-gray-700">{item.state === "processing" ? "Let an in-flight submission finish. If it stays unchanged, ask a developer to inspect the saved receipt. Do not resend." : item.hasActionId ? "An NXT action ID is saved. Use read-only verification of that action in the original workflow." : "No NXT action ID is saved. The result is uncertain; ask an administrator/developer to reconcile it in NXT before any new create."}</p>
          {item.ownerActive ? <a className={`${button} mt-3`} href={item.href}>Open in Follow-ups</a> : <p className="mt-3 text-sm font-semibold text-amber-900">Owner is inactive. Ask a developer to investigate without changing ownership or deleting the receipt.</p>}
        </article>)}</div>
        <Limited total={verifications?.total} shown={verificationItems.length} />
      </Section>
      <p className="text-sm leading-relaxed text-gray-600">Other workflow-specific results stay in <a className="font-semibold underline" href="/pledge-payments">Pledge Payments</a>, <a className="font-semibold underline" href="/import-history">Import History</a>, and <a className="font-semibold underline" href="/submissions">Work Queue</a>. This page does not certify every integration, email delivery, or scheduled job.</p>
    </>}
  </main>;
}
