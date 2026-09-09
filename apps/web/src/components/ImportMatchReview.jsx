import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import { canChangeImportMatch, getImportMatchCandidates, getSelectedImportMatchId, isImportMatchRejected } from "@/utils/importMatchReview";
import ImportSuggestedMatches from "./ImportSuggestedMatches";

export default function ImportMatchReview({ row, saved, reviewer, busy, onReject, onSelect, runId, autoLoad }) {
  const id = getSelectedImportMatchId(row);
  const created = Boolean(row.createdBlackbaudConstituentId);
  const rejected = isImportMatchRejected(row);
  if (!id && !rejected && !getImportMatchCandidates(row).length && !(reviewer && canChangeImportMatch(row))) return null;
  const selected = getImportMatchCandidates(row).find((candidate) => candidate.blackbaudConstituentId === id);
  const name = selected?.name || row.match?.name || "Selected NXT constituent";

  return <section aria-label="Compare constituent match" className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-3">
    <div className="grid gap-4 md:grid-cols-2">
      <div className="min-w-0 break-words">
        <h4 className="text-xs font-bold uppercase text-slate-600">From your CSV</h4>
        <p className="font-semibold">{row.input?.constituentName || [row.input?.firstName, row.input?.lastName].filter(Boolean).join(" ") || "Unnamed row"}</p>
        <p className="text-sm text-slate-700">{[row.input?.email, row.input?.email2].filter(Boolean).join(" / ") || "No email supplied"}</p>
        <p className="text-sm text-slate-700">{[row.input?.addressLine1, row.input?.postalCode].filter(Boolean).join(", ")}</p>
      </div>
      <div className="min-w-0 break-words">
        <h4 className="text-xs font-bold uppercase text-slate-600">{created ? "Created by this import" : "Selected NXT record"}</h4>
        <p className="font-semibold">{!id ? "No match selected" : name}</p>
        {id && <>
          <p className="text-sm text-slate-700">{row.match?.lookupId ? `Lookup ID ${row.match.lookupId}` : `System Record ID ${id}`}</p>
          <p className="text-sm text-slate-700">{row.match?.email || "Email not loaded; open NXT to compare"}</p>
          {selected?.address && <p className="whitespace-pre-line text-sm text-slate-700">{[selected.address, selected.postalCode].filter(Boolean).join(", ")}</p>}
        </>}
      </div>
    </div>
    {id && <div className="flex flex-wrap gap-2">
      <a href={buildBlackbaudConstituentProfileUrl(id)} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-blue-300 bg-white px-4 py-2 font-semibold text-blue-800" aria-label={`Open NXT record for ${name} in a new tab`}>Open NXT record</a>
      {reviewer && canChangeImportMatch(row) && <button type="button" disabled={!saved || busy} onClick={() => onReject({ ...row.match, blackbaudConstituentId: id })} className="rounded-lg border border-red-300 bg-white px-4 py-2 font-semibold text-red-800 disabled:opacity-50">Not a match</button>}
    </div>}
    <p role={rejected ? "status" : undefined} className="text-sm text-slate-700">
      {created ? "This record was created in NXT, not suggested as a possible match. Rejecting or recreating it here is blocked; open NXT to verify it."
        : rejected ? row.intentDisposition?.message
          : !saved ? "Save this preview to record a Not a match decision. Opening NXT does not select or change a record."
            : "Open NXT in a new tab to compare full details. Not a match clears this selection only; it does not delete, update, or create an NXT record."}
    </p>
    {!created && <ImportSuggestedMatches key={`${runId}:${row.id}:${JSON.stringify(row.input)}:${row.localDuplicateCheckedAt || ""}:${row.blackbaudResult?.duplicateCheckAt || ""}`} row={row} runId={saved ? runId : null} reviewer={reviewer} busy={busy} autoLoad={autoLoad} onSelect={onSelect} onReject={onReject} />}
    {row.rejectedMatches?.length > 0 && <details className="text-sm">
      <summary className="cursor-pointer font-semibold">Rejected matches ({row.rejectedMatches.length})</summary>
      <ul className="mt-2 space-y-2">{row.rejectedMatches.map((match, index) => <li key={`${match.constituentId}-${index}`}>
        <a href={buildBlackbaudConstituentProfileUrl(match.constituentId)} target="_blank" rel="noopener noreferrer" className="text-blue-800 underline">{match.name || `NXT record ${match.constituentId}`}</a> - marked not a match
      </li>)}</ul>
    </details>}
  </section>;
}
