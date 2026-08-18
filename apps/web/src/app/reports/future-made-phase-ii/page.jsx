"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import useUser from "@/utils/useUser";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import SharedReportHeader from "@/app/reports/SharedReportHeader";

const QUERY_POLL_INTERVAL_MS = 1250;
const MAX_QUERY_POLL_ATTEMPTS = 36;

function formatValue(value) {
  const text = String(value ?? "").trim();
  return text || "-";
}

function getSearchText(row) {
  return [row?.name, ...Object.values(row?.values || {})]
    .join(" ")
    .toLocaleLowerCase("en-US");
}

function wait(delayMs) {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

export default function FutureMadePhaseTwoReportPage() {
  const { data: user, loading: loadingUser } = useUser();
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!loadingUser && !user) {
      window.location.href = "/account/signin";
    }
  }, [loadingUser, user]);

  useEffect(() => {
    if (!user) return undefined;

    let active = true;
    async function loadReport() {
      setIsLoading(true);
      setError("");
      setReport(null);

      try {
        let jobId = "";
        for (let attempt = 0; attempt < MAX_QUERY_POLL_ATTEMPTS; attempt += 1) {
          const searchParams = jobId
            ? `?${new URLSearchParams({ jobId }).toString()}`
            : "";
          const response = await fetch(
            `/api/reports/future-made-phase-ii${searchParams}`,
            { cache: "no-store" },
          );
          const payload = await response.json().catch(() => null);

          if (response.status === 202) {
            jobId = String(payload?.jobId || jobId).trim();
            if (!jobId) {
              throw new Error("NXT did not return a query job to monitor.");
            }
            await wait(QUERY_POLL_INTERVAL_MS);
            continue;
          }

          if (!response.ok) {
            throw new Error(payload?.error || "Could not run the Future. Made. Phase II report.");
          }

          if (payload?.status !== "complete") {
            throw new Error("NXT returned an unexpected query result.");
          }

          if (active) setReport(payload);
          return;
        }

        throw new Error(
          "NXT is taking longer than expected to run this query. Please try again in a moment.",
        );
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not run the Future. Made. Phase II report.",
          );
        }
      } finally {
        if (active) setIsLoading(false);
      }
    }

    loadReport();
    return () => {
      active = false;
    };
  }, [refreshVersion, user]);

  const normalizedSearch = search.trim().toLocaleLowerCase("en-US");
  const visibleRows = (report?.rows || []).filter(
    (row) => !normalizedSearch || getSearchText(row).includes(normalizedSearch),
  );

  if (loadingUser || !user) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
        Loading report...
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", padding: "32px 24px" }}>
      <div style={{ width: "min(1440px, 100%)", margin: "0 auto" }}>
        <SharedReportHeader
          activeReportKey="future-made-phase-ii"
          eyebrow="Saved NXT query"
          title="Future. Made. Phase II"
          description="Every constituent returned by this NXT query. Results are not limited to any MGO portfolio or executive workspace."
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
                border: "1px solid #C4B5FD",
                backgroundColor: "white",
                color: "#5B21B6",
                padding: "0 14px",
                fontWeight: 800,
                cursor: isLoading ? "wait" : "pointer",
              }}
            >
              <RefreshCw size={17} />
              Run query again
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

        {isLoading ? (
          <section
            style={{
              border: "1px solid #DDD6FE",
              borderRadius: "18px",
              padding: "28px",
              backgroundColor: "#FAF5FF",
              color: "#5B21B6",
            }}
          >
            <strong>Running the saved NXT query...</strong>
            <p style={{ margin: "8px 0 0", color: "#6B7280" }}>
              The complete query result will load here when NXT finishes preparing it.
            </p>
          </section>
        ) : null}

        {report ? (
          <section
            style={{
              border: "1px solid #E2E8F0",
              borderRadius: "18px",
              backgroundColor: "white",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                padding: "22px 24px",
                borderBottom: "1px solid #E2E8F0",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "16px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2 style={{ margin: 0, color: "#0F172A", fontSize: "22px" }}>Query results</h2>
                <p style={{ margin: "5px 0 0", color: "#64748B" }}>
                  {report.totalRows.toLocaleString("en-US")} records returned by NXT
                  {normalizedSearch ? `, ${visibleRows.length.toLocaleString("en-US")} shown` : ""}.
                </p>
              </div>
              <label
                style={{
                  minWidth: "min(360px, 100%)",
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  border: "1px solid #CBD5E1",
                  borderRadius: "10px",
                  padding: "0 12px",
                  minHeight: "42px",
                  color: "#64748B",
                }}
              >
                <Search size={18} />
                <input
                  name="future-made-phase-ii-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search these results"
                  style={{ border: 0, outline: 0, width: "100%", fontSize: "15px" }}
                />
              </label>
            </div>

            {report.truncated ? (
              <p
                style={{
                  margin: 0,
                  padding: "14px 24px",
                  color: "#92400E",
                  backgroundColor: "#FFFBEB",
                  borderBottom: "1px solid #FDE68A",
                  fontWeight: 700,
                }}
              >
                The query returned more than 10,000 records. Only the first 10,000 are displayed.
              </p>
            ) : null}

            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: "780px" }}>
                <thead>
                  <tr style={{ backgroundColor: "#F8FAFC" }}>
                    {report.columns.map((column) => (
                      <th
                        key={column}
                        scope="col"
                        style={{
                          padding: "14px 18px",
                          textAlign: "left",
                          color: "#475569",
                          fontSize: "12px",
                          letterSpacing: "0.05em",
                          textTransform: "uppercase",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {column}
                      </th>
                    ))}
                    <th
                      scope="col"
                      style={{
                        padding: "14px 18px",
                        textAlign: "right",
                        color: "#475569",
                        fontSize: "12px",
                        letterSpacing: "0.05em",
                        textTransform: "uppercase",
                      }}
                    >
                      Record
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.map((row) => {
                    const profileUrl = buildBlackbaudConstituentProfileUrl(row.constituentId);
                    return (
                      <tr key={row.id} style={{ borderTop: "1px solid #E2E8F0" }}>
                        {report.columns.map((column) => (
                          <td
                            key={column}
                            style={{ padding: "16px 18px", color: "#1E293B", verticalAlign: "top" }}
                          >
                            {formatValue(row.values?.[column])}
                          </td>
                        ))}
                        <td style={{ padding: "12px 18px", textAlign: "right", whiteSpace: "nowrap" }}>
                          {profileUrl ? (
                            <a
                              href={profileUrl}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "7px",
                                minHeight: "38px",
                                padding: "0 11px",
                                border: "1px solid #93C5FD",
                                borderRadius: "9px",
                                color: "#1D4ED8",
                                fontWeight: 800,
                              }}
                            >
                              Open NXT record
                              <ExternalLink size={15} />
                            </a>
                          ) : (
                            <span style={{ color: "#94A3B8" }}>No constituent ID</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!visibleRows.length ? (
              <p style={{ margin: 0, padding: "24px", color: "#64748B" }}>
                No saved-query rows match that search.
              </p>
            ) : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}
