import { campaignMoney } from "@/utils/campaignPriorities";
import { campaignBreakdown, campaignPartShare } from "./campaignBreakdown";
import styles from "./campaign.module.css";

const money = value => campaignMoney(Number.isSafeInteger(value) ? value : null);

export default function CampaignPhilanthropicBudget({ data }) {
  const value = campaignBreakdown(data, "budgetPhilanthropic");
  if (!value.ready) return <p className={styles.muted}>The share of Philanthropic giving appears once both classification queries have been refreshed. Missing classifications are not treated as zero.</p>;
  const received = data.segments?.received?.status === "ready";
  const measures = [
    [data.segments?.committed?.status === "ready" ? "Committed" : "Campaign recognition", value.cents, value.otherCents, value.totalCents],
    ...(received ? [["Received to date", value.receivedCents, value.otherReceivedCents, value.totalReceivedCents]] : []),
  ];
  return <section className={styles.philanthropicBudget} aria-label="Budget Relieving within Philanthropic giving">
    <h4>Budget Relieving within Philanthropic giving</h4>
    <p className={styles.muted}>Only gifts outside Comprehensive Investment are included in this comparison.</p>
    <div className={styles.philanthropicBudgetGrid}>{measures.map(([label, amount, other, total]) => {
      const share = campaignPartShare(amount, other, total);
      return <article key={label} aria-label={`${label} Budget Relieving share of Philanthropic giving`}>
        <h5>{label}</h5><strong>{money(amount)}</strong>
        <p>of {money(total)} in Philanthropic giving</p>
        <p className={styles.budgetShare}>{share ? `${share} of Philanthropic giving` : total === 0 && amount === 0 && other === 0 ? "No percentage: the Philanthropic total is $0.00." : "Percentage unavailable until these amounts reconcile."}</p>
      </article>;
    })}</div>
    {!received && <p className={styles.muted}>Received share needs saved pledge-balance data.</p>}
  </section>;
}
