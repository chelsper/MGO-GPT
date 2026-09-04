"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import useUser from "@/utils/useUser";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import ReportDashboardPanels from "@/components/ReportDashboardPanels";

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function DonorTotal({ label, value, refreshPolicy, frozenAt }) {
  const isFrozen = refreshPolicy === "frozen";

  return (
    <article
      style={{
        border: "1px solid #BFDBFE",
        borderRadius: "12px",
        backgroundColor: "white",
        padding: "15px 16px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            color: "#1E3A8A",
            fontSize: "15px",
            fontWeight: 800,
          }}
        >
          {label}
        </p>
        {isFrozen ? (
          <p style={{ margin: "5px 0 0", color: "#64748B", fontSize: "12px", fontWeight: 700 }}>
            Frozen snapshot{frozenAt ? ` from ${new Date(frozenAt).toLocaleDateString("en-US")}` : ""}
          </p>
        ) : null}
      </div>
      <strong style={{ color: "#166534", fontSize: "32px", lineHeight: 1, flexShrink: 0 }}>
        {formatNumber(value)}
      </strong>
    </article>
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
      if (!response.ok) {
        throw new Error(payload?.error || "Could not load Alumni & Family Engagement.");
      }
      return payload;
    }

    async function loadReport() {
      setIsLoading(true);
      setError("");
      setStatusText(
        refreshVersion > 0
          ? "Refreshing configured dashboard panels..."
          : "Loading the saved report snapshot...",
      );
      try {
        const refreshSuffix = refreshVersion > 0 ? "?refresh=1" : "";
        const payload = await requestReport(`/api/reports/alumni-family-engagement${refreshSuffix}`);
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

  const isRefreshRequired = report?.status === "refresh_required";
  const totals = Array.isArray(report?.totals) ? report.totals : [];
  const dashboardPanels = Array.isArray(report?.dashboard?.panels)
    ? report.dashboard.panels
    : totals.length
      ? [
          {
            key: "alumni-donor-count-by-fiscal-year",
            type: "alumni_donor_count",
            title: "Alumni Donor Count by Fiscal Year",
            totals,
          },
        ]
      : [];
  const reportTitle = String(report?.report?.title || "Alumni & Family Engagement");
  const reportDescription = String(
    report?.report?.description || "Configured dashboard panels backed by saved NXT query snapshots.",
  );
  const genericPanels = Array.isArray(report?.genericConfiguration?.panels)
    ? report.genericConfiguration.panels
    : [];

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", padding: "28px 18px 48px" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto" }}>
        <SharedReportHeader
          activeReportKey="alumni-family-engagement"
          eyebrow="Shared engagement report"
          title={reportTitle}
          description={reportDescription}
          action={
            <button
              type="button"
              onClick={() => setRefreshVersion((version) => version + 1)}
              disabled={isLoading}
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
                cursor: isLoading ? "default" : "pointer",
                opacity: isLoading ? 0.65 : 1,
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

        {report?.refreshWarning ? (
          <section
            role="status"
            style={{
              marginBottom: "20px",
              border: "1px solid #FDE68A",
              borderRadius: "14px",
              padding: "18px",
              color: "#92400E",
              backgroundColor: "#FFFBEB",
              fontWeight: 700,
            }}
          >
            {report.refreshWarning}
          </section>
        ) : null}

        {report?.refreshNotice ? (
          <section
            role="status"
            style={{
              marginBottom: "20px",
              border: "1px solid #BFDBFE",
              borderRadius: "14px",
              padding: "18px",
              color: "#1E3A8A",
              backgroundColor: "#EFF6FF",
              fontWeight: 700,
            }}
          >
            {report.refreshNotice}
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
              Normal visits use the last successful snapshot and do not make another NXT request. A refresh runs
              only rows marked Refresh with report; frozen rows retain their compatible saved total.
            </p>
          </section>
        ) : null}

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
            <strong>No saved {reportTitle} snapshot is available.</strong>
            <p style={{ margin: "8px 0 0", lineHeight: 1.5 }}>
              Select Refresh data once. The configured dashboard panels will then remain available until the next
              scheduled refresh or another manual refresh. Rows marked Frozen snapshot remain available without
              another NXT request after their first successful total is saved.
            </p>
          </section>
        ) : null}

        {report?.generatedAt ? (
          <>
            {report.generatedAt ? (
              <p style={{ margin: "0 0 14px", color: "#64748B", fontSize: "14px" }}>
                Last refreshed: {new Date(report.generatedAt).toLocaleString("en-US")}
              </p>
            ) : null}
            <section
              style={{
                display: "grid",
                gap: "18px",
                // Leave an open half-width cell for the next panel on wide screens.
                gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 500px), 1fr))",
                alignItems: "start",
              }}
            >
              {dashboardPanels.map((panel) => {
                const panelTotals = Array.isArray(panel?.totals) ? panel.totals : [];

                return (
                  <section
                    key={panel.key}
                    style={{
                      border: "1px solid #BFDBFE",
                      borderRadius: "18px",
                      padding: "20px",
                      backgroundColor: "#EFF6FF",
                      minWidth: 0,
                    }}
                  >
                    <h2 style={{ margin: 0, color: "#1E3A8A", fontSize: "21px" }}>{panel.title}</h2>
                    <p style={{ margin: "7px 0 0", color: "#475569", lineHeight: 1.5 }}>
                      Each total is the count returned by its configured saved NXT query.
                    </p>

                    {panelTotals.length ? (
                      <div
                        style={{
                          display: "grid",
                          gap: "10px",
                          gridTemplateColumns: "minmax(0, 1fr)",
                          marginTop: "16px",
                        }}
                      >
                        {panelTotals.map((total) => (
                          <DonorTotal
                            key={`${panel.key}:${total.key}`}
                            label={total.label}
                            value={total.total}
                            refreshPolicy={total.refreshPolicy}
                            frozenAt={total.frozenAt}
                          />
                        ))}
                      </div>
                    ) : (
                      <p style={{ margin: "16px 0 0", color: "#64748B", fontWeight: 700 }}>
                        No count rows are configured in this panel.
                      </p>
                    )}
                  </section>
                );
              })}

              {!dashboardPanels.length && !genericPanels.length ? (
                <section
                  style={{
                    border: "1px solid #CBD5E1",
                    borderRadius: "16px",
                    padding: "20px",
                    color: "#475569",
                    backgroundColor: "white",
                  }}
                >
                  No dashboard panels have been configured yet.
                </section>
              ) : null}
            </section>
            {genericPanels.length ? (
              <div style={{ marginTop: dashboardPanels.length ? "18px" : 0 }}>
                <ReportDashboardPanels
                  configuration={report.genericConfiguration}
                  snapshot={report.genericSnapshot}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </main>
  );
}
