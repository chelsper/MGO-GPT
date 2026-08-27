"use client";

import { useEffect, useState } from "react";
import { ExternalLink, RefreshCw, Search } from "lucide-react";
import useUser from "@/utils/useUser";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import { isAdminRole, isExecutiveRole } from "@/utils/workspaceRoles";

const QUERY_POLL_INTERVAL_MS = 1250;
const MAX_QUERY_POLL_ATTEMPTS = 36;

function formatValue(value) {
  const text = String(value ?? "").trim();
  return text || "-";
}

function formatRefreshTime(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getSearchText(row) {
  return [row?.name, ...Object.values(row?.values || {})]
    .join(" ")
    .toLocaleLowerCase("en-US");
}

function wait(delayMs) {
  return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

function getLookupResultKey(result, index) {
  return (
    result?.blackbaudConstituentId ||
    result?.blackbaudRecordId ||
    result?.lookupId ||
    `${result?.name || "constituent"}-${index}`
  );
}

export default function FutureMadePhaseTwoReportPage() {
  const { data: user, loading: loadingUser } = useUser();
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [search, setSearch] = useState("");
  const [viewerRole, setViewerRole] = useState("");
  const [lookupQuery, setLookupQuery] = useState("");
  const [lookupResults, setLookupResults] = useState([]);
  const [lookupError, setLookupError] = useState("");
  const [lookupWarning, setLookupWarning] = useState("");
  const [isSearchingLookup, setIsSearchingLookup] = useState(false);
  const [hasSearchedLookup, setHasSearchedLookup] = useState(false);
  const [membershipStates, setMembershipStates] = useState({});

  useEffect(() => {
    if (!loadingUser && !user) {
      window.location.href = "/account/signin";
    }
  }, [loadingUser, user]);

  useEffect(() => {
    if (!user) return undefined;

    const controller = new AbortController();
    async function loadRole() {
      try {
        const response = await fetch("/api/users/profile", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || controller.signal.aborted) return;
        setViewerRole(String(payload?.workspaceUser?.role || payload?.user?.role || ""));
      } catch {
        if (!controller.signal.aborted) {
          setViewerRole("");
        }
      }
    }

    loadRole();
    return () => controller.abort();
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;

    let active = true;
    async function loadReport() {
      setIsLoading(true);
      setError("");
      setReport(null);

      try {
        let jobId = "";
        const shouldForceRefresh = refreshVersion > 0;
        for (let attempt = 0; attempt < MAX_QUERY_POLL_ATTEMPTS; attempt += 1) {
          const params = new URLSearchParams();
          if (jobId) params.set("jobId", jobId);
          if (shouldForceRefresh) params.set("refresh", "1");
          const searchParams = params.toString() ? `?${params.toString()}` : "";
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

          if (payload?.status === "refresh_required") {
            if (active) setReport(payload);
            return;
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

  useEffect(() => {
    const normalizedQuery = lookupQuery.trim();
    if (normalizedQuery.length < 2) {
      setLookupResults([]);
      setIsSearchingLookup(false);
      setHasSearchedLookup(false);
      setLookupError("");
      setLookupWarning("");
      return undefined;
    }

    setLookupResults([]);
    setHasSearchedLookup(false);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsSearchingLookup(true);
      setLookupError("");
      setLookupWarning("");
      try {
        const response = await fetch(
          `/api/blackbaud/constituents/search?q=${encodeURIComponent(normalizedQuery)}`,
          { signal: controller.signal },
        );
        const payload = await response.json().catch(() => null);
        if (controller.signal.aborted) return;

        if (!response.ok) {
          setLookupResults([]);
          setLookupError(payload?.error || "Could not search Raiser's Edge NXT right now.");
          return;
        }

        setLookupResults(Array.isArray(payload?.results) ? payload.results : []);
        setLookupWarning(payload?.warning || "");
      } catch (searchError) {
        if (!controller.signal.aborted) {
          console.error("Future. Made. Phase II lookup error:", searchError);
          setLookupResults([]);
          setLookupError("Could not search Raiser's Edge NXT right now.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearchingLookup(false);
          setHasSearchedLookup(true);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [lookupQuery]);

  const normalizedSearch = search.trim().toLocaleLowerCase("en-US");
  const refreshRequired = report?.status === "refresh_required";
  const reportRows = Array.isArray(report?.rows) ? report.rows : [];
  const reportColumns = Array.isArray(report?.columns) ? report.columns : [];
  const parsedTotalRows = Number(report?.totalRows);
  const totalRows =
    report?.totalRows === undefined ||
    report?.totalRows === null ||
    report?.totalRows === "" ||
    !Number.isFinite(parsedTotalRows)
      ? reportRows.length
      : parsedTotalRows;
  const visibleRows = reportRows.filter(
    (row) => !normalizedSearch || getSearchText(row).includes(normalizedSearch),
  );
  const hasResultTable = !refreshRequired && reportColumns.length > 0;
  const canManageFutureMadePhaseTwo =
    isAdminRole(viewerRole) || isExecutiveRole(viewerRole);

  async function addToFutureMadePhaseTwo(result) {
    const constituentId = String(
      result?.blackbaudConstituentId || result?.blackbaudRecordId || "",
    ).trim();
    if (!constituentId) return;

    setMembershipStates((current) => ({
      ...current,
      [constituentId]: { status: "loading", message: "" },
    }));

    try {
      const response = await fetch("/api/reports/future-made-phase-ii/membership", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ constituentId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(
          payload?.error || "Could not add this constituent to Future. Made. Phase II.",
        );
      }

      const wasAlreadyPresent = payload?.status === "already_present";
      setMembershipStates((current) => ({
        ...current,
        [constituentId]: {
          status: "success",
          message: wasAlreadyPresent
            ? "Already on Future. Made. Phase II"
            : "Added to Future. Made. Phase II. Run the query again to refresh this table.",
        },
      }));
    } catch (addError) {
      setMembershipStates((current) => ({
        ...current,
        [constituentId]: {
          status: "error",
          message:
            addError instanceof Error
              ? addError.message
              : "Could not add this constituent to Future. Made. Phase II.",
        },
      }));
    }
  }

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

        {report?.generatedAt && !refreshRequired ? (
          <p style={{ color: "#64748B", fontSize: "13px", margin: "16px 0 0" }}>
            Last refreshed {formatRefreshTime(report.generatedAt)}. This shared snapshot remains unchanged until
            6 PM Eastern or a manual refresh.
          </p>
        ) : null}

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

        {refreshRequired ? (
          <section
            style={{
              marginBottom: "20px",
              border: "1px solid #DDD6FE",
              borderRadius: "18px",
              padding: "22px",
              backgroundColor: "#FAF5FF",
              color: "#5B21B6",
            }}
          >
            <strong>No saved Future. Made. Phase II snapshot is available.</strong>
            <p style={{ margin: "8px 0 0", lineHeight: 1.5 }}>
              Select Run query again once. The resulting table will remain available until the next 6 PM Eastern
              refresh or another manual refresh.
            </p>
          </section>
        ) : null}

        {report && !refreshRequired && !hasResultTable ? (
          <section
            role="status"
            style={{
              marginBottom: "20px",
              border: "1px solid #FDE68A",
              borderRadius: "18px",
              padding: "22px",
              backgroundColor: "#FFFBEB",
              color: "#92400E",
            }}
          >
            <strong>The saved report snapshot is incomplete.</strong>
            <p style={{ margin: "8px 0 0", lineHeight: 1.5 }}>
              Select Run query again to rebuild the report. No list membership or NXT data has been changed.
            </p>
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

        {canManageFutureMadePhaseTwo ? (
          <section
            style={{
              marginBottom: "20px",
              border: "1px solid #DDD6FE",
              borderRadius: "18px",
              padding: "22px 24px",
              backgroundColor: "#FAF5FF",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0, color: "#0F172A", fontSize: "22px" }}>Add a constituent to this list</h2>
                <p style={{ margin: "6px 0 0", color: "#64748B", lineHeight: 1.5 }}>
                  Search Raiser's Edge NXT and add someone to Future. Made. Phase II without leaving this report.
                </p>
              </div>
              <div style={{ color: "#5B21B6", fontSize: "13px", fontWeight: 800 }}>
                Executives and admins only
              </div>
            </div>

            <div style={{ marginTop: "16px", position: "relative" }}>
              <Search
                aria-hidden="true"
                size={20}
                color="#64748B"
                style={{ position: "absolute", left: "15px", top: "50%", transform: "translateY(-50%)" }}
              />
              <input
                name="future-made-phase-ii-lookup"
                type="search"
                value={lookupQuery}
                onChange={(event) => setLookupQuery(event.target.value)}
                placeholder="Search NXT by first name, last name, or constituent name"
                autoComplete="off"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  minHeight: "50px",
                  borderRadius: "12px",
                  border: "1px solid #C4B5FD",
                  padding: "12px 16px 12px 46px",
                  color: "#111827",
                  backgroundColor: "#FFFFFF",
                  fontSize: "16px",
                }}
              />
            </div>
            <p style={{ margin: "10px 0 0", color: "#64748B", fontSize: "13px", lineHeight: 1.5 }}>
              Enter at least two characters. Search results come directly from your Raiser's Edge NXT connection.
            </p>

            {lookupError ? (
              <div
                role="alert"
                style={{
                  marginTop: "16px",
                  border: "1px solid #FECACA",
                  backgroundColor: "#FEF2F2",
                  color: "#991B1B",
                  borderRadius: "14px",
                  padding: "14px 16px",
                  fontWeight: 700,
                }}
              >
                {lookupError}
              </div>
            ) : null}

            {lookupWarning ? (
              <div
                role="status"
                style={{
                  marginTop: "16px",
                  border: "1px solid #FDE68A",
                  backgroundColor: "#FFFBEB",
                  color: "#92400E",
                  borderRadius: "14px",
                  padding: "14px 16px",
                  fontWeight: 700,
                }}
              >
                {lookupWarning}
              </div>
            ) : null}

            {isSearchingLookup ? (
              <div style={{ marginTop: "16px", color: "#64748B", fontWeight: 700 }}>
                Searching NXT...
              </div>
            ) : null}

            {hasSearchedLookup && !isSearchingLookup && !lookupError && lookupResults.length === 0 ? (
              <div
                style={{
                  marginTop: "16px",
                  border: "1px solid #E2E8F0",
                  borderRadius: "16px",
                  backgroundColor: "white",
                  padding: "18px",
                  color: "#475569",
                }}
              >
                No NXT constituents matched “{lookupQuery.trim()}”. Try another version of the name.
              </div>
            ) : null}

            {lookupResults.length > 0 ? (
              <div style={{ display: "grid", gap: "12px", marginTop: "16px" }}>
                {lookupResults.map((result, index) => {
                  const profileUrl = buildBlackbaudConstituentProfileUrl(
                    result.blackbaudConstituentId || result.blackbaudRecordId,
                  );
                  const constituentId = String(
                    result.blackbaudConstituentId || result.blackbaudRecordId || "",
                  ).trim();
                  const membershipState = constituentId ? membershipStates[constituentId] : null;
                  const isAdding = membershipState?.status === "loading";
                  const isAdded = membershipState?.status === "success";

                  return (
                    <article
                      key={getLookupResultKey(result, index)}
                      style={{
                        backgroundColor: "white",
                        border: "1px solid #DCE7F7",
                        borderRadius: "16px",
                        padding: "16px 18px",
                        boxShadow: "0 8px 22px rgba(15, 23, 42, 0.04)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: "16px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <h3 style={{ margin: 0, color: "#111827", fontSize: "19px" }}>
                            {result.name || "Unnamed constituent"}
                          </h3>
                          <div style={{ color: "#64748B", fontSize: "13px", marginTop: "5px" }}>
                            {result.lookupId ? `Lookup ID: ${result.lookupId}` : "No lookup ID available"}
                            {constituentId ? ` · NXT ID ${constituentId}` : ""}
                          </div>
                          {membershipState?.message ? (
                            <div
                              style={{
                                color:
                                  membershipState.status === "error" ? "#991B1B" : "#166534",
                                fontSize: "13px",
                                fontWeight: 700,
                                marginTop: "6px",
                              }}
                            >
                              {membershipState.message}
                            </div>
                          ) : null}
                        </div>
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                          {constituentId ? (
                            <button
                              type="button"
                              onClick={() => addToFutureMadePhaseTwo(result)}
                              disabled={isAdding || isAdded}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "8px",
                                minHeight: "40px",
                                padding: "9px 13px",
                                borderRadius: "999px",
                                border: "1px solid #C7D2FE",
                                backgroundColor: isAdded ? "#ECFDF5" : "#F5F3FF",
                                color: isAdded ? "#166534" : "#5B21B6",
                                fontSize: "14px",
                                fontWeight: 800,
                                cursor: isAdding || isAdded ? "default" : "pointer",
                              }}
                            >
                              {isAdding
                                ? "Adding..."
                                : isAdded
                                  ? "Added"
                                  : "Add to Future. Made. Phase II"}
                            </button>
                          ) : null}
                          {profileUrl ? (
                            <a
                              href={profileUrl}
                              rel="noreferrer"
                              target="_blank"
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "8px",
                                minHeight: "40px",
                                padding: "9px 13px",
                                borderRadius: "999px",
                                border: "1px solid #CBD5E1",
                                color: "#334155",
                                fontSize: "14px",
                                fontWeight: 800,
                                textDecoration: "none",
                                backgroundColor: "white",
                              }}
                            >
                              <ExternalLink size={15} />
                              Open in NXT
                            </a>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : null}
          </section>
        ) : null}

        {hasResultTable ? (
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
                  {totalRows.toLocaleString("en-US")} records returned by NXT
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
                    {reportColumns.map((column) => (
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
                        {reportColumns.map((column) => (
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
