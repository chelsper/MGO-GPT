import { IMPORT_PRESETS } from "@/utils/importPresets";

export default function ImportPresetPicker({ value, disabled, onSelect }) {
  const selected = IMPORT_PRESETS.find((item) => item.id === value);
  return <section aria-label="Import starting points" className="mb-5 rounded-2xl border border-emerald-200 bg-white p-5">
    <h2 className="text-xl font-bold text-slate-900">Start with what you want to do</h2>
    <p className="mt-1 text-sm text-slate-600">Choose a starting point before or after uploading. We suggest the relevant columns and options; you review the plan before any NXT checks or writes.</p>
    <div className="mt-4 grid gap-3 md:grid-cols-3">
      {IMPORT_PRESETS.map((item) => <button type="button" key={item.id} aria-pressed={item.id === value} disabled={disabled}
        onClick={() => onSelect(item.id)}
        className={`min-w-0 rounded-xl border p-4 text-left focus-visible:ring-2 focus-visible:ring-emerald-700 focus-visible:ring-offset-2 disabled:opacity-50 ${item.id === value ? "border-emerald-700 bg-emerald-50 ring-1 ring-emerald-700" : "border-slate-200 bg-white"}`}>
        <span className="block font-bold text-slate-900">{item.label}</span>
        <span className="mt-2 block text-sm leading-6 text-slate-600">{item.description}</span>
      </button>)}
    </div>
    {selected ? <div role="status" className="mt-4 text-sm leading-6 text-emerald-950">
      <p><strong>Starting point: {selected.label}.</strong> {selected.help}</p>
      <p>Refine these choices in Your import plan. Switching starting points resets configuration and confirmation, not the uploaded file. Use a saved setup to keep your custom choices for future files.</p>
    </div> : <p className="mt-4 text-sm text-slate-600">Already have a setup? Use it below, or upload your file and configure it manually. Mixed imports and all supported fields remain available.</p>}
  </section>;
}
