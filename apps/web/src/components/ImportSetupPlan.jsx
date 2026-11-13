export default function ImportSetupPlan({ plan, saved = false, disabled = false, onChoice, onOptions, children }) {
  return <section aria-label="Your import plan" className="min-w-0 space-y-4">
    <div>
      <h2 className="text-xl font-bold text-slate-900">{saved ? "Saved import" : "Your import plan"}</h2>
      <p className="mt-1 text-sm text-slate-600">{saved
        ? "Continue the saved review below. Upload a new file to start another import."
        : !plan.rowCount
          ? "Upload a CSV to see its fields and choices here. No need to configure the full field catalog first."
          : `${plan.rowCount} ${plan.rowCount === 1 ? "row" : "rows"} in this file. ${plan.description}`}</p>
    </div>
    {!saved && plan.rowCount > 0 && <>
      <p className="text-sm font-semibold text-emerald-800">This is a requested plan, not an approval. NXT matching, duplicate checks, and row-level review come next.</p>
      {children}
      <div className="grid gap-3">
        {plan.groups.map((item) => <div key={item.group} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-semibold text-slate-900">{item.group}</h3>
            <span className="text-xs font-semibold text-slate-600">{item.status}</span>
          </div>
          <p className="mt-1 break-words text-xs text-slate-600">{item.fields.join(", ")}</p>
          <p className="mt-2 text-sm text-slate-700">{item.description}</p>
          {item.choice && <label className="mt-2 flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-800">
            <input type="checkbox" checked={item.checked} disabled={disabled} className="focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2" onChange={(event) => { if (!disabled) onChoice(item.choice, event.target.checked); }} />
            {item.choiceLabel}
          </label>}
          {onOptions && <button type="button" disabled={disabled} onClick={() => onOptions(item.group)}
            className="mt-1 min-h-11 text-left text-sm font-semibold text-emerald-800 underline focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-50">Options for {item.group.toLowerCase()}</button>}
        </div>)}
      </div>
      {plan.extras.length > 0 && <div className="rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
        {plan.extras.map((extra) => <p key={extra} className="mb-2">{extra}</p>)}
        {plan.nameBuilderEnabled && onOptions && <button type="button" disabled={disabled} onClick={() => onOptions("Addressee and salutation fields")}
          className="min-h-11 font-semibold text-emerald-800 underline focus-visible:ring-2 focus-visible:ring-emerald-700 disabled:opacity-50">Name-format options</button>}
      </div>}
      {plan.unusedHeaders.length > 0 && <p className="text-sm text-slate-600">{plan.unusedHeaders.length} unused {plan.unusedHeaders.length === 1 ? "column is" : "columns are"} excluded. See "Not included" under column mapping; use "Add more fields" to include one.</p>}
      <p className="text-xs text-slate-600">Unselected fields stay unchanged. Blank name/profile cells never clear NXT values. Setup choices do not send data to NXT.</p>
    </>}
  </section>;
}
