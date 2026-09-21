import { useEffect, useState } from "react";
import { validatePersonalWorkspace } from "@/utils/personalDashboards";

export async function personalRequest(path, options = {}) {
  const response = await fetch(path, { cache: "no-store", ...options });
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    const message = response.status === 401 ? "Sign in to use your dashboards."
      : response.status === 403 || response.status === 404 ? "This dashboard or metric is unavailable to you."
      : options.method && response.status >= 400 && response.status < 500 && result?.error
        ? result.error : "Saved dashboard data could not be loaded or saved. Please try again.";
    throw new Error(message);
  }
  return result;
}

export function usePersonalDashboards() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [isPending, setPending] = useState(true);
  const [attempt, setAttempt] = useState(0);
  // Owner-specific layouts are not kept in a shared cross-session query cache.
  useEffect(() => {
    const controller = new AbortController();
    setPending(true); setData(null); setError(null);
    personalRequest("/api/reports/personal-dashboards", { signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setData(validatePersonalWorkspace(result)); })
      .catch((failure) => { if (!controller.signal.aborted) setError(failure); })
      .finally(() => { if (!controller.signal.aborted) setPending(false); });
    return () => controller.abort();
  }, [attempt]);
  return { data, setData, error, isPending, refetch: () => setAttempt((value) => value + 1) };
}

export async function savePersonalDashboards(workspace) {
  return validatePersonalWorkspace(await personalRequest("/api/reports/personal-dashboards", {
    method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(workspace),
  }));
}
