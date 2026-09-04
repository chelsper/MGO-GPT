"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "react-router";
import { RefreshCw } from "lucide-react";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import ReportDashboardPanels from "@/components/ReportDashboardPanels";
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
  const refreshRequest = useRef(null);
  const path = `/api/reports/dashboards/${encodeURIComponent(reportKey || "")}`;

  useEffect(() => {
    const controller = new AbortController();
    setReport(null);
    setError("");
    setLoading(true);
    setRefreshing(false);
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
    if (!report || loading || refreshRequest.current) return;
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

  const configuration = report?.configuration;
  const snapshot = report?.snapshot;
  const generatedAt = snapshotTime(snapshot?.generatedAt);
  const needsRefresh = snapshot?.status === "refresh_required";
  const partial = snapshot?.status === "partial";
  const pending = (report?.refreshStatus || snapshot?.refreshStatus) === "pending";
  const remaining = report?.remainingQueryCount ?? snapshot?.remainingQueryCount;
  const hasFailedValues = snapshot?.values?.some((value) => value.error || value.status === "stale") || snapshot?.warnings?.length > 0;

  return (
    <main className={styles.page}>
      <div className={styles.pageContent}>
        <SharedReportHeader
          activeReportKey={configuration?.key || reportKey}
          accessibleReports={[]}
          eyebrow="Configured dashboard"
          title={configuration?.title || "Report dashboard"}
          description={configuration?.description || "Saved query counts and static values from the last dashboard snapshot."}
          action={
            <button type="button" className={styles.button} onClick={refresh} disabled={loading || refreshing || !report}>
              <RefreshCw size={17} aria-hidden="true" />
              {refreshing ? "Refreshing data..." : pending ? "Continue refresh" : "Refresh data"}
            </button>
          }
        />
        {error ? <div className={styles.alert} role="alert">{error}</div> : null}
        {loading ? <div className={styles.notice} role="status">Loading the cached dashboard...</div> : null}
        {refreshing ? <div className={styles.notice} role="status">Refreshing saved query counts. The previous snapshot remains visible; frozen values are preserved.</div> : null}
        {pending ? <div className={styles.notice} role="status">Refresh paused between batches{Number.isInteger(remaining) ? `: ${remaining} queries remaining` : ""}. Choose Continue refresh to run the next batch. No queries run automatically.</div> : null}
        {needsRefresh && !pending ? <div className={styles.notice}>This dashboard has not been fully refreshed. Unknown values are shown as Not refreshed, not zero. Choose Refresh data to run its saved queries.</div> : null}
        {partial && (!pending || hasFailedValues) ? <div className={styles.warning} role="status">Some values could not be refreshed. Last successful values are retained where available; missing values are marked Not refreshed.</div> : null}
        {report ? (
          <>
            <p className={styles.snapshotStatus}>{generatedAt ? `Snapshot as of ${generatedAt}. ` : "No completed refresh yet. "}Opening this page does not run saved queries.</p>
            <ReportDashboardPanels configuration={configuration.dataConfiguration} snapshot={snapshot} />
          </>
        ) : null}
      </div>
    </main>
  );
}
