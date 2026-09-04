"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Columns2,
  GripVertical,
  LayoutDashboard,
  RefreshCw,
  Rows3,
  Save,
  X,
} from "lucide-react";
import useUser from "@/utils/useUser";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import ReportDashboardPanels, {
  reorderDashboardPanels,
  setDashboardPanelWidth,
} from "@/components/ReportDashboardPanels";
import dashboardStyles from "@/components/reportDashboard.module.css";

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
  const [arranging, setArranging] = useState(false);
  const [layoutDraft, setLayoutDraft] = useState(null);
  const [draggedPanelKey, setDraggedPanelKey] = useState("");
  const [savingLayout, setSavingLayout] = useState(false);
  const [layoutMessage, setLayoutMessage] = useState("");
  const [layoutError, setLayoutError] = useState("");

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

  function startArranging() {
    if (!report?.report?.canArrange || !report?.dashboardConfiguration) return;
    setLayoutDraft(structuredClone(report.dashboardConfiguration));
    setLayoutMessage("");
    setLayoutError("");
    setArranging(true);
  }

  function cancelArranging() {
    setLayoutDraft(null);
    setDraggedPanelKey("");
    setLayoutError("");
    setArranging(false);
  }

  function movePanel(sourceKey, target) {
    setLayoutDraft((current) => {
      if (typeof target === "number") {
        const panels = Array.isArray(current?.panels) ? current.panels : [];
        const sourceIndex = panels.findIndex((panel) => panel.key === sourceKey);
        const targetPanel = panels[sourceIndex + target];
        return targetPanel
          ? reorderDashboardPanels(current, sourceKey, targetPanel.key)
          : current;
      }
      return reorderDashboardPanels(current, sourceKey, target);
    });
  }

  function changePanelWidth(panelKey, width) {
    setLayoutDraft((current) => setDashboardPanelWidth(current, panelKey, width));
  }

  async function saveLayout() {
    if (!report?.report?.canArrange || !layoutDraft || savingLayout) return;
    setSavingLayout(true);
    setLayoutError("");
    setLayoutMessage("");
    try {
      const response = await fetch("/api/reports/configurations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportKey: "alumni-family-engagement",
          dataConfiguration: layoutDraft,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.configuration?.dataConfiguration) {
        throw new Error(response.status === 403
          ? "Only administrators can arrange this dashboard."
          : "Could not save the dashboard layout. Please reload and try again.");
      }
      const savedConfiguration = payload.configuration.dataConfiguration;
      const widths = new Map(savedConfiguration.panels.map((panel) => [panel.key, panel.width]));
      setReport((current) => ({
        ...current,
        dashboardConfiguration: savedConfiguration,
        dashboard: {
          ...current.dashboard,
          panels: (current.dashboard?.panels || []).map((panel) => ({
            ...panel,
            width: widths.get(panel.key) || panel.width,
          })),
        },
        genericConfiguration: {
          version: 1,
          panels: savedConfiguration.panels.filter((panel) => panel.layout),
        },
      }));
      setLayoutDraft(null);
      setDraggedPanelKey("");
      setArranging(false);
      setLayoutMessage("Dashboard layout saved. Cached report data was not refreshed.");
    } catch (saveError) {
      setLayoutError(saveError.message);
    } finally {
      setSavingLayout(false);
    }
  }

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
  const savedLayout = report?.dashboardConfiguration || {
    dashboardVersion: 2,
    panels: [...dashboardPanels, ...genericPanels],
  };
  const displayedLayout = arranging && layoutDraft ? layoutDraft : savedLayout;
  const donorPanelsByKey = new Map(dashboardPanels.map((panel) => [panel.key, panel]));
  const genericPanelsByKey = new Map(genericPanels.map((panel) => [panel.key, panel]));
  const orderedPanels = (displayedLayout?.panels || []).flatMap((panel) => {
    if (panel.type === "alumni_donor_count") {
      const savedPanel = donorPanelsByKey.get(panel.key);
      return savedPanel ? [{ kind: "donor", panel: { ...savedPanel, ...panel, totals: savedPanel.totals } }] : [];
    }
    const savedPanel = genericPanelsByKey.get(panel.key);
    return savedPanel ? [{ kind: "generic", panel: { ...savedPanel, ...panel } }] : [];
  });
  const layoutDirty = arranging && layoutDraft
    ? JSON.stringify(layoutDraft) !== JSON.stringify(savedLayout)
    : false;

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", padding: "28px 18px 48px" }}>
      <div style={{ maxWidth: "1480px", margin: "0 auto" }}>
        <SharedReportHeader
          activeReportKey="alumni-family-engagement"
          eyebrow="Shared engagement report"
          title={reportTitle}
          description={reportDescription}
          action={
            <div className={dashboardStyles.headerActions}>
              {report?.report?.canArrange && !arranging ? (
                <button type="button" className={dashboardStyles.button} onClick={startArranging} disabled={isLoading || !report?.dashboardConfiguration}>
                  <LayoutDashboard size={17} aria-hidden="true" />
                  Arrange dashboard
                </button>
              ) : null}
              <button
                type="button"
                className={dashboardStyles.button}
                onClick={() => setRefreshVersion((version) => version + 1)}
                disabled={isLoading || arranging}
              >
                <RefreshCw size={17} aria-hidden="true" />
                Refresh data
              </button>
            </div>
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

        {layoutError ? <div className={dashboardStyles.alert} role="alert">{layoutError}</div> : null}
        {layoutMessage ? <div className={dashboardStyles.successNotice} role="status">{layoutMessage}</div> : null}

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
            {arranging ? (
              <div className={dashboardStyles.arrangeToolbar} role="region" aria-label="Arrange dashboard controls">
                <p>Drag panels into order or use the arrow controls. Choose half width for side-by-side panels or full width to stack a panel. These changes do not refresh report data.</p>
                <div className={dashboardStyles.arrangeActions}>
                  <button type="button" className={dashboardStyles.button} onClick={cancelArranging} disabled={savingLayout}>
                    <X size={16} aria-hidden="true" />
                    Cancel
                  </button>
                  <button type="button" className={dashboardStyles.primary} onClick={saveLayout} disabled={!layoutDirty || savingLayout}>
                    <Save size={16} aria-hidden="true" />
                    {savingLayout ? "Saving..." : "Save layout"}
                  </button>
                </div>
              </div>
            ) : null}
            <section className={dashboardStyles.dashboard}>
              {orderedPanels.map(({ kind, panel }, index) => {
                const title = panel.title || "Untitled panel";
                const panelTotals = Array.isArray(panel?.totals) ? panel.totals : [];
                return (
                  <div
                    key={panel.key}
                    className={`${dashboardStyles.panelSlot} ${panel.width === "full" ? dashboardStyles.full : dashboardStyles.half}`}
                    onDragOver={arranging ? (event) => event.preventDefault() : undefined}
                    onDrop={arranging ? (event) => {
                      event.preventDefault();
                      if (draggedPanelKey && draggedPanelKey !== panel.key) movePanel(draggedPanelKey, panel.key);
                      setDraggedPanelKey("");
                    } : undefined}
                  >
                    {arranging ? (
                      <div className={dashboardStyles.panelArrangeBar}>
                        <button
                          type="button"
                          className={`${dashboardStyles.iconButton} ${dashboardStyles.dragHandle}`}
                          draggable
                          onDragStart={(event) => {
                            if (event.dataTransfer) {
                              event.dataTransfer.effectAllowed = "move";
                              event.dataTransfer.setData("text/plain", panel.key);
                            }
                            setDraggedPanelKey(panel.key);
                          }}
                          onDragEnd={() => setDraggedPanelKey("")}
                          aria-label={`Drag ${title} to reorder`}
                          title="Drag to reorder"
                        >
                          <GripVertical size={18} aria-hidden="true" />
                        </button>
                        <strong>{title}</strong>
                        <div className={dashboardStyles.panelActions}>
                          <button type="button" className={dashboardStyles.iconButton} onClick={() => movePanel(panel.key, -1)} disabled={index === 0} aria-label={`Move ${title} earlier`} title="Move earlier"><ArrowUp size={17} aria-hidden="true" /></button>
                          <button type="button" className={dashboardStyles.iconButton} onClick={() => movePanel(panel.key, 1)} disabled={index === orderedPanels.length - 1} aria-label={`Move ${title} later`} title="Move later"><ArrowDown size={17} aria-hidden="true" /></button>
                          <button type="button" className={dashboardStyles.widthButton} onClick={() => changePanelWidth(panel.key, panel.width === "full" ? "half" : "full")} aria-label={`${panel.width === "full" ? "Use half width for" : "Use full width for"} ${title}`}>
                            {panel.width === "full" ? <Columns2 size={17} aria-hidden="true" /> : <Rows3 size={17} aria-hidden="true" />}
                            {panel.width === "full" ? "Half width" : "Full width"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                    {kind === "generic" ? (
                      <ReportDashboardPanels
                        configuration={{ version: 1, panels: [{ ...panel, width: "full" }] }}
                        snapshot={report.genericSnapshot}
                      />
                    ) : (
                      <section className={dashboardStyles.specialPanel} aria-label={title}>
                        <h2 style={{ margin: 0, color: "#1E3A8A", fontSize: "21px" }}>{title}</h2>
                        <p style={{ margin: "7px 0 0", color: "#475569", lineHeight: 1.5 }}>
                          Each total is the count returned by its configured saved NXT query.
                        </p>
                        {panelTotals.length ? (
                          <div style={{ display: "grid", gap: "10px", gridTemplateColumns: "minmax(0, 1fr)", marginTop: "16px" }}>
                            {panelTotals.map((total) => (
                              <DonorTotal key={`${panel.key}:${total.key}`} label={total.label} value={total.total} refreshPolicy={total.refreshPolicy} frozenAt={total.frozenAt} />
                            ))}
                          </div>
                        ) : (
                          <p style={{ margin: "16px 0 0", color: "#64748B", fontWeight: 700 }}>
                            No count rows are configured in this panel.
                          </p>
                        )}
                      </section>
                    )}
                  </div>
                );
              })}

              {!orderedPanels.length ? (
                <section
                  style={{
                    gridColumn: "1 / -1",
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
          </>
        ) : null}
      </div>
    </main>
  );
}
