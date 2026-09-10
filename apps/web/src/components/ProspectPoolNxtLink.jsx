import { useEffect, useState } from "react";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import { poolButtonStyle } from "@/components/ProspectPoolNavigation";

export default function ProspectPoolNxtLink({ entry, onLinked }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(entry.prospect_name || "");
  const [matches, setMatches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMatches([]);
    setError("");
    if (query.trim().length < 2) {
      setStatus("Enter at least two characters to search NXT.");
      return;
    }
    let active = true;
    const controller = new AbortController();
    setStatus("Searching NXT...");
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/blackbaud/constituents/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (!response.ok) throw new Error("NXT search is unavailable. Try again; no record has been linked.");
        const data = await response.json();
        if (!active) return;
        const results = Array.isArray(data.results) ? data.results.filter((match) => match.blackbaudConstituentId) : [];
        setMatches(results);
        setStatus(data.warning || (results.length ? "Compare the records, then select the correct match." : "No matches returned. Try another name or lookup ID."));
      } catch (err) {
        if (active) {
          setStatus("");
          setError(err.message || "NXT search is unavailable. No record has been linked.");
        }
      }
    }, 250);
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [open, query]);

  async function linkRecord() {
    if (!selected || saving) return;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/prospect-pool/${entry.id}/link-constituent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blackbaudConstituentId: selected.blackbaudConstituentId, confirmLink: true }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not link this NXT record.");
      onLinked(data);
    } catch (err) {
      setError(err.message || "Could not link this NXT record.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section aria-label={`NXT link for ${entry.prospect_name}`} style={{ padding: "16px", marginTop: "16px", border: "1px solid #FCD34D", borderRadius: "12px", background: "#FFFBEB" }}>
      <strong>NXT record not linked</strong>
      <p style={{ fontSize: "14px", lineHeight: 1.5 }}>
        The assignment is saved in the app. Link the correct existing NXT record to load contact details and enable MGOGPT sync. Linking does not create or change a record in NXT.
      </p>
      {!open ? (
        <button type="button" style={poolButtonStyle} onClick={() => setOpen(true)}>Link NXT record</button>
      ) : (
        <div style={{ display: "grid", gap: "12px" }}>
          <label style={{ display: "grid", gap: "6px" }}>
            Search NXT by name or lookup ID
            <input value={query} disabled={saving} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} style={{ padding: "12px", border: "1px solid #D1D5DB", borderRadius: "8px", minWidth: 0, width: "100%", boxSizing: "border-box" }} />
          </label>
          {status ? <div role="status">{status}</div> : null}
          {error ? <div role="alert" style={{ color: "#991B1B" }}>{error}</div> : null}
          <div style={{ display: "grid", gap: "8px", maxHeight: "300px", overflowY: "auto" }}>
            {matches.map((match) => (
              <div key={match.blackbaudConstituentId} style={{ padding: "12px", border: "1px solid #BFDBFE", borderRadius: "8px", background: "white", overflowWrap: "anywhere" }}>
                <strong>{match.name || "Unnamed constituent"}</strong>
                <div>Lookup ID: {match.lookupId || "Unavailable"} | NXT record: {match.blackbaudConstituentId}</div>
                {match.email ? <div>{match.email}</div> : null}
                {match.address ? <div style={{ whiteSpace: "pre-wrap" }}>{match.address}</div> : null}
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" }}>
                  <a href={buildBlackbaudConstituentProfileUrl(match.blackbaudConstituentId)} target="_blank" rel="noopener noreferrer" style={poolButtonStyle}>Open NXT record</a>
                  <button type="button" disabled={saving} aria-pressed={selected?.blackbaudConstituentId === match.blackbaudConstituentId} onClick={() => setSelected(match)} style={poolButtonStyle}>
                    {selected?.blackbaudConstituentId === match.blackbaudConstituentId ? "Selected" : "Use this match"}
                  </button>
                </div>
              </div>
            ))}
          </div>
          {selected ? <p>Confirm linking this pool entry to <strong>{selected.name}</strong> (NXT record {selected.blackbaudConstituentId}). The assigned MGO will not change.</p> : null}
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button type="button" disabled={!selected || saving} onClick={linkRecord} style={{ ...poolButtonStyle, opacity: !selected || saving ? 0.5 : 1 }}>
              {saving ? "Linking..." : "Confirm NXT link"}
            </button>
            <button type="button" disabled={saving} onClick={() => { setOpen(false); setSelected(null); }} style={poolButtonStyle}>Cancel linking</button>
          </div>
        </div>
      )}
    </section>
  );
}
