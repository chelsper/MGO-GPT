import { useState } from "react";
import { campaignMoney } from "@/utils/campaignPriorities";
import styles from "./campaign.module.css";
import { campaignBreakdown } from "./campaignBreakdown";
import CampaignPhilanthropicBudget from "./CampaignPhilanthropicBudget";

const exactMoney = cents => campaignMoney(Number.isSafeInteger(cents) ? cents : null);

function shareLabel(amount, total, tenths) {
  if (amount === 0) return "0%";
  if (amount === total) return "100%";
  if (amount / total < 0.001) return "<0.1%";
  if (amount / total > 0.999) return ">99.9%";
  return `${tenths / 10}%`;
}

export default function CampaignClassification({data,kind="investment"}) {
  const [view, setView] = useState("committed");
  const classification=campaignBreakdown(data,kind), budget=kind==="budgetRelieving";
  const title=budget ? "Budget Relieving" : "Campaign composition";
  if (!data.runId || !classification.ready) return <p className={styles.muted}>{budget ? "Budget Relieving" : "Comprehensive Investment and Philanthropic"} totals appear after the classification query is connected and refreshed. They are not assumed to be zero.</p>;
  const received=data.segments?.received?.status==="ready";
  const committed=data.segments?.committed?.status==="ready";
  const showReceived = view === "received" && received;
  const primaryLabel = committed ? "Committed" : "Campaign recognition";
  const label = showReceived ? "Received to date" : primaryLabel;
  const total = showReceived ? data.segments.received.cents : committed ? data.segments.committed.cents : data.effectiveCents;
  const philanthropic = showReceived ? classification.otherReceivedCents : classification.otherCents;
  const investment = showReceived ? classification.receivedCents : classification.cents;
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
      <div><h3>{title}</h3><p className={styles.muted}>{budget ? "A separate view of gifts already in the campaign." : "Two categories within the same campaign total."}</p></div>
      <div role="group" aria-label={`${title} view`} className={styles.compositionToggle}>
        <button type="button" aria-pressed={!showReceived} onClick={() => setView("committed")}>{primaryLabel}</button>
        <button type="button" aria-pressed={showReceived} disabled={!received} onClick={() => setView("received")}>Received to date</button>
      </div>
    </div>
    {!received && <p className={styles.muted}>The Received view needs saved pledge-balance data.</p>}
    {proportional ? <figure className={styles.compositionFigure}>
      <div role="img" aria-label={`${label} ${budget ? "budget relief" : "campaign composition"}: ${classification.otherLabel} ${exactMoney(philanthropic)} (${philanthropicShare}); ${classification.label} ${exactMoney(investment)} (${investmentShare}). Total ${exactMoney(total)}.`}>
        <div className={styles.compositionBar} aria-hidden="true">
          <span className={styles[classification.otherBar]} style={{ width: `${philanthropicPercent}%` }} />
          <span className={styles[classification.bar]} style={{ width: `${investment / total * 100}%` }} />
        </div>
        <div className={styles.compositionLegend} aria-hidden="true">
          <span><i className={styles[classification.otherMarker]} />{classification.otherLabel}<strong>{philanthropicShare}</strong></span>
          <span><i className={styles[classification.marker]} />{classification.label}<strong>{investmentShare}</strong></span>
        </div>
      </div>
      <figcaption className={styles.muted}>Share of the {label.toLowerCase()} campaign total. Exact amounts below.</figcaption>
    </figure> : <p className={styles.muted}>{unavailable}</p>}
    {received && <p className={`${styles.muted} ${styles.compositionTableHint}`}>Scroll the table sideways to compare exact amounts.</p>}
    {budget && <p className={styles.muted}>Budget Relieving may overlap Comprehensive Investment or Philanthropic giving. It is not an additional campaign amount and does not change the Philanthropic calculation.</p>}
    <div className={styles.tableWrap} tabIndex={0} role="region" aria-label={budget ? "Exact Budget Relieving amounts" : "Exact campaign category amounts"}>
    <table aria-label={budget ? "Budget Relieving campaign totals" : "Campaign investment and philanthropic totals"}><thead><tr><th scope="col">Campaign category</th><th scope="col">{primaryLabel}</th>{received && <th scope="col">Received to date</th>}</tr></thead>
      <tbody>{[
        [classification.label,classification.cents,classification.receivedCents],
        [classification.otherLabel,classification.otherCents,classification.otherReceivedCents],
      ].map(([label,amount,paid])=><tr key={label}><th scope="row">{label}</th><td>{exactMoney(amount)}</td>{received && <td>{exactMoney(paid)}</td>}</tr>)}</tbody>
    </table>
    </div>
    {budget && <CampaignPhilanthropicBudget data={data} />}
  </div>;
}
