import { useEffect, useState } from "react";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import { canChangeImportMatch, getImportMatchCandidates, getSelectedImportMatchId } from "@/utils/importMatchReview";

export default function ImportSuggestedMatches({ row, runId, reviewer, busy, autoLoad, onSelect, onReject }) {
  const [loaded, setLoaded] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const editable = reviewer && canChangeImportMatch(row);
  const known = getImportMatchCandidates(row, { includeRejected: true });
  const shouldLoad = Boolean(runId && editable && !busy && !known.length && !row.matchSuggestionsCheckedAt && loaded === null && !error && (autoLoad || retry));

  useEffect(() => {
    if (!shouldLoad) { setLoading(false); return; }
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    fetch(`/api/constituency-import/runs/${encodeURIComponent(runId)}/rows/${encodeURIComponent(row.id)}/match`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "suggestions" }), signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload?.results)) throw new Error(payload?.error || "Could not load suggested matches.");
      if (active) setLoaded(payload);
    }).catch((failure) => {
      if (active) setError(failure.message || "Could not load suggested matches. This row remains in review.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [shouldLoad, runId, row.id, retry]);

  const selectedId = getSelectedImportMatchId(row);
  const candidates = getImportMatchCandidates({ ...row,
    matchCandidates: [...(row.matchCandidates || []), ...(loaded?.results || [])] })
    .filter((candidate) => candidate.blackbaudConstituentId !== selectedId);
  const checked = loaded !== null || row.matchSuggestionsCheckedAt || known.length > 0;
  if (!editable && !candidates.length) return null;

  return <section aria-label="Suggested NXT matches" className="space-y-3">
    <h4 className="font-bold text-blue-900">Suggested NXT matches{candidates.length ? ` (${candidates.length})` : ""}</h4>
    <p className="text-sm text-slate-700">Compare these records with your CSV above. Open a record in NXT for full details, choose a match, or rule it out. These choices do not change NXT.</p>
    {loading && <p role="status" className="text-sm text-blue-800">Loading suggested matches for this row...</p>}
    {error && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{error} This is not a confirmed nonmatch.
      <button type="button" disabled={busy} onClick={() => { setError(""); setRetry((value) => value + 1); }} className="ml-2 font-bold underline">Retry suggested matches</button>
    </div>}
    {!checked && !loading && !error && !shouldLoad && editable && <button type="button" disabled={!runId || busy} onClick={() => setRetry((value) => value + 1)} className="rounded-lg border border-blue-300 bg-white px-4 py-2 font-semibold text-blue-800 disabled:opacity-50">Load suggested matches</button>}
    {candidates.map((candidate) => <article key={candidate.blackbaudConstituentId} className="rounded-lg border border-blue-200 bg-white p-3">
      <div className="min-w-0 break-words">
        <h5 className="font-semibold">{candidate.name}</h5>
        <p className="text-sm text-slate-600">{candidate.lookupId ? `Lookup ID ${candidate.lookupId} / ` : ""}System Record ID {candidate.blackbaudConstituentId}</p>
        <p className="text-sm text-slate-700">{[candidate.email, candidate.email2].filter(Boolean).join(" / ") || "Email not available in search result"}</p>
        <p className="whitespace-pre-line text-sm text-slate-700">{[candidate.address, candidate.postalCode].filter(Boolean).join(", ") || "Address not available in search result"}</p>
        {candidate.reason && <p className="mt-1 text-sm text-blue-800">{candidate.reason}</p>}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={buildBlackbaudConstituentProfileUrl(candidate.blackbaudConstituentId)} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-800" aria-label={`Open NXT record for ${candidate.name} in a new tab`}>Open NXT record</a>
        {editable && <>
          <button type="button" disabled={!runId || busy || loading} onClick={() => onSelect(candidate)} className="rounded-lg bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Use this match</button>
          <button type="button" disabled={!runId || busy || loading} onClick={() => onReject(candidate)} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-semibold text-red-800 disabled:opacity-50">Not a match</button>
        </>}
      </div>
    </article>)}
    {checked && !candidates.length && !selectedId && <p className="text-sm text-slate-700">{loaded?.notice || "No remaining suggested matches."} The row stays in review. Search for another record below; this does not approve creating a new record.</p>}
  </section>;
}
