import { workspaceCardStyle } from "./prospectDetailPresentation";

export function ActiveOpportunitySection({
  opportunityGroups,
  editingOpportunityId,
  opportunityEditFeedback,
  renderOpportunityCard,
}) {
  return (
    <div style={{ ...workspaceCardStyle, marginBottom: 0 }}>
      <h3
        style={{
          fontSize: "16px",
          fontWeight: "700",
          color: "#111827",
          margin: "0 0 12px 0",
        }}
      >
        Active Opportunities ({opportunityGroups.active.length})
      </h3>
      {!editingOpportunityId && opportunityEditFeedback ? (
        <p role="status" className="mb-3 text-sm text-green-800">
          {opportunityEditFeedback}
        </p>
      ) : null}
      {opportunityGroups.active.length === 0 ? (
        <p
          style={{
            fontSize: "14px",
            color: "#9CA3AF",
            fontStyle: "italic",
          }}
        >
          No active linked opportunities. Closed opportunities are available in
          the history below.
        </p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {opportunityGroups.active.map(renderOpportunityCard)}
        </div>
      )}
    </div>
  );
}

export function ClosedOpportunityHistory({
  opportunityGroups,
  renderOpportunityCard,
}) {
  return (
    <>
      {opportunityGroups.recentClosed.length ||
      opportunityGroups.olderClosed.length ? (
        <section
          style={workspaceCardStyle}
          aria-label="Closed opportunity history"
        >
          <h3 className="mb-2 font-bold text-gray-900">
            Closed Opportunities ({opportunityGroups.recentClosed.length})
          </h3>
          <p className="mb-3 text-sm text-gray-500">
            Funded, withdrawn, and declined opportunities closed in the last two
            years. Stewardship stays with its opportunity.
          </p>
          <div className="flex flex-col gap-3">
            {opportunityGroups.recentClosed.map(renderOpportunityCard)}
          </div>
          {opportunityGroups.olderClosed.length ? (
            <details className="mt-4">
              <summary className="mb-3 cursor-pointer text-sm font-semibold text-gray-700">
                Older or undated closed history (
                {opportunityGroups.olderClosed.length})
              </summary>
              <div className="flex flex-col gap-3">
                {opportunityGroups.olderClosed.map(renderOpportunityCard)}
              </div>
            </details>
          ) : null}
        </section>
      ) : null}
    </>
  );
}
