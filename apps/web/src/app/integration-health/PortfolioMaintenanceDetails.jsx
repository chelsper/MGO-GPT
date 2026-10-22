import { useEffect, useRef, useState } from "react";
import PortfolioRefreshProgress from "../my-top-prospects/PortfolioRefreshProgress";
import usePortfolioRefreshRunner from "@/utils/usePortfolioRefreshRunner";

export default function PortfolioMaintenanceDetails({ workspaceId }) {
  const [state, setState] = useState(null);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(false);
  const [startedHere, setStartedHere] = useState(false);
  const [readAttempt, setReadAttempt] = useState(0);
  const mounted = useRef(false);
  const busy = useRef(false);
  const url = `/api/blackbaud/portfolio-refresh?adminWorkspaceId=${encodeURIComponent(workspaceId)}`;
  useEffect(() => {
    mounted.current = true;
    setState(null); setError(null);
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 20000);
    fetch(url, { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("Maintenance details could not be read. Check your admin access and reload.");
      const value = await response.json();
      if (mounted.current) setState(value);
    }).catch(err => { if (mounted.current && (timedOut || err.name !== "AbortError")) setError(timedOut ? new Error("Reading saved status timed out. Reload to try again.") : err); })
      .finally(() => clearTimeout(timer));
    return () => { mounted.current = false; clearTimeout(timer); controller.abort(); };
  }, [url, readAttempt]);
  async function run(body) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError(null);
    try {
      const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Maintenance request failed.");
      const saved = await fetch(url, { cache: "no-store" });
      if (!saved.ok) throw new Error("Request accepted, but status could not be reloaded. Reload before trying again.");
      const next = await saved.json();
      if (mounted.current) { setState(next); setStartedHere(true); }
    } catch (err) { if (mounted.current) setError(err); }
    finally { busy.current = false; if (mounted.current) setPending(false); }
  }
  usePortfolioRefreshRunner({ job: state?.job, enabled: startedHere, serverManaged: state?.serverManaged === true,
    isPending: pending, error, onProcess: run });
  if (!state) return <div className="mt-3 text-sm"><p role="status">{error?.message || "Reading saved maintenance details..."}</p>
    {error && <button type="button" className="min-h-11 font-semibold text-indigo-700 hover:underline" onClick={() => setReadAttempt(value => value + 1)}>Reload maintenance status</button>}</div>;
  return <div className="mt-3"><button type="button" disabled={pending} className="mb-3 min-h-11 font-semibold text-indigo-700 hover:underline"
    onClick={() => setReadAttempt(value => value + 1)}>Reload maintenance status</button><PortfolioRefreshProgress technical isAdmin state={state} error={error} isPending={pending}
    onStart={mode => run({ action: "start", mode })}
    onResume={() => run({ action: "resume", jobId: state.job?.jobId })}
    onRetryFailures={() => run({ action: "retry_failed", jobId: state.job?.jobId })}
    onCancel={() => run({ action: "cancel", jobId: state.job?.jobId })} /></div>;
}
