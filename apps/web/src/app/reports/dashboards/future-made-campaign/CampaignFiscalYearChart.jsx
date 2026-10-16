import { useState } from "react";
import { campaignMoney } from "@/utils/campaignPriorities";
import styles from "./campaign.module.css";

const exactMoney = amount => campaignMoney(Number.isSafeInteger(amount) ? amount : null);
const reconciles = (amounts, total) => Number.isSafeInteger(total) && amounts.every(Number.isSafeInteger)
  && amounts.reduce((sum, amount) => sum + BigInt(amount), 0n) === BigInt(total);

export default function CampaignFiscalYearChart({ data, periodLabel }) {
  const [view, setView] = useState("committed");
  const segments = data.segments;
  const years = segments?.fiscalYears;
  if (!data.runId || !years?.length) return null;
  const receivedAvailable = segments.received?.status === "ready";
  const financial = segments.committed?.status === "ready";
  const showReceived = view === "received" && receivedAvailable;
  const primaryLabel = financial ? "Committed" : "Campaign recognition";
  const label = showReceived ? "Received to date" : primaryLabel;
  const primaryTotal = financial ? segments.committed.cents : data.effectiveCents;
  const total = showReceived ? segments.received.cents : primaryTotal;
  const field = showReceived ? "received_cents" : "effective_cents";
  const amounts = years.map(year => year[field]);
  const valid = [total, ...amounts].every(Number.isSafeInteger);
  const complete = reconciles(amounts, total);
  const negative = valid && amounts.some(amount => amount < 0);
  const drawable = complete && !negative;
  const primaryDrawable = reconciles(years.map(year => year.effective_cents), primaryTotal)
    && years.every(year => year.effective_cents >= 0);
  const receivedDrawable = receivedAvailable && reconciles(years.map(year => year.received_cents), segments.received.cents)
    && years.every(year => year.received_cents >= 0);
  // A fixed scale across valid views makes switching meaningful, not two resized charts.
  const scale = Math.max(0, ...years.flatMap(year => [
    ...(primaryDrawable ? [year.effective_cents] : []), ...(receivedDrawable ? [year.received_cents] : []),
  ]));
  const philanthropicField = showReceived ? "philanthropic_received_cents" : "philanthropic_cents";
  const investmentField = showReceived ? "investment_received_cents" : "investment_cents";
  const classification = segments.classification;
  const classified = classification?.status === "ready";
  const split = drawable && classified && years.every(year =>
    reconciles([year[philanthropicField], year[investmentField]], year[field])
    && year[philanthropicField] >= 0 && year[investmentField] >= 0)
    && reconciles(years.map(year => year[philanthropicField]), showReceived ? classification.philanthropicReceivedCents : classification.philanthropicCents)
    && reconciles(years.map(year => year[investmentField]), showReceived ? classification.investmentReceivedCents : classification.investmentCents);
  const ordered = [...years].sort((a, b) => a.fiscal_year === null ? 1 : b.fiscal_year === null ? -1 : b.fiscal_year - a.fiscal_year);
  const issue = !valid ? "Some fiscal-year amounts are unavailable. Saved amounts remain visible; no missing value is treated as zero."
    : !complete ? "The fiscal-year amounts do not match the saved campaign total. Bars are hidden; check the details below."
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
    {!receivedAvailable && <p className={styles.muted}>The Received chart needs saved pledge-balance data.</p>}
    {issue && <p className={styles.notice}>{issue}</p>}
    {drawable && <>
      <div className={styles.fiscalLegend} aria-label="Fiscal-year chart legend">
        {split ? <><span><i className={styles.philanthropicKey} aria-hidden="true" />Philanthropic</span><span><i className={styles.investmentKey} aria-hidden="true" />Comprehensive Investment</span></>
          : <span><i className={styles.totalKey} aria-hidden="true" />Campaign total</span>}
      </div>
      {classified && !split && <p className={styles.muted}>Category amounts cannot be reconciled in this view. Bars show campaign totals only; category values remain in the details.</p>}
      {total === 0 && <p className={styles.muted}>The saved {label.toLowerCase()} amounts are all $0.00. No filled bars are shown.</p>}
    </>}
    <ol className={styles.fiscalChartRows} aria-label={`${label} by fiscal year`}>
      {ordered.map((year, index) => {
        const name = year.fiscal_year === null ? "Date needed" : `FY${year.fiscal_year}`;
        const amount = year[field];
        const breakdown = split ? ` Philanthropic ${exactMoney(year[philanthropicField])}; Comprehensive Investment ${exactMoney(year[investmentField])}.` : "";
        const description = `${name}: ${periodLabel(year.fiscal_year)}. ${label} ${exactMoney(amount)}.${breakdown}`;
        return <li key={`${year.fiscal_year ?? "unknown"}:${index}`} className={year.fiscal_year === null ? styles.fiscalUndated : undefined}>
          <div className={styles.fiscalChartRow} role="img" aria-label={description}>
            <span className={styles.fiscalYearName} aria-hidden="true">{name}</span>
            <div className={styles.fiscalBarTrack} aria-hidden="true">
              {drawable && scale > 0 && (split ? <>
                <span className={styles.philanthropicBar} style={{ width: `${year[philanthropicField] / scale * 100}%` }} />
                <span className={styles.investmentBar} style={{ width: `${year[investmentField] / scale * 100}%` }} />
              </> : <span className={styles.totalBar} style={{ width: `${amount / scale * 100}%` }} />)}
            </div>
            <strong className={styles.fiscalYearAmount} aria-hidden="true">{exactMoney(amount)}</strong>
          </div>
        </li>;
      })}
    </ol>
    <p className={styles.fiscalChartTotal}>{label} campaign total <strong>{exactMoney(total)}</strong></p>
    <p className={styles.muted}>Fiscal years may contain partial-year activity. These are gift-year totals, not a cash-receipts timeline. Exact categories, dates, and deductions are in the details below.</p>
  </div>;
}
