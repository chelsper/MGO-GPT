import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { calendarDate, canRollOpportunityForward, formatCalendarDate } from "@/utils/prospectActivity";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

export default function OpportunityRollover({ opportunity, readOnly, onUpdated }) {
  const [confirming, setConfirming] = useState(false);
  const { fiscalYear } = getStandingsPeriods();
  const mutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/prospects/opportunities/${encodeURIComponent(opportunity.id)}/rollover`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true, expectedDate: calendarDate(opportunity.expected_date), fiscalYear: fiscalYear.label }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || "Could not update the expected date.");
      return payload;
    },
    onSuccess: (payload) => { setConfirming(false); onUpdated(payload); },
  });
  if (readOnly || !opportunity.blackbaud_opportunity_id || !canRollOpportunityForward(opportunity)) return null;
  return <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
    {confirming ? <div role="group" aria-label="Confirm fiscal-year update">
      <p>Change the expected date from {formatCalendarDate(opportunity.expected_date)} to <strong>{formatCalendarDate(fiscalYear.endsOn)}</strong> in JUMGOGPT and NXT? The amount, stage, and ask date will not change.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="rounded-full bg-blue-700 px-4 py-2 font-semibold text-white disabled:opacity-50" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? "Updating and verifying..." : "Confirm update in app and NXT"}</button>
        <button type="button" className="rounded-full border border-amber-300 bg-white px-4 py-2" disabled={mutation.isPending} onClick={() => { setConfirming(false); mutation.reset(); }}>Cancel</button>
      </div>
    </div> : <div className="flex flex-wrap items-center justify-between gap-2">
      <span>Expected date is in a prior fiscal year.</span>
      <button type="button" className="rounded-full border border-amber-300 bg-white px-4 py-2 font-semibold" onClick={() => setConfirming(true)}>Update to {fiscalYear.label}?</button>
    </div>}
    {mutation.isError ? <p role="alert" className="mt-2 text-red-800">{mutation.error.message}</p> : null}
  </div>;
}
