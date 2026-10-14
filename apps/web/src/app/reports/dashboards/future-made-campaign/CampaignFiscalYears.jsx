import { campaignMoney } from "@/utils/campaignPriorities";
import styles from "./campaign.module.css";

function periodLabel(year, startMonth) {
  if (year === null) return "Gift date missing or unrecognized";
  const yearStart = startMonth === 1 ? year : year-1;
  const end = new Date(Date.UTC(yearStart+1,startMonth-1,0));
  const format = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${format.format(new Date(Date.UTC(yearStart,startMonth-1,1)))} through ${format.format(end)}`;
}

export default function CampaignFiscalYears({ data }) {
  const years = data.segments?.fiscalYears || [];
  const startMonth = data.segments?.fiscalYearStartMonth;
  const financial = data.segments?.committed?.status === "ready";
  const received = data.segments?.received?.status === "ready";
  return <section id="campaign-fiscal-years" className={styles.card} aria-label="Campaign by fiscal year">
    <div className={styles.sectionHead}><div><h2>By fiscal year</h2><p className={styles.muted}>Grouped by original gift date. Received is paid to date on those gifts, not cash received during that fiscal year.</p></div></div>
    {!data.runId ? <p>Fiscal years will appear after the first campaign refresh.</p>
      : !data.segments ? <p>Reload saved data to load the fiscal-year breakdown.</p>
        : !years.length ? <p>No gifts in the saved campaign results.</p>
          : <><div className={styles.tableWrap}><table aria-label="Fiscal-year campaign recognition">
            <thead><tr><th scope="col">Fiscal year</th><th scope="col">Original amount</th>{financial && <th scope="col">Write-offs</th>}<th scope="col">Local adjustments</th><th scope="col">{financial ? "Committed" : "Campaign recognition"}</th>{received && <><th scope="col">Pledge balance</th><th scope="col">Received to date</th></>}</tr></thead>
            <tbody>{years.map(year => <tr key={year.fiscal_year ?? "unknown"}>
              <th scope="row">{year.fiscal_year === null ? "Date needed" : `FY${year.fiscal_year}`}<small className={styles.yearPeriod}>{periodLabel(year.fiscal_year, startMonth)}</small></th>
              <td>{campaignMoney(year.original_cents)}</td>{financial && <td>{campaignMoney(year.write_off_cents)}</td>}<td>{campaignMoney(year.effective_cents-(year.net_cents ?? year.original_cents))}</td><td><strong>{campaignMoney(year.effective_cents)}</strong></td>{received && <><td>{campaignMoney(year.pledge_balance_cents)}</td><td>{campaignMoney(year.received_cents)}</td></>}
            </tr>)}</tbody>
            <tfoot><tr><th scope="row">Campaign total</th><td>{campaignMoney(data.originalCents)}</td>{financial && <td>{campaignMoney(data.writeOffCents)}</td>}<td>{campaignMoney(data.effectiveCents-(data.netCents ?? data.originalCents))}</td><td><strong>{campaignMoney(data.effectiveCents)}</strong></td>{received && <><td>{campaignMoney(data.pledgeBalanceCents)}</td><td>{campaignMoney(data.segments.received.cents)}</td></>}</tr></tfoot>
          </table></div>
          {years.some(year => year.fiscal_year === null) && <p className={styles.muted}>Date needed amounts remain in the campaign total. No fiscal year has been guessed.</p>}
          {!received && <p className={styles.muted}>Map write-offs and pledge balances and complete a refresh to show Committed and Received to date.</p>}
        </>}
  </section>;
}
