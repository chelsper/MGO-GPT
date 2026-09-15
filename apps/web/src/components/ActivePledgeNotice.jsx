export default function ActivePledgeNotice({ status, incomplete = false }) {
  if (!Number.isSafeInteger(status?.count) || status.count < 1) return null;
  const verifiedAt = Date.parse(status.verifiedAt);
  const verifiedDate = Number.isFinite(verifiedAt)
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York",
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(verifiedAt))
    : null;
  return (
    <aside
      aria-label="Saved pledge status"
      className="my-3 rounded-xl border border-teal-200 bg-teal-50 px-3 py-3 text-sm text-teal-900"
    >
      <p className="font-semibold">
        {status.stale ? "Active pledge in older report data" : "Active pledge"}
        {status.count > 1 ? ` (${status.count} pledges)` : ""}
      </p>
      <p className="mt-1 text-xs leading-relaxed">
        Listed in the saved Pledge Payments report (query 12033).
        {verifiedDate ? ` Verified ${verifiedDate} (Eastern).` : ""}
        {status.stale || incomplete
          ? " The report is incomplete or refreshing; confirm current status before outreach."
          : " Not a live NXT check."}
      </p>
    </aside>
  );
}
