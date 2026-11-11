export default function PortfolioMaintenanceIndicator({ state, error, isAdmin }) {
  const inventory = state?.inventory;
  const freshness = inventory?.freshness;
  if (inventory?.total === 0 && !error) return null;
  const updated = Date.parse(freshness?.givingUpdatedAt || "");
  const hasDate = freshness?.missing === 0 && Number.isFinite(updated) && updated <= Date.now();
  const checked = hasDate ? `Giving last checked ${new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium", timeZone: "America/New_York",
      }).format(new Date(updated))}` : null;
  const automatic = state?.serverManaged === true;
  const label = error ? "Update status is unavailable. Saved portfolio details are still shown."
    : freshness?.delayed > 0 ? "Some information is delayed. Your saved details are still available."
      : freshness?.missing > 0 ? automatic
        ? "Saved details are pending automatic updates. No action needed."
        : "Some saved details are not available yet."
      : checked ? automatic ? "Updates automatically" : null
        : "Update status is not available yet.";
  const needsAttention = Boolean(error || freshness?.delayed > 0);
  return <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs ${needsAttention ? "text-amber-800" : "text-gray-500"}`}>
    {checked && <span title="This is the oldest successful giving check across this portfolio, not a live NXT check. Individual summary dates may differ.">{checked}</span>}
    {label && <span role={needsAttention ? "status" : undefined}>{label}</span>}
    {isAdmin ? <a className="min-h-9 content-center font-semibold text-indigo-700 hover:underline"
      href="/integration-health#health-portfolios">Integration Health</a> : needsAttention ? <span>Please contact your administrator if this persists.</span> : null}
  </div>;
}
