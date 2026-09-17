import PortfolioRefreshStatus from "@/components/PortfolioRefreshStatus";
import { smallActionButton } from "./prospectPresentation";

export default function PortfolioRefreshProgress({
  state,
  isPending,
  error,
  isAdmin,
  onStart,
  onResume,
  onRetryFailures,
  onCancel,
}) {
  const job = state?.job || null;
  const inventory = state?.inventory || null;
  const active = ["queued", "processing"].includes(job?.status);
  const paused = job?.status === "paused";
  const completed = ["completed", "completed_with_failures"].includes(job?.status);
  const processed = Number(job?.processedCount || 0);
  const total = Number(job?.totalCount || 0);
  const percent = total > 0 ? Math.min(100, Math.round((processed / total) * 100)) : 0;

  return (
    <PortfolioRefreshStatus state={state} isPending={isPending} error={error}>
    <div
      style={{
        border: "1px solid #BFDBFE",
        borderRadius: "12px",
        backgroundColor: "#EFF6FF",
        padding: "14px",
        display: "grid",
        gap: "10px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <div style={{ color: "#1E3A8A", fontSize: "14px", fontWeight: 800 }}>
            {job?.mode === "nightly" ? "Nightly portfolio maintenance" : "Cached intelligence refresh"}
          </div>
          <div style={{ marginTop: "3px", color: "#475569", fontSize: "12px" }}>
            {inventory
              ? `${inventory.total} prospects · ${inventory.current} current · ${inventory.stale} stale · ${inventory.failed} failed`
              : "Checking cached portfolio summaries..."}
          </div>
          <div style={{ marginTop: "5px", color: "#475569", fontSize: "12px" }}>
            Assignments and giving refresh overnight. Full summaries refresh every seven days,
            sooner for detected giving or local proposal changes, or when you refresh one manually.
            Saved data stays visible while updates run.
          </div>
        </div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {!active && !paused ? (
            <button
              type="button"
              onClick={() => onStart("stale")}
              disabled={isPending || !inventory?.stale}
              style={{
                border: "1px solid #2563EB",
                borderRadius: "9px",
                backgroundColor: isPending || !inventory?.stale ? "#DBEAFE" : "#2563EB",
                color: isPending || !inventory?.stale ? "#1D4ED8" : "white",
                padding: "8px 11px",
                fontSize: "12px",
                fontWeight: 800,
                cursor: isPending || !inventory?.stale ? "not-allowed" : "pointer",
              }}
            >
              {inventory?.stale ? `Refresh ${inventory.stale} stale` : "All summaries current"}
            </button>
          ) : null}
          {!active && !paused ? (
            <button type="button" onClick={() => onStart("nightly")} disabled={isPending} style={smallActionButton}>
              Refresh stale giving
            </button>
          ) : null}
          {paused ? (
            <button type="button" onClick={onResume} disabled={isPending || Date.parse(job.pausedUntil || "") > Date.now()} style={smallActionButton}>
              {Date.parse(job.pausedUntil || "") > Date.now() ? "Waiting for Blackbaud" : "Resume now"}
            </button>
          ) : null}
          {completed && Number(job?.failedCount || 0) > 0 ? (
            <button type="button" onClick={onRetryFailures} disabled={isPending} style={smallActionButton}>
              Retry {job.failedCount} failed
            </button>
          ) : null}
          {active || paused ? (
            <button type="button" onClick={onCancel} disabled={isPending} style={smallActionButton}>
              Cancel
            </button>
          ) : null}
        </div>
      </div>

      {job && total > 0 ? (
        <>
          <div style={{ height: "8px", borderRadius: "999px", backgroundColor: "#DBEAFE", overflow: "hidden" }}>
            <div
              style={{
                width: `${percent}%`,
                height: "100%",
                borderRadius: "999px",
                backgroundColor: paused ? "#D97706" : "#2563EB",
                transition: "width 180ms ease",
              }}
            />
          </div>
          <div style={{ color: "#334155", fontSize: "12px", lineHeight: 1.5 }}>
            <strong>{processed} / {total} processed.</strong>{" "}
            {`${Number(job.successCount || 0)} completed · ${Number(job.failedCount || 0)} failed. `}
            {job.status === "processing" || job.status === "queued"
              ? `Currently processing in batches of 10 from checkpoint ${Number(job.currentCursor || 0) + 1}.`
              : paused
                ? `Waiting for Blackbaud's rate limit${job.pausedUntil ? ` until ${new Date(job.pausedUntil).toLocaleString()}` : ""}.`
                : job.status === "cancelled"
                  ? "Refresh cancelled. Saved summaries were preserved."
                  : "Refresh pass completed."}
            {job.lastSuccessfulConstituentId
              ? ` Last successful constituent: ${job.lastSuccessfulConstituentId}.`
              : ""}
          </div>
        </>
      ) : null}

      {paused && !error && Number.isFinite(Date.parse(job.pausedUntil || "")) ? (
        <div role="status" style={{ color: "#92400E", fontSize: "12px", lineHeight: 1.5 }}>
          This refresh will continue automatically after the cooldown while this page is open.
          If you leave, overnight maintenance picks it up. Saved summaries remain available;
          a rate-limit pause does not count as a failed record.
        </div>
      ) : null}

      {isAdmin && job?.failedItems?.length ? (
        <details>
          <summary style={{ cursor: "pointer", color: "#991B1B", fontSize: "12px", fontWeight: 800 }}>
            Restricted failure diagnostics ({job.failedItems.length})
          </summary>
          <div style={{ marginTop: "8px", display: "grid", gap: "5px", color: "#7F1D1D", fontSize: "11px" }}>
            {job.failedItems.map((item) => (
              <div key={`${item.constituentId}-${item.position}`}>
                {item.constituentId}: {item.stage || "unknown stage"} · {item.endpoint || "endpoint unavailable"}
                {item.httpStatus ? ` · HTTP ${item.httpStatus}` : ""} · {item.apiCallCount} API calls · retry {item.retryCount}
              </div>
            ))}
          </div>
        </details>
      ) : null}

      {isAdmin && !active && !paused ? (
        <details>
          <summary style={{ cursor: "pointer", color: "#475569", fontSize: "11px", fontWeight: 700 }}>
            Administrator options
          </summary>
          <button
            type="button"
            onClick={() => onStart("full")}
            disabled={isPending}
            style={{ ...smallActionButton, marginTop: "8px" }}
          >
            Full rebuild
          </button>
        </details>
      ) : null}
      {error ? <div style={{ color: "#991B1B", fontSize: "12px", fontWeight: 700 }}>{error.message}</div> : null}
    </div>
    </PortfolioRefreshStatus>
  );
}
