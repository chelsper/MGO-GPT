import { useRef, useState } from "react";
import { societyLetterCsvPlan } from "@/utils/societyLetterCsvExport";
import { MAX_COMBINED_LETTER_HOUSEHOLDS } from "@/utils/societyLetters";
import { DEFAULT_CSV_FORMAT } from "@/utils/societyLetterCsvFormat";
import LetterCsvFormat from "./LetterCsvFormat";

const input =
  "mt-1 block min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 font-normal";

export default function LetterCsvExport({
  data,
  busy,
  onExport,
  onTrackedExport,
  onSaveFormat,
}) {
  const [societyKey, setSocietyKey] = useState("");
  const [dateOverride, setDateOverride] = useState("");
  const [formats, setFormats] = useState({});
  const [previewId, setPreviewId] = useState("");
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inFlight = useRef(false);
  const letterDate = dateOverride || data.today;
  const csvFormat =
    formats[societyKey] || data.csvFormats?.[societyKey] || DEFAULT_CSV_FORMAT;
  const plan = societyLetterCsvPlan(data, societyKey, letterDate, csvFormat);
  const disabled = busy || working;
  async function download(tracked = false) {
    if (disabled || inFlight.current || plan.issue || !plan.entries.length)
      return;
    inFlight.current = true;
    setWorking(true);
    setError("");
    setMessage("");
    try {
      await (tracked ? onTrackedExport : onExport)({
        action: tracked ? "create_csv_run" : "export_merge_csv",
        revision: data.revision,
        periodKey: data.period.key,
        societyKey,
        letterDate,
        csvFormat,
        householdIds: plan.entries.map((entry) => entry.householdId),
      });
      setMessage(
        tracked
          ? `Tracked CSV saved for ${plan.entries.length} ${plan.entries.length === 1 ? "household" : "households"}. After merging in Word, open Saved CSV exports to confirm which letters you created and apply their appeals. Nothing is marked mailed.`
          : `CSV download started for ${plan.entries.length} ${plan.entries.length === 1 ? "household" : "households"}. No appeals, letter statuses, or mailing statuses changed.`,
      );
    } catch (err) {
      setError(
        err.message ||
          "The CSV could not be downloaded. Saved letters are unchanged.",
      );
    } finally {
      inFlight.current = false;
      setWorking(false);
    }
  }
  async function saveFormat() {
    if (disabled || inFlight.current || !societyKey || !onSaveFormat) return;
    inFlight.current = true;
    setWorking(true);
    setError("");
    setMessage("");
    try {
      await onSaveFormat({ action: "save_csv_format", societyKey, csvFormat });
      setMessage(
        "CSV format saved for this society. Choose the letter date for each export. Existing exports and recipient reviews are unchanged.",
      );
    } catch (err) {
      setError(err.message || "CSV format could not be saved.");
    } finally {
      inFlight.current = false;
      setWorking(false);
    }
  }
  return (
    <section
      aria-label="Word mail merge export"
      className="my-4 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"
    >
      <h3 className="font-semibold text-emerald-950">
        Prefer to merge and print in Word?
      </h3>
      <p className="mt-2 text-sm text-gray-700">
        Download one CSV per society with all eligible reviewed households for
        this period, up to {MAX_COMBINED_LETTER_HOUSEHOLDS.toLocaleString()} at
        once. Table filters and selected checkboxes do not limit this export.
        PDF and Word document options below are unchanged.
      </p>
      <div className="my-3 grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          Society for CSV
          <select
            className={input}
            value={societyKey}
            disabled={disabled}
            onChange={(event) => {
              setSocietyKey(event.target.value);
              setMessage("");
              setError("");
            }}
          >
            <option value="">Choose a society</option>
            {data.definitions
              .filter((item) => data.settings?.societyKeys?.includes(item.key))
              .map((item) => (
                <option key={item.key} value={item.key}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          CSV letter date
          <input
            className={input}
            type="date"
            value={letterDate || ""}
            disabled={disabled}
            onChange={(event) => {
              setDateOverride(event.target.value);
              setMessage("");
              setError("");
            }}
          />
        </label>
      </div>
      {societyKey && (
        <>
          <LetterCsvFormat
            format={csvFormat}
            disabled={disabled}
            plan={plan}
            rows={data.rows || []}
            previewId={previewId}
            onPreview={setPreviewId}
            onChange={(format) => {
              setFormats({ ...formats, [societyKey]: format });
              setError("");
              setMessage("");
            }}
          />
          {onSaveFormat && (
            <button
              type="button"
              disabled={disabled}
              className="mb-3 min-h-11 rounded-xl border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50"
              onClick={saveFormat}
            >
              Save CSV format for this society
            </button>
          )}
        </>
      )}
      {societyKey &&
        (plan.issue ? (
          <p role="status" className="text-sm text-amber-900">
            {plan.issue}
          </p>
        ) : (
          <>
            <p role="status" className="text-sm font-semibold">
              {plan.entries.length}{" "}
              {plan.entries.length === 1 ? "household" : "households"} ready for
              CSV; {plan.omitted.length} not included.
            </p>
            {plan.omitted.length > 0 && (
              <details className="my-2 text-sm">
                <summary className="cursor-pointer font-semibold">
                  Why some recipients are not included
                </summary>
                <ul className="mt-2 max-h-60 space-y-2 overflow-y-auto">
                  {plan.omitted.slice(0, 50).map((item, index) => (
                    <li key={`${item.householdId}-${index}`}>
                      <strong>{item.name}:</strong> {item.reason}
                    </li>
                  ))}
                </ul>
                {plan.omitted.length > 50 && (
                  <p>
                    Showing the first 50 of {plan.omitted.length}. Use the
                    workspace filters to review the remaining recipients.
                  </p>
                )}
              </details>
            )}
          </>
        ))}
      <button
        type="button"
        className="mt-3 min-h-11 rounded-xl border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
        disabled={disabled || !!plan.issue || !plan.entries.length}
        onClick={() => download(false)}
      >
        {working ? "Preparing CSV..." : "Download reviewed households (.csv)"}
      </button>
      {onTrackedExport && (
        <button
          type="button"
          className="ml-2 mt-3 min-h-11 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={disabled || !!plan.issue || !plan.entries.length}
          onClick={() => download(true)}
        >
          Save tracked CSV &amp; download
        </button>
      )}
      {onTrackedExport && (
        <p className="mt-2 text-sm text-gray-700">
          Choose a tracked CSV if you want to apply NXT appeals and record
          mailing later. It saves the exact recipient list and merge values;
          neither download option updates NXT.
        </p>
      )}
      {message && (
        <p role="status" className="mt-2 text-sm text-emerald-900">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <p className="mt-3 text-sm text-gray-600">
        Uses saved membership and recipient edits, not a live NXT delivery
        check. Membership last checked:{" "}
        {data.refreshedAt
          ? new Date(data.refreshedAt).toLocaleString()
          : "not available"}
        . Exporting does not reserve recipients, apply appeals, or mark letters
        created or mailed. Repeating an export may include the same households.
      </p>
      <details className="mt-3 text-sm text-gray-700">
        <summary className="cursor-pointer font-semibold">
          How to use the CSV in Word
        </summary>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          <li>
            Open this society's saved letter in Word. In Mailings, select this
            CSV as the recipient list.
          </li>
          <li>
            Insert native Word merge fields using the CSV column names. Saved
            field mappings are included; typed placeholders such as{" "}
            {"{salutation}"} or {"«First_Name»"} do not merge automatically. A
            standalone "Date" also needs a Word merge field for the CSV's letter
            date. This is a one-time setup in your Word copy; the app's merge
            settings do not convert those placeholders in Word.
          </li>
          <li>
            Preview results and use Finish &amp; Merge to create one document
            for this society. Use the full address field to preserve a manually
            edited address block.
          </li>
        </ol>
        <p className="mt-2">
          Connect directly to Word. If opening in Excel first, import ZIP codes
          and system IDs as text to preserve leading zeros. Word controls the
          letterhead, page breaks, and blank address-line suppression. External
          merge completion and appeal updates require a tracked CSV and your
          explicit confirmation under Saved CSV exports.
        </p>
      </details>
    </section>
  );
}
