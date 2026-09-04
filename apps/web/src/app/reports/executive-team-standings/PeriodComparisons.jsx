import { comparisonChange, numericScore, periodText, RANKING_MODES, scoreText } from "./standingsPresentation";

export function ScorecardComparison({ entry, comparison }) {
  if (!comparison) return null;
  return <section className="standings-comparison-card" aria-label="Year-to-date comparison">
    <h4>Same point last year</h4>
    {Object.entries(RANKING_MODES).map(([mode, metric]) => {
      const current = entry[metric.field];
      const prior = entry.priorYearToDate?.[mode === "raised" ? "raised" : "highValueActions"];
      return <div className="standings-comparison-metric" key={mode}>
        <strong>{mode === "raised" ? "Raised" : "High-value actions"}</strong>
        <div className="standings-year-pair">
          <div><span>{comparison.current.label} YTD</span><b>{scoreText(current, mode)}</b></div>
          <div><span>{comparison.prior.label} YTD</span><b>{scoreText(prior, mode)}</b></div>
        </div>
        <p>{comparisonChange(current, prior, mode)}</p>
      </div>;
    })}
  </section>;
}

export function WeeklySpotlight({ entries, comparison }) {
  if (!comparison) return null;
  return <section className="standings-week" aria-label="Weekly spotlight">
    <div><p className="standings-eyebrow">Weekly spotlight</p><h2>Last completed week</h2><p>{periodText(comparison.week)}</p></div>
    <div className="standings-week-winners">{["raised", "actions"].map((mode) => {
      const key = mode === "raised" ? "raised" : "highValueActions";
      const complete = entries.length > 0 && entries.every((entry) => numericScore(entry.lastCompletedWeek?.[key]) !== null);
      const best = Math.max(0, ...entries.map((entry) => numericScore(entry.lastCompletedWeek?.[key]) ?? 0));
      const winners = entries.filter((entry) => numericScore(entry.lastCompletedWeek?.[key]) === best);
      return <div key={mode}><strong>{mode === "raised" ? "Fundraising leader" : "High-value action leader"}</strong>
        <b>{complete && best > 0 ? scoreText(best, mode) : "Not yet awarded"}</b>
        <span>{!complete ? "Waiting for complete team data." : best > 0 ? winners.map((entry) => entry.name).join(" / ") : "No qualifying activity this week."}</span>
      </div>;
    })}</div>
    <p className="standings-week-note">Based on NXT gift and action dates, including work recorded outside JUMGOGPT. Shared credit and ties are retained. This is not a claim of historical rank movement.</p>
  </section>;
}
