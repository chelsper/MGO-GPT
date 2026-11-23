"use client";
import { useReportConfigurations } from "@/app/reports/useReportConfigurations";
import OutreachPriorities from "@/components/OutreachPriorities";
import { isProjectProspecting } from "@/utils/projectProspecting";
import styles from "./tasks.module.css";

export default function TasksPage() {
  const { configurations, canManage, isPending, error, refetch } = useReportConfigurations();
  const projects = configurations.filter(project => isProjectProspecting(project) && project.canView);
  return <main className={styles.page}>
    <header className={styles.header}>
      <a className={styles.home} href="/">Back to Home</a>
      <p className={styles.eyebrow}>MY WORK</p>
      <h1>My Tasks</h1>
      <p>Start with your assigned project calls. See what is due and finish recording work you have already done.</p>
      <p className={styles.note}>These tasks belong to your signed-in account, even when viewing another MGO workspace.</p>
      <nav className={styles.links} aria-label="Task workspaces">
        <a href="/follow-ups">Follow-ups &amp; Discussion</a>
      </nav>
      <p className={styles.note}>Your existing portfolio follow-ups remain in Follow-ups &amp; Discussion. They are not included in the project counts below.</p>
      {canManage && <details className={styles.management}>
        <summary>Team management</summary>
        <p>Setting up projects and assigning callers is separate from your personal calls.</p>
        <a href="/project-outreach">Manage Project Outreach</a>
      </details>}
    </header>
    {isPending && <p role="status">Loading your shared projects...</p>}
    {error && <section className={styles.notice} role="alert">
      <p>Your projects could not be loaded. This does not mean you have no tasks.</p>
      <button onClick={() => refetch()}>Try again</button>
    </section>}
    {!isPending && !error && (projects.length ? <OutreachPriorities projects={projects} fromTasks /> :
      <section className={styles.notice}>
        <h2>No shared outreach projects yet</h2>
        <p>Ask an Admin or Advancement Services user to share a project and assign people to you. Existing portfolio follow-ups are still available above.</p>
      </section>)}
  </main>;
}
