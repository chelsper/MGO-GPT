const ROOT = "/api/reports/fy-revenue-goals";
export const REVENUE_REFRESH_SOURCES = [
  { key: "reinvestment", label: "Gift re-investment", queryId: "31074", url: ROOT },
  { key: "cash", label: "Budget-relieving cash", queryId: "31075", url: `${ROOT}/budget-cash` },
  { key: "pledges", label: "Pledge installments", queryId: "31076", url: `${ROOT}/budget-pledges` },
];

function waitForNextBatch(signal) {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, 400);
    signal?.addEventListener("abort", abort, { once: true });
  });
}

// Use the existing per-source validation and revision checks. Never publish a
// combined snapshot or bypass the pledge job's resumable balance checks.
export async function refreshRevenueSources({ signal, onData, onProgress, fetcher = fetch, wait = waitForNextBatch }) {
  async function request(url, body) {
    signal?.throwIfAborted();
    const response = await fetcher(url, { cache: "no-store", signal, ...(body ? {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    } : {}) });
    const data = await response.json();
    signal?.throwIfAborted();
    if (!response.ok) throw Object.assign(new Error(data.error || "Could not refresh this source. Its last saved totals are still available."), { status: response.status });
    if (data.canManage !== true) throw Object.assign(new Error("You no longer have permission to refresh this dashboard."), { status: 403 });
    return data;
  }
  const results = [];
  for (const source of REVENUE_REFRESH_SOURCES) {
    onProgress({ ...source, message: `Checking ${source.label.toLowerCase()}...` });
    try {
      let data = await request(source.url);
      onData(source.key, data);
      const settings = data.job?.source || data.source;
      if (!settings) {
        results.push({ ...source, status: "skipped", message: "Not connected. Connect this source below to include it." });
        continue;
      }
      // Resume existing pledge work instead of discarding its checkpoint.
      if (source.key !== "pledges" || !data.job) {
        data = await request(source.url, { operation: "refresh", input: settings, revision: data.revision });
        onData(source.key, data);
      }
      while (source.key === "pledges" && data.job?.status === "running" && !data.job.resumeAfter) {
        onProgress({ ...source, message: `Checking pledge balances: ${data.job.completed} of ${data.job.total} pledges checked.` });
        await wait(signal);
        data = await request(source.url, { operation: "continue", revision: data.revision });
        onData(source.key, data);
      }
      results.push(data.job ? { ...source, status: "attention", message: data.job.resumeAfter
        ? `NXT checks are paused until ${new Date(data.job.resumeAfter).toLocaleString()}. Resume balance checks in the pledge section; previous totals are still shown.`
        : data.job.error || "Pledge checks need attention. Resume or review the saved job below; previous totals are still shown." }
        : { ...source, status: "updated", message: "Updated." });
    } catch (error) {
      if (signal?.aborted || error.name === "AbortError" || [401, 403].includes(error.status)) throw error;
      results.push({ ...source, status: "error", message: error.message });
      if (error.status === 429) {
        for (const remaining of REVENUE_REFRESH_SOURCES.slice(results.length)) {
          results.push({ ...remaining, status: "attention", message: "Not started because NXT requested a pause. Try again after the pause." });
        }
        break;
      }
    }
  }
  return results;
}
