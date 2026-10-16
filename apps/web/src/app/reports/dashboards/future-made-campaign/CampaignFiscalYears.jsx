import { campaignMoney } from "@/utils/campaignPriorities";
import styles from "./campaign.module.css";
import { useState } from "react";
import CampaignFiscalYearChart from "./CampaignFiscalYearChart";
import { campaignBreakdown } from "./campaignBreakdown";

function periodLabel(year, startMonth) {
  if (year === null) return "Gift date missing or unrecognized";
  if (!Number.isInteger(year) || year < 1000 || year > 9999 || !Number.isInteger(startMonth) || startMonth < 1 || startMonth > 12) return "Fiscal period unavailable";
  const yearStart = startMonth === 1 ? year : year-1;
  const end = new Date(Date.UTC(yearStart+1,startMonth-1,0));
  const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${format.format(new Date(Date.UTC(yearStart,startMonth-1,1)))} through ${format.format(end)}`;
}

export default function CampaignFiscalYears({ data }) {
  const [view,setView] = useState("classification");
  const [breakdown,setBreakdown] = useState("investment");
  const chooseBreakdown = kind => { setBreakdown(kind); if (view !== "amounts") setView(kind === "investment" ? "classification" : kind); };
  const years = data.segments?.fiscalYears || [];
  const startMonth = data.segments?.fiscalYearStartMonth;
  const financial = data.segments?.committed?.status === "ready";
  const received = data.segments?.received?.status === "ready";
  const investment = campaignBreakdown(data), budget = campaignBreakdown(data,"budgetRelieving");
  const selectedView = view === "amounts" ? "amounts" : view === "budgetRelieving" && budget.ready ? "budgetRelieving" : investment.ready ? "classification" : budget.ready ? "budgetRelieving" : "amounts";
  const classification = selectedView === "budgetRelieving" ? budget : investment;
  return <section id="campaign-fiscal-years" className={styles.card} aria-label="Campaign by fiscal year">
    <div className={styles.sectionHead}><div><h2>By fiscal year</h2><p className={styles.muted}>Grouped by original gift date. Received is paid to date on those gifts, not cash received during that fiscal year.</p></div></div>
    {!data.runId ? <p>Fiscal years will appear after the first campaign refresh.</p>
      : !data.segments ? <p>Reload saved data to load the fiscal-year breakdown.</p>
        : !years.length ? <p>No gifts in the saved campaign results.</p>
          : <><CampaignFiscalYearChart data={data} periodLabel={year => periodLabel(year, startMonth)} breakdown={breakdown} onBreakdownChange={chooseBreakdown} />
          <details className={styles.fiscalDetails}>
          <summary>View fiscal-year details</summary>
          {(investment.ready || budget.ready) && <label>Fiscal-year view<select value={selectedView} onChange={e=>{setView(e.target.value);if(e.target.value!=="amounts")setBreakdown(e.target.value==="classification" ? "investment" : e.target.value);}}>{investment.ready && <option value="classification">Comprehensive Investment &amp; Philanthropic</option>}{budget.ready && <option value="budgetRelieving">Budget Relieving &amp; other campaign giving</option>}<option value="amounts">Campaign amounts and deductions</option></select></label>}
          {selectedView!=="amounts" ? <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Fiscal-year category details"><table aria-label={selectedView === "budgetRelieving" ? "Fiscal-year Budget Relieving totals" : "Fiscal-year investment and philanthropic totals"}>
            <thead><tr><th scope="col">Fiscal year</th><th scope="col">Campaign {financial ? "committed" : "recognition"}</th><th scope="col">{classification.label}</th><th scope="col">{classification.otherLabel}</th>{received && <><th scope="col">Campaign received</th><th scope="col">{selectedView === "budgetRelieving" ? "Budget Relieving" : "Investment"} received</th><th scope="col">{classification.otherLabel} received</th></>}</tr></thead>
            <tbody>{years.map(year=><tr key={year.fiscal_year ?? "unknown"}>
              <th scope="row">{year.fiscal_year===null ? "Date needed" : `FY${year.fiscal_year}`}<small className={styles.yearPeriod}>{periodLabel(year.fiscal_year,startMonth)}</small></th>
              <td>{campaignMoney(year.effective_cents)}</td><td>{campaignMoney(year[classification.field])}</td><td>{campaignMoney(year[classification.otherField])}</td>
              {received && <><td>{campaignMoney(year.received_cents)}</td><td>{campaignMoney(year[classification.receivedField])}</td><td>{campaignMoney(year[classification.otherReceivedField])}</td></>}
            </tr>)}</tbody><tfoot><tr><th scope="row">Campaign total</th><td>{campaignMoney(data.effectiveCents)}</td><td>{campaignMoney(classification.cents)}</td><td>{campaignMoney(classification.otherCents)}</td>
              {received && <><td>{campaignMoney(data.segments.received.cents)}</td><td>{campaignMoney(classification.receivedCents)}</td><td>{campaignMoney(classification.otherReceivedCents)}</td></>}
            </tr></tfoot></table><p className={styles.muted}>{selectedView === "budgetRelieving" ? "Budget Relieving and other campaign giving reconcile to each fiscal year's campaign total. This separate measure may overlap investment/philanthropic categories and is not added to them." : "Each fiscal year's Philanthropic amount is its campaign total minus Comprehensive Investment. Both categories use the same post-write-off campaign amounts."}</p></div>
            : <div className={styles.tableWrap} tabIndex={0} role="region" aria-label="Fiscal-year amount details"><table aria-label="Fiscal-year campaign recognition">
            <thead><tr><th scope="col">Fiscal year</th><th scope="col">Original amount</th>{financial && <th scope="col">Write-offs</th>}<th scope="col">Local adjustments</th><th scope="col">{financial ? "Committed" : "Campaign recognition"}</th>{received && <><th scope="col">Pledge balance</th><th scope="col">Received to date</th></>}</tr></thead>
            <tbody>{years.map(year => <tr key={year.fiscal_year ?? "unknown"}>
              <th scope="row">{year.fiscal_year === null ? "Date needed" : `FY${year.fiscal_year}`}<small className={styles.yearPeriod}>{periodLabel(year.fiscal_year, startMonth)}</small></th>
              <td>{campaignMoney(year.original_cents)}</td>{financial && <td>{campaignMoney(year.write_off_cents)}</td>}<td>{campaignMoney(year.effective_cents-(year.net_cents ?? year.original_cents))}</td><td><strong>{campaignMoney(year.effective_cents)}</strong></td>{received && <><td>{campaignMoney(year.pledge_balance_cents)}</td><td>{campaignMoney(year.received_cents)}</td></>}
            </tr>)}</tbody>
            <tfoot><tr><th scope="row">Campaign total</th><td>{campaignMoney(data.originalCents)}</td>{financial && <td>{campaignMoney(data.writeOffCents)}</td>}<td>{campaignMoney(data.effectiveCents-(data.netCents ?? data.originalCents))}</td><td><strong>{campaignMoney(data.effectiveCents)}</strong></td>{received && <><td>{campaignMoney(data.pledgeBalanceCents)}</td><td>{campaignMoney(data.segments.received.cents)}</td></>}</tr></tfoot>
          </table></div>}</details>
          {years.some(year => year.fiscal_year === null) && <p className={styles.muted}>Date needed amounts remain in the campaign total. No fiscal year has been guessed.</p>}
          {!received && <p className={styles.muted}>Map write-offs and pledge balances and complete a refresh to show Committed and Received to date.</p>}
        </>}
  </section>;
}
