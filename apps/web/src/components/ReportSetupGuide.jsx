import { validateDashboardQueryId } from "@/app/api/utils/dashboardConfiguration";
import { REPORT_STARTERS, createReportStarter } from "@/utils/reportLayoutTemplates";
import styles from "./reportConfigurationEditor.module.css";

export default function ReportSetupGuide({ draft, configuration, isNew, disabled, onTab, onStarter }) {
  const panels = draft.dataConfiguration?.panels || [];
  const sources = panels.flatMap((panel) => panel.layout === "query_results"
    ? [{ label: panel.title, queryId: panel.queryId }]
    : (panel.values || []).filter((cell) => cell.source === "query_count").map((cell) => ({
        label: `${panel.title} / ${panel.rows.find((row) => row.key === cell.rowKey)?.label || "Metric"} / ${panel.columns.find((column) => column.key === cell.columnKey)?.label || "Value"}`,
        queryId: cell.queryId,
      })));
  const mapped = sources.filter(({ queryId }) => !validateDashboardQueryId(queryId)).length;
  const emptyValues = panels.flatMap((panel) => panel.values || []).filter((cell) => cell.source === "static" && cell.staticValue === null).length;
  const steps = [
    ["Define report", "Configure", `${draft.title.trim() ? "Title entered" : "Add a title"}; ${panels.length} panel${panels.length === 1 ? "" : "s"}.`],
    ["Connect data", "Configure", sources.length ? `${mapped} of ${sources.length} query IDs entered. IDs are not verified here.` : "Manual values only; no NXT queries configured."],
    ["Review layout", "Preview", "Preview the layout with compatible saved values only."],
    ["Choose viewers", "Access", isNew ? "Create a disabled report first, then select viewers." : `${configuration.active ? "Enabled" : "Disabled"} in saved settings; ${configuration.specificUserIds.length} saved viewer${configuration.specificUserIds.length === 1 ? "" : "s"}.`],
  ];
  return <section className={styles.guide} aria-label="Report setup guide">
    <div className={styles.sectionHeading}><h3>Report setup guide</h3><span className={styles.muted}>No automatic NXT checks</span></div>
    <ol className={styles.steps}>
      {steps.map(([title, tab, detail], index) => <li key={title}>
        <button type="button" className={styles.stepButton} disabled={disabled} onClick={() => onTab(tab)}><span>{index + 1}</span>{title}</button>
        <p>{detail}</p>
      </li>)}
    </ol>
    {sources.length > 0 && <details className={styles.sourceList}><summary>Review query connections ({mapped}/{sources.length})</summary><ul>{sources.map(({ label, queryId }, index) => <li key={index}><strong>{label}</strong><span>{validateDashboardQueryId(queryId) ? "Needs a valid query ID" : `Query ${queryId} (not verified here)`}</span></li>)}</ul><p>Enter the destination environment's query IDs in Configure. Test query or Load query preview explicitly contacts NXT. Preview and saving settings do not.</p></details>}
    {emptyValues > 0 && <p className={styles.muted}>{emptyValues} manual value{emptyValues === 1 ? " is" : "s are"} blank and will display as unknown, not zero.</p>}
    {panels.length === 0 && <div className={styles.stack}>
      <p className={styles.muted}>Start with a layout below, or use the panel builder for a blank dashboard. Starters change only this draft.</p>
      <div className={styles.starters}>{REPORT_STARTERS.map((starter) => <button key={starter.key} type="button" className={styles.starter} disabled={disabled} onClick={() => onStarter(createReportStarter(starter.key))}><strong>{starter.title}</strong><span>{starter.description}</span></button>)}</div>
    </div>}
  </section>;
}
