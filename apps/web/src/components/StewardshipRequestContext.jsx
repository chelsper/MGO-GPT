export default function StewardshipRequestContext({ context }) {
  if (!context?.constituentId) return null;
  return <section aria-label="Request context" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
    <p className="font-semibold">{context.constituentName}</p>
    {context.opportunityId && <p>Opportunity: {context.opportunityTitle || "Untitled opportunity"}</p>}
    <p className="mt-1">Saved donor context. No donation is required for this request.</p>
  </section>;
}
