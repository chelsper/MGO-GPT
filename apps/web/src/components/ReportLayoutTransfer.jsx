import { useEffect, useRef, useState } from "react";
import { buildReportLayoutTemplate, parseReportLayoutTemplate, REPORT_LAYOUT_MAX_BYTES } from "@/utils/reportLayoutTemplates";
import styles from "./reportConfigurationEditor.module.css";

export default function ReportLayoutTransfer({ draft, disabled, onImport }) {
  const [incoming, setIncoming] = useState(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const generation = useRef(0);
  const fileInput = useRef(null);
  useEffect(() => () => { generation.current += 1; }, []);

  async function readFile(event) {
    const file = event.target.files?.[0];
    const current = ++generation.current;
    setIncoming(null);
    setError("");
    setMessage("");
    setReading(false);
    if (!file) return;
    if (file.size > REPORT_LAYOUT_MAX_BYTES) { setError("Choose a report layout file no larger than 128 KB."); return; }
    setReading(true);
    try {
      const contents = await file.text();
      if (generation.current !== current) return;
      setIncoming(parseReportLayoutTemplate(contents));
    } catch (failure) {
      if (generation.current === current) setError(failure.message || "Could not read this report layout.");
    } finally { if (generation.current === current) setReading(false); }
  }

  function download() {
    if (!draft || disabled) return;
    setError("");
    setMessage("");
    try {
      const contents = JSON.stringify(buildReportLayoutTemplate(draft), null, 2);
      const url = URL.createObjectURL(new Blob([contents], { type: "application/json" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = "report-layout.json";
      link.click();
      setTimeout(URL.revokeObjectURL.bind(URL), 1000, url);
      setMessage("Layout file prepared from the current draft. No report settings or data were changed.");
    } catch (failure) { setError(failure.message || "Could not export this report layout."); }
  }

  function importDraft() {
    if (disabled || !incoming || !onImport(incoming)) return;
    setIncoming(null);
    if (fileInput.current) fileInput.current.value = "";
    setMessage("Layout opened as a new, unsaved draft. Enter query IDs and values, then save it disabled before choosing viewers.");
  }

  return <details className={`${styles.card} ${styles.transfer}`}>
    <summary>Reuse a report layout</summary>
    <p>For custom dashboards only. A layout includes the current draft's title, description, panel arrangement, and row/column labels. Review these labels for private information before sharing the file.</p>
    <p className={styles.muted}>Query IDs, query column mappings, static values, notes, saved results, credentials, and viewer lists are excluded. Imported sources start unmapped and refreshable. Built-in reports and their reporting rules are not transferable here.</p>
    <div className={styles.grid}>
      <section className={styles.stack} aria-label="Export report layout"><strong>Export this layout</strong><p className={styles.muted}>Download a layout-only JSON file. Unsaved layout edits are included; this is not a data backup.</p><div><button type="button" className={styles.button} disabled={disabled || !draft} onClick={download}>Download layout</button></div>{!draft && <small>Select a custom dashboard to export its layout.</small>}</section>
      <section className={styles.stack} aria-label="Import report layout"><label className={styles.field}>Choose a report layout file<input ref={fileInput} type="file" accept=".json,application/json" disabled={disabled || reading} onChange={readFile} /></label><small className={styles.muted}>Read locally in this browser. Maximum 128 KB. Nothing is uploaded or saved just by opening a file.</small>{reading && <p role="status">Reading layout...</p>}{incoming && <div className={styles.notice}><strong>{incoming.title || "Untitled layout"}</strong><p>{incoming.dataConfiguration.panels.length} panels. Existing saved reports will not be overwritten. Query connections, values, and viewers must be set up here.</p><button type="button" className={styles.button} disabled={disabled} onClick={importDraft}>Open as new draft</button></div>}</section>
    </div>
    {error && <p className={`${styles.notice} ${styles.error}`} role="alert">{error}</p>}
    {message && <p role="status" className={styles.success}>{message}</p>}
  </details>;
}
