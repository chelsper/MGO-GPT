import { Trophy } from "lucide-react";
import { scoreText } from "@/app/reports/executive-team-standings/standingsPresentation";

const messages = {
  missing_snapshot: "Waiting for the first Team Standings snapshot.",
  fiscal_year_mismatch: "Waiting for a Team Standings snapshot for this fiscal year.",
  workspace_not_ranked: "No Team Standings total is saved for this workspace yet.",
  missing_metric: "This total is unavailable in the saved Team Standings snapshot.",
};

function snapshotDate(value) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date)
    : null;
}

export default function ProspectRaisedCard({ summary, isLoading = false, isError = false }) {
  const snapshot = summary?.raisedSnapshot;
  const isYtd = snapshot?.periodMode !== "full_fiscal_year";
  const asOf = snapshotDate(snapshot?.asOf);
  const message = isError
    ? "Could not reload the saved total. Please try again."
    : messages[snapshot?.reason];

  return (
    <section aria-label="Fundraising total" style={{ backgroundColor: "white", borderRadius: "12px", border: "1px solid #E5E7EB", padding: "20px", flex: "1 1 180px", minWidth: "180px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px", color: "#6B7280", fontSize: "13px", fontWeight: 500 }}>
        <Trophy size={18} color="#F59E0B" aria-hidden="true" />
        <span>{summary?.currentFY || "Current FY"} Raised{isYtd ? " YTD" : ""}</span>
      </div>
      <p style={{ fontSize: "28px", fontWeight: 700, color: "#111827", margin: 0 }}>
        {isLoading && summary?.closedThisFY == null ? "Loading..." : scoreText(summary?.closedThisFY, "raised")}
      </p>
      {summary?.priorFY && isYtd ? (
        <div style={{ marginTop: "6px", fontSize: "13px", color: "#6B7280", fontWeight: 600 }}>
          {summary.priorFY} YTD: {isLoading && summary.closedPriorFY == null ? "Loading..." : scoreText(summary.closedPriorFY, "raised")}
        </div>
      ) : null}
      <p style={{ margin: "8px 0 0", fontSize: "12px", color: "#6B7280" }}>
        Team Standings snapshot{asOf ? ` through ${asOf}` : ""}.
      </p>
      {message ? <p role="status" style={{ margin: "6px 0 0", fontSize: "12px", color: "#92400E" }}>{message}</p> : null}
    </section>
  );
}
