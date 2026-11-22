import { useEffect, useState } from "react";
import { requestProjectOutreach } from "@/utils/projectOutreachRequest";
import {
  PRIORITY_COUNTS,
  prioritizeOutreachProjects,
  validateOutreachPriorities,
} from "@/utils/outreachPriorities";
import styles from "./outreachPriorities.module.css";

export default function OutreachPriorities({ projects, fromTasks = false }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [filter, setFilter] = useState("all");
  const projectKeys = JSON.stringify(
    projects.map((project) => project.key).sort(),
  );
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setSummary(null);
    setError("");
    requestProjectOutreach("/api/project-outreach/priorities", {
      signal: controller.signal,
    })
      .then(validateOutreachPriorities)
      .then((value) => {
        if (!controller.signal.aborted) setSummary(value);
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setError(
            "Saved priorities are unavailable right now. You can still open a project below.",
          );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [projectKeys, reload]);
  const effectiveFilter = summary?.canRecord ? filter : "all";
  const ordered = prioritizeOutreachProjects(
    projects,
    summary,
    effectiveFilter,
  );
  const available = prioritizeOutreachProjects(projects, summary).filter(
    (project) => project.priorities,
  );
  const total = (key) =>
    available.reduce((sum, project) => sum + project.priorities[key], 0);
  return (
    <section className={styles.section} aria-label="My outreach priorities">
      <div className={styles.heading}>
        <div>
          <h2>{fromTasks ? "Project call assignments" : "My priorities"}</h2>
          <p>
            Your saved workload across shared projects. No NXT refresh or action
            submission.
          </p>
        </div>
        <button
          disabled={loading}
          onClick={() => setReload((value) => value + 1)}
        >
          Reload saved priorities
        </button>
      </div>
      {loading && <p role="status">Loading saved priorities...</p>}
      {error && <p role="alert">{error}</p>}
      {summary?.canRecord && (
        <>
          {available.length === projects.length && (
            <div className={styles.totals}>
              <div>
                <span>Overdue assignments</span>
                <strong>{total("overdue")}</strong>
              </div>
              <div>
                <span>Due today</span>
                <strong>{total("today")}</strong>
              </div>
              <div>
                <span>Finish recording in NXT</span>
                <strong>{total("drafts") + total("verification")}</strong>
              </div>
            </div>
          )}
          <p className={styles.help}>
            Saved status checked {new Date(summary.checkedAt).toLocaleString()}.
            Due dates use {summary.today} (Eastern).
          </p>
          <p className={styles.help}>
            Assignments are counted per project, not as unique people across
            projects. NXT counts are your recorded actions, including after
            reassignment; they do not mean another call is due. Open a project
            to review its saved list and check current contact preferences
            before calling.
          </p>
          <label className={styles.filter}>
            Show projects
            <select
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            >
              <option value="all">All shared projects</option>
              <option value="overdue">With my overdue assignments</option>
              <option value="today">With my assignments due today</option>
              <option value="actions">With my unfinished NXT actions</option>
              <option value="upcoming">With my upcoming assignments</option>
            </select>
          </label>
          {available.length < projects.length && (
            <p role="status">
              Some projects have no current workload summary. Open the project
              to check its saved status.
            </p>
          )}
        </>
      )}
      {summary && !summary.canRecord && (
        <p>
          Your account has viewing access. Open a shared project to review
          outreach.
        </p>
      )}
      {!ordered.length && (
        <p role="status">
          No projects match this view. Choose All shared projects to see the
          other lists.
        </p>
      )}
      <div className={styles.projects}>
        {ordered.map((project) => (
          <article key={project.key} className={styles.project}>
            <h3>{project.title}</h3>
            <p>{project.description}</p>
            {summary?.canRecord &&
              (project.priorities ? (
                <>
                  <dl className={styles.counts}>
                    {Object.entries(PRIORITY_COUNTS).map(([key, label]) => (
                      <div key={key}>
                        <dt>{label}</dt>
                        <dd>{project.priorities[key]}</dd>
                      </div>
                    ))}
                  </dl>
                  {!project.priorities.open &&
                    !project.priorities.drafts &&
                    !project.priorities.verification && (
                      <p className={styles.help}>
                        No open assignments or unfinished NXT actions saved for
                        you in this project.
                      </p>
                    )}
                </>
              ) : (
                <p className={styles.help}>Workload summary unavailable.</p>
              ))}
            <div className={styles.actions}>
              {fromTasks && summary?.canRecord && project.priorities?.open > 0 && (
                <a href={`/project-outreach/${encodeURIComponent(project.key)}?from=tasks&start=calls`}>
                  Start / continue my calls
                  <span className={styles.srOnly}> for {project.title}</span>
                </a>
              )}
              <a className={fromTasks ? styles.secondary : undefined} href={`/project-outreach/${encodeURIComponent(project.key)}${fromTasks ? "?from=tasks" : ""}`}>
                {fromTasks ? "View project" : "Open outreach"}
                <span className={styles.srOnly}> for {project.title}</span>
              </a>
            </div>
            {fromTasks && summary?.canRecord && project.priorities?.open > 0 && (
              <p className={styles.help}>
                Opens your next eligible person from saved assignments. Nothing
                is recorded or submitted until you save an outcome.
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
