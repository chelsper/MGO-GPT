export const QUERY_JOB_MAX_AGE_MS = 30 * 60 * 1000;
export const LEGACY_QUERY_EXPIRY_MESSAGE =
  "The query job expired. Restart this refresh; your previous results are retained.";

export function listQueryExpired(job, now = Date.now()) {
  return Boolean(
    job?.stage === "query" &&
    job.status !== "complete" &&
    now - Date.parse(job.queryStartedAt) > QUERY_JOB_MAX_AGE_MS,
  );
}

export function listQueryRecovery(job, now = Date.now()) {
  const expired = listQueryExpired(job, now);
  const restartRequired = expired || job?.status === "needs_restart";
  // Older releases assigned a fake cooldown to local expiry. Preserve all
  // other delays, particularly provider throttling on an aged query job.
  const localExpiryDelay =
    expired &&
    (job.failureCode === "LIST_QUERY_EXPIRED" ||
      job.message === LEGACY_QUERY_EXPIRY_MESSAGE);
  return {
    restartRequired,
    message: expired
      ? "This query attempt has expired and is not running. Choose Restart refresh to start a new read-only query. Any saved results will stay available."
      : job?.message || "",
    retryAt: localExpiryDelay ? null : job?.retryAt || null,
  };
}
