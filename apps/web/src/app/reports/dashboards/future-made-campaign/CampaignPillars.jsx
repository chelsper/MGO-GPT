import { CAMPAIGN_PRIORITIES, campaignMoney } from "@/utils/campaignPriorities";
import styles from "./campaign.module.css";

export default function CampaignPillars({ data, selectedPriority, onSelect }) {
  const ready = Boolean(data.runId);
  return <section id="campaign-pillars" className={styles.pillarSection} aria-label="Campaign pillars">
    <h2>Campaign priorities</h2><p className={styles.muted}>Five pillars, across all fiscal years. Select a pillar to see its gifts below.</p>
    <div className={styles.priorities} role="group" aria-label="Five campaign priorities">
      {CAMPAIGN_PRIORITIES.map(priority => {
        const bucket = data.priorities.find(p => p.priority === priority.key);
        return <button key={priority.key} className={styles.priority} onClick={() => onSelect(selectedPriority === priority.key ? "" : priority.key)} aria-pressed={selectedPriority === priority.key}>
          <span>{priority.label}</span><strong>{campaignMoney(ready ? bucket?.effective_cents || 0 : null)}</strong><small>{ready ? `${bucket?.allocations || 0} allocations` : "Awaiting first refresh"}</small>
        </button>;
      })}
    </div>
    {ready && <div className={styles.unassigned}><span><strong>Unassigned: {campaignMoney(data.priorities.find(p => p.priority === "unassigned")?.effective_cents || 0)}</strong> &middot; Included in the campaign total, not hidden.</span><button onClick={() => onSelect("unassigned")}>Review unassigned</button></div>}
  </section>;
}
