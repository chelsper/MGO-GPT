"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { LayoutDashboard, RefreshCw, Save, X } from "lucide-react";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import ReportDashboardPanels, {
  reorderDashboardPanels,
  setDashboardPanelWidth,
} from "@/components/ReportDashboardPanels";
import styles from "@/components/reportDashboard.module.css";

async function requestDashboard(path, options) {
  const response = await fetch(path, { cache: "no-store", ...options });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = response.status === 401
      ? "Sign in to view this dashboard."
      : response.status === 403 || response.status === 404
        ? "This dashboard is unavailable or you do not have access."
        : "Could not load this dashboard. Please try again.";
    throw new Error(message);
  }
  if (!payload?.configuration?.dataConfiguration || !payload?.snapshot) {
    throw new Error("The dashboard response was incomplete. Please try again.");
  }
  return payload;
}

function snapshotTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime())
    ? date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })
    : null;
}

export default function ReportDashboardPage() {
  const { reportKey } = useParams();
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [arranging, setArranging] = useState(false);
  const [layoutDraft, setLayoutDraft] = useState(null);
  const [savingLayout, setSavingLayout] = useState(false);
  const [layoutMessage, setLayoutMessage] = useState("");
  const [layoutError, setLayoutError] = useState("");
  const refreshRequest = useRef(null);
  const path = `/api/reports/dashboards/${encodeURIComponent(reportKey || "")}`;

  useEffect(() => {
    const controller = new AbortController();
    setReport(null);
    setError("");
    setLoading(true);
    setRefreshing(false);
    setArranging(false);
    setLayoutDraft(null);
    setSavingLayout(false);
    setLayoutMessage("");
    setLayoutError("");
    if (!reportKey) {
      setError("No dashboard was selected.");
      setLoading(false);
      return undefined;
    }
    // A normal visit reads the cached snapshot only, never refreshes or polls NXT.
    requestDashboard(path, { signal: controller.signal })
      .then((payload) => { if (!controller.signal.aborted) setReport(payload); })
      .catch((loadError) => { if (!controller.signal.aborted) setError(loadError.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => {
      controller.abort();
      refreshRequest.current?.abort();
      refreshRequest.current = null;
    };
  }, [path, reportKey]);

  async function refresh() {
    if (!report || loading || arranging || refreshRequest.current) return;
    const controller = new AbortController();
    refreshRequest.current = controller;
    setRefreshing(true);
    setError("");
    try {
      const payload = await requestDashboard(path, { method: "POST", signal: controller.signal });
      if (!controller.signal.aborted) setReport(payload);
    } catch (refreshError) {
      if (!controller.signal.aborted) setError(`${refreshError.message} The previous snapshot is still shown.`);
    } finally {
      if (refreshRequest.current === controller) {
        refreshRequest.current = null;
        setRefreshing(false);
      }
    }
  }

  function startArranging() {
    if (!report?.configuration?.canArrange) return;
    setLayoutDraft(structuredClone(report.configuration.dataConfiguration));
    setLayoutMessage("");
    setLayoutError("");
    setArranging(true);
  }

  function cancelArranging() {
    setLayoutDraft(null);
    setLayoutError("");
    setArranging(false);
  }

  function movePanel(sourceKey, targetKey) {
    setLayoutDraft((current) => reorderDashboardPanels(current, sourceKey, targetKey));
  }

  function changePanelWidth(panelKey, width) {
    setLayoutDraft((current) => setDashboardPanelWidth(current, panelKey, width));
  }

  async function saveLayout() {
    if (!report?.configuration?.canArrange || !layoutDraft || savingLayout) return;
    setSavingLayout(true);
    setLayoutError("");
    setLayoutMessage("");
    try {
      const response = await fetch("/api/reports/configurations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportKey: report.configuration.key,
          dataConfiguration: layoutDraft,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.configuration?.dataConfiguration) {
        throw new Error(response.status === 403
          ? "Only administrators can arrange this dashboard."
          : "Could not save the dashboard layout. Please reload and try again.");
      }
      setReport((current) => ({ ...current, configuration: payload.configuration }));
      setLayoutDraft(null);
      setArranging(false);
      setLayoutMessage("Dashboard layout saved. Cached report data was not refreshed.");
    } catch (saveError) {
      setLayoutError(saveError.message);
    } finally {
      setSavingLayout(false);
    }
  }

  const configuration = report?.configuration;
  const snapshot = report?.snapshot;
  const generatedAt = snapshotTime(snapshot?.generatedAt);
  const needsRefresh = snapshot?.status === "refresh_required";
  const partial = snapshot?.status === "partial";
  const pending = (report?.refreshStatus || snapshot?.refreshStatus) === "pending";
  const remaining = report?.remainingQueryCount ?? snapshot?.remainingQueryCount;
  const hasFailedValues = snapshot?.values?.some((value) => value.error || value.status === "stale") || snapshot?.warnings?.length > 0;
  const displayedConfiguration = arranging && layoutDraft ? layoutDraft : configuration?.dataConfiguration;
  const layoutDirty = arranging && layoutDraft && configuration?.dataConfiguration
    ? JSON.stringify(layoutDraft) !== JSON.stringify(configuration.dataConfiguration)
    : false;

  return (
    <main className={styles.page}>
      <div className={styles.pageContent}>
        <SharedReportHeader
          activeReportKey={configuration?.key || reportKey}
          accessibleReports={[]}
          eyebrow="Configured dashboard"
          title={configuration?.title || "Report dashboard"}
          description={configuration?.description || "Saved query results, counts, and static values from the last dashboard snapshot."}
          action={
            <div className={styles.headerActions}>
              {configuration?.canArrange && !arranging ? (
                <button type="button" className={styles.button} onClick={startArranging} disabled={loading || refreshing || !report}>
                  <LayoutDashboard size={17} aria-hidden="true" />
                  Arrange dashboard
                </button>
              ) : null}
              <button type="button" className={styles.button} onClick={refresh} disabled={loading || refreshing || arranging || !report}>
                <RefreshCw size={17} aria-hidden="true" />
                {refreshing ? "Refreshing data..." : pending ? "Continue refresh" : "Refresh data"}
              </button>
            </div>
          }
        />
        {error ? <div className={styles.alert} role="alert">{error}</div> : null}
        {layoutError ? <div className={styles.alert} role="alert">{layoutError}</div> : null}
        {layoutMessage ? <div className={styles.successNotice} role="status">{layoutMessage}</div> : null}
        {loading ? <div className={styles.notice} role="status">Loading the cached dashboard...</div> : null}
        {refreshing ? <div className={styles.notice} role="status">Refreshing saved query data. The previous snapshot remains visible; frozen values and tables are preserved.</div> : null}
        {pending ? <div className={styles.notice} role="status">Refresh paused between batches{Number.isInteger(remaining) ? `: ${remaining} queries remaining` : ""}. Choose Continue refresh to run the next batch. No queries run automatically.</div> : null}
        {needsRefresh && !pending ? <div className={styles.notice}>This dashboard has not been fully refreshed. Unknown values are shown as Not refreshed, not zero. Choose Refresh data to run its saved queries.</div> : null}
        {partial && (!pending || hasFailedValues) ? <div className={styles.warning} role="status">Some values could not be refreshed. Last successful values are retained where available; missing values are marked Not refreshed.</div> : null}
        {report ? (
          <>
            <p className={styles.snapshotStatus}>{generatedAt ? `Snapshot as of ${generatedAt}. ` : "No completed refresh yet. "}Opening this page does not run saved queries.</p>
            {arranging ? (
              <div className={styles.arrangeToolbar} role="region" aria-label="Arrange dashboard controls">
                <p>Drag panels into order or use the arrow controls. Choose half width for side-by-side panels or full width to stack a panel. These changes do not refresh report data.</p>
                <div className={styles.arrangeActions}>
                  <button type="button" className={styles.button} onClick={cancelArranging} disabled={savingLayout}>
                    <X size={16} aria-hidden="true" />
                    Cancel
                  </button>
                  <button type="button" className={styles.primary} onClick={saveLayout} disabled={!layoutDirty || savingLayout}>
                    <Save size={16} aria-hidden="true" />
                    {savingLayout ? "Saving..." : "Save layout"}
                  </button>
                </div>
              </div>
            ) : null}
            <ReportDashboardPanels
              configuration={displayedConfiguration}
              snapshot={snapshot}
              arrangeMode={arranging}
              onMovePanel={movePanel}
              onWidthChange={changePanelWidth}
            />
          </>
        ) : null}
      </div>
    </main>
  );
}
