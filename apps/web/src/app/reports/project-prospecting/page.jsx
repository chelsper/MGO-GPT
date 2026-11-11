"use client";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import { useReportConfigurations } from "@/app/reports/useReportConfigurations";
import { getReportHref } from "@/app/api/utils/reportRegistry";
import { isProjectProspecting, PROJECT_SECTION } from "@/utils/projectProspecting";
import styles from "@/components/reportConfigurationEditor.module.css";

export default function ProjectProspectingPage() {
  const { configurations, visibleReports, canManage, isPending, error, refetch } = useReportConfigurations();
  const projects = configurations.filter(isProjectProspecting);
  return <main className={styles.page}><div className={styles.container}>
    <SharedReportHeader activeReportKey={PROJECT_SECTION} title="Project Prospecting"
      description="Shared prospect lists for your projects. Tags stay in the app; adding a person applies the project's configured membership field in NXT."
      accessibleReports={visibleReports} action={canManage && <a className={styles.button} href="/report-configurations?newProject=1">Add project</a>} />
    {isPending && <p role="status">Loading your projects...</p>}
    {error && <div role="alert" className={styles.notice}>Projects could not be loaded. <button className={styles.button} onClick={() => refetch()}>Try again</button></div>}
    {!isPending && !error && !projects.length && <section className={styles.card}><h2>No projects available yet</h2><p>An administrator or Advancement Services can grant you access to a project.</p></section>}
    {!error && <div className={styles.grid}>{projects.map(project => <article key={project.key} className={styles.card}>
      <span className={styles.tag}>{project.active ? "Shared project" : "Setup needed"}</span>
      <h2 className={styles.listTitle}>{project.title}</h2><p>{project.description}</p>
      <p className={styles.muted}>Saved NXT query {project.dataConfiguration.queryId || "not selected"}. Everyone granted access can create and apply tags.</p>
      {project.canView ? <a className={styles.button} href={getReportHref(project)}>Open project</a> : <p>Select viewers and enable this project before opening its data.</p>}
      {canManage && <a className={styles.button} href={`/report-configurations?report=${encodeURIComponent(project.key)}&tab=${project.active ? "Configure" : "Access"}`}>Project settings</a>}
    </article>)}</div>}
  </div></main>;
}
