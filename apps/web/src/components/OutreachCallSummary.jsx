import { useState } from "react";
import { OUTREACH_OUTCOMES } from "@/utils/projectOutreach";
import styles from "./projectOutreach.module.css";

export default function OutreachCallSummary({ summary, today, busy, onReview }) {
  const [limit, setLimit] = useState(25);
  const [view, setView] = useState("today");
  if (!summary) return null;
  const entries = view === "today" ? summary.today : summary.unfinished;
  return <section className={styles.callSummary} aria-label="Your call summary">
    <h3>Your call summary</h3>
    <p className={styles.help}>Recorded {today} (Eastern), including earlier visits. Based on saved outcomes, not calls opened or unsaved notes.</p>
    <div className={styles.summaryCounts}>
      <div><strong>{summary.people}</strong><span>People with saved outcomes</span></div>
      <div><strong>{summary.outcomes.reached}</strong><span>Reached</span></div>
      <div><strong>{summary.outcomes.voicemail}</strong><span>Messages left</span></div>
      <div><strong>{summary.followUps}</strong><span>Follow-ups scheduled</span></div>
    </div>
    <p className={styles.help}>People counts use each person's latest outcome today and may overlap. Action counts include every saved outcome.</p>
    <p>{summary.today.length} saved outcomes today: <strong>{summary.statuses.confirmed} confirmed in NXT</strong>, {summary.statuses.draft} saved in app only, {summary.statuses.verification} awaiting verification.</p>
    {!summary.today.length && <p>No outcomes recorded today yet. Existing assignments and history are unchanged.</p>}
    <details>
      <summary>Review saved outcomes{summary.unfinished.length ? ` / ${summary.unfinished.length} unfinished NXT ${summary.unfinished.length === 1 ? "action" : "actions"}` : ""}</summary>
      <label>Show saved outcomes
        <select value={view} disabled={busy} onChange={e => { setView(e.target.value); setLimit(25); }}>
          <option value="today">Recorded today</option>
          <option value="unfinished">Unfinished NXT actions (all dates)</option>
        </select>
      </label>
      <p className={styles.help}>An app-only outcome is saved, not a failed call. Reviewing it does not submit anything. Awaiting verification is not a reason to record a replacement.</p>
      <ul className={styles.summaryList}>
        {entries.slice(0, limit).map(({ task, event }) => <li key={event.id}>
          <div><strong>{task.name}</strong><span>{OUTREACH_OUTCOMES[event.result.outcome] || "Saved outcome"} / {event.result.actionDate}</span>
            <span>{event.state === "confirmed" ? "Confirmed in NXT" : event.state === "draft" ? "Saved in app only" : "Awaiting verification"}</span>
            {event.result.stage === "follow_up" && event.result.nextDate && <span>Follow-up: {event.result.nextDate}</span>}
          </div>
          <button disabled={busy} onClick={e => onReview(task.id, e.currentTarget)}>Review<span className={styles.srOnly}> saved outcomes for {task.name}</span></button>
        </li>)}
      </ul>
      {!entries.length && <p>No saved outcomes in this view.</p>}
      {entries.length > limit && <button disabled={busy} onClick={() => setLimit(value => value + 25)}>Show more saved outcomes</button>}
    </details>
  </section>;
}
