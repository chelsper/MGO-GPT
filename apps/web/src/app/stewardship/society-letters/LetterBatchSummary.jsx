import {
  letterBatchSummary,
  savedLetterSelection,
} from "@/utils/societyLetterBatchSummary";

function Metric({ label, value }) {
  return (
    <div className="rounded-xl bg-white px-3 py-3">
      <dt className="text-xs font-medium text-gray-600">{label}</dt>
      <dd className="mt-1 text-xl font-bold tabular-nums text-gray-900">
        {value}
      </dd>
    </div>
  );
}

export default function LetterBatchSummary({
  items,
  selectionSummary,
  preview = false,
}) {
  const { counts, societies, appeals, unrecordedAppeals } =
    letterBatchSummary(items);
  const selection = preview ? selectionSummary : savedLetterSelection(items);
  return (
    <section
      className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4"
      aria-label={preview ? "Selection summary" : "Batch summary"}
    >
      <h3 className="font-semibold text-gray-900">
        {preview ? "Selection summary" : "Batch summary"}
      </h3>
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Metric label="Letters" value={counts.letters} />
        <Metric label="Joint recipients" value={counts.joint} />
        <Metric label="Single recipients" value={counts.single} />
        <Metric label="Constituent records" value={counts.constituents} />
      </dl>
      {!!counts.other && (
        <p className="mt-2 text-sm text-gray-600">
          {counts.other} letters have other or unrecorded household membership.
        </p>
      )}
      <ul
        className="mt-3 space-y-1 text-sm text-gray-700"
        aria-label="Letters by society"
      >
        {societies.map((society) => (
          <li key={society.key} className="flex justify-between gap-4">
            <span className="min-w-0">
              {society.name}
              {society.period && (
                <span className="mt-0.5 block text-xs text-gray-500">
                  <span className="whitespace-nowrap">
                    {society.period.start}
                  </span>
                  {" to "}
                  <span className="whitespace-nowrap">
                    {society.period.end}
                  </span>
                </span>
              )}
            </span>
            <span className="shrink-0 font-semibold">
              {society.letters} {society.letters === 1 ? "letter" : "letters"}
            </span>
          </li>
        ))}
      </ul>
      {!preview && (
        <>
          <dl
            className="mt-4 flex flex-wrap gap-2"
            aria-label="Delivery progress"
          >
            {[
              ["Prepared, not mailed", counts.prepared],
              ["Mailed", counts.mailed],
              ["Email sent", counts.emailSent],
              ...(counts.queued
                ? [["Email queued, not sent", counts.queued]]
                : []),
              ...(counts.attention
                ? [["Needs verification", counts.attention]]
                : []),
              ...(counts.cancelled ? [["Cancelled", counts.cancelled]] : []),
            ].map(([label, value]) => (
              <div
                key={label}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${label === "Needs verification" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-gray-200 bg-white text-gray-700"}`}
              >
                <dt>{label}</dt>
                <dd className="font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
          {!!counts.emailSent && (
            <p className="mt-2 text-xs text-gray-600">
              Email sent means accepted by the email provider.{" "}
              {counts.delivered} confirmed delivered.
            </p>
          )}
        </>
      )}
      <details className="mt-4 border-t border-gray-200 pt-3 text-sm">
        <summary className="cursor-pointer font-semibold text-gray-700">
          {preview
            ? "Recipients outside this selection"
            : "Selection and appeal details"}
        </summary>
        {selection ? (
          <div className="mt-3 text-gray-600">
            <p>
              {selection.notSelected} not selected · {selection.excluded}{" "}
              excluded · {selection.covered} already covered ·{" "}
              {selection.reserved} already reserved
            </p>
            <p className="mt-1 text-xs">
              From {selection.total} households in the saved query results{" "}
              {preview ? "now" : "when this batch was prepared"}. Not selected
              does not mean excluded or sent. People absent from those results
              are not counted.
            </p>
          </div>
        ) : (
          <p className="mt-3 text-gray-600">
            Counts for recipients outside this batch were not recorded.
          </p>
        )}
        {!preview && (
          <div className="mt-4">
            <h4 className="font-semibold">Saved NXT appeal receipts</h4>
            {appeals.map((appeal) => (
              <div
                key={appeal.key}
                className="mt-2 rounded-lg border border-gray-200 bg-white p-3 break-words"
              >
                <p className="font-semibold">
                  {appeal.society}:{" "}
                  {appeal.lookupId || `System ID ${appeal.id}`}
                </p>
                <p>{appeal.description}</p>
                <p className="mt-1 text-xs text-gray-600">
                  System ID {appeal.id} · Appeal date{" "}
                  {appeal.date || "not recorded"} · {appeal.confirmed} of{" "}
                  {appeal.total} member assignments confirmed
                </p>
              </div>
            ))}
            {!!unrecordedAppeals && (
              <p className="mt-2 text-gray-600">
                {unrecordedAppeals}{" "}
                {unrecordedAppeals === 1 ? "letter has" : "letters have"} no
                saved NXT appeal receipt. Preparation or delivery alone does not
                confirm an appeal assignment.
              </p>
            )}
            {!!appeals.length && (
              <p className="mt-2 text-xs text-gray-600">
                These are saved receipts, not a live NXT check. Lower-tier
                coverage does not mean a lower-tier appeal was applied.
              </p>
            )}
          </div>
        )}
      </details>
    </section>
  );
}
