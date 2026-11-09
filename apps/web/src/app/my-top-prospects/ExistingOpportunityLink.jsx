import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { formatCurrency, formatLongDate } from "./prospectDetailPresentation";

export default function ExistingOpportunityLink({ prospectId, scope, disabled = false }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const request = useRef(0);
  const busy = useRef(false);
  const toggle = useRef(null);
  const endpoint = `/api/prospects/${prospectId}/opportunities/link-existing`;
  useEffect(() => () => { request.current++; }, [prospectId, scope]);

  async function load() {
    if (busy.current || disabled) return;
    const run = ++request.current;
    busy.current = true;
    setOpen(true); setRows(null); setSelected(""); setError(""); setFeedback(""); setStatus("loading");
    try {
      const response = await fetch(`${endpoint}?scope=${encodeURIComponent(scope)}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not load NXT opportunities.");
      if (run === request.current) setRows(result.opportunities);
    } catch (failure) {
      if (run === request.current) setError(failure.message);
    } finally {
      if (run === request.current) { busy.current = false; setStatus(""); }
    }
  }

  async function link() {
    if (busy.current || !selected || disabled) return;
    const run = ++request.current;
    busy.current = true; setStatus("saving"); setError("");
    try {
      const response = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, opportunityId: selected }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not save the link. Reload the list before retrying.");
      // Invalidate the saved-data views even if the user closed the prospect
      // while the request completed. Never resend a provider create.
      for (const key of ["prospect", "prospects", "prospect-summary-base", "prospect-summary-closed", "blackbaud-portfolio", "opportunity-pipeline", "blackbaud-summary"]) {
        queryClient.invalidateQueries({ queryKey: [key] });
      }
      if (run === request.current) {
        setFeedback(`${result.alreadyLinked ? "This opportunity is already linked." : "Opportunity linked. NXT was not changed."}${result.expectedDateNeeded ? " Expected date needed before it can appear in a fiscal-year total." : ""}`);
        setOpen(false); toggle.current?.focus();
      }
    } catch (failure) {
      if (run === request.current) { setError(failure.message); setRows(null); setSelected(""); }
    } finally {
      if (run === request.current) { busy.current = false; setStatus(""); }
    }
  }

  function cancel() {
    if (status === "saving") return;
    request.current++; busy.current = false;
    setOpen(false); setStatus(""); setError(""); toggle.current?.focus();
  }

  return <div className="mb-4 text-sm">
    <button ref={toggle} type="button" onClick={load} disabled={disabled || Boolean(status)}
      aria-expanded={open} className="rounded-lg border border-green-700 bg-white px-3 py-2 font-semibold text-green-800 disabled:opacity-50">
      Link existing NXT opportunity
    </button>
    {feedback && <p role="status" className="mt-2 text-green-800">{feedback}</p>}
    {open && <section aria-label="Link existing NXT opportunity" className="mt-3 rounded-xl border border-green-200 bg-green-50 p-4">
      <p className="mb-3 text-gray-700">Choose an open opportunity already in NXT for this constituent and assigned to this MGO. Older opportunities are included here. Linking saves it in Top Prospects; it does not create or change anything in NXT.</p>
      {status === "loading" && <p role="status">Checking NXT opportunities...</p>}
      {error && <p role="alert" className="mb-3 text-red-800">{error}</p>}
      {rows?.length === 0 && <p className="mb-3">No open NXT opportunities assigned to this MGO were found for this constituent.</p>}
      {rows?.length > 0 && <fieldset disabled={status === "saving" || disabled}>
        <legend className="mb-2 font-semibold">Choose an opportunity</legend>
        <div className="max-h-80 space-y-2 overflow-y-auto">
          {rows.map(row => <label key={row.id} className="flex items-start gap-3 rounded-lg border border-green-200 bg-white p-3">
            <input type="radio" name={`nxt-link-${prospectId}`} value={row.id} checked={selected === row.id}
              disabled={row.linkState !== "available"} onChange={() => setSelected(row.id)} className="mt-1" />
            <span className="min-w-0 break-words">
              <span className="block font-semibold">{row.title}</span>
              <span className="block text-gray-600">{row.current_stage} · {row.estimated_amount == null ? "Ask amount not set" : formatCurrency(row.estimated_amount)} · NXT ID {row.id}</span>
              {row.purpose && <span className="block text-gray-600">{row.purpose}</span>}
              {row.expected_date ? <span className="block">Expected {formatLongDate(row.expected_date)}</span>
                : <span className="block text-amber-900">Expected date needed. You can link now; it will stay out of fiscal-year totals until dated.</span>}
              {row.linkState === "linked" && <span className="block text-green-800">Already linked to this prospect</span>}
              {row.linkState === "elsewhere" && <span className="block text-amber-900">Already linked elsewhere in this workspace. Ask an Admin to review the existing link.</span>}
            </span>
          </label>)}
        </div>
      </fieldset>}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={link} disabled={!selected || Boolean(status) || disabled}
          className="rounded-lg bg-green-800 px-3 py-2 font-semibold text-white disabled:opacity-50">{status === "saving" ? "Linking..." : "Link selected opportunity"}</button>
        <button type="button" onClick={cancel} disabled={status === "saving"} className="rounded-lg border border-gray-300 bg-white px-3 py-2">Cancel</button>
        {!status && <button type="button" onClick={load} disabled={disabled} className="rounded-lg border border-gray-300 bg-white px-3 py-2">Reload NXT list</button>}
      </div>
    </section>}
  </div>;
}
