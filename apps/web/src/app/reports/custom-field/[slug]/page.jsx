"use client";

import { useEffect, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import useUser from "@/utils/useUser";
import SharedReportHeader from "@/app/reports/SharedReportHeader";

const POLL_INTERVAL_MS = 1250;
const MAX_POLL_ATTEMPTS = 48;

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function formatValue(value) {
  const text = String(value ?? "").trim();
  return text || "-";
}

function formatRefreshTime(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function getSlugFromLocation() {
  if (typeof window === "undefined") return "";
  const part = window.location.pathname.split("/").filter(Boolean).pop() || "";
  try {
    return decodeURIComponent(part);
  } catch {
    return part;
  }
}

export default function CustomFieldReportPage() {
  const { data: user, loading: loadingUser } = useUser();
  const [slug, setSlug] = useState("");
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [statusText, setStatusText] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [search, setSearch] = useState("");

  useEffect(() => {
    setSlug(getSlugFromLocation());
  }, []);

  useEffect(() => {
    if (!loadingUser && !user) {
      window.location.href = "/account/signin";
    }
  }, [loadingUser, user]);

  useEffect(() => {
    if (!user || !slug) return undefined;

    let active = true;
    const controller = new AbortController();

    async function requestReport(path) {
      const response = await fetch(path, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok && response.status !== 202) {
        throw new Error(payload?.error || "Could not load this Custom Field Report.");
      }
      return { response, payload };
    }

    async function loadReport() {
      setIsLoading(true);
      setError("");
      setStatusText(
        refreshVersion > 0
          ? "Starting the NXT custom-field report refresh..."
          : "Loading the last successful report snapshot...",
      );
      try {
        const refreshSuffix = refreshVersion > 0 ? "?refresh=1" : "";
        let { response, payload } = await requestReport(
          `/api/reports/custom-field/${encodeURIComponent(slug)}${refreshSuffix}`,
        );

        for (let attempt = 0; response.status === 202 && attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
          if (!active) return;
          setStatusText("Waiting for NXT to finish the custom-field report refresh...");
          const jobId = String(payload?.poll?.jobId || payload?.jobId || "").trim();
          if (!jobId) {
            throw new Error("NXT did not return a custom-field job to monitor.");
          }
          await wait(POLL_INTERVAL_MS);
          if (!active) return;
          ({ response, payload } = await requestReport(
            `/api/reports/custom-field/${encodeURIComponent(slug)}?jobId=${encodeURIComponent(jobId)}`,
          ));
        }

        if (response.status === 202) {
          throw new Error(
            "The NXT custom-field report is taking longer than expected. Please try refreshing this report again.",
          );
        }
        if (!active) return;
        setReport(payload);
        setStatusText("");
      } catch (loadError) {
        if (!active || loadError?.name === "AbortError") return;
        setError(
          loadError instanceof Error ? loadError.message : "Could not load this Custom Field Report.",
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
  }, [refreshVersion, slug, user]);

  if (loadingUser || !user || !slug) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#64748B" }}>
        Loading report...
      </main>
    );
  }

  const definition = report?.report || {};
  const title = String(definition.title || "Custom Field Report");
  const description = String(
    definition.description ||
      "Count of constituents with the configured exact Blackbaud custom-field category and description.",
  );
  const isCountOnly = report?.resultMode === "count_only";
  const columns = Array.isArray(report?.columns) ? report.columns : [];
  const rows = Array.isArray(report?.rows) ? report.rows : [];
  const normalizedSearch = search.trim().toLocaleLowerCase("en-US");
  const filteredRows = normalizedSearch
    ? rows.filter((row) =>
        Object.values(row?.values || {})
          .join(" ")
          .toLocaleLowerCase("en-US")
          .includes(normalizedSearch),
      )
    : rows;
  const refreshRequired = report?.status === "refresh_required";

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", padding: "28px 18px 48px" }}>
      <div style={{ maxWidth: "1400px", margin: "0 auto" }}>
        <SharedReportHeader
          activeReportKey={definition.key}
          eyebrow="Configured custom field report"
          title={title}
          description={description}
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
              borderRadius: "16px",
              padding: "18px",
              color: "#92400E",
              backgroundColor: "#FFFBEB",
            }}
          >
            <strong>Showing the last successful snapshot</strong>
            <p style={{ margin: "8px 0 0", lineHeight: 1.5 }}>{report.refreshWarning}</p>
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
              Normal visits use the last successful snapshot and do not make another NXT request.
            </p>
          </section>
        ) : null}

        {refreshRequired ? (
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
            <strong>No saved snapshot is available for this report.</strong>
            <p style={{ margin: "8px 0 0", lineHeight: 1.5 }}>
              Select Refresh data once. The returned report will then stay available as a snapshot until the next
              scheduled or manual refresh. Enabled reports are refreshed one at a time after 6 PM to protect the
              Blackbaud API quota.
            </p>
          </section>
        ) : null}

        {report?.status === "complete" ? (
          <>
            <section
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "end",
                gap: "16px",
                flexWrap: "wrap",
                marginBottom: "16px",
              }}
            >
              <div style={{ color: "#475569", lineHeight: 1.5 }}>
                <strong style={{ display: "block", color: "#0F172A", fontSize: "18px" }}>
                  {Number(report?.totalRows || 0).toLocaleString("en-US")} {isCountOnly ? "matching constituents" : "results"}
                </strong>
                <span>
                  Last refreshed {formatRefreshTime(report?.generatedAt)} · {definition.fieldCategory}: {definition.fieldDescription}
                </span>
              </div>
              {!isCountOnly ? (
                <label
                  style={{
                    minWidth: "260px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    border: "1px solid #CBD5E1",
                    borderRadius: "10px",
                    backgroundColor: "white",
                    padding: "0 12px",
                  }}
                >
                  <Search size={17} color="#64748B" />
                  <input
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search results"
                    style={{
                      minHeight: "42px",
                      width: "100%",
                      border: 0,
                      outline: 0,
                      color: "#0F172A",
                      font: "inherit",
                    }}
                  />
                </label>
              ) : null}
            </section>

            {isCountOnly ? (
              <section
                style={{
                  border: "1px solid #BFDBFE",
                  borderRadius: "16px",
                  padding: "20px",
                  backgroundColor: "#EFF6FF",
                  color: "#1E3A8A",
                }}
              >
                <strong>Count-only snapshot</strong>
                <p style={{ margin: "8px 0 0", color: "#475569", lineHeight: 1.5 }}>
                  The app retains only the matching constituent count. It does not download, store, or display the
                  individual NXT records for this report.
                </p>
              </section>
            ) : (
              <>
                <section
                  style={{
                    overflowX: "auto",
                    border: "1px solid #E2E8F0",
                    borderRadius: "16px",
                    backgroundColor: "white",
                  }}
                >
                  <table style={{ width: "100%", minWidth: "760px", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ backgroundColor: "#F8FAFC", textAlign: "left" }}>
                        {columns.map((column) => (
                          <th
                            key={column}
                            style={{
                              borderBottom: "1px solid #E2E8F0",
                              color: "#475569",
                              fontSize: "12px",
                              letterSpacing: "0.03em",
                              padding: "13px 16px",
                              textTransform: "uppercase",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {column}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredRows.map((row) => (
                        <tr key={row.id}>
                          {columns.map((column) => (
                            <td
                              key={column}
                              style={{
                                borderBottom: "1px solid #F1F5F9",
                                color: "#1E293B",
                                padding: "13px 16px",
                                verticalAlign: "top",
                                lineHeight: 1.45,
                              }}
                            >
                              {formatValue(row?.values?.[column])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!filteredRows.length ? (
                    <p style={{ margin: 0, padding: "22px", color: "#64748B" }}>
                      No report rows match this search.
                    </p>
                  ) : null}
                </section>
                {report?.truncated ? (
                  <p style={{ margin: "12px 0 0", color: "#B45309", fontWeight: 700 }}>
                    Showing the first {rows.length.toLocaleString("en-US")} of {Number(report.totalRows || 0).toLocaleString("en-US")} returned rows.
                  </p>
                ) : null}
              </>
            )}
          </>
        ) : null}
      </div>
    </main>
  );
}
