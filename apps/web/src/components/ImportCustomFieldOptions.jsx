import { useRef, useState } from "react";

export default function ImportCustomFieldOptions({ category, onChange, disabled }) {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function load() {
    if (disabled || pending.current) return;
    pending.current = true; setLoading(true); setError("");
    try {
      const response = await fetch("/api/constituency-import/custom-field-categories");
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.categories)) throw new Error(data.error || "Could not load NXT categories.");
      setCategories(data.categories);
    } catch { setError("NXT categories could not be loaded. Try again when the connection is available. No import was submitted."); }
    finally { pending.current = false; setLoading(false); }
  }
  return <section aria-label="Custom-field import options" className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
    <h3 className="font-semibold text-slate-900">Add a constituent custom field</h3>
    <p className="text-sm text-slate-600">Choose one existing category for this file. Map Custom Field Value, plus optional Date and Comment columns. Blank rows add nothing. Exact duplicates are skipped; different existing values stay in review.</p>
    <button type="button" disabled={disabled || loading} onClick={load} className="min-h-11 font-semibold text-emerald-800 underline disabled:opacity-50">{loading ? "Loading NXT categories..." : "Load NXT categories"}</button>
    <label className="block text-sm font-semibold text-slate-800">NXT custom-field category
      <select value={category} disabled={disabled || loading} onChange={(event) => onChange(event.target.value)} className="mt-1 block min-h-11 w-full rounded-lg border border-slate-300 bg-white p-2">
        <option value="">Choose a category</option>
        {category && !categories.some((item) => item.name === category) && <option value={category}>{category} (saved choice; rechecked before sending)</option>}
        {categories.map((item) => <option key={item.name} value={item.name}>{item.name} ({item.dataType})</option>)}
      </select>
    </label>
    <p className="text-xs text-slate-600">Text, table, Yes/No, date, number and currency categories only. No new categories or table entries are created. Relationship Originator and MGOGPT remain in their existing workflows. Comments: 50 characters maximum.</p>
    {error && <p role="alert" className="text-sm text-amber-900">{error}</p>}
  </section>;
}
