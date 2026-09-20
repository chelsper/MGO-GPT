import { useNavigate } from "react-router";
import { getReportHref } from "@/app/api/utils/reportRegistry";
import { visibleDashboards } from "@/utils/reportDashboards";
import styles from "@/app/reports/dashboards/dashboards.module.css";

export default function DashboardSwitcher({ reports, activeReportKey, disabled = false }) {
  const navigate = useNavigate();
  const dashboards = visibleDashboards(reports);
  if (!dashboards.length) return null;
  const selected = dashboards.some((report) => report.key === activeReportKey)
    ? activeReportKey : "";
  return (
    <div className={styles.switcher}>
      <label className={styles.field}>
        Dashboard
        <select
          value={selected}
          disabled={disabled}
          aria-describedby={disabled ? "dashboard-switch-hint" : undefined}
          onChange={(event) => {
            const report = dashboards.find((item) => item.key === event.target.value);
            if (report && report.key !== activeReportKey) navigate(getReportHref(report));
          }}
        >
          {!selected && <option value="" disabled>Choose a dashboard</option>}
          {dashboards.map((report) => <option key={report.key} value={report.key}>{report.title}</option>)}
        </select>
      </label>
      {disabled && <p id="dashboard-switch-hint">Finish or cancel arranging before switching dashboards.</p>}
    </div>
  );
}
