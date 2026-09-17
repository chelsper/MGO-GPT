const RECENT_PROGRESS_MS = 15 * 60 * 1000;

export default function PortfolioRefreshStatus({
  state,
  isPending,
  error,
  children,
}) {
  const inventory = state?.inventory;
  const job = state?.job;
  const validCounts =
    inventory &&
    [
      inventory.total,
      inventory.current,
      inventory.stale,
      inventory.failed,
    ].every((count) => Number.isInteger(count) && count >= 0);
  const settled =
    !job ||
    (["completed", "cancelled"].includes(job.status) && job.failedCount === 0);
  const summariesCurrent =
    validCounts &&
    inventory.current === inventory.total &&
    inventory.stale === 0 &&
    inventory.failed === 0;
  const healthy = summariesCurrent && settled && !isPending && !error;
  const backgroundJob =
    job?.mode === "nightly" && ["queued", "processing"].includes(job.status);
  const progressAge = Date.now() - Date.parse(job?.updatedAt || "");
  const recentProgress =
    Number.isFinite(progressAge) &&
    progressAge >= 0 &&
    progressAge < RECENT_PROGRESS_MS;
  const validProgress =
    job &&
    [
      job.totalCount,
      job.processedCount,
      job.successCount,
      job.failedCount,
    ].every((count) => Number.isInteger(count) && count >= 0) &&
    job.totalCount > 0 &&
    job.processedCount <= job.totalCount &&
    job.successCount === job.processedCount &&
    job.failedCount === 0 &&
    !job.failedItems?.length;
  // Every automatic batch sets isPending. Do not reopen the panel on each batch.
  const quietBackground =
    backgroundJob &&
    summariesCurrent &&
    inventory.total > 0 &&
    validProgress &&
    recentProgress &&
    !error;

  // Pauses, failures, missing/stale summaries and unverified progress stay visible.
  if (!healthy && !quietBackground)
    return (
      <>
        {backgroundJob && !recentProgress && !error ? (
          <p role="status" className="text-sm text-amber-800">
            Background refresh progress needs checking. No recent saved progress
            is available; this does not by itself mean the refresh failed. Saved
            data remains available.
          </p>
        ) : null}
        {children}
      </>
    );

  return (
    <details
      key={`${job?.workspaceUserId || "workspace"}:${job?.jobId || "saved"}:${quietBackground ? "background" : "settled"}`}
      className="rounded-lg border border-gray-200 bg-gray-50 text-sm"
    >
      <summary className="cursor-pointer px-3 py-2 text-gray-600 marker:text-gray-400">
        <span className="font-semibold text-emerald-800">
          {quietBackground
            ? "Saved summaries ready"
            : inventory.total
              ? "Portfolio summaries up to date"
              : "No portfolio summaries to refresh"}
        </span>{" "}
        {quietBackground ? (
          <span className="ml-3 inline-block">
            Background giving check: {job.processedCount} of {job.totalCount}{" "}
            checked. You can keep working.
          </span>
        ) : null}
        <span className="ml-3 inline-block whitespace-nowrap text-xs font-semibold text-indigo-700">
          {quietBackground ? "Refresh details" : "Refresh options"}
        </span>
      </summary>
      <div className="border-t border-gray-200 p-2 sm:p-3">{children}</div>
    </details>
  );
}
