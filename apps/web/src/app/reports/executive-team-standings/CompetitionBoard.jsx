import { Trophy, Target } from "lucide-react";
import { rankStandings, RANKING_MODES, scoreText } from "./standingsPresentation";
import "./standings.css";

function LeaderCard({ entries, mode, fiscalYear }) {
  const ranked = rankStandings(entries, mode);
  const leaders = ranked.filter((entry) => entry.rank === 1 && entry.score > 0);
  const complete = ranked.length > 0 && ranked.every((entry) => entry.score !== null);
  const Icon = mode === "raised" ? Trophy : Target;
  return (
    <article className={`standings-leader standings-leader-${mode}`}>
      <div className="standings-eyebrow"><Icon size={18} aria-hidden="true" />{fiscalYear} {mode === "raised" ? "Fundraising" : "High-value action"} leader{leaders.length > 1 ? "s" : ""}</div>
      <p className="standings-leader-value">{complete && leaders.length ? scoreText(leaders[0].score, mode) : "Not yet ranked"}</p>
      <p className="standings-leader-names">{complete && leaders.length ? leaders.map((entry) => entry.name).join(" / ") : complete ? "No positive scores recorded yet." : "Waiting for a complete team snapshot."}</p>
      <span className="standings-leader-note">{mode === "raised" ? "NXT gift credit, including qualifying commitments" : "Meeting category or Solicitation type; counted once"}</span>
    </article>
  );
}

export default function CompetitionBoard({ entries, mode, onModeChange, fiscalYear }) {
  const ranked = rankStandings(entries, mode);
  const complete = ranked.every((entry) => entry.score !== null);
  const topScore = ranked[0]?.score || 0;
  const hasLegacyActions = entries.some((entry) => entry.highValueActionsThisFiscalYear === undefined);
  const scoreColumns = mode === "actions" ? ["actions", "raised"] : ["raised", "actions"];
  return (
    <section aria-label="Team leaderboard" className="standings-competition">
      <div className="standings-leaders">
        <LeaderCard entries={entries} mode="raised" fiscalYear={fiscalYear} />
        <LeaderCard entries={entries} mode="actions" fiscalYear={fiscalYear} />
      </div>
      <div className="standings-board">
        <div className="standings-board-heading">
          <div><p className="standings-eyebrow">Season standings</p><h2>{fiscalYear} leaderboard</h2></div>
          <div className="standings-switch" role="group" aria-label="Rank standings by">
            {Object.entries(RANKING_MODES).map(([key, value]) => (
              <button type="button" key={key} aria-pressed={mode === key} onClick={() => onModeChange(key)}>{value.label}</button>
            ))}
          </div>
        </div>
        <p className="standings-board-note" aria-live="polite">Ranked by {RANKING_MODES[mode].label.toLowerCase()}. Ties share a rank.{!complete ? " Provisional standings: unavailable scores are not ranked." : ""} Select an MGO to see their scorecard.</p>
        {hasLegacyActions ? <p className="standings-upgrade" role="status">High-value actions: Refresh required. This saved snapshot predates the new metric. Select Refresh standings once; opening or sorting this page does not run NXT again.</p> : null}
        <div className="standings-table-scroll" tabIndex={0} role="region" aria-label="Ranked standings table">
          <table className="standings-table">
            <caption className="standings-sr-only">{fiscalYear} standings, ranked by {RANKING_MODES[mode].label}</caption>
            <thead><tr><th scope="col">Rank</th><th scope="col">MGO</th>{scoreColumns.map((column) => <th key={column} scope="col" className={mode === column ? "" : "standings-secondary-score"} aria-sort={mode === column ? "descending" : "none"}>{column === "raised" ? `${fiscalYear} raised` : "High-value actions"}</th>)}</tr></thead>
            <tbody>{ranked.map((entry) => {
              const leading = complete && entry.rank === 1 && entry.score > 0;
              return (
                <tr key={entry.userId} className={leading ? "standings-leading" : ""}>
                  <td><span className="standings-rank" aria-label={entry.rank === null ? "Unranked" : `Rank ${entry.rank}`}>{entry.rank === null ? "-" : String(entry.rank).padStart(2, "0")}</span></td>
                  <th scope="row"><a href={`#scorecard-${entry.userId}`}>{entry.name}</a><span className="standings-relative" aria-hidden="true"><span style={{ width: `${topScore > 0 && entry.score !== null ? (entry.score / topScore) * 100 : 0}%` }} /></span></th>
                  {scoreColumns.map((column) => <td key={column} className={mode === column ? "standings-selected-score" : "standings-secondary-score"}>{column === "actions" && entry.highValueActionsThisFiscalYear === undefined ? "Refresh required" : scoreText(entry[RANKING_MODES[column].field], column)}</td>)}
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <p className="standings-board-note"><span className="standings-mobile-note">Switch rankings to compare the other metric, or open a scorecard to see both. </span>Bars compare the selected score to the leading available score, not to a goal. Shared NXT credit can appear for more than one MGO; scores are not deduplicated university revenue or team action totals.</p>
      </div>
      <details className="standings-rules">
        <summary>Scoring rules &amp; data sources</summary>
        <dl>
          <dt>Fiscal year</dt><dd>July 1 through June 30. Both rankings use the same report fiscal year.</dd>
          <dt>FY raised</dt><dd>The existing NXT fundraiser-attributed gift calculation: each qualifying gift counts once per credited MGO. Includes qualifying pledges and planned gifts, not just cash received. A shared gift may credit more than one MGO.</dd>
          <dt>High-value actions</dt><dd>NXT Category = Meeting OR Type = Solicitation. An action matching both counts once per credited MGO. Uses the action date within the fiscal year, regardless of which application recorded it. Scheduled actions are included; this is not a completed-only measure.</dd>
          <dt>Local next-step coverage</dt><dd>Active JUMGOGPT prospects with nonblank, unfinished next-step text divided by all active JUMGOGPT prospects, rounded to a percentage. No due date is required. Does not include follow-up recorded only in NXT and never affects rank.</dd>
          <dt>Fair comparisons</dt><dd>Ties share a rank. Unavailable scores are not zero. Leaders are announced only when the team has complete scores for that metric. No rank movement is claimed without historical snapshots.</dd>
        </dl>
      </details>
    </section>
  );
}
