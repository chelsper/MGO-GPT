import { useState } from "react";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import { formatCalendarDate } from "@/utils/prospectActivity";

export const pledgeMoney = (cents) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const dateLabel = (date) => formatCalendarDate(date, { month: "short", day: "numeric", year: "numeric" });

export default function PledgePaymentList({ rows, upcoming, today }) {
  const [expanded, setExpanded] = useState(null);
  const metrics = ["Total pledged", "Paid to date", "Payments past due", "Currently due", upcoming ? "Next due date" : "Oldest due date", upcoming ? "Due on next date" : "Amount due through today"];
  const headings = ["Constituent / pledge", "Fund description", ...metrics];
  const desktopGrid = "xl:grid-cols-[minmax(0,2fr)_minmax(0,1.6fr)_repeat(6,minmax(0,1fr))]";
  return <div>
    <div className={`hidden ${desktopGrid} gap-4 border-b border-gray-200 bg-gray-50 px-5 py-4 text-xs font-bold uppercase text-gray-600 xl:grid`}>
      {headings.map((heading, index) => <div key={heading} className={`min-w-0 break-words ${index > 1 ? "text-right" : ""}`}>{heading}</div>)}
    </div>
    <ul className="divide-y divide-gray-200">
      {rows.map((row) => <li key={row.id} className="px-4 py-5 sm:px-5">
        <div className={`grid min-w-0 grid-cols-2 items-start gap-4 md:grid-cols-3 ${desktopGrid}`}>
          <div className="col-span-2 min-w-0 xl:col-span-1">
            <a href={buildBlackbaudConstituentProfileUrl(row.constituentId)} target="_blank" rel="noopener noreferrer" className="break-words font-bold text-indigo-700 hover:underline">{row.name}<span className="sr-only"> (opens NXT in a new tab)</span></a>
            <p className="mt-1 text-xs text-gray-500">Pledge {row.lookupId}</p>
            {row.stale && <p className="mt-1 text-xs font-semibold text-amber-800">Previous saved values; refresh pending or incomplete</p>}
            <button aria-expanded={expanded === row.id} aria-controls={`schedule-${row.id}`} className="mt-2 min-h-11 text-sm font-semibold text-indigo-700 underline" onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
              {expanded === row.id ? "Hide schedule" : "View payment schedule"}
            </button>
          </div>
          <dl className="col-span-2 min-w-0 md:col-span-1">
            <dt className="mb-1 text-xs text-gray-500 xl:sr-only">Fund description</dt>
            <dd className="break-words text-sm text-gray-700">
              {row.fundDescriptions?.length > 0
                ? <ul className="space-y-1">{row.fundDescriptions.map((description) => <li key={description}>{description}</li>)}</ul>
                : <span className="text-gray-500">{row.fundDescriptionsUnavailable ? "Fund description unavailable" : Array.isArray(row.fundDescriptions) ? "Not provided by NXT" : "Refresh to load fund description"}</span>}
            </dd>
            {row.fundDescriptionsUnavailable && row.fundDescriptions?.length > 0 && <dd className="mt-1 text-xs text-amber-800">Some fund descriptions unavailable</dd>}
          </dl>
          {[
            [metrics[0], pledgeMoney(row.totalCents)],
            [metrics[1], pledgeMoney(row.paidToDateCents)],
            [metrics[2], row.pastDueCount],
            [metrics[3], `${row.pastDueCount + row.dueTodayCount} payments`, row.dueTodayCount ? `${row.dueTodayCount} due today` : "Includes past due"],
            [metrics[4], dateLabel(row.dueDate)],
            [metrics[5], pledgeMoney(row.amountDueCents)],
          ].map(([label, value, note]) => <dl key={label} className="min-w-0 xl:text-right">
            <dt className="mb-1 text-xs text-gray-500 xl:sr-only">{label}</dt>
            <dd className={`break-words font-semibold tabular-nums ${label === metrics[5] ? "text-emerald-800" : "text-gray-900"}`}>{value}</dd>
            {note && <dd className="mt-1 text-xs text-gray-500">{note}</dd>}
          </dl>)}
        </div>
        {expanded === row.id && <div id={`schedule-${row.id}`} className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3 flex flex-wrap justify-between gap-2 text-sm text-gray-600">
            <span>Outstanding pledge balance: <strong>{pledgeMoney(row.balanceCents)}</strong></span>
            <span>Saved {new Date(row.refreshedAt).toLocaleString()}</span>
          </div>
          <p className="mb-3 text-sm text-gray-600">Remaining amounts reflect NXT installment balances, including partial payments and write-offs. Paid to date counts verified payment applications, not balance reductions.</p>
          <div className="max-h-80 overflow-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full min-w-[480px] text-left text-sm">
              <caption className="sr-only">Payment schedule for {row.name}, pledge {row.lookupId}</caption>
              <thead className="sticky top-0 bg-gray-100"><tr>{["Due date", "Scheduled", "Remaining", "Status"].map((label) => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead>
              <tbody>{row.installments.map((entry) => <tr key={entry.id} className="border-t border-gray-100">
                <td className="p-3">{dateLabel(entry.date)}</td><td className="p-3 tabular-nums">{pledgeMoney(entry.amountCents)}</td>
                <td className="p-3 tabular-nums">{pledgeMoney(entry.balanceCents)}</td>
                <td className="p-3">{entry.balanceCents === 0 ? "Settled" : entry.date < today ? "Past due" : entry.date === today ? "Due today" : "Upcoming"}</td>
              </tr>)}</tbody>
            </table>
          </div>
        </div>}
      </li>)}
    </ul>
  </div>;
}
