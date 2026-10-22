import { importFieldResults } from "@/utils/importFieldResults";

const tones = {
  verified: "bg-emerald-50 text-emerald-800", skipped: "bg-slate-100 text-slate-700",
  awaiting: "bg-blue-50 text-blue-800", attention: "bg-amber-50 text-amber-900",
  ready: "bg-slate-100 text-slate-700", unchanged: "bg-slate-100 text-slate-700", linked: "bg-blue-50 text-blue-800",
};
function checkedTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function ImportFieldResults({ row, busy, dirty, onAction }) {
  const result = importFieldResults(row);
  if (!result.fields.length) return null;
  return <section aria-label="Saved field results" className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h4 className="font-bold text-slate-900">What finished and what remains</h4>
        <p className="mt-1 text-sm text-slate-600">Saved results, not a live NXT check. Creating a record does not confirm every requested field.</p>
      </div>
      {result.targetId && <p className="text-sm text-slate-600">NXT ID {result.targetId}</p>}
    </div>
    {dirty && <p role="status" className="text-sm text-amber-900">Unsaved edits are not reflected here. Save or cancel them before continuing.</p>}
    {result.next && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 p-3">
      <div className="min-w-0 flex-1" style={{ flexBasis: "260px" }}>
        <p className="text-sm font-semibold text-slate-800">Next step</p>
        <p className="mt-1 text-sm text-slate-600">{result.next.detail}</p>
      </div>
      {result.next.kind === "wait" ? <p role="status" className="text-sm text-slate-700">{result.next.label}</p> :
        <button type="button" disabled={busy || dirty} onClick={() => onAction(result.next)}
          className="min-h-11 rounded-full bg-emerald-800 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? "Please wait..." : result.next.label}
        </button>}
    </div>}
    <ul className="divide-y divide-slate-100">
      {result.fields.map((field) => <li key={field.key} className="grid gap-x-4 gap-y-1 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_11rem]">
        <p className="text-sm font-semibold text-slate-900">{field.field}</p>
        <div className="min-w-0">
          {field.value && <p className="break-words text-sm text-slate-700">{field.value}</p>}
          {field.checkedAt && <p className="mt-1 text-xs text-slate-500">Saved check: {checkedTime(field.checkedAt)}</p>}
        </div>
        <span className={`w-fit self-start rounded-full px-2.5 py-1 text-xs font-semibold ${tones[field.state]}`}>{field.status}</span>
        {field.state !== "verified" && <p className="break-words text-xs leading-relaxed text-slate-600 sm:col-span-3">{field.detail}</p>}
      </li>)}
    </ul>
  </section>;
}
