"use client";

import { useEffect, useState } from "react";
import { CircleAlert, ExternalLink, RefreshCw, Users } from "lucide-react";
import useUser from "@/utils/useUser";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";
import SharedReportHeader from "@/app/reports/SharedReportHeader";

const POLL_INTERVAL_MS = 1250;
const MAX_POLL_ATTEMPTS = 48;

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function formatDate(value) {
  const dateOnlyMatch = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (dateOnlyMatch) {
    const [, year, month, day] = dateOnlyMatch;
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${year}-${month}-${day}T00:00:00Z`));
  }
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Not available";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function MetricCard({ label, value, detail, color = "#1D4ED8" }) {
  return (
    <article
      style={{
        border: "1px solid #DCE7F7",
        borderRadius: "16px",
        backgroundColor: "white",
        padding: "18px",
      }}
    >
      <p
        style={{
          margin: 0,
          color: "#64748B",
          fontSize: "12px",
          fontWeight: 800,
          letterSpacing: "0.06em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </p>
      <strong style={{ display: "block", marginTop: "8px", color, fontSize: "31px" }}>
        {formatNumber(value)}
      </strong>
      {detail ? <p style={{ margin: "6px 0 0", color: "#64748B", fontSize: "13px" }}>{detail}</p> : null}
    </article>
  );
}

function SetupInstructions({ canManage }) {
  return (
    <section
      style={{
        border: "1px solid #BFDBFE",
        borderRadius: "18px",
        padding: "24px",
        backgroundColor: "#EFF6FF",
      }}
    >
      <h2 style={{ margin: 0, color: "#1E3A8A", fontSize: "22px" }}>Connect the saved NXT query</h2>
      <p style={{ margin: "9px 0 0", color: "#334155", lineHeight: 1.55 }}>
        This report resolves the saved NXT query named Alumni Donors FY27 when it first refreshes. An
        administrator can also enter its query ID in Report Access. The report then uses one saved query export,
        not a background scan of constituent records.
      </p>
      <ol style={{ margin: "15px 0 0", paddingLeft: "22px", color: "#334155", lineHeight: 1.65 }}>
        <li>Filter to constituency codes that begin with `Alumni`.</li>
        <li>Filter to current-fiscal-year Cash Received gifts.</li>
        <li>Include direct and soft-credit recipients as separate credited constituent rows.</li>
        <li>
          Output constituent system record ID or lookup ID, name, constituency code, Cash Received gift date and
          type, and credit type.
        </li>
      </ol>
      <p style={{ margin: "14px 0 0", color: "#1E3A8A", fontWeight: 800, lineHeight: 1.5 }}>
        The report deduplicates by constituent. Two alumni spouses receiving soft credit for the same DAF gift
        count as two alumni donors; repeated credits for one alum count once.
      </p>
      {canManage ? (
        <a
          href="/report-configurations"
          style={{
            display: "inline-flex",
            marginTop: "18px",
            minHeight: "42px",
            alignItems: "center",
            borderRadius: "10px",
            backgroundColor: "#1D4ED8",
            color: "white",
            padding: "0 14px",
            textDecoration: "none",
            fontWeight: 800,
          }}
        >
          Configure report source
        </a>
      ) : null}
    </section>
  );
}

export default function AlumniFamilyEngagementPage() {
  const { data: user, loading: loadingUser } = useUser();
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [statusText, setStatusText] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    if (!loadingUser && !user) {
      window.location.href = "/account/signin";
    }
  }, [loadingUser, user]);

  useEffect(() => {
    if (!user) return undefined;

    let active = true;
    const controller = new AbortController();

    async function requestReport(path) {
      const response = await fetch(path, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok && response.status !== 202) {
        throw new Error(payload?.error || "Could not load Alumni & Family Engagement.");
      }
      return { response, payload };
    }

    async function loadReport() {
      setIsLoading(true);
      setError("");
      setStatusText("Preparing the saved NXT query...");
      try {
        const refreshSuffix = refreshVersion > 0 ? "?refresh=1" : "";
        let { response, payload } = await requestReport(
          `/api/reports/alumni-family-engagement${refreshSuffix}`,
        );

        for (let attempt = 0; response.status === 202 && attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
          if (!active) return;
          setStatusText(payload?.jobStatus || "Waiting for NXT to finish the saved query...");
          await wait(POLL_INTERVAL_MS);
          if (!active) return;
          ({ response, payload } = await requestReport(
            `/api/reports/alumni-family-engagement?jobId=${encodeURIComponent(payload?.jobId || "")}`,
          ));
        }

        if (response.status === 202) {
          throw new Error("The saved NXT query is taking longer than expected. Please try refreshing this report.");
        }
        if (!active) return;
        setReport(payload);
        setStatusText("");
      } catch (loadError) {
        if (!active || loadError?.name === "AbortError") return;
        setError(
          loadError instanceof Error ? loadError.message : "Could not load Alumni & Family Engagement.",
        );
      } finally {
        if (active) setIsLoading(false);
      }
    }

    loadReport();
    return () => {
      active = false;
      controller.abort();
    };
  }, [refreshVersion, user]);

  if (loadingUser || !user) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#64748B" }}>
        Loading report...
      </main>
    );
  }

  const metrics = report?.metrics || {};
  const donors = Array.isArray(report?.donors) ? report.donors : [];
  const warnings = Array.isArray(report?.warnings) ? report.warnings : [];
  const canManage = canManageWorkspaceRole(user.role);
  const isSetupRequired = report?.status === "setup_required";
  const isRefreshRequired = report?.status === "refresh_required";

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", padding: "28px 18px 48px" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto" }}>
        <SharedReportHeader
          activeReportKey="alumni-family-engagement"
          eyebrow="Shared engagement report"
          title="Alumni & Family Engagement"
          description="Distinct alumni constituents with a current-fiscal-year Cash Received credit, including direct and soft credits."
          action={
            <button
              type="button"
              onClick={() => setRefreshVersion((version) => version + 1)}
              disabled={isLoading || isSetupRequired}
              style={{
                minHeight: "42px",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                borderRadius: "10px",
                border: "1px solid #BFDBFE",
                backgroundColor: "white",
                color: "#1D4ED8",
                padding: "0 14px",
                fontWeight: 800,
                cursor: isLoading || isSetupRequired ? "default" : "pointer",
                opacity: isLoading || isSetupRequired ? 0.65 : 1,
              }}
            >
              <RefreshCw size={17} />
              Refresh data
            </button>
          }
        />

        {error ? (
          <section
            role="alert"
            style={{
              marginBottom: "20px",
              border: "1px solid #FECACA",
              borderRadius: "14px",
              padding: "18px",
              color: "#991B1B",
              backgroundColor: "#FEF2F2",
              fontWeight: 700,
            }}
          >
            {error}
          </section>
        ) : null}

        {isLoading ? (
          <section
            style={{
              marginBottom: "20px",
              border: "1px solid #BFDBFE",
              borderRadius: "16px",
              padding: "22px",
              backgroundColor: "#EFF6FF",
              color: "#1E3A8A",
            }}
          >
            <strong>{statusText || "Loading the cached report..."}</strong>
            <p style={{ margin: "8px 0 0", color: "#475569", lineHeight: 1.5 }}>
              A refresh runs one saved NXT query. Normal visits use the last successful snapshot and do not make
              another NXT request for every constituent.
            </p>
          </section>
        ) : null}

        {isSetupRequired ? <SetupInstructions canManage={canManage} /> : null}

        {isRefreshRequired ? (
          <section
            style={{
              marginBottom: "20px",
              border: "1px solid #BFDBFE",
              borderRadius: "16px",
              padding: "20px",
              backgroundColor: "#EFF6FF",
              color: "#1E3A8A",
            }}
          >
            <strong>No saved Alumni & Family Engagement snapshot is available.</strong>
            <p style={{ margin: "8px 0 0", lineHeight: 1.5 }}>
              Select Refresh data once. The saved result will then remain available until the next 6 PM Eastern
              refresh or another manual refresh.
            </p>
          </section>
        ) : null}

        {report?.status === "complete" ? (
          <>
            <section
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(205px, 1fr))",
                gap: "14px",
                marginBottom: "20px",
              }}
            >
              <MetricCard
                label={`${report?.fiscalYear?.yearLabel || "Current FY"} alumni donors`}
                value={metrics.alumniDonors}
                detail="Unique alumni constituents"
                color="#166534"
              />
              <MetricCard
                label="Soft-credit donors"
                value={metrics.softCreditDonors}
                detail="Also included in the total when eligible"
                color="#7E22CE"
              />
              <MetricCard
                label="Direct-credit donors"
                value={metrics.directCreditDonors}
                detail="Also included in the total when eligible"
                color="#1D4ED8"
              />
              <MetricCard
                label="Credits reviewed"
                value={metrics.qualifyingCreditRows}
                detail={`${formatNumber(metrics.duplicateCreditsCollapsed)} duplicate credits collapsed`}
                color="#B45309"
              />
            </section>

            <section
              style={{
                border: "1px solid #BBF7D0",
                borderRadius: "15px",
                backgroundColor: "#F0FDF4",
                padding: "18px 20px",
                color: "#166534",
                marginBottom: "20px",
              }}
            >
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                <Users size={20} style={{ marginTop: "2px", flexShrink: 0 }} />
                <div>
                  <strong>
                    {report?.fiscalYear?.yearLabel || "Current FY"}: {report?.fiscalYear?.startDate} through{" "}
                    {report?.fiscalYear?.endDate}
                  </strong>
                  <p style={{ margin: "6px 0 0", lineHeight: 1.5 }}>
                    Each credited constituent is counted once. This means two alumni spouses who both receive soft
                    credit for one DAF gift count as two alumni donors.
                  </p>
                </div>
              </div>
            </section>

            {warnings.length ? (
              <section
                style={{
                  border: "1px solid #FDE68A",
                  borderRadius: "15px",
                  backgroundColor: "#FFFBEB",
                  padding: "18px 20px",
                  color: "#92400E",
                  marginBottom: "20px",
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                  <CircleAlert size={20} style={{ marginTop: "2px", flexShrink: 0 }} />
                  <div>
                    <strong>Saved-query data check</strong>
                    <ul style={{ margin: "8px 0 0", paddingLeft: "20px", lineHeight: 1.5 }}>
                      {warnings.map((warning) => (
                        <li key={warning}>{warning}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </section>
            ) : null}

            <section
              style={{
                border: "1px solid #E2E8F0",
                borderRadius: "18px",
                backgroundColor: "white",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "20px 22px",
                  borderBottom: "1px solid #E2E8F0",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "16px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h2 style={{ margin: 0, color: "#0F172A", fontSize: "21px" }}>Included alumni donors</h2>
                  <p style={{ margin: "6px 0 0", color: "#64748B" }}>
                    {formatNumber(donors.length)} unique donor{donors.length === 1 ? "" : "s"} from {report?.query?.name || "the saved NXT query"}.
                  </p>
                </div>
                <p style={{ margin: 0, color: "#64748B", fontSize: "13px" }}>
                  Last refreshed {formatDate(report.generatedAt)}
                </p>
              </div>

              {report.truncated ? (
                <p style={{ margin: 0, padding: "14px 22px", color: "#92400E", backgroundColor: "#FFFBEB", fontWeight: 700 }}>
                  The saved query returned more than 10,000 rows. Only the first 10,000 were evaluated.
                </p>
              ) : null}

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "780px" }}>
                  <thead>
                    <tr style={{ backgroundColor: "#F8FAFC" }}>
                      {["Constituent", "Constituency", "Credit", "Latest Cash Received", "Record"].map((label) => (
                        <th
                          key={label}
                          scope="col"
                          style={{
                            padding: "13px 18px",
                            textAlign: label === "Record" ? "right" : "left",
                            color: "#475569",
                            fontSize: "12px",
                            letterSpacing: "0.05em",
                            textTransform: "uppercase",
                          }}
                        >
                          {label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {donors.map((donor) => {
                      const profileUrl = buildBlackbaudConstituentProfileUrl(donor.constituentId);
                      return (
                        <tr key={donor.id} style={{ borderTop: "1px solid #E2E8F0" }}>
                          <td style={{ padding: "15px 18px", color: "#0F172A", fontWeight: 800 }}>
                            <div>{donor.name}</div>
                            {donor.lookupId ? (
                              <div style={{ marginTop: "4px", color: "#64748B", fontSize: "13px", fontWeight: 500 }}>
                                Lookup ID {donor.lookupId}
                              </div>
                            ) : null}
                          </td>
                          <td style={{ padding: "15px 18px", color: "#334155" }}>{donor.constituency || "From query criteria"}</td>
                          <td style={{ padding: "15px 18px", color: "#334155" }}>{donor.creditTypes.join(", ")}</td>
                          <td style={{ padding: "15px 18px", color: "#334155" }}>
                            {donor.giftDate ? formatDate(donor.giftDate) : "From query criteria"}
                          </td>
                          <td style={{ padding: "12px 18px", textAlign: "right" }}>
                            {profileUrl ? (
                              <a
                                href={profileUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "7px",
                                  minHeight: "38px",
                                  border: "1px solid #93C5FD",
                                  borderRadius: "9px",
                                  color: "#1D4ED8",
                                  padding: "0 11px",
                                  textDecoration: "none",
                                  fontWeight: 800,
                                }}
                              >
                                Open NXT
                                <ExternalLink size={15} />
                              </a>
                            ) : (
                              <span style={{ color: "#94A3B8" }}>No ID</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {!donors.length ? (
                <p style={{ margin: 0, padding: "22px", color: "#64748B" }}>
                  No qualifying alumni donor rows were returned by this saved query.
                </p>
              ) : null}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
