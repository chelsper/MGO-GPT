"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RefreshCw, Target, TrendingUp, Users } from "lucide-react";
import useUser from "@/utils/useUser";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number(value || 0));
}

function getCoverage(covered, active) {
  if (!active) return "No active prospects";
  return `${Math.round((Number(covered || 0) / Number(active)) * 100)}% coverage`;
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
        const response = await fetch("/api/reports/executive-team-standings", {
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

  const standings = Array.isArray(report?.standings) ? report.standings : [];
  const totals = standings.reduce(
    (result, entry) => ({
      activeProspects: result.activeProspects + Number(entry.activeProspects || 0),
      openPipeline: result.openPipeline + Number(entry.openPipeline || 0),
      funded: result.funded + Number(entry.fundedThisFiscalYear || 0),
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
    <main style={{ backgroundColor: "#F8FAFC", minHeight: "100vh", padding: "40px 24px 80px" }}>
      <div style={{ margin: "0 auto", maxWidth: "1400px" }}>
        <SharedReportHeader
          activeReportKey="executive-team-standings"
          eyebrow="Executive dashboard"
          title="Team Standings"
          description="A local operational snapshot for active MGOs. This is not an NXT revenue report."
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

        {error ? (
          <section style={{ ...panelStyle, borderColor: "#FECACA", backgroundColor: "#FEF2F2", color: "#991B1B", marginTop: "28px", padding: "18px" }}>
            <strong style={{ display: "flex", alignItems: "center", gap: "8px" }}><AlertTriangle size={19} /> Standings could not load</strong>
            <p style={{ margin: "8px 0 0" }}>{error}</p>
          </section>
        ) : null}

        <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))", gap: "16px", marginTop: "28px" }}>
          <MetricCard label="Active MGOs" value={standings.length} icon={<Users size={20} />} color="#4F46E5" />
          <MetricCard label="Active prospects" value={totals.activeProspects} icon={<Target size={20} />} color="#0369A1" />
          <MetricCard label="Open pipeline" value={formatCurrency(totals.openPipeline)} icon={<TrendingUp size={20} />} color="#0F766E" />
          <MetricCard label={`${report?.fiscalYear?.label || "Current FY"} closed-opportunity value`} value={formatCurrency(totals.funded)} icon={<TrendingUp size={20} />} color="#166534" />
        </section>

        <section style={{ ...panelStyle, marginTop: "20px", padding: "20px 24px" }}>
          <div style={{ alignItems: "flex-start", display: "flex", flexWrap: "wrap", gap: "14px", justifyContent: "space-between" }}>
            <div>
              <h2 style={{ color: "#0F172A", fontSize: "20px", margin: 0 }}>Recent momentum</h2>
              <p style={{ color: "#64748B", lineHeight: 1.5, margin: "6px 0 0" }}>
                Last {report?.trendWindowDays || 7} days across the team. This shows current motion without pretending we have historical ranking snapshots.
              </p>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
              <TrendChip color="#1D4ED8" label={pluralize(totals.prospectsTouched, "prospect touched")} />
              <TrendChip color="#7C3AED" label={pluralize(totals.updatesLogged, "update logged")} />
              <TrendChip color="#0F766E" label={pluralize(totals.opportunityChanges, "opportunity change")} />
              <TrendChip color="#166534" label={`${formatCurrency(totals.recentlyClosedValue)} recently closed`} />
            </div>
          </div>
        </section>

        <section style={{ ...panelStyle, marginTop: "24px", overflow: "hidden" }}>
          <div style={{ padding: "22px 24px", borderBottom: "1px solid #E2E8F0" }}>
            <h2 style={{ color: "#0F172A", fontSize: "22px", margin: 0 }}>Team board</h2>
            <p style={{ color: "#64748B", lineHeight: 1.5, margin: "7px 0 0" }}>
              Pipeline and funded figures reflect opportunities recorded in JUMGOGPT. Follow-up coverage is based on active prospects with an open next step.
            </p>
          </div>

          {loading ? (
            <p style={{ color: "#64748B", margin: 0, padding: "28px 24px" }}>Loading team standings...</p>
          ) : standings.length ? (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(310px, 1fr))", gap: "18px", padding: "22px" }}>
              {standings.map((entry, index) => (
                <article key={entry.userId} style={{ border: "1px solid #E2E8F0", borderRadius: "16px", padding: "20px", backgroundColor: index === 0 ? "#F8FAFC" : "white" }}>
                  {(() => {
                    const isExpanded = expandedUserIds.includes(entry.userId);
                    const activeProspects = Array.isArray(entry.drilldown?.activeProspects)
                      ? entry.drilldown.activeProspects
                      : [];
                    const openOpportunities = Array.isArray(entry.drilldown?.openOpportunities)
                      ? entry.drilldown.openOpportunities
                      : [];
                    return (
                      <>
                  <div style={{ alignItems: "flex-start", display: "flex", gap: "12px", justifyContent: "space-between" }}>
                    <div>
                      <p style={{ color: "#64748B", fontSize: "13px", fontWeight: 900, letterSpacing: "0.07em", margin: 0, textTransform: "uppercase" }}>MGO</p>
                      <h3 style={{ color: "#0F172A", fontSize: "22px", margin: "6px 0 0" }}>{entry.name}</h3>
                      <p style={{ color: "#64748B", fontSize: "14px", margin: "5px 0 0" }}>{entry.email}</p>
                    </div>
                    <span style={{ borderRadius: "999px", backgroundColor: "#EEF2FF", color: "#4338CA", fontSize: "14px", fontWeight: 900, padding: "8px 10px" }}>
                      {entry.activeProspects} active
                    </span>
                  </div>
                  <div style={{ borderTop: "1px solid #E2E8F0", display: "grid", gap: "13px", gridTemplateColumns: "1fr 1fr", marginTop: "18px", paddingTop: "18px" }}>
                    <StandingsMetric label="Open pipeline" value={formatCurrency(entry.openPipeline)} color="#0F766E" />
                    <StandingsMetric label={`${report?.fiscalYear?.label || "Current FY"} closed`} value={formatCurrency(entry.fundedThisFiscalYear)} color="#166534" />
                    <StandingsMetric label="Next-step coverage" value={getCoverage(entry.prospectsWithNextSteps, entry.activeProspects)} color="#1D4ED8" />
                    <StandingsMetric label="Overdue follow-ups" value={entry.overdueNextSteps} color={entry.overdueNextSteps ? "#B91C1C" : "#166534"} />
                  </div>
                  <div style={{ backgroundColor: "#F8FAFC", border: "1px solid #E2E8F0", borderRadius: "14px", display: "grid", gap: "8px", marginTop: "18px", padding: "14px" }}>
                    <div style={{ color: "#0F172A", fontSize: "13px", fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                      Last {entry.trend?.windowDays || report?.trendWindowDays || 7} days
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                      <TrendChip color="#1D4ED8" label={pluralize(Number(entry.trend?.prospectsTouched || 0), "prospect touched")} />
                      <TrendChip color="#7C3AED" label={pluralize(Number(entry.trend?.updatesLogged || 0), "update logged")} />
                      <TrendChip color="#0F766E" label={pluralize(Number(entry.trend?.opportunityChanges || 0), "opportunity change")} />
                      <TrendChip color="#166534" label={`${formatCurrency(entry.trend?.recentlyClosedValue || 0)} closed`} />
                    </div>
                  </div>
                  <div style={{ borderTop: "1px solid #E2E8F0", display: "grid", gap: "12px", marginTop: "18px", paddingTop: "18px" }}>
                    <div style={{ alignItems: "center", display: "flex", flexWrap: "wrap", gap: "10px", justifyContent: "space-between" }}>
                      <div style={{ color: "#475569", fontSize: "14px", lineHeight: 1.45 }}>
                        Show the exact active prospects and open opportunities behind this standing.
                      </div>
                      <button
                        type="button"
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
                        {isExpanded ? "Hide underlying records" : "Show underlying records"}
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
          Source: {report?.source || "JUMGOGPT local operational records"}. Generated from app data only; no Blackbaud request is made.
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
