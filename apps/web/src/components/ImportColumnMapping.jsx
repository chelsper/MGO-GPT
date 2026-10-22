export default function ImportColumnMapping({ fields, headers, mappings, disabled, onChange }) {
  if (!headers.length) return null;
  const problems = fields.filter((field) => !headers.includes(mappings[field.key]));
  const unused = headers.filter((header) => !Object.values(mappings).includes(header));
  return <details className="rounded-2xl border border-slate-200 bg-slate-50 p-4" open={problems.length ? true : undefined}>
    <summary className="cursor-pointer font-bold text-slate-900">Review columns ({fields.length} selected{problems.length ? `, ${problems.length} need attention` : ""})</summary>
    <p className="mt-2 text-sm text-slate-600">Match each selected field to a column in this file. To add or remove a field, use Choose import fields above. Missing setup columns are never guessed.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {fields.map((field) => <label key={field.key} className="grid min-w-0 gap-1 text-sm font-semibold text-slate-700">{field.label} column
        <select disabled={disabled} value={mappings[field.key] || ""} onChange={(event) => onChange(field.key, event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2">
          <option value="">Choose a column</option>
          {mappings[field.key] && !headers.includes(mappings[field.key]) && <option value={mappings[field.key]}>{mappings[field.key]} (missing)</option>}
          {headers.map((header) => <option key={header} value={header}>{header}</option>)}
        </select>
      </label>)}
    </div>
    {unused.length > 0 && <p className="mt-3 break-words text-sm text-amber-900">Not included: {unused.join(", ")}. These columns will not be imported.</p>}
  </details>;
}
