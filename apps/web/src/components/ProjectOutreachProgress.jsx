import {
  OUTREACH_PROGRESS_METRICS,
  outreachProgress,
} from "@/utils/outreachProgress";
import styles from "./projectOutreach.module.css";

export default function ProjectOutreachProgress({
  saved,
  people,
  busy,
  onSelect,
}) {
  const progress = outreachProgress(saved, people);
  if (!progress) return null;
  return (
    <details className={styles.progress}>
      <summary>
        Team progress <span>Saved assignments and action follow-through</span>
      </summary>
      <p className={styles.help}>
        Across this project, independent of list filters. Choose a count to see
        the people behind it. Assignments are grouped by current caller; NXT
        actions by the person who recorded them. Counts can overlap and are not
        added together.
      </p>
      <button
        disabled={busy || !progress.unassigned}
        onClick={(event) =>
          onSelect(
            { metric: "unassigned", label: "Unassigned people" },
            event.currentTarget,
          )
        }
      >
        Unassigned people: {progress.unassigned}
      </button>
      <div className={styles.progressGrid}>
        {progress.callers.map((caller) => (
          <section
            key={caller.id}
            className={styles.progressCaller}
            aria-label={`Progress for ${caller.name}`}
          >
            <h3>{caller.name}</h3>
            {!caller.available && (
              <p className={styles.warning}>
                Not currently available for new assignments. Saved history is
                kept.
              </p>
            )}
            <p className={styles.help}>
              {caller.complete} of {caller.assigned} current assignments
              complete
            </p>
            <progress
              aria-label={`${caller.name}: assignment completion`}
              value={caller.complete}
              max={Math.max(1, caller.assigned)}
            />
            <div className={styles.progressCounts}>
              {Object.entries(OUTREACH_PROGRESS_METRICS).map(
                ([metric, label]) => (
                  <button
                    key={metric}
                    disabled={busy || !caller[metric]}
                    aria-label={`${caller.name}: ${label}, ${caller[metric]} ${["draft", "uncertain"].includes(metric) ? (caller[metric] === 1 ? "action" : "actions") : caller[metric] === 1 ? "person" : "people"}`}
                    onClick={(event) =>
                      onSelect(
                        {
                          callerId: caller.id,
                          metric,
                          label: `${caller.name}: ${label}`,
                        },
                        event.currentTarget,
                      )
                    }
                  >
                    <span>{label}</span>
                    <strong>{caller[metric]}</strong>
                  </button>
                ),
              )}
            </div>
          </section>
        ))}
      </div>
      <p className={styles.help}>
        Completed outreach is not the same as an NXT-confirmed action. Drafts
        and verification counts are actions, not unique people; opening a count
        may show fewer people. Only the recording user can submit or verify
        their saved action. This view makes no NXT requests and does not
        reassign anyone.
      </p>
    </details>
  );
}
