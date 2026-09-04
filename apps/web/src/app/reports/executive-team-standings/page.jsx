"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Target, TrendingUp, Users } from "lucide-react";
import useUser from "@/utils/useUser";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import CompetitionBoard from "./CompetitionBoard";
import { coverageText as getCoverage, rankStandings, RANKING_MODES, scoreText } from "./standingsPresentation";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function isFiniteNumericValue(value) {
  if (value === null || value === undefined || value === "") return false;
  return Number.isFinite(Number(value));
}

function formatOptionalCurrency(value) {
  return isFiniteNumericValue(value) ? formatCurrency(value) : "Unavailable";
}

function formatShortDate(value) {
  if (!value) return "No due date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatRefreshTime(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function pluralize(value, singular, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function buildProspectDetailUrl(prospectId) {
  const normalizedId = Number(prospectId);
  if (!Number.isFinite(normalizedId) || normalizedId <= 0) return "";
  const params = new URLSearchParams();
  params.set("prospectId", String(normalizedId));
  return `/my-top-prospects?${params.toString()}`;
}

const detailLinkStyle = {
  alignItems: "center",
  backgroundColor: "white",
  border: "1px solid #C7D2FE",
  borderRadius: "999px",
  color: "#4338CA",
  display: "inline-flex",
  fontSize: "12px",
  fontWeight: 800,
  padding: "6px 10px",
  textDecoration: "none",
};

const panelStyle = {
  backgroundColor: "white",
  border: "1px solid #E2E8F0",
  borderRadius: "18px",
  boxShadow: "0 10px 28px rgba(15, 23, 42, 0.05)",
};

