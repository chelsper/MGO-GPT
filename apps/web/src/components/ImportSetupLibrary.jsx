import { useEffect, useState } from "react";
import { normalizeImportSetup } from "@/utils/importSetups";

const endpoint = "/api/constituency-import/setups";
const button = "min-h-11 rounded-full border border-indigo-200 bg-white px-4 py-2 text-sm font-semibold text-indigo-700 disabled:opacity-50";

export default function ImportSetupLibrary({ selected, configuration, disabled, canSave, onSelect, onSaved, onBusyChange }) {
  const [setups, setSetups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const currentSetup = setups.find((item) => item.id === selected?.id);
  const selectionChanged = Boolean(selected && !loading && currentSetup?.revision !== selected.revision);
  useEffect(() => { setName(selected?.configuration.name || ""); }, [selected?.id, selected?.revision]);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const payload = await response.json();
      if (!response.ok || !Array.isArray(payload.setups)) throw new Error("Your setups could not be loaded. You can still configure a new import below.");
      if (active) setSetups(payload.setups);
    }).catch((error) => { if (active) setError(error.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [attempt]);

  async function save(method) {
    if (busy || disabled) return;
    if (method !== "POST" && selectionChanged) return;
    if (method === "DELETE" && !window.confirm(`Remove the saved setup "${selected.configuration.name}"? Saved import runs and NXT records will not change.`)) return;
    setError("");
    setMessage("");
    let body;
    try {
      body = method === "DELETE" ? {} : { configuration: normalizeImportSetup({ ...configuration, name }) };
      if (method !== "POST") Object.assign(body, { id: selected.id, revision: selected.revision });
    } catch (error) { setError(error.message); return; }
    setBusy(true);
    onBusyChange(true);
    try {
      const response = await fetch(endpoint, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok || (method !== "DELETE" && !payload.setup?.configuration) || (method === "DELETE" && payload.deleted !== true)) throw new Error(payload.error || "The setup could not be saved. Reload your setups before retrying.");
      if (method === "DELETE") {
        setSetups((items) => items.filter((item) => item.id !== selected.id));
        onSaved(null);
        setMessage("Setup removed. Your current file and saved import runs are unchanged.");
      } else {
        setSetups((items) => [...items.filter((item) => item.id !== payload.setup.id), payload.setup].sort((a, b) => a.configuration.name.localeCompare(b.configuration.name)));
        onSaved(payload.setup);
        setMessage("Setup saved to your account. No constituent data or approvals were saved in it.");
      }
    } catch (error) { setError(error.message || "Could not save. Reload your setups before retrying."); }
    finally { setBusy(false); onBusyChange(false); }
  }

  return <section aria-label="Saved import setups" className="mb-5 rounded-2xl border border-indigo-200 bg-white p-5">
    <h2 className="text-xl font-bold text-slate-900">Use a saved import setup</h2>
    <p className="mt-1 text-sm text-slate-600">Reuse your columns, import purpose, and contact options. Each file still needs fresh checks and approval.</p>
    <div className="mt-4 flex flex-wrap items-end gap-3">
      <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold text-slate-700" style={{ flexBasis: "280px" }}>
        Your saved setups
        <select className="min-h-11 w-full rounded-xl border border-slate-300 bg-white px-3" value={selected?.id || ""} disabled={disabled || busy || loading}
          onChange={(event) => { setMessage(""); setError(""); onSelect(setups.find((item) => item.id === event.target.value) || null); }}>
          <option value="">Start without a saved setup</option>
          {selected && !setups.some((item) => item.id === selected.id) && <option value={selected.id}>{selected.configuration.name} (reload to check)</option>}
          {setups.map((setup) => <option key={setup.id} value={setup.id}>{setup.configuration.name}</option>)}
        </select>
      </label>
      <button type="button" className={button} disabled={busy || disabled || loading} onClick={() => setAttempt((value) => value + 1)}>{loading ? "Loading setups..." : "Reload setups"}</button>
    </div>
    {selectionChanged && <div className="mt-3 text-sm text-amber-900">
      <p>{currentSetup ? "This setup changed elsewhere. Load its current version before updating or removing it." : "This setup is no longer in your saved list. Your current file is unchanged; you can save a new setup."}</p>
      {currentSetup && <button type="button" className={`${button} mt-2`} disabled={busy || disabled} onClick={() => onSelect(currentSetup)}>Load current saved setup</button>}
    </div>}
    <details className="mt-4 text-sm text-slate-700">
      <summary className="cursor-pointer font-semibold">Save or manage a setup</summary>
      <p className="mt-2">Configure the file below, then save it here. Setups are private to your account in this app. Primary flags come from each new file; no previous recipient choices are reused.</p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="grid min-w-0 flex-1 gap-1 font-semibold" style={{ flexBasis: "260px" }}>Setup name
          <input value={name} maxLength={80} placeholder="e.g. New constituents with contacts" disabled={busy || disabled} onChange={(event) => setName(event.target.value)} className="min-h-11 w-full rounded-xl border border-slate-300 px-3" />
        </label>
        <button type="button" className={button} disabled={disabled || busy || !canSave || !name.trim()} onClick={() => save("POST")}>Save as new setup</button>
        {selected && <>
          <button type="button" className={button} disabled={disabled || busy || selectionChanged || !canSave || !name.trim()} onClick={() => save("PUT")}>Update selected setup</button>
          <button type="button" className={button} disabled={disabled || busy || selectionChanged} onClick={() => save("DELETE")}>Remove setup</button>
        </>}
      </div>
      {!canSave && <p className="mt-2 text-slate-600">Upload a file and select its columns before saving a setup. Existing saved runs are not changed here.</p>}
    </details>
    {message && <p role="status" className="mt-3 text-sm text-emerald-800">{message}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-800">{error}</p>}
  </section>;
}
