import { useState } from "react";

export default function ImportColumnMapping({ fields, availableFields = fields, headers, mappings, rows = [], disabled, onChange, onToggle }) {
  const [fieldToAdd, setFieldToAdd] = useState("");
  if (!headers.length) return null;
  const problems = fields.filter((field) => !headers.includes(mappings[field.key]));
  const unused = headers.filter((header) => !Object.values(mappings).includes(header));
  const unselected = availableFields.filter((field) => !fields.some((selected) => selected.key === field.key));
  return <section aria-label="Column mapping" className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
    <h3 className="font-bold text-slate-900">Match your columns</h3>
    <p className="mt-1 text-sm text-slate-600">Keep your own column names. Check the sample values, then choose which fields to include. Mapping a field does not approve an NXT change.</p>
    <p className="mt-2 text-sm font-semibold text-slate-700">{fields.length} selected{problems.length ? `; ${problems.length} need a column or can be removed` : "; all columns found"}.</p>
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      {fields.map((field) => {
        const sample = rows.find((row) => String(row[mappings[field.key]] ?? "").trim())?.[mappings[field.key]];
        return <div key={field.key} className="min-w-0 rounded-xl border border-slate-200 bg-white p-3">
          <label className="grid min-w-0 gap-1 text-sm font-semibold text-slate-700">{field.label} column
            <select disabled={disabled} value={mappings[field.key] || ""} onChange={(event) => onChange(field.key, event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2">
              <option value="">Choose a column</option>
              {mappings[field.key] && !headers.includes(mappings[field.key]) && <option value={mappings[field.key]}>{mappings[field.key]} (missing)</option>}
              {headers.map((header) => <option key={header} value={header}>{header}</option>)}
            </select>
          </label>
          <div className="mt-1 flex items-start justify-between gap-2">
            <p className="min-w-0 break-words py-2 text-xs text-slate-600">Sample: {sample == null ? "No populated value in this file" : String(sample).slice(0, 180)}</p>
            {onToggle && <button type="button" disabled={disabled} onClick={() => onToggle(field.key)} aria-label={`Remove ${field.label} from import`}
              className="min-h-11 shrink-0 px-2 text-sm font-semibold text-slate-600 underline disabled:opacity-50">Remove</button>}
          </div>
        </div>;
      })}
    </div>
    {onToggle && unselected.length > 0 && <details className="mt-4">
      <summary className="min-h-11 cursor-pointer py-3 text-sm font-semibold text-emerald-800">Add more fields</summary>
      <div className="flex flex-wrap items-end gap-2">
      <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold text-slate-700">Add another field
        <select value={fieldToAdd} disabled={disabled} onChange={(event) => setFieldToAdd(event.target.value)} className="min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2">
          <option value="">Choose an import field</option>
          {[...new Set(unselected.map((field) => field.group))].map((group) => <optgroup key={group} label={group}>
            {unselected.filter((field) => field.group === group).map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
          </optgroup>)}
        </select>
      </label>
      <button type="button" disabled={disabled || !unselected.some((field) => field.key === fieldToAdd)} onClick={() => { onToggle(fieldToAdd); setFieldToAdd(""); }}
        className="min-h-11 rounded-full border border-emerald-700 bg-white px-4 text-sm font-semibold text-emerald-800 disabled:opacity-50">Add field</button>
      </div>
    </details>}
    <p className="mt-3 text-xs text-slate-600">NXT System ID identifies the record. NXT Lookup ID is its lookup code. External Constituent ID is a source reference only, not an NXT match.</p>
    {unused.length > 0 && <p className="mt-3 break-words text-sm text-slate-600">Not included: {unused.join(", ")}. These columns will not be imported.</p>}
  </section>;
}
