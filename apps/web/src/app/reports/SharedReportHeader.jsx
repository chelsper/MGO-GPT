"use client";

import { ArrowLeft } from "lucide-react";
import { getReportHref } from "@/app/api/utils/reportRegistry";
import { useReportConfigurations } from "@/app/reports/useReportConfigurations";
import { isConstituentList, reportNavigation } from "@/utils/constituentLists";
import { DASHBOARDS_KEY, DASHBOARDS_HREF, isReportDashboard } from "@/utils/reportDashboards";
import DashboardSwitcher from "@/components/DashboardSwitcher";
import styles from "./SharedReportHeader.module.css";

function ReportDestinations({ compact, children }) {
  return compact ? <details className={styles.destinations}>
    <summary>Reports &amp; dashboards</summary>
    <div>{children}</div>
  </details> : <>{children}</>;
}

function SharedReportHeaderContent({
  activeReportKey,
  eyebrow,
  title,
  description,
  action = null,
  backHref,
  backLabel,
  accessibleReports = [],
  reportSection,
  dashboardSwitchDisabled = false,
  compact = false,
}) {
  const dashboardDetail = reportSection === DASHBOARDS_KEY || (activeReportKey !== DASHBOARDS_KEY &&
    isReportDashboard(accessibleReports.find((report) => report.key === activeReportKey) || { key: activeReportKey })
  );
  const returnHref = backHref || (dashboardDetail ? DASHBOARDS_HREF : "/reports");
  const returnLabel = backLabel || (dashboardDetail ? "Back to My Dashboards" : "Back to reports");
  return (
    <>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "20px",
          flexWrap: "wrap",
          marginBottom: compact ? "12px" : "24px",
        }}
      >
        <div style={{ minWidth: 0, flex: "1 1 320px", overflowWrap: "anywhere" }}>
          <a
            href={returnHref}
            aria-label={returnLabel}
            style={{
              minHeight: "44px",
              borderRadius: "12px",
              border: compact ? "none" : "1px solid #E2E8F0",
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: compact ? "8px 0" : "8px 12px",
              marginBottom: compact ? "4px" : "12px",
              fontSize: "14px",
              fontWeight: 700,
              textDecoration: "none",
              backgroundColor: compact ? "transparent" : "white",
              color: "#334155",
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={18} aria-hidden="true" />{returnLabel}
          </a>
          <div>
            {eyebrow ? (
              <p
                style={{
                  margin: "2px 0 6px",
                  color: "#6D28D9",
                  fontSize: "13px",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {eyebrow}
              </p>
            ) : null}
            <h1 style={{ margin: 0, color: "#0F172A", fontSize: "32px" }}>{title}</h1>
            {description ? (
              <p style={{ margin: "8px 0 0", color: "#64748B", lineHeight: 1.5, maxWidth: "860px" }}>
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {action}
      </header>

      <ReportDestinations compact={compact}>
      {accessibleReports.length ? (
        <nav
          aria-label="Reports"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flexWrap: "wrap",
            marginBottom: "28px",
            paddingBottom: "14px",
            borderBottom: "1px solid #E2E8F0",
          }}
        >
          {reportNavigation(accessibleReports).map((report) => {
            const selected = report.key === activeReportKey ||
              (report.key === DASHBOARDS_KEY && dashboardDetail) ||
              (report.key === "lists" && (activeReportKey?.startsWith("list-") || isConstituentList({ key: activeReportKey })));
            return (
              <a
                key={report.key}
                href={getReportHref(report)}
                aria-current={selected ? "page" : undefined}
                style={{
                  minHeight: "44px",
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: "999px",
                  border: selected ? "1px solid #4F46E5" : "1px solid #C7D2FE",
                  backgroundColor: selected ? "#4F46E5" : "white",
                  color: selected ? "white" : "#4338CA",
                  padding: "8px 15px",
                  maxWidth: "100%",
                  minWidth: 0,
                  overflowWrap: "anywhere",
                  fontSize: "14px",
                  fontWeight: 800,
                  textDecoration: "none",
                }}
              >
                {report.title}
              </a>
            );
          })}
        </nav>
      ) : null}
      {dashboardDetail && (
        <DashboardSwitcher reports={accessibleReports} activeReportKey={activeReportKey} disabled={dashboardSwitchDisabled} />
      )}
      </ReportDestinations>
    </>
  );
}

function SharedReportHeaderWithConfigurationLoader(props) {
  const { visibleReports, error } = useReportConfigurations();
  return <SharedReportHeaderContent {...props} accessibleReports={error ? [] : visibleReports} />;
}

export default function SharedReportHeader({ accessibleReports, ...props }) {
  if (Array.isArray(accessibleReports)) {
    return <SharedReportHeaderContent {...props} accessibleReports={accessibleReports} />;
  }

  return <SharedReportHeaderWithConfigurationLoader {...props} />;
}
