import { calendarDate, formatCalendarDate } from "@/utils/prospectActivity";
import { ORGANIZATION_REPORTING_POLICY } from "@/utils/organizationRuntimePolicy";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: ORGANIZATION_REPORTING_POLICY.currencyCode,
});
const validCents = (value) => Number.isSafeInteger(value) && value >= 0;
const amount = (value) =>
  validCents(value) ? currency.format(value / 100) : "Unavailable";

export default function ActivePledgeNotice({ status, incomplete = false }) {
  if (!Number.isSafeInteger(status?.count) || status.count < 1) return null;
  const verifiedAt = Date.parse(status.verifiedAt);
  const verifiedDate = Number.isFinite(verifiedAt)
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: ORGANIZATION_REPORTING_POLICY.timeZone,
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(verifiedAt))
    : null;
  const asOf = calendarDate(status.asOf);
  const nextDue = calendarDate(status.nextPaymentDueDate);
  const metrics = [
    { label: "Total pledged", value: amount(status.totalCents) },
    { label: "Balance due", value: amount(status.balanceCents) },
    {
      label: "Next payment due",
      value: nextDue
        ? `${formatCalendarDate(nextDue, { month: "short", day: "numeric", year: "numeric" })}${nextDue === asOf ? " (today)" : ""}`
        : asOf && status.nextPaymentDueDate === null
          ? "No upcoming payment"
          : "Unavailable",
    },
  ];
  if (validCents(status.overdueCents) && status.overdueCents > 0) {
    metrics.push({
      label: "Overdue amount",
      value: amount(status.overdueCents),
      overdue: true,
    });
  }
  return (
    <aside
      aria-label="Saved pledge status"
      className="my-3 rounded-xl border border-teal-200 bg-teal-50 px-3 py-3 text-sm text-teal-900"
    >
      <p className="font-semibold">
        {status.stale ? "Active pledge in older report data" : "Active pledge"}
        {status.count > 1 ? ` (${status.count} pledges)` : ""}
      </p>
      <dl
        className="my-3 grid gap-x-5 gap-y-3"
        style={{
          gridTemplateColumns:
            "repeat(auto-fit, minmax(min(100%, 10rem), 1fr))",
        }}
      >
        {metrics.map(({ label, value, overdue }) => (
          <div
            key={label}
            className={`min-w-0 ${overdue ? "text-amber-900" : ""}`}
          >
            <dt className="text-xs font-medium">{label}</dt>
            <dd className="mt-1 break-words text-base font-semibold tabular-nums">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {status.count > 1 && (
        <p className="text-xs leading-relaxed">
          Combined amounts across these {status.count} active pledges.
        </p>
      )}
      {asOf && (
        <p className="text-xs leading-relaxed">
          Due dates as of{" "}
          {formatCalendarDate(asOf, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}{" "}
          (Eastern). Next payment includes today; overdue excludes today.
        </p>
      )}
      {status.overdueCents === null && (
        <p className="text-xs leading-relaxed">
          Overdue amount could not be verified.
        </p>
      )}
      <p className="mt-1 text-xs leading-relaxed">
        Listed in the saved Pledge Payments report (query {ORGANIZATION_REPORTING_POLICY.pledgeQuery.id}).
        {verifiedDate ? ` Verified ${verifiedDate} (Eastern).` : ""}
        {status.stale || incomplete
          ? " The report is incomplete or refreshing; confirm current status before outreach."
          : " Not a live NXT check."}
      </p>
    </aside>
  );
}
