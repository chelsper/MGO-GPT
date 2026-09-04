import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Save } from "lucide-react";
import { getReportHref, getReportTypeDefinitions, getDashboardReportMetadata } from "@/app/api/utils/reportRegistry";
import { validateAlumniFamilyEngagementDashboard } from "@/app/api/utils/alumniDonorConfiguration";
import { validateDashboardConfiguration } from "@/app/api/utils/dashboardConfiguration";
import { getWorkspaceRoleLabel } from "@/utils/workspaceRoles";
import ReportDashboardBuilder from "./ReportDashboardBuilder";
import ReportDashboardPanels from "./ReportDashboardPanels";
import AlumniReportConfiguration, { AlumniReportPreview } from "./AlumniReportConfiguration";
import styles from "./reportConfigurationEditor.module.css";

const NEW_REPORT_KEY = "__new-report-draft__";
const TABS = ["Configure", "Access", "Preview"];
const BUILD_FIELDS = ["title", "description", "dataConfiguration"];
const ACCESS_FIELDS = ["visibility", "specificUserIds", "active"];
const AUDIENCES = {
  all_users: ["All active users", "All active workspace users may open this report."],
  executive: ["Executives", "Access follows the existing executive report policy."],
  specific_users: ["Specific users", "Select the people who should be able to view this report."],
};

const clone = (value) => JSON.parse(JSON.stringify(value));
const isDashboard = (configuration) => configuration?.configurationSchema === "query-count-dashboard-v1";

export function createReportDraft(configuration) {
  return {
    title: configuration?.title || "",
    description: configuration?.description || "",
    visibility: configuration?.visibility || "all_users",
    specificUserIds: [...(configuration?.specificUserIds || [])].map(Number),
    active: configuration?.active === true,
    dataConfiguration: configuration?.dataConfiguration ? clone(configuration.dataConfiguration) : null,
  };
}

function pick(object, keys) { return Object.fromEntries(keys.map((key) => [key, object[key]])); }

export function buildReportConfigurationPatch(configuration, draft, tab) {
  const capabilities = configuration.configurationCapabilities || {};
  const patch = { reportKey: configuration.key };
  if (tab !== "Access") {
    if (capabilities.canEditTitle !== false) patch.title = draft.title;
    if (capabilities.canEditDescription !== false) patch.description = draft.description;
    if (capabilities.dataConfiguration || configuration.supportsDataConfiguration) patch.dataConfiguration = draft.dataConfiguration;
  }
  if (tab !== "Configure") {
    patch.visibility = draft.visibility;
    patch.specificUserIds = draft.visibility === "specific_users" ? draft.specificUserIds : [];
    if (isDashboard(configuration)) patch.active = draft.active;
  }
  return patch;
}

function isDirty(draft, saved, keys = [...BUILD_FIELDS, ...ACCESS_FIELDS]) {
  return JSON.stringify(pick(draft, keys)) !== JSON.stringify(pick(createReportDraft(saved), keys));
}

