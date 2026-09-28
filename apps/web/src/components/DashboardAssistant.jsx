import { lazy, Suspense, useId, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useDashboardAssistantSettings } from "./WorkspaceTerminology";
import DashboardAssistantAvatar from "./DashboardAssistantAvatar";
import GiftDocumentationCheck from "./GiftDocumentationCheck";
import OutreachDraft from "./OutreachDraft";
import { priorityDraftContext } from "@/utils/outreachDrafts";
import { formatCalendarDate } from "@/utils/prospectActivity";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import { dashboardReminderPolicy } from "@/utils/dashboardAssistantSettings";
import "./DashboardAssistant.css";

const GiftFollowUpDialog = lazy(() => import("./GiftFollowUpDialog"));

export default function DashboardAssistant({ viewerId, workspaceId }) {
  const settings = useDashboardAssistantSettings();
  // A scope change unmounts all open panels, cached notices, and in-flight UI.
  if (!settings.enabled || !viewerId || !workspaceId) return null;
  return <AssistantPanel key={`${viewerId}:${workspaceId}`} viewerId={String(viewerId)} workspaceId={String(workspaceId)} settings={settings} />;
}

function AssistantPanel({ viewerId, workspaceId, settings }) {
  const [open, setOpen] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [kind, setKind] = useState("all");
  const [limit, setLimit] = useState(5);
  const [notice, setNotice] = useState("");
  const [followUpGift, setFollowUpGift] = useState(null);
  const id = useId();
  const heading = useRef(null);
  const url = `/api/dashboard-priorities?workspaceId=${encodeURIComponent(workspaceId)}`;
  const query = useQuery({
    queryKey: ["dashboard-priorities", viewerId, workspaceId],
    enabled: open, staleTime: 0, gcTime: 0, retry: false, refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => {
      const result = await fetch(url, { signal, cache: "no-store" });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload?.error || "Reminders are unavailable. Please try again.");
      if (payload.viewerId !== viewerId || payload.workspaceUserId !== workspaceId) throw new Error("Your workspace changed. Reload your dashboard.");
      return payload;
    },
  });
  const mutation = useMutation({
    mutationFn: async ({ item, action, days }) => {
      const result = await fetch(url, { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: item.key, revision: item.revision, action, ...(days ? { days } : {}) }) });
      const payload = await result.json();
      if (!result.ok) throw new Error(payload?.error || "That choice could not be saved. Please try again.");
    },
    onSuccess: async (_, { action, item }) => {
      setNotice(action === "restore" ? "Reminder restored." : action === "snooze" ? "Reminder snoozed. The record's date has not changed." : item.kind === "gift"
        ? "Gift reminder dismissed for you. Nothing was sent or marked thanked."
        : "Reminder dismissed for you. The record is still open.");
      await query.refetch();
      heading.current?.focus();
    },
  });
  const choose = (item, action, days) => { setNotice(""); mutation.mutate({ item, action, days }); };
  const busy = mutation.isPending || query.isFetching;
  const allRecords = query.data ? (showHidden ? query.data.hidden : query.data.items) : [];
  const records = allRecords.filter(item => kind === "all" || item.kind === kind);
  const failed = query.isError || mutation.isError;
  const policy = dashboardReminderPolicy(query.data?.reminderPolicy || settings);

  return <section className="dashboard-assistant" aria-label={`${settings.name}, dashboard helper`}>
    <button type="button" className="dashboard-assistant-launcher" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <DashboardAssistantAvatar avatar={settings.avatar} />
      <span><strong>Check in with {settings.name}</strong><span>A few things worth a look, when you're ready.</span></span>
      <span className="dashboard-assistant-toggle" aria-hidden="true">{open ? "Close" : "Take a look"}</span>
    </button>
    {open && <div id={id} className="dashboard-assistant-panel">
      <header>
        <div><h2 ref={heading} tabIndex={-1}>Let's look at what's coming up</h2>
          <p>{query.data?.workspaceName ? `${query.data.workspaceName}'s workspace. ` : ""}Reminders use saved follow-ups, opportunity dates, and recent gifts. Documentation checks run only when you ask.</p></div>
        <button type="button" onClick={() => { mutation.reset(); setNotice(""); query.refetch(); }} disabled={busy}>Reload reminders</button>
      </header>
      <p className="dashboard-assistant-note">You decide what to do next. Nothing is sent or changed automatically. Snooze and dismiss are private to you in this workspace; updated details can bring a reminder back.</p>
      {query.isPending && <p role="status">Looking at your saved records...</p>}
      {failed && <p role="alert">{query.error?.message || mutation.error?.message}</p>}
      {notice && !failed && <p role="status" className="dashboard-assistant-notice">{notice}</p>}
      {query.data && !query.isError && <>
        {query.data.giftCoverage && <details className="dashboard-assistant-note dashboard-assistant-coverage">
          <summary>About gift suggestions</summary>
          <p>Direct monetary gifts over ${policy.giftMinimum.toLocaleString("en-US")} from the past {policy.recentGiftDays} {policy.recentGiftDays === 1 ? "day" : "days"}, including today, one reminder per gift. Pledges, soft credits, and non-cash gifts are not included. This does not tell us whether someone has already been thanked; check their history before adding an action.</p>
          <p>{query.data.giftCoverage.status === "unavailable"
            ? "Recent gift data isn't available for this workspace yet. Suggestions will appear after the regular background checks have saved fresh gift and portfolio information. Opening this panel does not start a refresh."
            : `Gift data checked ${formatCalendarDate(query.data.giftCoverage.checkedAt?.slice(0, 10))}. Available dates: ${formatCalendarDate(query.data.giftCoverage.startDate)} through ${formatCalendarDate(query.data.giftCoverage.endDate)}. Later gifts may not be included yet.`}</p>
        </details>}
        <div className="dashboard-assistant-tabs" aria-label="Reminder view">
          <button type="button" aria-pressed={!showHidden} onClick={() => { setShowHidden(false); setLimit(5); }}>To review ({query.data.items.length})</button>
          <button type="button" aria-pressed={showHidden} onClick={() => { setShowHidden(true); setLimit(5); }}>Snoozed & dismissed ({query.data.hidden.length})</button>
        </div>
        <label className="dashboard-assistant-filter">Show
          <select value={kind} onChange={event => { setKind(event.target.value); setLimit(5); }}>
            <option value="all">All reminders</option><option value="follow-up">Follow-ups</option>
            <option value="opportunity">Opportunities</option><option value="gift">Recent gifts</option>
          </select>
        </label>
        {!records.length && <p className="dashboard-assistant-empty">{kind !== "all" ? "No reminders in this view." : showHidden ? "No reminders tucked away." : query.data.hidden.length
          ? "No reminders to review here. Your snoozed and dismissed items are still available."
          : "Nothing in the available saved records needs attention here right now."}</p>}
        {kind === "gift" && !records.length && query.data.giftCoverage?.status === "unavailable" && <p className="dashboard-assistant-note">Gift suggestions are waiting for the regular background checks. This doesn't mean there were no gifts.</p>}
        <ul className="dashboard-assistant-list">{records.slice(0, limit).map(item => <li key={item.key}>
          <div className="dashboard-assistant-timing">{item.hiddenReason === "dismissed" ? "Dismissed" : item.hiddenReason === "snoozed" ? `Snoozed until ${formatCalendarDate(item.snoozeUntil)}` : item.timing}</div>
          <h3>{item.constituentName}</h3><p className="dashboard-assistant-title">{item.title}</p><p>{item.message}</p>
          {item.kind === "gift" && item.followUp && <div className="dashboard-assistant-follow-up">
            <strong>{item.followUp.status === "Done" ? "Follow-up completed" : "Follow-up planned"}</strong>
            <p>{item.followUp.title}</p>
            <p>{item.followUp.ownerName}{item.followUp.dueDate
              ? ` \u00b7 ${item.followUp.status === "Done" ? "Due date was" : "Due"} ${formatCalendarDate(item.followUp.dueDate, { month: "short", day: "numeric", year: "numeric" })}`
              : " \u00b7 No due date"}</p>
            {item.followUp.status === "Done" && <p className="dashboard-assistant-note">This task is marked complete in the app. It doesn't confirm a thank-you was sent or an NXT action was logged.</p>}
          </div>}
          {item.kind === "gift" && item.giftAmount >= policy.majorGiftMinimum && !showHidden && <GiftDocumentationCheck
            key={item.revision} item={item} viewerId={viewerId} workspaceId={workspaceId} />}
          <div className="dashboard-assistant-actions">
            {item.kind === "gift" && (item.followUp
              ? <a href={`/follow-ups?tab=next-steps&nextStepId=${encodeURIComponent(item.followUp.id)}&status=${encodeURIComponent(item.followUp.status)}`}
                  aria-label={`View follow-up: ${item.followUp.title} for ${item.constituentName}`}>View follow-up</a>
              : !showHidden && query.data.canCreateFollowUp && <button type="button" disabled={busy} onClick={() => setFollowUpGift(item)}>Create a stewardship follow-up</button>)}
            {!showHidden && <OutreachDraft context={priorityDraftContext(item)}
              label={item.kind === "gift" ? "Draft a thank-you" : "Prepare for a conversation"} />}
            <a href={item.href} aria-label={`${item.linkLabel}: ${item.title} for ${item.constituentName}`}>{item.linkLabel}</a>
            {item.kind === "gift" && <a href={buildBlackbaudConstituentProfileUrl(item.constituentId)} target="_blank" rel="noopener noreferrer">Review donor in NXT<span className="sr-only"> (opens in a new tab)</span></a>}
            {showHidden ? <button type="button" disabled={busy} onClick={() => choose(item, "restore")}>Restore reminder</button> : <>
              <details><summary>Snooze</summary><div className="dashboard-assistant-snooze">
                <button type="button" disabled={busy} onClick={() => choose(item, "snooze", 1)}>Until tomorrow</button>
                <button type="button" disabled={busy} onClick={() => choose(item, "snooze", 7)}>For one week</button>
              </div></details>
              <button type="button" disabled={busy} onClick={() => choose(item, "dismiss")}>Dismiss reminder</button>
            </>}
          </div>
        </li>)}</ul>
        {records.length > limit && <button type="button" onClick={() => setLimit(limit + 5)}>Show five more</button>}
        {query.data.truncated && <p className="dashboard-assistant-note">This is a limited selection from a large workspace. Use Follow-ups & Discussion, the Opportunity Pipeline, or your giving reports for the full picture.</p>}
      </>}
    </div>}
    {followUpGift && <Suspense fallback={<p role="status">Opening follow-up...</p>}>
      <GiftFollowUpDialog key={`${followUpGift.key}:${followUpGift.revision}`} item={followUpGift} viewerId={viewerId} workspaceId={workspaceId}
        onClose={() => setFollowUpGift(null)} />
    </Suspense>}
  </section>;
}
