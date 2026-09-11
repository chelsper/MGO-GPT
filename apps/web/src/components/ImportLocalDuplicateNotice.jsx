import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";

export default function ImportLocalDuplicateNotice({ duplicate }) {
  if (!duplicate) return null;
  const pending = duplicate.kind === "pending_row";
  const created = duplicate.kind === "created";
  const canOpenImport = /^[1-9]\d*$/.test(String(duplicate.runId || "")) && /^[1-9]\d*$/.test(String(duplicate.rowId || ""));
  return <aside aria-label="Import history conflict" className="space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
    <h4 className="font-bold">{pending ? "Another CSV row needs comparison" : created ? "An earlier import created a record" : "An earlier creation needs verification"}</h4>
    <p className="font-semibold">{duplicate.name}</p>
    <p>{duplicate.runId ? `Import #${duplicate.runId}` : "Retained creation history"}{duplicate.rowNumber ? ` / CSV row ${duplicate.rowNumber}` : ` / saved row ${duplicate.rowId}`}{duplicate.sameRun ? " / this batch" : ""}</p>
    <p>Reason: {duplicate.reason}. {duplicate.lookupId ? `CSV Lookup ID: ${duplicate.lookupId}. ` : ""}{duplicate.systemId ? `CSV system ID: ${duplicate.systemId}.` : ""}</p>
    <p>This check uses saved import information, not a newly confirmed NXT search match.</p>
    <p>{pending
      ? "Compare both CSV rows. For the same person, keep one and skip the extra unsent row, then retry duplicate checks on the retained row. For different people, use Review this hold below to record your comparison."
      : created
        ? "Open the NXT record and compare it with this CSV row. Search indexing can lag after creation. Do not create a second record or select this one without comparing its current identity."
        : "A create request may already have reached NXT. Verify the earlier attempt before retrying. Skipping its row does not make another creation safe."}</p>
    <div className="flex flex-wrap gap-3">
      {canOpenImport && <a className="font-bold underline" target="_blank" rel="noopener noreferrer" href={`/constituency-import?queueRun=${encodeURIComponent(duplicate.runId)}&queueRow=${encodeURIComponent(duplicate.rowId)}`}>Review blocking import row</a>}
      {duplicate.createdConstituentId && <a className="font-bold underline" target="_blank" rel="noopener noreferrer" href={buildBlackbaudConstituentProfileUrl(duplicate.createdConstituentId)}>Open previously created NXT record</a>}
    </div>
    <p className="text-xs">No new NXT record was created by this check. Opening these links does not select a match or change NXT.</p>
  </aside>;
}