async function saveReport(payload, create) {
  const response = await fetch("/api/reports/configurations", {
    method: create ? "POST" : "PATCH",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error || "Could not save this report.");
  if (!result?.configuration?.key) throw new Error("The server did not confirm the saved report. Your draft is retained.");
  return result;
}

function AccessEditor({ configuration, draft, users, onChange }) {
  const [search, setSearch] = useState("");
  const generic = isDashboard(configuration);
  const access = configuration.configurationCapabilities?.access || {};
  const matches = users.filter((user) => `${user.name} ${user.email}`.toLowerCase().includes(search.toLowerCase()));
  const userIds = new Set(users.map((user) => Number(user.id)));
  const missingIds = draft.specificUserIds.filter((id) => !userIds.has(id));
  function toggle(id) {
    onChange({ specificUserIds: draft.specificUserIds.includes(id) ? draft.specificUserIds.filter((value) => value !== id) : [...draft.specificUserIds, id] });
  }
  return <section className={styles.stack} aria-label="Report access">
    {generic && <label className={styles.choice}><input type="checkbox" checked={draft.active} onChange={(event) => onChange({ active: event.target.checked })} /><span><strong>Enable this report</strong><small>Only selected active users can open an enabled report. Managers can preview disabled drafts here; administrator status does not grant published-report access.</small></span></label>}
    {!generic && <div className={styles.stack}>
      <h3 style={{ margin: 0 }}>Who can view this report?</h3>
      {(access.allowedVisibilities || Object.keys(AUDIENCES)).filter((key) => AUDIENCES[key]).map((key) => <label className={styles.choice} key={key}><input type="radio" name={`audience-${configuration.key}`} checked={draft.visibility === key} onChange={() => onChange({ visibility: key })} /><span><strong>{AUDIENCES[key][0]}</strong><small>{AUDIENCES[key][1]}</small></span></label>)}
      {access.adminRoleBypass !== false && <p className={styles.muted}>Existing policy: administrators retain access to this built-in report.</p>}
    </div>}
    {draft.visibility === "specific_users" && <>
      <div className={styles.sectionHeading}><h3 style={{ margin: 0 }}>Users with access</h3><span className={styles.tag}>{draft.specificUserIds.length} selected</span></div>
      <label className={styles.field}>Find a user<input type="search" placeholder="Search name or email" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className={styles.users}>
        {matches.map((user) => <label className={styles.choice} key={user.id}><input type="checkbox" checked={draft.specificUserIds.includes(Number(user.id))} onChange={() => toggle(Number(user.id))} /><span><strong>{user.name || user.email}</strong><small>{user.email} / {getWorkspaceRoleLabel(user.role)}</small></span></label>)}
        {!matches.length && <p>No active users match this search.</p>}
      </div>
      {missingIds.map((id) => <label className={styles.choice} key={id}><input type="checkbox" checked onChange={() => toggle(id)} /><span>Inactive or unavailable user #{id}<small>Remove this selection before publishing access changes.</small></span></label>)}
      {!draft.specificUserIds.length && <p className={styles.notice}>{generic ? "This report can remain disabled with no viewers. Choose at least one active user before enabling it." : "Choose at least one active user before saving specific-user access."}</p>}
    </>}
  </section>;
}

function Preview({ configuration, draft, isNew }) {
  const [saved, setSaved] = useState(null);
  const [notice, setNotice] = useState("");
  const generic = isDashboard(configuration);
  const alumni = configuration.key === "alumni-family-engagement";
  const reportKey = configuration.key;
  const savedRevision = configuration.updatedAt;
  useEffect(() => {
    if (isNew || (!generic && !alumni)) return;
    const controller = new AbortController();
    setNotice("");
    const url = generic ? `/api/reports/dashboards/${encodeURIComponent(reportKey)}?preview=1` : "/api/reports/alumni-family-engagement";
    fetch(url, { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload?.error || "Saved values are not available for this preview.");
        if (!controller.signal.aborted) setSaved(payload);
      })
      .catch((error) => { if (!controller.signal.aborted) setNotice(error.message); });
    return () => controller.abort();
  }, [alumni, generic, isNew, reportKey, savedRevision]);
  return <section className={`${styles.preview} ${styles.stack}`}>
    <div className={styles.notice}>Layout preview uses your draft and compatible saved values only. Opening this tab never runs an NXT query. Save your configuration before refreshing data on the report.</div>
    <div><h2>{draft.title || "Untitled report"}</h2><p className={styles.muted}>{draft.description}</p></div>
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    {generic ? <ReportDashboardPanels configuration={draft.dataConfiguration} snapshot={saved?.snapshot} /> : alumni ? <AlumniReportPreview configuration={draft.dataConfiguration} snapshot={saved} /> : <p className={styles.muted}>This built-in report keeps its specialized layout and calculations. Use Open report to view it; title and access changes do not alter those calculations.</p>}
    {!isNew && configuration.canView && <div><a className={styles.button} href={getReportHref(configuration)} target="_blank" rel="noreferrer">Open saved report</a></div>}
  </section>;
}

export default function ReportConfigurationEditor({ initialConfigurations, users }) {
  const [configurations, setConfigurations] = useState(initialConfigurations);
  const [drafts, setDrafts] = useState(() => Object.fromEntries(initialConfigurations.map((configuration) => [configuration.key, createReportDraft(configuration)])));
  const [selectedKey, setSelectedKey] = useState(initialConfigurations[0]?.key || "");
  const [tab, setTab] = useState("Configure");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({});
  const [newReport, setNewReport] = useState(null);
  const allReports = newReport ? [...configurations, newReport] : configurations;
  const configuration = allReports.find((report) => report.key === selectedKey);
  const draft = drafts[selectedKey];
  const isNew = selectedKey === NEW_REPORT_KEY;
  const generic = isDashboard(configuration);
  const dirtyKeys = allReports.filter((report) => drafts[report.key] && (report.key === NEW_REPORT_KEY || isDirty(drafts[report.key], report))).map((report) => report.key);
  const hasUnsavedChanges = dirtyKeys.length > 0;
  const currentDirty = Boolean(configuration && draft && (isNew || isDirty(draft, configuration, tab === "Configure" ? BUILD_FIELDS : tab === "Access" ? ACCESS_FIELDS : undefined)));
  const matchingReports = allReports.filter((report) => report.key === selectedKey || `${drafts[report.key]?.title || report.title} ${report.reportTypeLabel || ""}`.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);

  function updateDraft(patch) {
    setDrafts((current) => ({ ...current, [selectedKey]: { ...current[selectedKey], ...patch } }));
    setFeedback((current) => ({ ...current, [selectedKey]: null }));
  }

  function addReport() {
    if (!newReport) {
      const report = { ...getDashboardReportMetadata(NEW_REPORT_KEY), key: NEW_REPORT_KEY, title: "", description: "", visibility: "specific_users", specificUserIds: [], active: false, dataConfiguration: { version: 1, panels: [] } };
      setNewReport(report);
      setDrafts((current) => ({ ...current, [NEW_REPORT_KEY]: createReportDraft(report) }));
    }
    setSelectedKey(NEW_REPORT_KEY);
    setSearch("");
    setTab("Configure");
  }

  async function save() {
    const key = selectedKey;
    const savedTab = tab;
    const patch = isNew ? pick(draft, BUILD_FIELDS) : buildReportConfigurationPatch(configuration, draft, savedTab);
    let error = "";
    if (Object.hasOwn(patch, "title") && (!draft.title.trim() || draft.title.trim().length > 120)) error = "Enter a report title between 1 and 120 characters.";
    if (!error && Object.hasOwn(patch, "dataConfiguration")) error = generic ? validateDashboardConfiguration(draft.dataConfiguration) : validateAlumniFamilyEngagementDashboard(draft.dataConfiguration);
    if (!error && Object.hasOwn(patch, "visibility") && draft.visibility === "specific_users" && (!generic || draft.active) && !draft.specificUserIds.length) error = "Choose at least one active user before saving access.";
    if (error) { setFeedback((current) => ({ ...current, [key]: { error: true, message: error } })); return; }
    setSaving(true);
    try {
      const result = await saveReport(patch, isNew);
      const saved = result.configuration;
      setConfigurations((current) => isNew ? [...current, saved] : current.map((report) => report.key === key ? saved : report));
      setDrafts((current) => {
        const next = { ...current };
        const fresh = createReportDraft(saved);
        // Saving one tab must not discard unsaved changes in the other tab.
        next[saved.key] = isNew || savedTab === "Preview" ? fresh : { ...current[key], ...pick(fresh, savedTab === "Configure" ? BUILD_FIELDS : ACCESS_FIELDS) };
        if (isNew) delete next[NEW_REPORT_KEY];
        return next;
      });
      if (isNew) { setNewReport(null); setSelectedKey(saved.key); setTab("Access"); }
      setFeedback((current) => ({ ...current, [saved.key]: { message: isNew ? "Report created as a disabled draft. Select viewers and enable it when ready." : `${savedTab === "Preview" ? "All changes" : savedTab === "Access" ? "Access settings" : "Configuration"} saved. Existing snapshots were not refreshed.` } }));
    } catch (error) {
      setFeedback((current) => ({ ...current, [key]: { error: true, message: error.message } }));
    } finally { setSaving(false); }
  }

  function discard() {
    if (!window.confirm("Discard this report's unsaved changes? Saved configuration and snapshots will not change.")) return;
    if (isNew) { setNewReport(null); setSelectedKey(configurations[0]?.key || ""); }
    setDrafts((current) => ({ ...current, [selectedKey]: createReportDraft(configuration) }));
    setFeedback((current) => ({ ...current, [selectedKey]: null }));
  }

  return <main className={styles.page}><div className={styles.container}>
    <header className={styles.header}><div><a href="/"><ArrowLeft size={16} style={{ verticalAlign: "middle" }} /> Back to dashboard</a><h1>Report Access &amp; Configurations</h1><p className={styles.muted}>Choose a report, build its content, then decide who can see it.</p></div></header>
    <section className={`${styles.card} ${styles.toolbar}`} aria-label="Choose a report">
      <label className={`${styles.field} ${styles.search}`}>Find a report<input type="search" placeholder="Search reports" value={search} disabled={saving} onChange={(event) => setSearch(event.target.value)} /></label>
      <label className={`${styles.field} ${styles.picker}`}>Selected report<select value={selectedKey} disabled={saving} onChange={(event) => setSelectedKey(event.target.value)}>
        {!allReports.length && <option value="">No reports yet</option>}
        {getReportTypeDefinitions().map((type) => <optgroup key={type.key} label={type.label}>{matchingReports.filter((report) => report.reportType === type.key).map((report) => <option value={report.key} key={report.key}>{drafts[report.key]?.title || report.title || "New report"}{dirtyKeys.includes(report.key) ? " (unsaved)" : ""}</option>)}</optgroup>)}
      </select></label>
      <button className={`${styles.button} ${styles.primary}`} disabled={saving} onClick={addReport}><Plus size={17} /> {newReport ? "Continue new report" : "Add report"}</button>
    </section>
    {configuration && draft && <section className={styles.card} aria-label="Selected report editor">
      <div className={styles.sectionHeading}><div><h2 style={{ margin: 0 }}>{draft.title || "New report"}</h2><p className={styles.muted} style={{ margin: "6px 0 0" }}>{generic ? "Query counts and static values" : configuration.reportTypeLabel}</p></div><span className={styles.tag}>{isNew ? "Unsaved draft" : generic ? configuration.active ? "Enabled" : "Disabled draft" : "Built-in report"}</span></div>
      <div className={styles.tabs} role="tablist" aria-label="Report settings">
        {TABS.map((name, index) => <button key={name} id={`report-tab-${name}`} className={styles.tab} role="tab" aria-selected={tab === name} aria-controls={`report-panel-${name}`} tabIndex={tab === name ? 0 : -1} disabled={saving} onClick={() => setTab(name)} onKeyDown={(event) => {
          const next = event.key === "ArrowRight" ? (index + 1) % TABS.length : event.key === "ArrowLeft" ? (index + TABS.length - 1) % TABS.length : event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : null;
          if (next !== null) { event.preventDefault(); setTab(TABS[next]); document.getElementById(`report-tab-${TABS[next]}`)?.focus(); }
        }}>{name}{name !== "Preview" && isDirty(draft, configuration, name === "Access" ? ACCESS_FIELDS : BUILD_FIELDS) ? " *" : ""}</button>)}
      </div>
      <div role="tabpanel" id={`report-panel-${tab}`} aria-labelledby={`report-tab-${tab}`} tabIndex={0}>
        <fieldset disabled={saving} className={styles.editorFields}>
          {tab === "Configure" && <div className={styles.stack}>
            <div className={styles.grid}><label className={styles.field}>Report title<input maxLength={120} value={draft.title} disabled={configuration.configurationCapabilities?.canEditTitle === false} onChange={(event) => updateDraft({ title: event.target.value })} placeholder="Example: Alumni engagement" /></label></div>
            <label className={styles.field}>Report description<textarea maxLength={1000} value={draft.description} disabled={configuration.configurationCapabilities?.canEditDescription === false} onChange={(event) => updateDraft({ description: event.target.value })} placeholder="Explain what this report measures." /></label>
            {generic ? <ReportDashboardBuilder value={draft.dataConfiguration} onChange={(value) => updateDraft({ dataConfiguration: value })} disabled={saving} /> : configuration.key === "alumni-family-engagement" ? <AlumniReportConfiguration value={draft.dataConfiguration} onChange={(value) => updateDraft({ dataConfiguration: value })} /> : <p className={styles.notice}>{configuration.presentationNote || "This built-in report keeps its existing calculations and specialized layout. Use Add report to build a new query-count or static-value dashboard."}</p>}
          </div>}
          {tab === "Access" && (isNew ? <p className={styles.notice}>Save this report in Configure first. It will start disabled; you can then select viewers and enable it here.</p> : <AccessEditor key={selectedKey} configuration={configuration} draft={draft} users={users} onChange={updateDraft} />)}
          {tab === "Preview" && <Preview key={selectedKey} configuration={configuration} draft={draft} isNew={isNew} />}
        </fieldset>
      </div>
      <footer className={styles.footer}>
        <div><strong>{dirtyKeys.includes(selectedKey) ? "Unsaved changes" : "All changes saved"}</strong><small>{dirtyKeys.length > 1 ? `${dirtyKeys.length} reports have unsaved drafts. Switching reports keeps them in this page.` : "Saving settings does not run a query or replace a snapshot."}</small></div>
        <div className={styles.sectionHeading}>
          {dirtyKeys.includes(selectedKey) && <button className={styles.button} disabled={saving} onClick={discard}>Discard changes</button>}
          <button className={`${styles.button} ${styles.primary}`} disabled={saving || !currentDirty || (isNew && tab === "Access")} onClick={save}><Save size={17} />{saving ? "Saving..." : isNew ? "Create disabled report" : tab === "Access" ? "Save access" : tab === "Configure" ? "Save configuration" : "Save all changes"}</button>
        </div>
        {feedback[selectedKey] && <div style={{ flexBasis: "100%" }} className={feedback[selectedKey].error ? `${styles.notice} ${styles.error}` : styles.success} role={feedback[selectedKey].error ? "alert" : "status"}>{feedback[selectedKey].message}</div>}
      </footer>
    </section>}
  </div></main>;
}
