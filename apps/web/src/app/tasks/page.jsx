"use client";
import { useEffect, useState } from "react";
import { useReportConfigurations } from "@/app/reports/useReportConfigurations";
import AssignedOutreachView from "@/components/AssignedOutreachView";
import { isProjectProspecting } from "@/utils/projectProspecting";
import { requestProjectOutreach } from "@/utils/projectOutreachRequest";
import { prioritizeOutreachProjects, validateOutreachPriorities } from "@/utils/outreachPriorities";
import styles from "./tasks.module.css";

export default function TasksPage() {
  const { configurations, isPending, error: configurationError, refetch } = useReportConfigurations();
  const [summary, setSummary] = useState(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(true), [retry, setRetry] = useState(0), [selected, setSelected] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setSummary(null); setError(""); setLoading(true); setSelected("");
    requestProjectOutreach("/api/project-outreach/workspace", { signal: controller.signal })
      .then(validateOutreachPriorities).then(value => {
        if (!value.workspace) throw new Error("Workspace identity unavailable");
        if (!controller.signal.aborted) setSummary(value);
      }).catch(() => {
        if (!controller.signal.aborted) setError("Your saved assignments could not be loaded. This does not mean you have no tasks.");
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry]);
  const projects = prioritizeOutreachProjects(configurations.filter(p => isProjectProspecting(p) && p.canView), summary)
    .filter(p => p.priorities && (p.priorities.open || p.priorities.drafts || p.priorities.verification));
  const current = projects.find(p => p.key === selected) || projects[0];
  const ready = !isPending && !loading && !configurationError && !error && summary;
  const preview = summary?.workspace?.readOnly;
  return <main className={styles.page}>
    <header className={styles.header}>
      <a className={styles.home} href="/">Back to Home</a>
      <p className={styles.eyebrow}>ASSIGNED OUTREACH</p>
      <h1>{preview ? `${summary.workspace.name}'s Tasks` : "My Tasks"}</h1>
      <p>{preview ? "Read-only workspace preview. These are the selected MGO's assignments, not your personal calls."
        : "Your current call list opens here. Review a person, record what happened, and continue to the next."}</p>
      {preview && <p className={styles.note}>You can preview each person's call details and outcome fields below. Only the assigned caller can record outcomes or submit NXT actions from their own login. No assignments have been changed.</p>}
    </header>
    {(isPending || loading) && <p role="status">Loading the current workspace's saved assignments...</p>}
    {(configurationError || error) && <section className={styles.notice} role="alert">
      <p>{error || "Project access could not be checked. Your saved assignments are kept."}</p>
      <button onClick={() => { refetch(); setRetry(n => n + 1); }}>Reload My Tasks</button>
    </section>}
    {ready && !current && <section className={styles.notice}>
      <h2>No open call assignments</h2>
      <p>{preview ? `No open outreach or unfinished NXT actions are saved for ${summary.workspace.name} in projects shared with both of you.`
        : "No open outreach or unfinished NXT actions are saved for your account. Ask Advancement Services if you expected a call list."}</p>
      <button onClick={() => setRetry(n => n + 1)}>Reload My Tasks</button>
    </section>}
    {ready && current && <>
      {projects.length > 1 && <label className={styles.projectPicker}>Assignment project
        <select value={current.key} onChange={e => {
          if (window.confirm("Switch projects? Save any open outcome first; unsaved edits will not be kept.")) setSelected(e.target.value);
        }}>{projects.map(p => <option key={p.key} value={p.key}>{p.title} ({p.priorities.open} open)</option>)}</select>
      </label>}
      <p className={styles.note}>{current.priorities.open} open assignments. {current.priorities.drafts + current.priorities.verification} NXT updates to finish. Due dates use {summary.today} (Eastern).</p>
      <AssignedOutreachView key={`${summary.workspace.id}:${current.key}`} listKey={current.key} embedded
        previewUserId={preview ? summary.workspace.id : null} />
    </>}
    <nav className={styles.links} aria-label="Other task workspaces">
      <a href="/follow-ups">Follow-ups &amp; Discussion</a>
    </nav>
  </main>;
}
