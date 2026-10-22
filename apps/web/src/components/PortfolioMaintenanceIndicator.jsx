export default function PortfolioMaintenanceIndicator({ state, error, isAdmin }) {
  const inventory = state?.inventory;
  const freshness = inventory?.freshness;
  if (inventory?.total === 0 && !error) return null;
  const updated = Date.parse(freshness?.givingUpdatedAt || "");
  const label = error ? "Update status is unavailable. Saved portfolio details are still shown."
    : freshness?.delayed > 0 ? "Some portfolio details are taking longer to update. Saved information is still available."
      : Number.isFinite(updated) ? `Giving last updated ${new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium", timeZone: "America/New_York",
      }).format(new Date(updated))}`
        : freshness?.missing > 0 ? "Adding saved portfolio details in the background."
          : "Checking saved update status...";
  const needsAttention = Boolean(error || freshness?.delayed > 0);
  return <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${needsAttention ? "text-amber-800" : "text-gray-500"}`}>
    <span role={needsAttention ? "status" : undefined}
      title="The date is the oldest successful giving check across this portfolio, not a live NXT check. Individual summary dates may differ.">{label}</span>
    {isAdmin ? <a className="min-h-9 content-center font-semibold text-indigo-700 hover:underline"
      href="/integration-health#health-portfolios">Integration Health</a> : needsAttention ? <span>Please contact your administrator if this persists.</span> : null}
  </div>;
}
