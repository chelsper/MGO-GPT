import { useState } from "react";
import { campaignMoney } from "@/utils/campaignPriorities";
import styles from "./campaign.module.css";

const exactMoney = cents => campaignMoney(Number.isSafeInteger(cents) ? cents : null);

function shareLabel(amount, total, tenths) {
  if (amount === 0) return "0%";
  if (amount === total) return "100%";
  if (amount / total < 0.001) return "<0.1%";
  if (amount / total > 0.999) return ">99.9%";
  return `${tenths / 10}%`;
}

export default function CampaignClassification({data}) {
  const [view, setView] = useState("committed");
  const classification=data.segments?.classification;
  if (!data.runId || classification?.status!=="ready") return <p className={styles.muted}>Comprehensive Investment and Philanthropic totals appear after the classification query is connected and refreshed. They are not assumed to be zero.</p>;
  const received=data.segments?.received?.status==="ready";
  const committed=data.segments?.committed?.status==="ready";
  const showReceived = view === "received" && received;
  const primaryLabel = committed ? "Committed" : "Campaign recognition";
  const label = showReceived ? "Received to date" : primaryLabel;
  const total = showReceived ? data.segments.received.cents : committed ? data.segments.committed.cents : data.effectiveCents;
  const philanthropic = showReceived ? classification.philanthropicReceivedCents : classification.philanthropicCents;
  const investment = showReceived ? classification.investmentReceivedCents : classification.investmentCents;
  const valid = [total, philanthropic, investment].every(Number.isSafeInteger);
  const reconciled = valid && Number.isSafeInteger(philanthropic + investment) && philanthropic + investment === total;
  const nonnegative = reconciled && total >= 0 && philanthropic >= 0 && investment >= 0;
  const proportional = nonnegative && total > 0;
  const philanthropicPercent = proportional ? philanthropic / total * 100 : 0;
  // Round complementary shares together so the displayed tenths total 100%.
  const philanthropicTenths = Math.round(philanthropicPercent * 10);
  const philanthropicShare = proportional ? shareLabel(philanthropic, total, philanthropicTenths) : null;
  const investmentShare = proportional ? shareLabel(investment, total, 1000 - philanthropicTenths) : null;
  const unavailable = !valid ? "Some category amounts are unavailable. The saved values are shown below."
    : !reconciled ? "The saved category amounts do not match the campaign total. Percentages are not shown."
    : !nonnegative ? "This view includes a negative amount. Exact amounts are shown below instead of percentages."
    : `The saved ${label.toLowerCase()} total is $0.00; there is no proportional breakdown.`;

  return <div className={styles.composition}>
    <div className={styles.compositionHead}>
      <div><h3>Campaign composition</h3><p className={styles.muted}>Two categories within the same campaign total.</p></div>
      <div role="group" aria-label="Campaign composition view" className={styles.compositionToggle}>
        <button type="button" aria-pressed={!showReceived} onClick={() => setView("committed")}>{primaryLabel}</button>
        <button type="button" aria-pressed={showReceived} disabled={!received} onClick={() => setView("received")}>Received to date</button>
      </div>
    </div>
    {!received && <p className={styles.muted}>The Received view needs saved pledge-balance data.</p>}
    {proportional ? <figure className={styles.compositionFigure}>
      <div role="img" aria-label={`${label} campaign composition: Philanthropic ${exactMoney(philanthropic)} (${philanthropicShare}); Comprehensive Investment ${exactMoney(investment)} (${investmentShare}). Total ${exactMoney(total)}.`}>
        <div className={styles.compositionBar} aria-hidden="true">
          <span className={styles.philanthropicBar} style={{ width: `${philanthropicPercent}%` }} />
          <span className={styles.investmentBar} style={{ width: `${investment / total * 100}%` }} />
        </div>
        <div className={styles.compositionLegend} aria-hidden="true">
          <span><i className={styles.philanthropicKey} />Philanthropic<strong>{philanthropicShare}</strong></span>
          <span><i className={styles.investmentKey} />Comprehensive Investment<strong>{investmentShare}</strong></span>
        </div>
      </div>
      <figcaption className={styles.muted}>Share of the {label.toLowerCase()} campaign total. Exact amounts below.</figcaption>
    </figure> : <p className={styles.muted}>{unavailable}</p>}
    {received && <p className={`${styles.muted} ${styles.compositionTableHint}`}>Scroll the table sideways to compare exact amounts.</p>}
    <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Exact campaign category amounts">
    <table aria-label="Campaign investment and philanthropic totals"><thead><tr><th scope="col">Campaign category</th><th scope="col">{primaryLabel}</th>{received && <th scope="col">Received to date</th>}</tr></thead>
      <tbody>{[
        ["Comprehensive Investment",classification.investmentCents,classification.investmentReceivedCents],
        ["Philanthropic",classification.philanthropicCents,classification.philanthropicReceivedCents],
      ].map(([label,amount,paid])=><tr key={label}><th scope="row">{label}</th><td>{exactMoney(amount)}</td>{received && <td>{exactMoney(paid)}</td>}</tr>)}</tbody>
    </table>
    </div>
  </div>;
}
