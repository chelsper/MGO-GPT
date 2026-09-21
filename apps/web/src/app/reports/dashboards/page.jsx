"use client";

import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { ArrowRight, LayoutDashboard, Search, Settings2 } from "lucide-react";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import { useReportConfigurations } from "@/app/reports/useReportConfigurations";
import { getReportHref } from "@/app/api/utils/reportRegistry";
import { visibleDashboards } from "@/utils/reportDashboards";
import { usePersonalDashboards } from "@/app/reports/usePersonalDashboards";
import { MAX_PERSONAL_DASHBOARDS, personalDashboardHref } from "@/utils/personalDashboards";
import styles from "./dashboards.module.css";

export default function MyDashboardsPage() {
  const { visibleReports, canManage, isPending, error, refetch } = useReportConfigurations();
  const [search, setSearch] = useState("");
  const personal = usePersonalDashboards();
  const navigate = useNavigate();
  const location = useLocation();
  const ownDashboards = personal.error || personal.isPending ? [] : personal.data?.dashboards || [];
  const browse = new URLSearchParams(location.search).get("browse") === "1";
  const defaultId = !personal.error && personal.data?.defaultDashboardId;
  useEffect(() => {
    if (!browse && !personal.isPending && defaultId && personal.data.dashboards.some((item) => item.id === defaultId))
      navigate(personalDashboardHref(defaultId), { replace: true });
  }, [browse, personal.isPending, defaultId, personal.data, navigate]);
  const dashboards = visibleDashboards(error || isPending ? [] : visibleReports);
  const term = search.trim().toLowerCase();
  const filtered = dashboards.filter((report) =>
    `${report.title} ${report.description || ""}`.toLowerCase().includes(term),
  );

  return (
    <main className={styles.page}>
      <div className={styles.content}>
        <SharedReportHeader
          activeReportKey="dashboards"
          title="My Dashboards"
          description="Your private dashboards and shared reports, together in one place."
          accessibleReports={error || isPending ? [] : visibleReports}
          action={canManage && !error && !isPending ? (
            <a className={styles.button} href="/report-configurations">
              <Settings2 size={17} aria-hidden="true" /> Manage dashboards
            </a>
          ) : null}
        />
        <section aria-label="Your private dashboards" style={{ marginBottom: 32 }}>
          <div className={styles.toolbar}><div><h2>Your dashboards <span className={styles.count}>{ownDashboards.length}</span></h2><p>Private layouts made from approved metrics.</p></div>
            {!personal.isPending && !personal.error && ownDashboards.length < MAX_PERSONAL_DASHBOARDS && <a className={styles.button} href="/reports/personal-dashboards/new">Create dashboard</a>}
          </div>
          {personal.isPending ? <p role="status">Loading personal dashboards...</p> : personal.error ? <div className={styles.empty} role="alert"><p>Your personal dashboards could not be loaded.</p><button className={styles.button} onClick={() => personal.refetch()}>Retry personal dashboards</button></div>
            : !ownDashboards.length ? <p className={styles.searchStatus}>Create your first dashboard by choosing metrics shared with you.</p>
            : <div className={styles.grid}>{ownDashboards.map((dashboard) => <a className={styles.card} key={dashboard.id} href={personalDashboardHref(dashboard.id)} aria-label={`Open personal dashboard ${dashboard.title}`}>
              <h3>{dashboard.title}</h3><p>{dashboard.metricIds.length} cards · Only you{personal.data.defaultDashboardId === dashboard.id ? " · Your default" : ""}</p><span className={styles.cardFooter}>Open dashboard <ArrowRight size={19} aria-hidden="true" /></span>
            </a>)}</div>}
        </section>
        {isPending && <p role="status">Loading your dashboards...</p>}
        {error && (
          <section className={styles.empty} role="alert">
            <h2>Dashboards could not be loaded</h2>
            <p>Try again. If this continues, contact your administrator.</p>
            <button className={styles.button} onClick={() => refetch()}>Try again</button>
          </section>
        )}
        {!isPending && !error && (
          <>
            {dashboards.length > 0 && (
              <div className={styles.toolbar}>
                <div>
                  <h2>Available to you <span className={styles.count}>{dashboards.length}</span></h2>
                  <p>Only dashboards shared with you appear here.</p>
                </div>
                {dashboards.length > 1 && (
                  <label className={styles.search}>
                    <span className={styles.srOnly}>Find a dashboard</span>
                    <Search size={18} aria-hidden="true" />
                    <input type="search" placeholder="Find a dashboard" value={search} onChange={(event) => setSearch(event.target.value)} />
                  </label>
                )}
              </div>
            )}
            {!dashboards.length ? (
              <section className={styles.empty}>
                <LayoutDashboard size={28} aria-hidden="true" />
                <h2>No dashboards available</h2>
                <p>{canManage
                  ? "Use Manage dashboards to configure a dashboard, select its viewers, and enable it. Include yourself to see it here."
                  : "Ask your administrator to share a dashboard with you."}</p>
              </section>
            ) : !filtered.length ? (
              <section className={styles.empty}>
                <h2>No matching dashboards</h2>
                <p>Try a different name or clear your search.</p>
                <button className={styles.button} onClick={() => setSearch("")}>Clear search</button>
              </section>
            ) : (
              <div className={styles.grid}>
                {filtered.map((report) => (
                  <a className={styles.card} key={report.key} href={getReportHref(report)} aria-label={`Open ${report.title}`}>
                    <span className={styles.cardIcon}><LayoutDashboard size={24} aria-hidden="true" /></span>
                    <h3>{report.title}</h3>
                    <p>{report.description || "Explore shared metrics and saved report results."}</p>
                    <span className={styles.cardFooter}>Open dashboard <ArrowRight size={19} aria-hidden="true" /></span>
                  </a>
                ))}
              </div>
            )}
            {term && filtered.length > 0 && <p className={styles.searchStatus} role="status">{filtered.length} of {dashboards.length} dashboards match your search.</p>}
          </>
        )}
      </div>
    </main>
  );
}
