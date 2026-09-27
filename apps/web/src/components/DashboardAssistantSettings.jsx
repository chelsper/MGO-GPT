import DashboardAssistantAvatar from "./DashboardAssistantAvatar";
import { normalizeDashboardAssistant } from "@/utils/dashboardAssistantSettings";

export default function DashboardAssistantSettings({ value, onChange, disabled }) {
  const settings = normalizeDashboardAssistant(value);
  return <fieldset disabled={disabled} style={{ margin: "20px 0", border: "1px solid #cce5dd", padding: 20, borderRadius: 16, minWidth: 0 }}>
    <legend style={{ fontWeight: 750 }}>Dashboard helper</legend>
    <p style={{ color: "#4b5563", margin: "0 0 16px" }}>A quiet place to review saved follow-ups and opportunity dates. It appears only on the personal dashboard and never changes NXT or sends messages.</p>
    <label style={{ display: "block", marginBottom: 16 }}><input type="checkbox" checked={settings.enabled} onChange={e => onChange({ ...settings, enabled: e.target.checked })} /> Show the dashboard helper</label>
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "center" }}>
      <DashboardAssistantAvatar avatar={settings.avatar} />
      <label style={{ display: "grid", gap: 6 }}>Helper name
        <input maxLength={40} value={value?.name ?? settings.name} onChange={e => onChange({ ...settings, name: e.target.value })} style={{ padding: 12, border: "1px solid #d1d5db", borderRadius: 10, maxWidth: "100%" }} />
      </label>
      <label style={{ display: "grid", gap: 6 }}>Helper avatar
        <select value={settings.avatar} onChange={e => onChange({ ...settings, avatar: e.target.value })} style={{ padding: 12, border: "1px solid #d1d5db", borderRadius: 10 }}>
          <option value="dolphin">Dolphin</option><option value="compass">Compass</option>
        </select>
      </label>
    </div>
    <p style={{ color: "#4b5563", marginBottom: 0 }}>Save the Institution Profile below to apply these choices for your organization.</p>
  </fieldset>;
}