export default function ExecutiveTeamStandingsPage() {
  const { data: user, loading: loadingUser } = useUser();
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [expandedUserIds, setExpandedUserIds] = useState([]);
  const [rankingMode, setRankingMode] = useState("raised");

  useEffect(() => {
    if (!loadingUser && !user) {
      window.location.href = "/account/signin";
    }
  }, [loadingUser, user]);

  useEffect(() => {
    if (!user) return undefined;

    const controller = new AbortController();
    async function loadStandings() {
      setLoading(true);
      setError("");
      try {
        const searchParams = refreshVersion > 0 ? "?refresh=1" : "";
        const response = await fetch(`/api/reports/executive-team-standings${searchParams}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || "Could not load Executive Team Standings.");
        }
        setReport(payload);
      } catch (loadError) {
        if (loadError?.name !== "AbortError") {
          setError(
            loadError instanceof Error ? loadError.message : "Could not load Executive Team Standings.",
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    loadStandings();
    return () => controller.abort();
  }, [user, refreshVersion]);

  const standings = rankStandings(Array.isArray(report?.standings) ? report.standings : [], rankingMode);
  const refreshRequired = report?.status === "refresh_required";
  const hasCompleteLifetimeCredit =
    standings.length > 0 && standings.every((entry) => isFiniteNumericValue(entry.lifetimeGiving));
  const totals = standings.reduce(
    (result, entry) => ({
      activeProspects: result.activeProspects + Number(entry.activeProspects || 0),
      openPipeline: result.openPipeline + Number(entry.openPipeline || 0),
      funded: result.funded + Number(entry.fundedThisFiscalYear || 0),
      lifetimeGiving: result.lifetimeGiving + Number(entry.lifetimeGiving || 0),
      nxtActionsThisFiscalYear:
        result.nxtActionsThisFiscalYear + Number(entry.nxtActionsThisFiscalYear || 0),
      overdue: result.overdue + Number(entry.overdueNextSteps || 0),
      prospectsTouched:
        result.prospectsTouched + Number(entry.trend?.prospectsTouched || 0),
      updatesLogged: result.updatesLogged + Number(entry.trend?.updatesLogged || 0),
      opportunityChanges:
        result.opportunityChanges + Number(entry.trend?.opportunityChanges || 0),
      recentlyClosedValue:
        result.recentlyClosedValue + Number(entry.trend?.recentlyClosedValue || 0),
    }),
    {
      activeProspects: 0,
      openPipeline: 0,
      funded: 0,
      lifetimeGiving: 0,
      nxtActionsThisFiscalYear: 0,
      overdue: 0,
      prospectsTouched: 0,
      updatesLogged: 0,
      opportunityChanges: 0,
      recentlyClosedValue: 0,
    },
  );

  if (loadingUser || !user) {
    return <main style={{ padding: "64px", color: "#64748B" }}>Loading workspace...</main>;
  }

  return (
    <main style={{ backgroundColor: "#F8FAFC", minHeight: "100vh", padding: "32px clamp(12px, 2vw, 24px) 80px" }}>
      <div style={{ margin: "0 auto", maxWidth: "1480px" }}>
        <SharedReportHeader
          activeReportKey="executive-team-standings"
          eyebrow="Executive dashboard"
          title="Team Standings"
          description="Two ways to lead: fiscal-year fundraising and high-value NXT actions. One shared team snapshot."
          action={
            <button
              type="button"
              onClick={() => setRefreshVersion((value) => value + 1)}
              disabled={loading}
              style={{
                minHeight: "44px",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                borderRadius: "10px",
                border: "1px solid #BFDBFE",
                backgroundColor: "white",
                color: "#1D4ED8",
                padding: "0 15px",
                fontWeight: 800,
                cursor: loading ? "wait" : "pointer",
              }}
            >
              <RefreshCw size={17} />
              Refresh standings
            </button>
          }
        />

        {report?.generatedAt && !refreshRequired ? (
          <p style={{ color: "#64748B", fontSize: "13px", margin: "16px 0 0" }}>
            Last refreshed {formatRefreshTime(report.generatedAt)}. This shared snapshot remains unchanged until
            6 PM Eastern or a manual refresh.
          </p>
        ) : null}

        {error ? (
          <section style={{ ...panelStyle, borderColor: "#FECACA", backgroundColor: "#FEF2F2", color: "#991B1B", marginTop: "28px", padding: "18px" }}>
            <strong style={{ display: "flex", alignItems: "center", gap: "8px" }}><AlertTriangle size={19} /> Standings could not load</strong>
            <p style={{ margin: "8px 0 0" }}>{error}</p>
          </section>
        ) : null}

        {refreshRequired ? (
          <section
            style={{
              ...panelStyle,
              borderColor: "#BFDBFE",
              backgroundColor: "#EFF6FF",
              color: "#1E3A8A",
              marginTop: "28px",
              padding: "18px",
            }}
          >
            <strong>No saved Team Standings snapshot is available.</strong>
            <p style={{ margin: "8px 0 0" }}>
              Select Refresh standings once to create it. Future visits will use that saved result until the
              next 6 PM Eastern refresh or another manual refresh.
            </p>
          </section>
        ) : null}

        {report?.refreshWarning ? (
          <section
            style={{
              ...panelStyle,
              borderColor: "#FDE68A",
              backgroundColor: "#FFFBEB",
              color: "#92400E",
              marginTop: "20px",
              padding: "18px",
            }}
          >
            <strong>
              {report?.snapshotStatus === "partial"
                ? "Showing a partial refreshed snapshot"
                : "Showing the previous snapshot"}
            </strong>
            <p style={{ margin: "8px 0 0" }}>{report.refreshWarning}</p>
          </section>
        ) : null}

        {standings.length > 0 ? <CompetitionBoard entries={standings} mode={rankingMode} onModeChange={setRankingMode} fiscalYear={report?.fiscalYear?.label || "Current FY"} /> : null}

        <details className="standings-local" style={{ ...panelStyle, marginTop: "24px", padding: "16px 20px" }}>
          <summary>Team context &amp; local workflow (not ranked)</summary>
        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 210px), 1fr))", gap: "16px", marginTop: "18px" }}>
          <MetricCard label="Active MGOs" value={standings.length} icon={<Users size={20} />} color="#4F46E5" />
          <MetricCard label="Active prospects" value={totals.activeProspects} icon={<Target size={20} />} color="#0369A1" />
          <MetricCard label="Open pipeline" value={formatCurrency(totals.openPipeline)} icon={<TrendingUp size={20} />} color="#0F766E" />
          <MetricCard label="Lifetime solicitor credit" value={hasCompleteLifetimeCredit ? formatCurrency(totals.lifetimeGiving) : "Refresh required"} icon={<TrendingUp size={20} />} color="#0F766E" />
          <MetricCard label={`${report?.fiscalYear?.label || "Current FY"} attributed NXT actions`} value={standings.length && standings.every((entry) => isFiniteNumericValue(entry.nxtActionsThisFiscalYear)) ? totals.nxtActionsThisFiscalYear : "Unavailable"} icon={<TrendingUp size={20} />} color="#0369A1" />
        </section>

        <section style={{ ...panelStyle, marginTop: "20px", padding: "20px 24px" }}>
          <div style={{ alignItems: "flex-start", display: "flex", flexWrap: "wrap", gap: "14px", justifyContent: "space-between" }}>
            <div>
              <h2 style={{ color: "#0F172A", fontSize: "20px", margin: 0 }}>Recent JUMGOGPT activity</h2>
              <p style={{ color: "#64748B", lineHeight: 1.5, margin: "6px 0 0" }}>
                Last {report?.trendWindowDays || 7} days across the team. Excludes work recorded only in NXT; does not affect standings.
              </p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              <TrendChip color="#1D4ED8" label={pluralize(totals.prospectsTouched, "prospect touch", "prospect touches")} />
              <TrendChip color="#7C3AED" label={pluralize(totals.updatesLogged, "update logged")} />
              <TrendChip color="#0F766E" label={pluralize(totals.opportunityChanges, "opportunity change")} />
              <TrendChip color="#166534" label={`${formatCurrency(totals.recentlyClosedValue)} recently closed`} />
            </div>
          </div>
        </section>
        </details>

        <section style={{ ...panelStyle, marginTop: "24px", overflow: "hidden" }}>
          <div style={{ padding: "22px 24px", borderBottom: "1px solid #E2E8F0" }}>
            <h2 style={{ color: "#0F172A", fontSize: "22px", margin: 0 }}>Individual scorecards</h2>
            <p style={{ color: "#64748B", lineHeight: 1.5, margin: "7px 0 0" }}>
              Ordered by {RANKING_MODES[rankingMode].label.toLowerCase()}. Fundraising and high-value actions come from NXT, including work recorded outside JUMGOGPT.
            </p>
          </div>

          {loading && !report ? (
            <p style={{ color: "#64748B", margin: 0, padding: "28px 24px" }}>Loading team standings...</p>
          ) : standings.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 340px), 1fr))", gap: "18px", padding: "clamp(12px, 2vw, 22px)" }}>
              {standings.map((entry) => (
                <article id={`scorecard-${entry.userId}`} aria-label={`${entry.name} scorecard`} className="standings-scorecard" key={entry.userId} style={{ border: "1px solid #DCE6E1", borderTop: "4px solid #006B53", borderRadius: "16px", padding: "20px", backgroundColor: "white" }}>
                  {(() => {
                    const isExpanded = expandedUserIds.includes(entry.userId);
                    const activeProspects = Array.isArray(entry.drilldown?.activeProspects)
                      ? entry.drilldown.activeProspects
                      : [];
                    const openOpportunities = Array.isArray(entry.drilldown?.openOpportunities)
                      ? entry.drilldown.openOpportunities
                      : [];
                    const nxtActions = Array.isArray(entry.drilldown?.nxtActions)
                      ? entry.drilldown.nxtActions
                      : [];
                    return (
                      <>
                  <div style={{ alignItems: "flex-start", display: "flex", gap: "12px", justifyContent: "space-between" }}>
                    <div>
                      <p style={{ color: "#64748B", fontSize: "12px", fontWeight: 900, letterSpacing: "0.07em", margin: 0, textTransform: "uppercase" }}>{RANKING_MODES[rankingMode].label}</p>
                      <h3 style={{ color: "#0F172A", fontSize: "22px", margin: "6px 0 0" }}>{entry.name}</h3>
                      <p style={{ color: "#64748B", fontSize: "14px", margin: "5px 0 0", overflowWrap: "anywhere" }}>{entry.email}</p>
                    </div>
                    <span className="standings-rank" aria-label={entry.rank === null ? "Unranked" : `Rank ${entry.rank}`}>
                      {entry.rank === null ? "-" : `#${entry.rank}`}
                    </span>
                  </div>
                  <div style={{ borderTop: "1px solid #E2E8F0", display: "grid", gap: "13px", gridTemplateColumns: "1fr 1fr", marginTop: "18px", paddingTop: "18px" }}>
                    <StandingsMetric label={`${report?.fiscalYear?.label || "Current FY"} raised`} value={scoreText(entry.fundedThisFiscalYear, "raised")} color="#006B53" />
                    <StandingsMetric label={`${report?.fiscalYear?.label || "Current FY"} high-value actions`} value={entry.highValueActionsThisFiscalYear === undefined ? "Refresh required" : scoreText(entry.highValueActionsThisFiscalYear, "actions")} color="#006B53" />
                    <StandingsMetric label="Lifetime solicitor credit" value={formatOptionalCurrency(entry.lifetimeGiving)} color="#0F766E" />
                    <StandingsMetric label={`${report?.fiscalYear?.label || "Current FY"} all NXT actions`} value={scoreText(entry.nxtActionsThisFiscalYear, "actions")} color="#0369A1" />
                  </div>
                  <details className="standings-local">
                    <summary>Local workflow (JUMGOGPT only)</summary>
                    <p style={{ fontSize: "13px", lineHeight: 1.5 }}>Coverage counts active local prospects with unfinished next-step text. Work recorded only in NXT is not included. These metrics never affect rank.</p>
                    <div style={{ display: "grid", gap: "13px", gridTemplateColumns: "1fr 1fr" }}>
                    <StandingsMetric label="Active prospects" value={entry.activeProspects} color="#0F766E" />
                    <StandingsMetric label="Open pipeline" value={formatCurrency(entry.openPipeline)} color="#0F766E" />
                    <StandingsMetric label="Local next-step coverage" value={getCoverage(entry.prospectsWithNextSteps, entry.activeProspects)} color="#1D4ED8" />
                    <StandingsMetric label="Overdue follow-ups" value={entry.overdueNextSteps} color={entry.overdueNextSteps ? "#B91C1C" : "#166534"} />
                  </div>
                  <div style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "14px", display: "grid", gap: "8px", marginTop: "18px", padding: "14px" }}>
                    <div style={{ color: "#0F172A", fontSize: "13px", fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      Last {entry.trend?.windowDays || report?.trendWindowDays || 7} days
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      <TrendChip color="#1D4ED8" label={pluralize(Number(entry.trend?.prospectsTouched || 0), "prospect touch", "prospect touches")} />
                      <TrendChip color="#7C3AED" label={pluralize(Number(entry.trend?.updatesLogged || 0), "update logged")} />
                      <TrendChip color="#0F766E" label={pluralize(Number(entry.trend?.opportunityChanges || 0), "opportunity change")} />
                      <TrendChip color="#166534" label={`${formatCurrency(entry.trend?.recentlyClosedValue || 0)} closed`} />
                    </div>
                  </div>
                  </details>
                  <div style={{ borderTop: "1px solid #E2E8F0", display: "grid", gap: "12px", marginTop: "18px", paddingTop: "18px" }}>
                    <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "space-between" }}>
                      <div style={{ color: "#475569", fontSize: "14px", lineHeight: 1.45 }}>
                        Break this out into active prospects, open opportunities, and attributed NXT actions.
                      </div>
                      <button
                        type="button"
                        aria-expanded={isExpanded}
                        onClick={() =>
                          setExpandedUserIds((current) =>
                            current.includes(entry.userId)
                              ? current.filter((value) => value !== entry.userId)
                              : [...current, entry.userId],
                          )
                        }
                        style={{
                          backgroundColor: isExpanded ? "#EEF2FF" : "white",
                          border: "1px solid #C7D2FE",
                          borderRadius: "999px",
                          color: "#4338CA",
                          cursor: "pointer",
                          fontSize: "12px",
                          fontWeight: 900,
                          padding: "8px 12px",
                        }}
                      >
                        {isExpanded ? "Hide breakout details" : "Show breakout details"}
                      </button>
                    </div>

                    {isExpanded ? (
                      <div style={{ display: "grid", gap: "14px" }}>
                        <div style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "14px", padding: "14px" }}>
                          <div style={{ color: "#0F172A", fontSize: "14px", fontWeight: 900, marginBottom: "10px" }}>
                            Active prospects ({activeProspects.length})
                          </div>
                          {activeProspects.length ? (
                            <div style={{ display: "grid", gap: "10px" }}>
                              {activeProspects.map((prospect) => {
                                const prospectUrl = buildProspectDetailUrl(prospect.prospectId);
                                const nxtUrl = buildBlackbaudConstituentProfileUrl(
                                  prospect.blackbaudConstituentId,
                                );
                                return (
                                  <div key={prospect.prospectId} style={{ backgroundColor: "white", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "12px" }}>
                                    <div style={{ alignItems: "flex-start", display: "flex", gap: "10px", justifyContent: "space-between" }}>
                                      <div>
                                        <div style={{ color: "#0F172A", fontSize: "15px", fontWeight: 800 }}>
                                          {prospect.prospectName}
                                        </div>
                                        <div style={{ color: prospect.isOverdue ? "#B91C1C" : "#64748B", fontSize: "13px", lineHeight: 1.45, marginTop: "4px" }}>
                                          {prospect.hasOpenNextStep
                                            ? `Next step: ${prospect.nextActionText || "Open action"} · Due ${formatShortDate(prospect.nextActionDueDate)}`
                                            : "No open next step recorded"}
                                        </div>
                                      </div>
                                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "flex-end" }}>
                                        {prospectUrl ? (
                                          <a href={prospectUrl} style={detailLinkStyle}>
                                            Open in JUMGOGPT
                                          </a>
                                        ) : null}
                                        {nxtUrl ? (
                                          <a href={nxtUrl} rel="noreferrer" style={detailLinkStyle} target="_blank">
                                            Open in NXT
                                          </a>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ color: "#64748B", fontSize: "14px" }}>No active prospects are contributing right now.</div>
                          )}
                        </div>

                      <div style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "14px", padding: "14px" }}>
                          <div style={{ color: "#0F172A", fontSize: "14px", fontWeight: 900, marginBottom: "10px" }}>
                            Open opportunities ({openOpportunities.length})
                          </div>
                          {openOpportunities.length ? (
                            <div style={{ display: "grid", gap: "10px" }}>
                              {openOpportunities.map((opportunity) => {
                                const prospectUrl = buildProspectDetailUrl(opportunity.prospectId);
                                const nxtUrl = buildBlackbaudConstituentProfileUrl(
                                  opportunity.blackbaudConstituentId,
                                );
                                return (
                                  <div key={opportunity.opportunityId} style={{ backgroundColor: "white", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "12px" }}>
                                    <div style={{ alignItems: "flex-start", display: "flex", gap: "10px", justifyContent: "space-between" }}>
                                      <div>
                                        <div style={{ color: "#0F172A", fontSize: "15px", fontWeight: 800 }}>
                                          {opportunity.title}
                                        </div>
                                        <div style={{ color: "#334155", fontSize: "13px", fontWeight: 700, marginTop: "4px" }}>
                                          {opportunity.prospectName} · {opportunity.currentStage}
                                        </div>
                                        <div style={{ color: "#64748B", fontSize: "13px", lineHeight: 1.45, marginTop: "4px" }}>
                                          {formatCurrency(opportunity.estimatedAmount)}
                                          {opportunity.expectedDate ? ` · Expected ${formatShortDate(opportunity.expectedDate)}` : ""}
                                        </div>
                                      </div>
                                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "flex-end" }}>
                                        {prospectUrl ? (
                                          <a href={prospectUrl} style={detailLinkStyle}>
                                            Open prospect
                                          </a>
                                        ) : null}
                                        {nxtUrl ? (
                                          <a href={nxtUrl} rel="noreferrer" style={detailLinkStyle} target="_blank">
                                            Open in NXT
                                          </a>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ color: "#64748B", fontSize: "14px" }}>No open opportunities are contributing right now.</div>
                          )}
                        </div>

                        <div style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "14px", padding: "14px" }}>
                          <div style={{ color: "#0F172A", fontSize: "14px", fontWeight: 900, marginBottom: "10px" }}>
                            {`${report?.fiscalYear?.label || "Current FY"} NXT actions (${nxtActions.length})`}
                          </div>
                          {nxtActions.length ? (
                            <div style={{ display: "grid", gap: "10px" }}>
                              {nxtActions.map((action, actionIndex) => {
                                const actionKey = action.actionId || `${entry.userId}-${action.date || "undated"}-${actionIndex}`;
                                const nxtUrl = buildBlackbaudConstituentProfileUrl(
                                  action.blackbaudConstituentId,
                                );
                                return (
                                  <div key={actionKey} style={{ backgroundColor: "white", border: "1px solid #E2E8F0", borderRadius: "12px", padding: "12px" }}>
                                    <div style={{ alignItems: "flex-start", display: "flex", gap: "10px", justifyContent: "space-between" }}>
                                      <div>
                                        <div style={{ color: "#0F172A", fontSize: "15px", fontWeight: 800 }}>
                                          {action.summary || action.category || "Untitled NXT action"}
                                        </div>
                                        <div style={{ color: "#334155", fontSize: "13px", fontWeight: 700, marginTop: "4px" }}>
                                          {action.constituentName || "Unknown constituent"}
                                          {action.category ? ` · ${action.category}` : ""}
                                          {action.type ? ` · ${action.type}` : ""}
                                          {action.highValue ? <span style={{ display: "inline-block", marginLeft: "6px", color: "#006B53", fontWeight: 900 }}>High value</span> : null}
                                        </div>
                                        <div style={{ color: "#64748B", fontSize: "13px", lineHeight: 1.45, marginTop: "4px" }}>
                                          {action.date ? `Action date ${formatShortDate(action.date)}` : "Action date unavailable"}
                                          {action.blackbaudConstituentId
                                            ? ` · NXT ID ${action.blackbaudConstituentId}`
                                            : ""}
                                        </div>
                                      </div>
                                      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", justifyContent: "flex-end" }}>
                                        {nxtUrl ? (
                                          <a href={nxtUrl} rel="noreferrer" style={detailLinkStyle} target="_blank">
                                            Open in NXT
                                          </a>
                                        ) : null}
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div style={{ color: "#64748B", fontSize: "14px" }}>
                              {isFiniteNumericValue(entry.nxtActionsThisFiscalYear) ? "No attributed NXT actions are contributing right now." : "NXT actions are unavailable in this snapshot."}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : null}
                  </div>
                      </>
                    );
                  })()}
                </article>
              ))}
            </div>
          ) : (
            <p style={{ color: "#64748B", lineHeight: 1.5, margin: 0, padding: "28px 24px" }}>No active MGO users are available for this report.</p>
          )}
        </section>

        <p style={{ color: "#64748B", fontSize: "13px", lineHeight: 1.5, margin: "18px 0 0" }}>
          Source: {report?.source || "NXT gift credit and actions; JUMGOGPT local operational records"}. Rankings use NXT fundraiser attribution. Local pipeline and follow-up metrics are shown separately.
        </p>
      </div>
    </main>
  );
}

function MetricCard({ color, icon, label, value }) {
  return (
    <article style={{ ...panelStyle, padding: "20px" }}>
      <div style={{ alignItems: "center", color, display: "flex", gap: "8px", fontSize: "14px", fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase" }}>
        {icon}
        {label}
      </div>
      <p style={{ color: "#0F172A", fontSize: "30px", fontWeight: 900, margin: "16px 0 0" }}>{value}</p>
    </article>
  );
}

function StandingsMetric({ color, label, value }) {
  return (
    <div>
      <p style={{ color: "#64748B", fontSize: "12px", fontWeight: 900, letterSpacing: "0.06em", margin: 0, textTransform: "uppercase" }}>{label}</p>
      <p style={{ color, fontSize: "19px", fontWeight: 900, margin: "5px 0 0" }}>{value}</p>
    </div>
  );
}

function TrendChip({ color, label }) {
  return (
    <span
      style={{
        alignItems: "center",
        backgroundColor: "white",
        border: `1px solid ${color}22`,
        borderRadius: "999px",
        color,
        display: "inline-flex",
        fontSize: "12px",
        fontWeight: 800,
        padding: "7px 10px",
      }}
    >
      {label}
    </span>
  );
}
