import DashboardAssistantAvatar from "./DashboardAssistantAvatar";
import { HELPER_NUMBER_FIELDS, HELPER_TONES, normalizeDashboardAssistant, validateDashboardAssistant } from "@/utils/dashboardAssistantSettings";
import { buildOutreachDraft } from "@/utils/outreachDrafts";
import "./DashboardAssistantSettings.css";

export default function DashboardAssistantSettings({ value, onChange, disabled }) {
  const settings = normalizeDashboardAssistant(value);
  const update = patch => onChange({ ...settings, ...value, ...patch });
  const error = validateDashboardAssistant({ ...settings, ...value });
  return <fieldset disabled={disabled} className="helper-settings">
    <legend>Dashboard helper & draft preferences</legend>
    <p>A quiet place to review saved follow-ups, opportunity dates, and gifts. The helper appears only on the personal dashboard. These choices never send messages or change NXT.</p>
    <label className="helper-settings-toggle"><input type="checkbox" checked={settings.enabled} onChange={e => update({ enabled: e.target.checked })} /> Show the dashboard helper</label>
    <div className="helper-settings-identity">
      <DashboardAssistantAvatar avatar={settings.avatar} />
      <label>Helper name
        <input maxLength={40} value={value?.name ?? settings.name} onChange={e => update({ name: e.target.value })} />
      </label>
      <label>Helper avatar
        <select value={settings.avatar} onChange={e => update({ avatar: e.target.value })}>
          <option value="dolphin">Dolphin</option><option value="compass">Compass</option>
        </select>
      </label>
    </div>
    <details className="helper-settings-section">
      <summary>Reminder timing & gift thresholds</summary>
      <p>Choose what appears when someone opens or reloads the helper. Overdue follow-ups and past opportunity dates remain included. These are display rules, not new background jobs or notifications.</p>
      <div className="helper-settings-grid">{Object.entries(HELPER_NUMBER_FIELDS).map(([key, field]) => <label key={key}>{field.label}
        <input type="number" min={field.min} max={field.max} step={1} required value={value?.[key] ?? settings[key]}
          onChange={e => update({ [key]: e.target.value === "" ? "" : Number(e.target.value) })} />
        <small>{field.min.toLocaleString("en-US")} to {field.max.toLocaleString("en-US")}</small>
      </label>)}</div>
      <p>Gift suggestions still require fresh saved records. A larger date window cannot fill missing history. Documentation checks remain manual and must use a higher threshold than stewardship suggestions. These amounts do not change society levels, goals, or reports.</p>
    </details>
    <details className="helper-settings-section">
      <summary>Draft tone & thank-you wording</summary>
      <p>Applies to the helper's starters and donor-briefing meeting preparation. These are editable starting points, not AI-generated messages or approval to contact a donor.</p>
      <label>Preferred draft tone
        <select value={settings.tone} onChange={e => update({ tone: e.target.value })}>{Object.entries(HELPER_TONES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
      </label>
      <label>Organization-approved thank-you wording (optional)
        <textarea rows={5} maxLength={1200} value={value?.thankYouMessage ?? settings.thankYouMessage} onChange={e => update({ thankYouMessage: e.target.value })} />
        <small>Use a reusable plain-text paragraph, without donor details or merge fields. It replaces the default body after the gift amount. Leave blank to use the selected tone's standard wording. Staff still review the greeting, facts, and signature for each recipient.</small>
      </label>
      <div className="helper-settings-preview" aria-label="Sample thank-you preview">
        <h4>Sample thank-you</h4><p>Illustration only: a $2,500 gift. This preview uses no donor data and does not save your settings.</p>
        <pre>{buildOutreachDraft({ kind: "gift", giftAmount: 2500, drafting: settings }, "thank-you")}</pre>
      </div>
    </details>
    {error && <p role="alert">{error}</p>}
    <p>Save the Institution Profile below to apply these choices for your organization. Existing drafts are never rewritten automatically.</p>
  </fieldset>;
}
