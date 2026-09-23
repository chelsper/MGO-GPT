import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

export default function OpportunityRefresh({ prospectId, hasLinkedOpportunities, editing }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const busy = useRef(false);
  const generation = useRef(0);

  async function refresh(force = false) {
    if (busy.current || editing || !hasLinkedOpportunities) return;
    const run = ++generation.current;
    busy.current = true;
    setStatus("checking");
    try {
      const response = await fetch(`/api/prospects/${prospectId}/opportunities/refresh${force ? "?force=1" : ""}`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error("Refresh unavailable");
      if (run !== generation.current) return;
      setStatus(result.status || "unavailable");
      if (result.total > 0 || result.changed > 0) {
        await queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
      }
      if (result.changed > 0 || result.reconciled) {
        for (const key of ["prospects", "prospect-summary-base", "prospect-summary-closed", "blackbaud-portfolio"]) {
          queryClient.invalidateQueries({ queryKey: [key] });
        }
      }
    } catch {
      if (run === generation.current) setStatus("unavailable");
    } finally {
      if (run === generation.current) busy.current = false;
    }
  }

  useEffect(() => {
    refresh();
    return () => { generation.current++; busy.current = false; };
  }, [prospectId, hasLinkedOpportunities]);

  if (!hasLinkedOpportunities) return null;
  const message = status === "checking" ? "Checking linked opportunities in NXT..."
    : status === "current" ? "Linked opportunities checked. Recent NXT stage changes can take about 10 minutes to appear."
      : status === "deferred" ? "Saved details shown. Some checks are waiting; try again shortly."
        : status === "unavailable" ? "Saved details shown. NXT could not be checked right now."
          : "Saved opportunity details.";
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500">
      <span role="status">{editing ? "Finish or cancel your edit before checking NXT." : message}</span>
      <button type="button" disabled={editing || status === "checking"}
        onClick={() => refresh(true)} className="rounded-lg border border-indigo-200 px-3 py-2 font-semibold text-indigo-700 disabled:opacity-50">
        {status === "checking" ? "Checking NXT..." : "Check NXT updates"}
      </button>
    </div>
  );
}
