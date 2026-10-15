import { campaignMoney } from "@/utils/campaignPriorities";
import styles from "./campaign.module.css";

export default function CampaignClassification({data}) {
  const classification=data.segments?.classification;
  if (!data.runId || classification?.status!=="ready") return <p className={styles.muted}>Comprehensive Investment and Philanthropic totals appear after the classification query is connected and refreshed. They are not assumed to be zero.</p>;
  const received=data.segments?.received?.status==="ready";
  return <div className={styles.tableWrap}>
    <table aria-label="Campaign investment and philanthropic totals"><thead><tr><th scope="col">Campaign category</th><th scope="col">{data.segments?.committed?.status==="ready" ? "Committed" : "Campaign recognition"}</th>{received && <th scope="col">Received to date</th>}</tr></thead>
      <tbody>{[
        ["Comprehensive Investment",classification.investmentCents,classification.investmentReceivedCents],
        ["Philanthropic",classification.philanthropicCents,classification.philanthropicReceivedCents],
      ].map(([label,amount,paid])=><tr key={label}><th scope="row">{label}</th><td>{campaignMoney(amount)}</td>{received && <td>{campaignMoney(paid)}</td>}</tr>)}</tbody>
      <tfoot><tr><th scope="row">Campaign total</th><td><strong>{campaignMoney(data.effectiveCents)}</strong></td>{received && <td><strong>{campaignMoney(data.segments.received.cents)}</strong></td>}</tr></tfoot>
    </table>
    <p className={styles.muted}>Philanthropic is the campaign total minus Comprehensive Investment. Query {classification.queryId} classifies gifts; its amounts are not added again. Both categories include applicable write-offs and campaign-only adjustments.</p>
  </div>;
}
