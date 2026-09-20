import { Clock3, RefreshCw } from "lucide-react";
import styles from "./listReport.module.css";
import controls from "./reportConfigurationEditor.module.css";

function savedTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Date unavailable"
    : date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone: "America/New_York",
        timeZoneName: "short",
      });
}

export default function ListRefreshStatus({
  snapshot,
  queryOutput,
  job,
  refreshing,
  error,
}) {
  const active =
    (refreshing || job?.busy) &&
    !["needs_restart", "needs_configuration", "complete"].includes(job?.status);
  const saved = snapshot || queryOutput;
  let message = "Saved results";
  if (active)
    message =
      job?.stage === "fundraisers"
        ? "Updating fundraiser details..."
        : "Updating list...";
  else if (error || ["paused", "needs_restart"].includes(job?.status))
    message = saved
      ? "Showing saved results. Refresh paused."
      : "Refresh paused. Try again when ready.";
  else if (!snapshot && queryOutput) message = "Fundraiser details pending";
  else if (job?.status === "needs_configuration")
    message = "List setup pending";
  else if (!saved) message = "Ready for your first refresh";
  return (
    <div className={styles.statusBar} aria-label="List status">
      <p className={styles.statusText} role="status">
        {active ? (
          <RefreshCw size={15} aria-hidden="true" />
        ) : (
          <Clock3 size={15} aria-hidden="true" />
        )}
        {message}
        {active &&
          job?.stage === "fundraisers" &&
          job.total != null &&
          ` ${job.checked} of ${job.total}`}
      </p>
      {saved && (
        <p>
          {snapshot ? "Updated" : "Query retrieved"}{" "}
          <time dateTime={saved.generatedAt}>
            {savedTime(saved.generatedAt)}
          </time>
        </p>
      )}
    </div>
  );
}

export function ListRefreshDetails({
  report,
  snapshot,
  queryOutput,
  job,
  busy,
  refreshing,
  error,
  reload,
  refresh,
  children,
}) {
  if (!report.canConfigure) return null;
  const needsConfiguration = job?.status === "needs_configuration";
  function restart() {
    if (
      window.confirm(
        "Start a new read-only query refresh? Your last complete saved list will remain available. No constituent records will be changed.",
      )
    )
      refresh(true);
  }
  return (
    <details className={styles.diagnostics}>
      <summary>List settings &amp; status</summary>
      <div className={styles.diagnosticBody}>
        <strong>Administrator details</strong>
        <p>
          Opening, searching, and sorting use saved data only. Refresh reads NXT
          in small batches while this page stays open. Saved results remain
          available.
        </p>
        {snapshot?.leadAsOf && (
          <p>
            Current lead assignments checked as of {snapshot.leadAsOf}{" "}
            (Eastern). A blank lead means no matching current lead assignment
            was found.
          </p>
        )}
        {job?.message && job.status !== "complete" && <p>{job.message}</p>}
        {error && <p>{error}</p>}
        {needsConfiguration && queryOutput && (
          <p>Returned output fields: {queryOutput.headers.join(", ")}</p>
        )}
        {!needsConfiguration && job?.retryAt && (
          <p>A new refresh can start after {savedTime(job.retryAt)}.</p>
        )}
        <div className={styles.diagnosticActions}>
          <a className={controls.button} href="/report-configurations">
            Configure list
          </a>
          <button
            className={controls.button}
            disabled={refreshing}
            onClick={reload}
          >
            Reload status
          </button>
          {needsConfiguration &&
            report.dataConfiguration.source === "saved_query" && (
              <button
                className={controls.button}
                disabled={busy}
                onClick={restart}
              >
                Refresh query output
              </button>
            )}
          {job?.status === "paused" && (
            <button
              className={controls.button}
              disabled={busy}
              onClick={restart}
            >
              Restart unfinished refresh
            </button>
          )}
        </div>
        {children}
      </div>
    </details>
  );
}
