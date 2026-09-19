"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import useUser from "@/utils/useUser";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import { canUseExecutiveViewRole, isMgoRole } from "@/utils/workspaceRoles";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import GiftReportActions, {
  GiftRowActions,
} from "@/app/reports/GiftReportActions";
import { portfolioGivingTitle } from "@/utils/portfolioGivingTitle";
import { usePortfolioGivingReport } from "@/app/reports/usePortfolioGivingReport";
import { useReportConfigurations } from "@/app/reports/useReportConfigurations";
const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function formatCurrency(value) {
  return currencyFormatter.format(Number(value || 0));
}

function formatGiftDate(value) {
  // Gift/report dates are calendar dates, not instants in the viewer's zone.
  const date = new Date(typeof value === "string" ? value.slice(0, 10) : value);
  return Number.isFinite(date.getTime())
    ? dateFormatter.format(date)
    : "Unavailable";
}

function MetricCard({ label, value, hint }) {
  return (
    <div
      style={{
        backgroundColor: "white",
        border: "1px solid #E2E8F0",
        borderRadius: "16px",
        padding: "20px",
      }}
    >
      <div
        style={{
          color: "#64748B",
          fontSize: "12px",
          fontWeight: 800,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: "#0F172A",
          fontSize: "30px",
          fontWeight: 800,
          marginTop: "8px",
        }}
      >
        {value}
      </div>
      {hint ? (
        <div style={{ color: "#64748B", fontSize: "13px", marginTop: "6px" }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

export default function ReportsPage() {
  const { data: user, loading: loadingUser } = useUser();
  const [profileStatus, setProfileStatus] = useState(null);
  const [actingWorkspaceStatus, setActingWorkspaceStatus] = useState(null);
  const [mgoUsers, setMgoUsers] = useState([]);
  const [isSwitchingWorkspace, setIsSwitchingWorkspace] = useState(false);
  const [reportError, setReportError] = useState("");
  const {
    configurations: reportConfigurations,
    visibleReports,
    canManage: canManageReports,
    isLoading: isLoadingReportConfigurations,
    error: reportConfigurationsError,
  } = useReportConfigurations({ enabled: Boolean(user) });

  useEffect(() => {
    if (!loadingUser && !user) {
      window.location.href = "/account/signin";
    }
  }, [loadingUser, user]);

  useEffect(() => {
    if (!user) return undefined;

    let active = true;
    async function loadProfileContext() {
      try {
        const response = await fetch("/api/users/profile");
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            payload?.error || "Could not load your workspace profile.",
          );
        }
        if (active) setProfileStatus(payload);
      } catch (error) {
        if (active) {
          setReportError(
            error instanceof Error
              ? error.message
              : "Could not load your workspace profile.",
          );
        }
      }
    }

    loadProfileContext();
    return () => {
      active = false;
    };
  }, [user?.id, user?.email]);

  const canUseExecutiveView = canUseExecutiveViewRole(
    profileStatus?.user?.role,
  );
  const reportAccess =
    reportConfigurations.find(
      (configuration) => configuration.key === "portfolio-fy-giving",
    ) || null;
  const reportAccessLoading = Boolean(user) && isLoadingReportConfigurations;
  const reportAccessError = reportConfigurationsError
    ? reportConfigurationsError instanceof Error
      ? reportConfigurationsError.message
      : "Could not load report access."
    : !reportAccessLoading && user && !reportAccess
      ? "Portfolio giving access could not be loaded."
      : "";

  useEffect(() => {
    if (!user || !canUseExecutiveView) return undefined;

    let active = true;
    async function loadExecutiveOptions() {
      try {
        const [workspaceResponse, mgoResponse] = await Promise.all([
          fetch("/api/admin/workspace-user"),
          fetch("/api/users/mgos"),
        ]);
        const [workspacePayload, mgoPayload] = await Promise.all([
          workspaceResponse.json().catch(() => null),
          mgoResponse.json().catch(() => null),
        ]);
        if (!workspaceResponse.ok) {
          throw new Error(
            workspacePayload?.error ||
              "Could not load the selected MGO workspace.",
          );
        }
        if (!mgoResponse.ok) {
          throw new Error(
            mgoPayload?.error || "Could not load MGO report options.",
          );
        }
        if (active) {
          setActingWorkspaceStatus(workspacePayload);
          setMgoUsers(Array.isArray(mgoPayload) ? mgoPayload : []);
        }
      } catch (error) {
        if (active) {
          setReportError(
            error instanceof Error
              ? error.message
              : "Could not load MGO report options.",
          );
        }
      }
    }

    loadExecutiveOptions();
    return () => {
      active = false;
    };
  }, [canUseExecutiveView, user?.id, user?.email]);

  const workspaceUser = profileStatus?.workspaceUser || null;

  const report = usePortfolioGivingReport({
    workspaceUserId: workspaceUser?.id,
    enabled:
      !reportAccessLoading &&
      !reportAccessError &&
      reportAccess?.canView === true,
  });
  const snapshot = report.data?.snapshot;
  const reportRows = snapshot?.reportRows || [];
  const acknowledgmentGiftGroups = snapshot?.acknowledgmentGiftGroups || [];
  const period = snapshot?.period || report.data?.period;
  const refreshState = report.data?.refresh;
  const isLoadingReport = report.loading;
  const yearLabel = period?.yearLabel || portfolioGivingTitle().split(" ")[0];
  const closedYearLabel = snapshot?.closedGiftSummary?.currentFY || yearLabel;
  const totalReceived = snapshot?.hardCreditTotals?.received;
  const totalCommitted = snapshot?.closedGiftSummary?.closedThisFY;

  async function handleWorkspaceChange(event) {
    const nextUserId = Number(event.target.value || 0);
    setIsSwitchingWorkspace(true);
    setReportError("");
    try {
      const response = nextUserId
        ? await fetch("/api/admin/workspace-user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: nextUserId }),
          })
        : await fetch("/api/admin/workspace-user", { method: "DELETE" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.error || "Could not switch the MGO report workspace.",
        );
      }
      window.location.assign("/reports");
    } catch (error) {
      setReportError(
        error instanceof Error
          ? error.message
          : "Could not switch the MGO report workspace.",
      );
      setIsSwitchingWorkspace(false);
    }
  }

  const selectedMgoId = actingWorkspaceStatus?.actingUser?.id || "";
  if (loadingUser || !user) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          color: "#64748B",
        }}
      >
        Loading reports...
      </main>
    );
  }

  if (reportAccessLoading) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          color: "#64748B",
        }}
      >
        Checking report access...
      </main>
    );
  }

  if (reportAccessError) {
    return (
      <main
        style={{
          minHeight: "100vh",
          backgroundColor: "#F8FAFC",
          padding: "28px 18px",
        }}
      >
        <div style={{ maxWidth: "720px", margin: "0 auto" }}>
          <a href="/" style={{ color: "#1D4ED8", fontWeight: 800 }}>
            Return to home
          </a>
          <div
            role="alert"
            style={{
              marginTop: "18px",
              border: "1px solid #FECACA",
              backgroundColor: "#FEF2F2",
              color: "#991B1B",
              borderRadius: "14px",
              padding: "16px",
              fontWeight: 700,
            }}
          >
            {reportAccessError}
          </div>
        </div>
      </main>
    );
  }

  if (reportAccess?.canView !== true) {
    return (
      <main
        style={{
          minHeight: "100vh",
          backgroundColor: "#F8FAFC",
          padding: "28px 18px",
        }}
      >
        <div style={{ maxWidth: "720px", margin: "0 auto" }}>
          <a href="/" style={{ color: "#1D4ED8", fontWeight: 800 }}>
            Return to home
          </a>
          <section
            style={{
              marginTop: "18px",
              backgroundColor: "white",
              border: "1px solid #E2E8F0",
              borderRadius: "18px",
              padding: "26px",
            }}
          >
            <h1 style={{ margin: 0, color: "#0F172A" }}>
              Portfolio giving is not shared with you
            </h1>
            <p style={{ color: "#64748B", lineHeight: 1.55 }}>
              An Advancement Services user can change this report&apos;s
              audience in Report Access &amp; Configurations.
            </p>
            {canManageReports ? (
              <a
                href="/report-configurations"
                style={{ color: "#1D4ED8", fontWeight: 800 }}
              >
                Configure report access
              </a>
            ) : null}
          </section>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "#F8FAFC",
        padding: "28px 18px 48px",
      }}
    >
      <div style={{ maxWidth: "1480px", margin: "0 auto" }}>
        <SharedReportHeader
          activeReportKey="portfolio-fy-giving"
          title={portfolioGivingTitle()}
          description="Portfolio giving, gift credit, and acknowledgment details from your last complete refresh."
          backHref="/"
          backLabel="Return to home"
          accessibleReports={visibleReports}
          action={
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "10px",
                flexWrap: "wrap",
              }}
            >
              {canManageReports ? (
                <a
                  href="/report-configurations"
                  style={{
                    minHeight: "42px",
                    display: "inline-flex",
                    alignItems: "center",
                    borderRadius: "10px",
                    border: "1px solid #BFDBFE",
                    backgroundColor: "white",
                    color: "#1D4ED8",
                    padding: "0 14px",
                    fontSize: "14px",
                    fontWeight: 800,
                  }}
                >
                  Configure access
                </a>
              ) : null}
              <button
                type="button"
                onClick={refreshState?.busy ? report.reload : report.refresh}
                disabled={
                  isLoadingReport ||
                  report.refreshing ||
                  isSwitchingWorkspace ||
                  !workspaceUser
                }
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  minHeight: "42px",
                  borderRadius: "10px",
                  border: "1px solid #BFDBFE",
                  backgroundColor: "white",
                  color: "#1D4ED8",
                  padding: "0 14px",
                  fontSize: "14px",
                  fontWeight: 800,
                  cursor: isLoadingReport ? "wait" : "pointer",
                }}
              >
                <RefreshCw size={17} />
                {report.refreshing
                  ? "Refreshing..."
                  : refreshState?.busy
                    ? "Reload refresh status"
                    : refreshState && refreshState.status !== "complete"
                      ? "Resume refresh"
                      : "Refresh report"}
              </button>
            </div>
          }
        />

        <section
          style={{
            backgroundColor: "white",
            border: "1px solid #E2E8F0",
            borderRadius: "18px",
            padding: "22px",
            boxShadow: "0 10px 28px rgba(15, 23, 42, 0.05)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "18px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ margin: 0, color: "#0F172A", fontSize: "20px" }}>
                {yearLabel} portfolio giving
              </h2>
              <p
                style={{
                  margin: "7px 0 0",
                  color: "#64748B",
                  lineHeight: 1.5,
                  maxWidth: "760px",
                }}
              >
                Every total and row is limited to gifts where NXT credits the
                selected fundraiser. Direct hard-credit totals include Donor
                Advised Fund gifts; Donor Advised Fund entities are excluded
                from acknowledgment recipients.
              </p>
            </div>
            {canUseExecutiveView ? (
              <label
                style={{
                  display: "grid",
                  gap: "7px",
                  width: "min(100%, 280px)",
                  minWidth: 0,
                  color: "#334155",
                  fontSize: "13px",
                  fontWeight: 800,
                }}
              >
                Report for fundraiser
                <select
                  name="report-mgo-workspace"
                  value={selectedMgoId}
                  onChange={handleWorkspaceChange}
                  disabled={isSwitchingWorkspace}
                  style={{
                    minHeight: "44px",
                    borderRadius: "10px",
                    border: "1px solid #CBD5E1",
                    backgroundColor: "white",
                    color: "#0F172A",
                    padding: "0 12px",
                    fontSize: "15px",
                  }}
                >
                  <option value="">My MGO workspace</option>
                  {mgoUsers
                    .filter((candidate) => isMgoRole(candidate?.role))
                    .map((candidate) => (
                      <option key={candidate.id} value={candidate.id}>
                        {candidate.name || candidate.email}
                      </option>
                    ))}
                </select>
              </label>
            ) : null}
          </div>
          {workspaceUser ? (
            <div
              style={{
                marginTop: "16px",
                borderRadius: "12px",
                backgroundColor: "#EFF6FF",
                color: "#1E40AF",
                padding: "11px 13px",
                fontSize: "14px",
                fontWeight: 700,
              }}
            >
              Showing{" "}
              {workspaceUser.name || workspaceUser.email || "the selected MGO"}
              &apos;s portfolio.
            </div>
          ) : null}
        </section>

        {reportError || report.error ? (
          <div
            role="alert"
            style={{
              marginTop: "18px",
              border: "1px solid #FECACA",
              backgroundColor: "#FEF2F2",
              color: "#991B1B",
              borderRadius: "14px",
              padding: "14px 16px",
              fontWeight: 700,
            }}
          >
            {reportError || report.error}
          </div>
        ) : null}

        <section
          aria-label="Report refresh status"
          style={{
            marginTop: "18px",
            padding: "16px",
            border: "1px solid #CBD5E1",
            borderRadius: "14px",
            background: "#FFFFFF",
            color: "#475569",
          }}
        >
          {isLoadingReport ? (
            <p role="status">Loading saved report...</p>
          ) : null}
          {snapshot ? (
            <p style={{ margin: 0 }}>
              Last complete refresh:{" "}
              {new Date(snapshot.generatedAt).toLocaleString("en-US")}. Cash
              received through {formatGiftDate(snapshot.period.endDate)}.
              Committed totals cover the full fiscal year.
            </p>
          ) : !isLoadingReport ? (
            <div>
              <strong>No saved report yet for {yearLabel}.</strong>
              <p>
                Select Refresh report to prepare it. Totals will appear together
                after every required check succeeds.
              </p>
            </div>
          ) : null}
          {refreshState && refreshState.status !== "complete" ? (
            <div role="status" style={{ marginTop: "10px" }}>
              <strong>
                {report.refreshing
                  ? "Refreshing"
                  : refreshState.busy
                    ? "Refresh running in another request"
                    : "Refresh ready to resume"}
              </strong>
              <p style={{ margin: "6px 0" }}>
                {refreshState.stage === "portfolio"
                  ? "Checking portfolio assignments."
                  : refreshState.stage === "giving"
                    ? `Gift records checked: ${refreshState.checked} of ${refreshState.total} constituents.`
                    : refreshState.stage === "profiles"
                      ? `Donor details checked: ${refreshState.profilesChecked} of ${refreshState.profilesTotal}.`
                      : refreshState.stage === "opportunities"
                        ? "Checking open opportunity options."
                        : "Verifying fiscal-year totals."}
              </p>
              {refreshState.message ? (
                <p style={{ color: "#92400E" }}>{refreshState.message}</p>
              ) : null}
              {refreshState.retryAt ? (
                <p>
                  Retry after{" "}
                  {new Date(refreshState.retryAt).toLocaleTimeString("en-US")}.
                </p>
              ) : null}
              <p style={{ margin: "6px 0" }}>
                The previous complete report stays visible. Keep this page open
                to finish; if you leave, use Resume refresh to continue.
              </p>
            </div>
          ) : null}
          {snapshot?.warnings?.length ? (
            <p role="status" style={{ color: "#92400E" }}>
              {snapshot.warnings.join(" ")}
            </p>
          ) : null}
          <p style={{ margin: "8px 0 0", fontSize: "13px" }}>
            Opening this report does not refresh NXT. Refresh report reads NXT
            but does not change constituent or gift records.
          </p>
          {report.error ? (
            <button
              type="button"
              onClick={report.reload}
              disabled={report.loading || report.refreshing}
              style={{ marginTop: "10px" }}
            >
              Reload saved report and refresh status
            </button>
          ) : null}
        </section>

        {snapshot ? (
          <>
            <section
              aria-label="Report totals"
              style={{
                display: "grid",
                gridTemplateColumns:
                  "repeat(auto-fit, minmax(min(100%, 220px), 1fr))",
                gap: "16px",
                marginTop: "24px",
              }}
            >
              <MetricCard
                label={`${yearLabel} Total Cash Received`}
                value={formatCurrency(totalReceived)}
                hint="Gift-solicitor-attributed hard-credit revenue, including DAF gifts"
              />
              <MetricCard
                label={`${closedYearLabel} Total Committed`}
                value={formatCurrency(totalCommitted)}
                hint="Closed gifts credited to this MGO in Raiser's Edge NXT, matching the My Prospects calculation."
              />
              <MetricCard
                label="Acknowledgment recipients"
                value={reportRows.length}
                hint="Individuals with direct or soft-credit recognition"
              />
            </section>

            <GiftReportActions
              key={`${workspaceUser?.id}:${snapshot.generatedAt}`}
              groups={acknowledgmentGiftGroups}
              ready={true}
              savedOpportunities={snapshot.opportunities || {}}
              enabled={Boolean(
                workspaceUser &&
                profileStatus?.user?.id === workspaceUser.id &&
                !profileStatus?.actingAsUser,
              )}
            >
              <section
                style={{
                  marginTop: "24px",
                  backgroundColor: "white",
                  border: "1px solid #E2E8F0",
                  borderRadius: "18px",
                  boxShadow: "0 10px 28px rgba(15, 23, 42, 0.05)",
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "20px 22px 14px" }}>
                  <h2 style={{ margin: 0, color: "#0F172A", fontSize: "20px" }}>
                    Acknowledgment detail
                  </h2>
                  <p
                    style={{
                      margin: "6px 0 0",
                      color: "#64748B",
                      lineHeight: 1.5,
                    }}
                  >
                    Grouped by gift, newest first. Each group starts with the
                    hard-credit donor and lists any related soft-credit
                    recipients beneath it. Donor Advised Fund entities appear as
                    gift context but are excluded from the
                    acknowledgment-recipient total.
                  </p>
                </div>
                {acknowledgmentGiftGroups.length ? (
                  <div style={{ overflowX: "auto" }}>
                    <table
                      style={{
                        width: "100%",
                        minWidth: "1180px",
                        borderCollapse: "collapse",
                      }}
                    >
                      <thead>
                        <tr
                          style={{
                            backgroundColor: "#F8FAFC",
                            textAlign: "left",
                          }}
                        >
                          {[
                            "Donor / recipient",
                            "Fund description",
                            "Relationship to gift",
                            "Gift type",
                            `${yearLabel} Cash Received`,
                            `${yearLabel} Committed`,
                            "Gift Date",
                            "Actions",
                          ].map((heading) => (
                            <th
                              key={heading}
                              scope="col"
                              style={{
                                color: "#475569",
                                fontSize: "11px",
                                fontWeight: 800,
                                letterSpacing: "0.05em",
                                padding: "13px 16px",
                                textTransform: "uppercase",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {heading}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      {acknowledgmentGiftGroups.map((group, groupIndex) => {
                        const hardCreditProfileUrl =
                          buildBlackbaudConstituentProfileUrl(
                            group.hardCreditDonor?.constituentId,
                          );
                        const groupBorder =
                          groupIndex === 0
                            ? "1px solid #E2E8F0"
                            : "8px solid #E2E8F0";
                        return (
                          <tbody key={group.key}>
                            <tr
                              style={{
                                backgroundColor: "#F8FAFC",
                                borderTop: groupBorder,
                              }}
                            >
                              <td style={{ padding: "16px", color: "#0F172A" }}>
                                <span
                                  style={{
                                    color: "#64748B",
                                    display: "block",
                                    fontSize: "10px",
                                    fontWeight: 800,
                                    letterSpacing: "0.06em",
                                    marginBottom: "5px",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Hard-credit donor
                                </span>
                                <strong>
                                  {group.hardCreditDonor?.name ||
                                    "Unnamed donor"}
                                </strong>
                              </td>
                              <td
                                style={{
                                  padding: "16px",
                                  color: "#334155",
                                  lineHeight: 1.45,
                                }}
                              >
                                {group.fundDescriptions?.join("; ") ||
                                  "Unavailable"}
                              </td>
                              <td style={{ padding: "16px" }}>
                                <span
                                  style={{
                                    backgroundColor: "#DBEAFE",
                                    borderRadius: "999px",
                                    color: "#1D4ED8",
                                    display: "inline-flex",
                                    fontSize: "12px",
                                    fontWeight: 800,
                                    padding: "5px 9px",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  Hard credit
                                </span>
                              </td>
                              <td
                                style={{
                                  padding: "16px",
                                  color: "#334155",
                                  lineHeight: 1.45,
                                }}
                              >
                                {group.giftType || "Unavailable"}
                              </td>
                              <td
                                style={{
                                  padding: "16px",
                                  color: "#047857",
                                  fontWeight: 800,
                                }}
                              >
                                {formatCurrency(group.receivedAmount)}
                              </td>
                              <td
                                style={{
                                  padding: "16px",
                                  color: "#1D4ED8",
                                  fontWeight: 800,
                                }}
                              >
                                {formatCurrency(group.committedAmount)}
                              </td>
                              <td
                                style={{
                                  padding: "16px",
                                  color: "#334155",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {group.date
                                  ? formatGiftDate(group.date)
                                  : "Unavailable"}
                              </td>
                              <td style={{ padding: "16px" }}>
                                {hardCreditProfileUrl ? (
                                  <a
                                    href={hardCreditProfileUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    style={{
                                      alignItems: "center",
                                      border: "1px solid #BFDBFE",
                                      borderRadius: "9px",
                                      color: "#1D4ED8",
                                      display: "inline-flex",
                                      fontSize: "13px",
                                      fontWeight: 800,
                                      gap: "6px",
                                      padding: "8px 10px",
                                      textDecoration: "none",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    Open NXT record <ExternalLink size={14} />
                                  </a>
                                ) : (
                                  "Unavailable"
                                )}
                                <GiftRowActions
                                  constituent={group.hardCreditDonor}
                                  group={group}
                                />
                              </td>
                            </tr>
                            {group.softCreditRecipients.map((recipient) => {
                              const recipientProfileUrl =
                                buildBlackbaudConstituentProfileUrl(
                                  recipient.constituentId,
                                );
                              return (
                                <tr
                                  key={`${group.key}:${recipient.constituentId}`}
                                  style={{ borderTop: "1px solid #E2E8F0" }}
                                >
                                  <td
                                    style={{
                                      padding: "14px 16px 14px 34px",
                                      color: "#0F172A",
                                    }}
                                  >
                                    <div
                                      style={{
                                        borderLeft: "3px solid #A7F3D0",
                                        paddingLeft: "12px",
                                      }}
                                    >
                                      <span
                                        style={{
                                          color: "#047857",
                                          display: "block",
                                          fontSize: "10px",
                                          fontWeight: 800,
                                          letterSpacing: "0.06em",
                                          marginBottom: "4px",
                                          textTransform: "uppercase",
                                        }}
                                      >
                                        Soft-credit recipient
                                      </span>
                                      <strong>{recipient.name}</strong>
                                    </div>
                                  </td>
                                  <td
                                    style={{
                                      padding: "14px 16px",
                                      color: "#334155",
                                      lineHeight: 1.45,
                                    }}
                                  >
                                    Same gift
                                  </td>
                                  <td style={{ padding: "14px 16px" }}>
                                    <span
                                      style={{
                                        backgroundColor: "#D1FAE5",
                                        borderRadius: "999px",
                                        color: "#047857",
                                        display: "inline-flex",
                                        fontSize: "12px",
                                        fontWeight: 800,
                                        padding: "5px 9px",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      Soft credit
                                    </span>
                                  </td>
                                  <td
                                    style={{
                                      padding: "14px 16px",
                                      color: "#64748B",
                                    }}
                                  >
                                    {group.giftType || "Unavailable"}
                                  </td>
                                  <td
                                    style={{
                                      padding: "14px 16px",
                                      color: "#047857",
                                      fontWeight: 800,
                                    }}
                                  >
                                    {formatCurrency(recipient.amount)}
                                  </td>
                                  <td
                                    style={{
                                      padding: "14px 16px",
                                      color: "#94A3B8",
                                    }}
                                  >
                                    -
                                  </td>
                                  <td
                                    style={{
                                      padding: "14px 16px",
                                      color: "#64748B",
                                    }}
                                  >
                                    Same gift
                                  </td>
                                  <td style={{ padding: "14px 16px" }}>
                                    {recipientProfileUrl ? (
                                      <a
                                        href={recipientProfileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        style={{
                                          alignItems: "center",
                                          border: "1px solid #BFDBFE",
                                          borderRadius: "9px",
                                          color: "#1D4ED8",
                                          display: "inline-flex",
                                          fontSize: "13px",
                                          fontWeight: 800,
                                          gap: "6px",
                                          padding: "8px 10px",
                                          textDecoration: "none",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        Open NXT record{" "}
                                        <ExternalLink size={14} />
                                      </a>
                                    ) : (
                                      "Unavailable"
                                    )}
                                    <GiftRowActions
                                      constituent={recipient}
                                      group={group}
                                    />
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        );
                      })}
                    </table>
                  </div>
                ) : (
                  <div
                    style={{
                      borderTop: "1px solid #E2E8F0",
                      color: "#64748B",
                      padding: "24px 22px",
                    }}
                  >
                    No acknowledgment recipients or recognized gift records were
                    found for this portfolio in {yearLabel}.
                  </div>
                )}
              </section>
            </GiftReportActions>
          </>
        ) : null}
      </div>
    </main>
  );
}
