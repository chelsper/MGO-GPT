import { useState } from "react";

export default function ImportNameFormatDefaults({ value, onChange, disabled = false }) {
  const [formats, setFormats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/constituency-import/name-formats", { cache: "no-store" });
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.formats)) throw new Error(payload.error || "Could not load NXT formats.");
      setFormats(payload.formats);
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }
  return <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4 space-y-3">
    <h3 className="font-bold text-slate-900">New record name formats</h3>
    <p className="text-sm text-slate-700">Choose an NXT table format for this file. NXT builds the addressee or salutation automatically, not as editable custom text. Existing constituents are not changed.</p>
    <button type="button" className="rounded-lg border border-blue-300 bg-white px-3 py-2 font-semibold" onClick={load} disabled={disabled || loading}>{loading ? "Loading formats..." : "Load NXT table formats"}</button>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    <div className="grid gap-3 sm:grid-cols-2">
      {["addressee", "salutation"].map((kind) => <label key={kind} className="grid min-w-0 gap-1 text-sm font-semibold">
        Default {kind} for new records
        <select className="w-full min-w-0 rounded-lg border border-slate-300 bg-white p-3" value={value[kind] || ""} disabled={disabled} onChange={(event) => onChange({ ...value, [kind]: event.target.value })}>
          <option value="">Use NXT's normal default</option>
          {value[kind] && !formats.some((format) => format.id === value[kind]) && <option value={value[kind]}>Saved NXT format {value[kind]} (load to see label)</option>}
          {formats.map((format) => <option key={format.id} value={format.id}>{format.format}</option>)}
        </select>
      </label>)}
    </div>
    <p className="text-xs text-slate-600">Select before preparing the import. Do not also select custom text for the same name format.</p>
  </section>;
}
