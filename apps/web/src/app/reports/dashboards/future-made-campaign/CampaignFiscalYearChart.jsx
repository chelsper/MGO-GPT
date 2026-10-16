import { useState } from "react";
import { campaignMoney } from "@/utils/campaignPriorities";
import styles from "./campaign.module.css";
import { campaignBreakdown, campaignPartShare } from "./campaignBreakdown";

const exactMoney = amount => campaignMoney(Number.isSafeInteger(amount) ? amount : null);
const reconciles = (amounts, total) => Number.isSafeInteger(total) && amounts.every(Number.isSafeInteger)
  && amounts.reduce((sum, amount) => sum + BigInt(amount), 0n) === BigInt(total);

export default function CampaignFiscalYearChart({ data, periodLabel, breakdown = "investment", onBreakdownChange }) {
  const [view, setView] = useState("committed");
  const segments = data.segments;
  const years = segments?.fiscalYears;
  if (!data.runId || !years?.length) return null;
  const receivedAvailable = segments.received?.status === "ready";
  const financial = segments.committed?.status === "ready";
  const showReceived = view === "received" && receivedAvailable;
  const primaryLabel = financial ? "Committed" : "Campaign recognition";
  const label = showReceived ? "Received to date" : primaryLabel;
  const budgetAvailable = segments.budgetRelieving?.status === "ready";
  const investmentAvailable = segments.classification?.status === "ready";
  const philanthropicBudgetAvailable = campaignBreakdown(data,"budgetPhilanthropic").ready;
  const kind = breakdown === "budgetPhilanthropic" && philanthropicBudgetAvailable ? "budgetPhilanthropic"
    : budgetAvailable && (breakdown === "budgetRelieving" || !investmentAvailable) ? "budgetRelieving" : "investment";
  const classification = campaignBreakdown(data,kind), philanthropicBudget = kind === "budgetPhilanthropic";
  const primaryTotal = classification.totalCents;
  const total = showReceived ? classification.totalReceivedCents : primaryTotal;
  const field = showReceived ? classification.totalReceivedField : classification.totalField;
  const amounts = years.map(year => year[field]);
  const valid = [total, ...amounts].every(Number.isSafeInteger);
  const complete = reconciles(amounts, total);
  const negative = valid && amounts.some(amount => amount < 0);
  const drawable = complete && !negative;
  const primaryDrawable = reconciles(years.map(year => year[classification.totalField]), primaryTotal)
    && years.every(year => year[classification.totalField] >= 0);
  const receivedDrawable = receivedAvailable && reconciles(years.map(year => year[classification.totalReceivedField]), classification.totalReceivedCents)
    && years.every(year => year[classification.totalReceivedField] >= 0);
  // A fixed scale across valid views makes switching meaningful, not two resized charts.
  const scale = Math.max(0, ...years.flatMap(year => [
    ...(primaryDrawable ? [year[classification.totalField]] : []), ...(receivedDrawable ? [year[classification.totalReceivedField]] : []),
  ]));
  const philanthropicField = showReceived ? classification.otherReceivedField : classification.otherField;
  const investmentField = showReceived ? classification.receivedField : classification.field;
  const classified = classification.ready;
  const split = drawable && classified && years.every(year =>
    reconciles([year[philanthropicField], year[investmentField]], year[field])
    && year[philanthropicField] >= 0 && year[investmentField] >= 0)
    && reconciles(years.map(year => year[philanthropicField]), showReceived ? classification.otherReceivedCents : classification.otherCents)
    && reconciles(years.map(year => year[investmentField]), showReceived ? classification.receivedCents : classification.cents);
  const ordered = [...years].sort((a, b) => a.fiscal_year === null ? 1 : b.fiscal_year === null ? -1 : b.fiscal_year - a.fiscal_year);
  const issue = !valid ? "Some fiscal-year amounts are unavailable. Saved amounts remain visible; no missing value is treated as zero."
    : !complete ? `The fiscal-year amounts do not match the saved ${philanthropicBudget ? "Philanthropic" : "campaign"} total. Bars are hidden; check the details below.`
    : negative ? "This view includes negative amounts. Exact values are shown instead of proportional bars."
    : null;

  return <div className={styles.fiscalChart}>
    <div className={styles.fiscalChartHead}>
      <p className={styles.muted}>{primaryDrawable && receivedDrawable ? "Same dollar scale in both views." : "Compare saved amounts by fiscal year."}</p>
      <div role="group" aria-label="Fiscal-year chart view" className={styles.compositionToggle}>
        <button type="button" aria-pressed={!showReceived} onClick={() => setView("committed")}>{primaryLabel}</button>
        <button type="button" aria-pressed={showReceived} disabled={!receivedAvailable} onClick={() => setView("received")}>Received to date</button>
      </div>
    </div>
    {budgetAvailable && <label>Fiscal-year chart breakdown<select value={kind} onChange={e=>onBreakdownChange(e.target.value)}>
      {investmentAvailable && <option value="investment">Comprehensive Investment &amp; Philanthropic</option>}
      <option value="budgetRelieving">Budget Relieving &amp; other campaign giving</option>
      {philanthropicBudgetAvailable && <option value="budgetPhilanthropic">Budget Relieving within Philanthropic giving</option>}
    </select></label>}
    {kind === "budgetRelieving" && <p className={styles.muted}>Budget Relieving is part of the same total and may overlap either investment/philanthropic category. This chart shows a separate breakdown, not an extra stacked amount.</p>}
    {philanthropicBudget && <p className={styles.muted}>Budget Relieving as a share of each fiscal year's Philanthropic giving. Comprehensive Investment gifts are excluded from both the amount and the total.</p>}
    {!receivedAvailable && <p className={styles.muted}>The Received chart needs saved pledge-balance data.</p>}
    {issue && <p className={styles.notice}>{issue}</p>}
    {drawable && <>
      <div className={styles.fiscalLegend} aria-label="Fiscal-year chart legend">
        {split ? <><span><i className={styles[classification.otherMarker]} aria-hidden="true" />{classification.otherLabel}</span><span><i className={styles[classification.marker]} aria-hidden="true" />{classification.label}</span></>
          : <span><i className={styles.totalKey} aria-hidden="true" />{classification.totalLabel} total</span>}
      </div>
      {classified && !split && <p className={styles.muted}>Category amounts cannot be reconciled in this view. Bars show {philanthropicBudget ? "Philanthropic" : "campaign"} totals only; category values remain in the details.</p>}
      {total === 0 && <p className={styles.muted}>The saved {label.toLowerCase()} amounts are all $0.00. No filled bars are shown.</p>}
    </>}
    <ol className={styles.fiscalChartRows} aria-label={`${label} by fiscal year`}>
      {ordered.map((year, index) => {
        const name = year.fiscal_year === null ? "Date needed" : `FY${year.fiscal_year}`;
        const amount = year[field];
        const share = split && philanthropicBudget ? campaignPartShare(year[investmentField],year[philanthropicField],amount) : null;
        const detail = split ? ` ${classification.otherLabel} ${exactMoney(year[philanthropicField])}; ${classification.label} ${exactMoney(year[investmentField])}.` : "";
        const description = `${name}: ${periodLabel(year.fiscal_year)}. ${label} ${philanthropicBudget ? "Philanthropic " : ""}${exactMoney(amount)}.${detail}${share ? ` Budget Relieving is ${share} of Philanthropic giving.` : ""}`;
        return <li key={`${year.fiscal_year ?? "unknown"}:${index}`} className={year.fiscal_year === null ? styles.fiscalUndated : undefined}>
          <div className={styles.fiscalChartRow} role="img" aria-label={description}>
            <span className={styles.fiscalYearName} aria-hidden="true">{name}</span>
            <div className={styles.fiscalBarTrack} aria-hidden="true">
              {drawable && scale > 0 && (split ? <>
                <span className={styles[classification.otherBar]} style={{ width: `${year[philanthropicField] / scale * 100}%` }} />
                <span className={styles[classification.bar]} style={{ width: `${year[investmentField] / scale * 100}%` }} />
              </> : <span className={styles.totalBar} style={{ width: `${amount / scale * 100}%` }} />)}
            </div>
            <strong className={styles.fiscalYearAmount} aria-hidden="true">{exactMoney(amount)}</strong>
          </div>
          {philanthropicBudget && <p className={styles.fiscalShare}>Budget Relieving: {exactMoney(year[investmentField])}{share ? ` (${share} of Philanthropic giving)` : " (percentage unavailable)"}</p>}
        </li>;
      })}
    </ol>
    <p className={styles.fiscalChartTotal}>{label} {philanthropicBudget ? "Philanthropic" : "campaign"} total <strong>{exactMoney(total)}</strong></p>
    <p className={styles.muted}>Fiscal years may contain partial-year activity. These are gift-year totals, not a cash-receipts timeline. Exact categories, dates, and deductions are in the details below.</p>
  </div>;
}
