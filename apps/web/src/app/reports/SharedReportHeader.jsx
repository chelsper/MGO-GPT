"use client";

import { ArrowLeft } from "lucide-react";
import { getReportHref } from "@/app/api/utils/reportRegistry";
import { useReportConfigurations } from "@/app/reports/useReportConfigurations";

function SharedReportHeaderContent({
  activeReportKey,
  eyebrow,
  title,
  description,
  action = null,
  backHref = "/reports",
  backLabel = "Back to reports",
  accessibleReports = [],
}) {
  return (
    <>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: "20px",
          flexWrap: "wrap",
          marginBottom: "24px",
        }}
      >
        <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
          <a
            href={backHref}
            aria-label={backLabel}
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              border: "1px solid #E2E8F0",
              display: "grid",
              placeItems: "center",
              backgroundColor: "white",
              color: "#334155",
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={20} />
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
          {accessibleReports.map((report) => {
            const selected = report.key === activeReportKey;
            return (
              <a
                key={report.key}
                href={getReportHref(report)}
                aria-current={selected ? "page" : undefined}
                style={{
                  minHeight: "40px",
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: "999px",
                  border: selected ? "1px solid #4F46E5" : "1px solid #C7D2FE",
                  backgroundColor: selected ? "#4F46E5" : "white",
                  color: selected ? "white" : "#4338CA",
                  padding: "0 15px",
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
    </>
  );
}

function SharedReportHeaderWithConfigurationLoader(props) {
  const { visibleReports } = useReportConfigurations();
  return <SharedReportHeaderContent {...props} accessibleReports={visibleReports} />;
}

export default function SharedReportHeader({ accessibleReports, ...props }) {
  if (Array.isArray(accessibleReports)) {
    return <SharedReportHeaderContent {...props} accessibleReports={accessibleReports} />;
  }

  return <SharedReportHeaderWithConfigurationLoader {...props} />;
}
