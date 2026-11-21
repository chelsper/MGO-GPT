import { outreachSetupChecks, outreachConnectionLabel } from "@/utils/outreachReadiness";
import styles from "./projectOutreach.module.css";

export default function ProjectOutreachReadiness({ report, snapshot, saved, busy, onSetup, onReviewSource }) {
  const checks = outreachSetupChecks(report, snapshot, saved);
  const needed = checks.filter(c => c.state === "needed").length;
  const review = checks.filter(c => c.state === "review").length;
  const settingsHref = (tab) => `/report-configurations?report=${encodeURIComponent(report.key)}&tab=${tab}`;
  const readiness = saved.nxtReadiness;
  const nxtNeedsReview = readiness?.callers?.some(caller => !caller.fundraiserMapped || ["not_connected", "reconnect"].includes(caller.connection));
  return (
    <details className={styles.readiness} open={!saved.settings}>
      <summary>Setup &amp; readiness <span className={styles.help}>{needed ? `${needed} setup ${needed === 1 ? "item" : "items"} needed` : "Required local setup saved"}{review ? ` / ${review} ${review === 1 ? "item" : "items"} to review` : ""}{saved.canRecord && (nxtNeedsReview ? " / NXT setup to review" : readiness?.state !== "saved" ? " / NXT status unavailable" : "")}</span></summary>
      <p className={styles.help}>Based on saved settings and results only. Review suggestions do not add a new approval step or prevent saving outcomes locally.</p>
      <ul className={styles.checklist} aria-label="Outreach readiness checklist">
        {checks.map(check => (
          <li key={check.key}>
            <div><strong>{check.label}</strong><span className={`${styles.readinessBadge} ${check.state === "ready" ? styles.positive : styles.help}`}>{({ready:"Saved", needed:"Setup needed", review:"Review suggested"})[check.state]}</span><p>{check.detail}</p></div>
            {saved.canManage ? (
              check.action === "identity" || check.action === "callers" ? <a href={settingsHref(check.action === "callers" ? "Access" : "Configure")}>{check.action === "callers" ? "Review project access" : "Map system ID"}</a>
                : check.action === "source" ? <div className={styles.tools}><a href={settingsHref("Configure")}>Query settings</a>{onReviewSource && <button disabled={busy} onClick={onReviewSource}>Go to list refresh</button>}</div>
                  : <button disabled={busy} onClick={() => onSetup(check.action)}>Edit {check.label.toLowerCase()}</button>
            ) : check.state !== "ready" ? <small>Ask a project manager to review this setup.</small> : null}
          </li>
        ))}
      </ul>
      {saved.canRecord && <section aria-label="Saved NXT setup" className={styles.nxtReadiness}>
        <h3>{saved.canManage ? "Caller NXT setup" : "Your NXT setup"}</h3>
        <p>This is not a live NXT check. Active fundraiser identity and permissions are verified when you submit an action. Missing NXT setup does not prevent <strong>Save outcome only</strong>.</p>
        {readiness?.state !== "saved" ? <p>Saved connection status is unavailable. Local outreach still works; use Reload saved outreach to check again.</p> : <>
          <p className={styles.help}>Saved setup read {new Date(readiness.checkedAt).toLocaleString()}. Connections can change after this check.</p>
          {!readiness.callers.length && <p>No eligible callers in this saved check. Review project access.</p>}
          <ul className={styles.checklist}>
            {readiness.callers.map(caller => <li key={caller.id}>
              <div><strong>{caller.name}{caller.id === saved.viewerId ? " (you)" : ""}</strong><p>{outreachConnectionLabel(caller.connection)}. {caller.fundraiserMapped ? "Fundraiser ID saved; live verification happens on submission." : "An Admin needs to link this caller's NXT fundraiser system ID."}</p></div>
              {caller.id === saved.viewerId ? <a href="/settings">My NXT settings</a> : <small>{["not_connected", "reconnect"].includes(caller.connection) ? "Ask this caller to open Settings and connect their own NXT account." : "Caller uses their own NXT connection."}</small>}
            </li>)}
          </ul>
        </>}
        {saved.canManageAccounts && <a href="/access-management#workspace-users">Admin account setup</a>}
      </section>}
    </details>
  );
}
