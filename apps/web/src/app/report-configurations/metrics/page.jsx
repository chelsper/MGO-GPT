"use client";
import { useEffect, useState } from "react";
import ReportMetricLibrary from "@/components/ReportMetricLibrary";

export default function MetricLibraryPage() {
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState("");
  const [denied, setDenied] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(""); setDenied(false); setPayload(null);
    fetch("/api/reports/metrics?manage=1", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) { if (!controller.signal.aborted) setDenied(true); return; }
        const result = await response.json();
        if (!response.ok || result.canManage !== true) throw new Error("Unavailable");
        if (!controller.signal.aborted) setPayload(result);
      }).catch(() => { if (!controller.signal.aborted) setError("The metric library could not be loaded. Try again."); });
    return () => controller.abort();
  }, [attempt]);
  if (payload) return <ReportMetricLibrary initialPayload={payload} />;
  return <main style={{ padding: 32 }}><a href="/report-configurations">Back to Report Access &amp; Configurations</a><h1>Metric Library</h1>
    {denied ? <p>Sign in as an Admin or Advancement Services user to manage metrics.</p>
      : error ? <><p role="alert">{error}</p><button onClick={() => setAttempt((value) => value + 1)}>Try again</button></>
      : <p role="status">Loading metric library...</p>}
  </main>;
}
