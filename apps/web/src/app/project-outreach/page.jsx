"use client";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import { useReportConfigurations } from "@/app/reports/useReportConfigurations";
import { isProjectProspecting } from "@/utils/projectProspecting";
import styles from "@/components/reportConfigurationEditor.module.css";
import OutreachPriorities from "@/components/OutreachPriorities";

export default function ProjectOutreachHome() {
  const { configurations, canManage, isPending, error, refetch } =
    useReportConfigurations();
  const projects = configurations.filter(
    (project) => isProjectProspecting(project) && project.canView,
  );
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <SharedReportHeader
          title="Project Outreach"
          description="Query-backed call lists, temporary assignments, and recorded outcomes. Your NXT portfolio stays unchanged."
          backHref="/"
          backLabel="Home"
          action={
            canManage && (
              <a className={styles.button} href="/reports/project-prospecting">
                Manage projects &amp; access
              </a>
            )
          }
        />
        <p><a className={styles.button} href="/tasks">My Tasks</a> Your personal starting point for assigned outreach. Use this area for project setup and team progress.</p>
        <section className={styles.card}>
          <h2>My outreach</h2>
          <p>
            Choose a project to see your assigned people and record what
            happened. Managers can assign callers individually or in bulk.
            Recording an outcome and confirming its NXT action are tracked
            separately.
          </p>
          {canManage && (
            <p>
              For a new list, create a project with its own saved constituent
              query, grant access to the callers, then choose the contact
              columns and deadline in Outreach setup. No list is imported
              automatically.
            </p>
          )}
        </section>
        {isPending && <p role="status">Loading your projects...</p>}
        {error && (
          <div role="alert" className={styles.notice}>
            Projects could not be loaded.{" "}
            <button className={styles.button} onClick={() => refetch()}>
              Try again
            </button>
          </div>
        )}
        {!isPending && !error && !projects.length && (
          <p>
            No shared projects are available. Ask an Admin or Advancement
            Services user to grant you project access.
          </p>
        )}
        {!isPending && !error && projects.length > 0 && (
          <OutreachPriorities projects={projects} />
        )}
      </div>
    </main>
  );
}
