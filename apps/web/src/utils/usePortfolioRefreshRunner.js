import { useEffect } from "react";

const BATCH_DELAY_MS = 3000;
const MAX_TIMEOUT_MS = 2 ** 31 - 1;

export function getPortfolioRefreshDelay(job, now = Date.now()) {
  if (!job?.jobId) return null;
  if (["queued", "processing"].includes(job.status)) return BATCH_DELAY_MS;
  if (job.status !== "paused") return null;
  const deadline = Date.parse(job.pausedUntil || "");
  return Number.isFinite(deadline) ? Math.max(BATCH_DELAY_MS, deadline - now + 250) : null;
}

export default function usePortfolioRefreshRunner({ job, enabled, isPending, error, onProcess }) {
  useEffect(() => {
    if (!enabled || isPending || error) return undefined;
    const delay = getPortfolioRefreshDelay(job);
    if (delay === null) return undefined;
    let timer;
    const schedule = (remaining) => {
      timer = window.setTimeout(() => {
        // Long cooldowns must not overflow the browser timer and retry early.
        const remainingCooldown = Date.parse(job.pausedUntil || "") - Date.now();
        if (job.status === "paused" && remainingCooldown > 0) {
          schedule(remainingCooldown + 250);
        } else {
          onProcess({ action: "process", jobId: job.jobId });
        }
      }, Math.min(remaining, MAX_TIMEOUT_MS));
    };
    schedule(delay);
    return () => window.clearTimeout(timer);
  }, [enabled, isPending, error, onProcess, job?.jobId, job?.status, job?.processedCount, job?.pausedUntil]);
}
