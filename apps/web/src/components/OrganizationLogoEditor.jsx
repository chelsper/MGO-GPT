import { useEffect, useRef, useState } from "react";
import { prepareOrganizationLogo } from "@/utils/organizationLogo";

export default function OrganizationLogoEditor({ value, shortName, disabled, onChange, onBusyChange }) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const attempt = useRef(0);
  useEffect(() => () => { attempt.current += 1; }, []);
  async function choose(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const version = ++attempt.current;
    setBusy(true); onBusyChange(true); setError("");
    try {
      const logo = await prepareOrganizationLogo(file);
      if (version === attempt.current) onChange(logo);
    } catch (failure) {
      if (version === attempt.current) setError(failure.message);
    } finally {
      if (version === attempt.current) { setBusy(false); onBusyChange(false); }
    }
  }
  return <section aria-labelledby="organization-logo-heading" style={{ margin: "24px 0", padding: 20, border: "1px solid #D1E4DF", borderRadius: 16, background: "#F8FCFB" }}>
    <h3 id="organization-logo-heading" style={{ margin: "0 0 8px" }}>Organization logo</h3>
    <p style={{ color: "#4B5563", margin: "0 0 16px" }}>Use your logo in the app header and navigation. Save the institution profile to apply it.</p>
    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 20 }}>
      <div style={{ width: 136, height: 96, flexShrink: 0, border: "1px solid #D1D5DB", borderRadius: 12, background: "white", display: "grid", placeItems: "center", padding: 12, boxSizing: "border-box" }}>
        {value ? <img src={value} alt="Organization logo preview" style={{ maxWidth: "100%", maxHeight: 70, objectFit: "contain" }} /> : <span aria-label="Initials preview" style={{ color: "#007963", fontSize: 26, fontWeight: 800 }}>{shortName}</span>}
      </div>
      <div style={{ flex: "1 1 240px", minWidth: 0 }}>
        <label style={{ display: "block", fontWeight: 700 }}>Choose logo<input type="file" accept="image/png,image/jpeg,image/webp" disabled={disabled || busy} onChange={choose} style={{ display: "block", margin: "10px 0", maxWidth: "100%" }} /></label>
        <small style={{ color: "#4B5563" }}>PNG, JPEG, or WebP up to 2 MB. Automatically resized; transparent PNG works best. The file stays in your browser until you save.</small>
        {value && <button type="button" disabled={disabled || busy} onClick={() => { setError(""); onChange(null); }} style={{ display: "block", marginTop: 12, minHeight: 44, padding: "8px 14px", border: "1px solid #CBD5E1", borderRadius: 10, background: "white" }}>Restore initials</button>}
      </div>
    </div>
    {busy && <p role="status">Preparing logo preview...</p>}
    {error && <p role="alert" style={{ color: "#991B1B" }}>{error}</p>}
  </section>;
}
