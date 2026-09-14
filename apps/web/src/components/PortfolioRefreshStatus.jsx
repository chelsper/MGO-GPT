export default function PortfolioRefreshStatus({ state, isPending, error, children }) {
  const inventory = state?.inventory;
  const job = state?.job;
  const validCounts = inventory && [inventory.total, inventory.current, inventory.stale, inventory.failed]
    .every((count) => Number.isInteger(count) && count >= 0);
  const settled = !job || (["completed", "cancelled"].includes(job.status) && job.failedCount === 0);
  const healthy = validCounts && settled && !isPending && !error &&
    inventory.current === inventory.total && inventory.stale === 0 && inventory.failed === 0;

  // Never collapse unfinished work or errors, even when older snapshots are current.
  if (!healthy) return children;

  return <details key={`${job?.workspaceUserId || "workspace"}:${job?.jobId || "saved"}`}
    className="rounded-lg border border-gray-200 bg-gray-50 text-sm">
    <summary className="cursor-pointer px-3 py-2 text-gray-600 marker:text-gray-400">
      <span className="font-semibold text-emerald-800">{inventory.total ? "Portfolio summaries up to date" : "No portfolio summaries to refresh"}</span>{" "}
      <span className="ml-3 inline-block whitespace-nowrap text-xs font-semibold text-indigo-700">Refresh options</span>
    </summary>
    <div className="border-t border-gray-200 p-2 sm:p-3">{children}</div>
  </details>;
}
