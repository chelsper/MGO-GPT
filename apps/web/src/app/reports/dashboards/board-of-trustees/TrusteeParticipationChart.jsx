import { boardParticipation, boardPercent, boardSnapshotIsCurrent, boardYearLabel, boardYearStage } from "@/utils/boardTrustees";
import styles from "./trustees.module.css";

function chartParticipation(snapshot) {
  if (!snapshot) return { rate: null, reason: "No saved data" };
  if (!boardSnapshotIsCurrent(snapshot)) return { rate: null, reason: "Refresh needed" };
  if (snapshot.eligibility.reviewCount > 0) return { rate: null, reason: "Eligibility review" };
  const stats = boardParticipation(snapshot);
  const reason = stats.total === 0 ? "No eligible trustees" : stats.unknown > 0 ? "Giving incomplete" : "Roster incomplete";
  return { ...stats, reason: stats.rate === null ? reason : "" };
}

export default function TrusteeParticipationChart({ entries, years, selectedYear, onSelectYear, disabled = false }) {
  const rows = [...years].sort((a, b) => a - b).map(year => {
    const snapshot = entries.find(entry => entry.source.fiscalYear === year)?.snapshot;
    return { year, ...chartParticipation(snapshot), stage: boardYearStage(year, snapshot?.refreshedAt) };
  });
  const selected = rows.find(row => row.year === selectedYear);

  return <section className={styles.participationChart} aria-labelledby="participation-chart-heading">
    <div className={styles.chartHeader}>
      <div><p className={styles.chartEyebrow}>THE YEARLY VIEW</p><h2 id="participation-chart-heading">Trustee participation by fiscal year</h2>
        <p>Percentage of eligible trustees who gave cash, pledged or made a planned gift. Select a year to see its trustee list below.</p></div>
    </div>
    <p className={styles.chartScrollHint}>Scroll across the chart to see all fiscal years.</p>
    <div className={styles.chartScroll} tabIndex={0} role="region" aria-label="Year-over-year trustee participation chart">
      <div className={styles.chartPlot} style={{ "--year-count": rows.length }}>
        <div className={styles.chartAxis} aria-hidden="true">
          <span className={styles.axisTop}>100%</span>
          <span style={{ bottom: "50%" }}>50%</span>
          <span className={styles.axisBottom}>0%</span>
        </div>
        <ol className={styles.chartYears}>
          {rows.map(row => {
            const label = `${boardYearLabel(row.year)}: participation, ${row.rate === null ? row.reason : `${boardPercent(row.rate)}, ${row.participants} of ${row.total} eligible trustees`}. ${row.stage}. Show this year's trustees.`;
            return <li key={row.year}><button type="button" className={styles.chartYear} disabled={disabled}
              aria-label={label} title={label} aria-pressed={selectedYear === row.year} onClick={() => onSelectYear(row.year)}>
              <span className={styles.chartRate} aria-hidden="true">{row.rate === null ? "--" : boardPercent(row.rate)}</span>
              <span className={styles.chartTrack} aria-hidden="true">
                <span className={styles.chartBaseline} style={{ bottom: "0%" }} />
                {row.rate !== null && row.rate > 0 && <span className={styles.chartBar} style={{ height: `${row.rate * 100}%`, bottom: "0%" }} />}
                {row.rate === null && <span className={styles.chartMissing}>{row.reason}</span>}
              </span>
              <span className={styles.chartYearLabel} aria-hidden="true">{boardYearLabel(row.year)}</span>
              <span className={styles.chartCount} aria-hidden="true">{row.rate !== null && `${row.participants} of ${row.total}`}</span>
              <span className={styles.chartCoverage} aria-hidden="true">{row.rate !== null && (row.stage === "Year to date" ? "YTD" : row.stage === "Before fiscal year" ? "Before FY" : row.stage === "Not refreshed" ? "Date unknown" : "")}</span>
            </button></li>;
          })}
        </ol>
      </div>
    </div>
    <p className={styles.chartSelection} role="status">{selected && <><strong>{boardYearLabel(selectedYear)} participation:</strong> {selected.rate === null ? selected.reason : `${boardPercent(selected.rate)} (${selected.participants} of ${selected.total} eligible trustees) / ${selected.stage}`}</>}</p>
    <p className={styles.chartNote}>Each eligible trustee counts once, even when they have both cash and commitments. Each year uses its own eligible roster and saved query credit settings. YTD is a partial year, not a full-year comparison.</p>
  </section>;
}
