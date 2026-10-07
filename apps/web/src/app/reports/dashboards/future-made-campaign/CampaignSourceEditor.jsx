"use client";
import { useRef, useState } from "react";
import { CAMPAIGN_FIELDS } from "@/utils/campaignPriorities";
import { CAMPAIGN_FIELD_HELP, campaignRequiredFields, campaignFieldCandidates, campaignMappingIssues, suggestCampaignColumns } from "@/utils/campaignSourceMapping";
import styles from "./campaign.module.css";

const blankSource = { queryId: "27460", queryName: "", mode: "split", columns: {} };

export default function CampaignSourceEditor({ data, pending, command, onClose, readFields }) {
  const saved = data.config?.sourceKey ? data.config : blankSource;
  const [source, setSource] = useState({ queryId: saved.queryId, queryName: saved.queryName, mode: saved.mode, columns: saved.columns || {}, confirmed: false });
  const [fields, setFields] = useState([]), [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(""), [loading, setLoading] = useState(false), [suggested, setSuggested] = useState([]);
  const request = useRef(0);
  const required = campaignRequiredFields(source.mode);
  const issues = campaignMappingIssues(source, fields, loaded);
  const complete = required.filter(key => source.columns[key] && !issues.some(issue => issue.key === key)).length;
  async function loadFields() {
    const id = ++request.current;
    setLoading(true); setError(""); setLoaded(false);
    setSource(current => ({ ...current, confirmed: false }));
    try {
      const result = await readFields(source.queryId);
      if (id !== request.current) return;
      setFields(result.fields); setLoaded(true);
      const matches = suggestCampaignColumns(result.fields, source.mode, source.columns);
      setSuggested(matches.suggested);
      setSource(current => ({ ...current, queryName: result.queryName, columns: matches.columns, confirmed: false }));
    } catch (e) { if (id === request.current) setError(e.message); }
    finally { if (id === request.current) setLoading(false); }
  }
  function changeQuery(value) {
    request.current++;
    setSource({ queryId: value, queryName: "", mode: source.mode, columns: {}, confirmed: false });
    setFields([]); setLoaded(false); setSuggested([]); setLoading(false); setError("");
  }
  function changeMode(mode) {
    setSource(current => ({ ...current, mode, columns: { ...current.columns, splitId: "", amount: "" }, confirmed: false }));
    setSuggested(current => current.filter(key => !["splitId", "amount"].includes(key)));
  }
  function fieldControl(key) {
    const value = source.columns[key] || "", fieldIssues = issues.filter(issue => issue.key === key);
    return <div key={key} className={styles.mappingField}>
      <label htmlFor={`campaign-source-${key}`}>{CAMPAIGN_FIELDS[key]}</label>
      <select id={`campaign-source-${key}`} value={value} disabled={pending || loading}
        aria-describedby={`campaign-help-${key}`} aria-invalid={Boolean(value && fieldIssues.length)}
        onChange={e => { setSource(current => ({ ...current, columns: { ...current.columns, [key]: e.target.value }, confirmed: false })); setSuggested(current => current.filter(item => item !== key)); }}>
        <option value="">{required.includes(key) ? "Choose a matching query field" : "Not included"}</option>
        {value && !fields.includes(value) && <option value={value}>{value} ({loaded ? "not returned" : "saved; reload to verify"})</option>}
        {fields.map(field => <option key={field} value={field}>{field}</option>)}
      </select>
      <p id={`campaign-help-${key}`} className={styles.fieldHelp}>{CAMPAIGN_FIELD_HELP[key]}</p>
      {suggested.includes(key) && <small className={styles.matchTag}>Suggested from the query label. Please review.</small>}
      {value && fieldIssues.map(issue => <small key={issue.message} className={styles.fieldIssue}>{issue.message}</small>)}
      {!value && required.includes(key) && !campaignFieldCandidates(key, fields, source.mode).length && <small className={styles.fieldIssue}>No clear match returned. Do not substitute another ID or amount.</small>}
    </div>;
  }
  return <section className={styles.card} aria-label="Campaign source setup">
    <div className={styles.sectionHead}><div><h2>Connect your campaign query</h2><p>Choose the query, match its fields, then save. Nothing is imported or changed in NXT during setup.</p></div><button onClick={onClose} disabled={pending || loading}>Close setup</button></div>
    <h3>1. Load the available fields</h3>
    <div className={styles.formGrid}>
      <label>Saved Gift query system ID<input value={source.queryId} onChange={e => changeQuery(e.target.value)} inputMode="numeric" disabled={pending} /></label>
      <div className={styles.fieldAction}><button disabled={loading || pending || !/^[1-9]\d*$/.test(source.queryId)} onClick={loadFields}>{loading ? "Loading fields..." : loaded ? "Reload query fields" : "Load query fields"}</button><small>Reads the saved query definition only, not gift records.</small></div>
    </div>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!loaded && <p className={styles.muted}>Load fields to see matches and any missing information. Your saved settings stay unchanged.</p>}
    {loaded && <>
      <p role="status" className={styles.mappingSummary}><strong>{source.queryName}</strong><span>{fields.length} fields loaded. {complete} of {required.length} required fields matched. Suggestions are not saved yet.</span></p>
      <h3>2. Match fields to the campaign</h3>
      <label className={styles.basis}>Amount basis<select value={source.mode} disabled={pending || loading} onChange={e => changeMode(e.target.value)}>
        <option value="split">One campaign-countable amount per fund split (recommended)</option><option value="gift">One amount and one fund per gift</option>
      </select></label>
      <p className={styles.fieldHelp}>{source.mode === "split" ? "Keep this selected when gifts can support multiple funds. Each allocation needs its own ID and amount." : "Use this when every gift belongs to one campaign fund. If a gift appears under different funds, the import stops for review rather than counting it twice."}</p>
      {issues.length > 0 && <div className={styles.notice} aria-label="Mapping still needed"><strong>Before you can save</strong><ul>{[...new Set(issues.map(issue => issue.message))].map(message => <li key={message}>{message}</li>)}</ul><p>If a required field is not available in NXT, leave it unresolved. We need to verify the source rather than guess or divide gift amounts.</p></div>}
      <div className={styles.formGrid}>{required.map(fieldControl)}</div>
      <h3>Optional display fields</h3><p className={styles.fieldHelp}>These add context. They do not change campaign credit.</p>
      <div className={styles.formGrid}>{Object.keys(CAMPAIGN_FIELDS).filter(key => !required.includes(key) && key !== "splitId").map(fieldControl)}</div>
      <details className={styles.returnedFields}><summary>All returned query fields ({fields.length})</summary><ul>{fields.map(field => <li key={field}>{field}</li>)}</ul></details>
      {fields.some(field => /pledge.*balance/i.test(field)) && <p className={styles.muted}>Pledge balance is available in your query, but the current dashboard does not import it. It must not replace or be added to campaign credit without a separate agreed calculation.</p>}
      <h3>3. Review and save</h3>
      <p className={styles.fieldHelp}>Saving remembers these choices. After saving, use Refresh campaign to import gifts; then assign the returned funds to priorities.</p>
      <label className={styles.check}><input type="checkbox" checked={source.confirmed} disabled={pending || loading || issues.length > 0}
        onChange={e => setSource(current => ({ ...current, confirmed: e.target.checked }))} />I reviewed the system IDs and campaign-countable amount. The query includes the gifts that should count for this campaign.</label>
      {data.runId && <p className={styles.muted}>Changing mappings keeps the last complete results visible, but fund assignments and exceptions do not transfer automatically to a different source.</p>}
      <button className={styles.primary} disabled={pending || loading || !source.confirmed || issues.length > 0} onClick={async () => { if (await command("source", source)) onClose(); }}>Save source settings</button>
    </>}
  </section>;
}
