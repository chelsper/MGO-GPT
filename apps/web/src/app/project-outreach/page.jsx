"use client";
import { useReportConfigurations } from "@/app/reports/useReportConfigurations";
import { isProjectProspecting } from "@/utils/projectProspecting";
import styles from "@/app/tasks/tasks.module.css";
import OutreachPriorities from "@/components/OutreachPriorities";

export default function ProjectOutreachHome() {
  const { configurations, canManage, isPending, error, refetch } =
    useReportConfigurations();
  const projects = configurations.filter(
    (project) => isProjectProspecting(project) && project.canView,
  );
  return (
    <main className={styles.page}>
        <header className={styles.header}>
          <a className={styles.home} href="/tasks">Back to My Tasks</a>
          <p className={styles.eyebrow}>OUTREACH</p>
          <h1>Project Outreach</h1>
          <p>Open your assigned calls below. Project setup and team assignments are separate from your personal work.</p>
        </header>
        {isPending && <p role="status">Loading your projects...</p>}
        {error && (
          <div role="alert" className={styles.notice}>
            Projects could not be loaded.{" "}
            <button onClick={() => refetch()}>
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
          <OutreachPriorities projects={projects} fromTasks />
        )}
        {!isPending && !error && canManage && <details className={styles.management}>
          <summary>Project management</summary>
          <p>Choose a project to manage its caller assignments, setup and team progress. These are not your personal call tasks.</p>
          <ul className={styles.projectLinks}>
            {projects.map(project => <li key={project.key}>
              <a href={`/project-outreach/${encodeURIComponent(project.key)}?view=manage`}>Manage {project.title}</a>
            </li>)}
          </ul>
          <a href="/reports/project-prospecting">Manage projects &amp; access in Reports</a>
        </details>}
    </main>
  );
}
