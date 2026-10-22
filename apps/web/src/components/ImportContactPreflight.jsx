import { useId } from "react";

export default function ImportContactPreflight({ summary, intent, defaults, onChoice, onDefaultType, disabled = false }) {
  const id = useId();
  if (!summary.groups.length) return null;
  return <section aria-label="Contact import plan" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 sm:p-5">
    <h3 className="text-lg font-bold text-slate-900">What will happen to the contact information?</h3>
    <p className="mt-1 text-sm text-slate-700">{intent === "new"
      ? "Contacts marked for import will be included when you approve eligible new records. Possible duplicates still need review."
      : intent === "mixed"
        ? "Contacts marked for import stay with each row. Existing records need update review; eligible new records use the separate creation approval."
        : "This is an update-only import. Contacts marked for import will be reviewed against existing records; no new constituents will be created."}</p>
    {summary.groups.length > 1 && summary.groups.some((group) => group.mode !== "import") && <button type="button" disabled={disabled}
      onClick={() => summary.groups.forEach((group) => onChoice(group, "import"))}
      className="mt-3 min-h-11 rounded-full border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50">
      Include all mapped emails and phones
    </button>}
    <div className="mt-4 grid gap-3 md:grid-cols-2">
      {summary.groups.map((group) => <fieldset key={group.key} disabled={disabled} className="min-w-0 rounded-xl border border-emerald-200 bg-white p-4">
        <legend className="px-1 font-bold text-slate-900">{group.label}</legend>
        <p className="text-sm text-slate-600">{group.count} contact {group.count === 1 ? "value" : "values"} across {group.rowCount} {group.rowCount === 1 ? "row" : "rows"}; {group.primaryCount} marked primary in the file.</p>
        <div className="mt-3 grid gap-2">
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-800">
            <input type="radio" name={`${id}-${group.key}`} checked={group.mode === "import"} onChange={() => onChoice(group, "import")} />
            Import {group.label.toLowerCase()}
          </label>
          <label className="flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-800">
            <input type="radio" name={`${id}-${group.key}`} checked={group.mode === "matching"} onChange={() => onChoice(group, "matching")} />
            {group.key === "email" ? "Use email addresses for matching only" : "Do not import phone numbers"}
          </label>
        </div>
        {group.mode === "matching" && <p className="mt-2 text-sm text-amber-900">These values will not be added or changed in NXT. Their primary flags will not be applied.</p>}
        {group.mode === "choose" && <p className="mt-2 text-sm text-amber-900">Choose one option before reviewing the CSV.</p>}
        {group.mode === "import" && <>
          <p className="mt-2 text-sm text-emerald-800">Included for review, not sent yet. Blank primary flags do not request a primary change.</p>
          {group.blankTypeCount > 0 && <label className="mt-3 grid gap-1 text-sm font-semibold text-slate-800">
            Default {group.key} type for blank values
            <input value={defaults[group.defaultType] || ""} maxLength={100} onChange={(event) => onDefaultType(group.defaultType, event.target.value)}
              className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 font-normal" />
            <span className="font-normal text-slate-600">Use a type configured in NXT. Applies to {group.blankTypeCount} blank {group.blankTypeCount === 1 ? "type" : "types"} only; file values are kept.</span>
          </label>}
          {group.issues.length > 0 && <details className="mt-3 text-sm text-amber-900">
            <summary className="cursor-pointer font-semibold">{group.issues.length} {group.issues.length === 1 ? "row needs" : "rows need"} {group.key} review</summary>
            <p className="mt-2">Correct these values now or review the affected contacts after preparation. Preparing the file does not approve them.</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">{group.issues.slice(0, 5).map((issue) => <li key={issue.rowNumber}>Row {issue.rowNumber}: {issue.message}</li>)}</ul>
            {group.issues.length > 5 && <p className="mt-1">{group.issues.length - 5} additional rows need review.</p>}
          </details>}
        </>}
      </fieldset>)}
    </div>
  </section>;
}
