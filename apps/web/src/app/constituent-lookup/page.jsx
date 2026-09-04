"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink, Search } from "lucide-react";
import { useLocation } from "react-router";
import useUser from "@/utils/useUser";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import { isAdminRole, isExecutiveRole } from "@/utils/workspaceRoles";

function getResultKey(result, index) {
  return (
    result?.blackbaudConstituentId ||
    result?.blackbaudRecordId ||
    result?.lookupId ||
    `${result?.name || "constituent"}-${index}`
  );
}

function ResultDetail({ label, value }) {
  if (!value) return null;

  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          color: "#6B7280",
          fontSize: "11px",
          fontWeight: 800,
          letterSpacing: "0.04em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          color: "#374151",
          fontSize: "14px",
          lineHeight: 1.45,
          marginTop: "4px",
          overflowWrap: "anywhere",
          whiteSpace: "pre-line",
        }}
      >
        {value}
      </div>
    </div>
  );
}

export default function ConstituentLookupPage() {
  const location = useLocation();
  const { data: user, loading: loadingUser } = useUser();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [error, setError] = useState("");
  const [warning, setWarning] = useState("");
  const [viewerRole, setViewerRole] = useState("");
  const [membershipStates, setMembershipStates] = useState({});

  useEffect(() => {
    if (!loadingUser && !user) {
      window.location.href = "/account/signin";
    }
  }, [loadingUser, user]);

  useEffect(() => {
    const requestedQuery = new URLSearchParams(location.search).get("q")?.trim();
    if (requestedQuery) setQuery(requestedQuery);
  }, [location.search]);

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
        setViewerRole(String(payload?.user?.role || ""));
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
    const normalizedQuery = query.trim();
    if (normalizedQuery.length < 2) {
      setResults([]);
      setIsSearching(false);
      setHasSearched(false);
      setError("");
      setWarning("");
      return undefined;
    }

    setResults([]);
    setHasSearched(false);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      setIsSearching(true);
      setError("");
      setWarning("");
      try {
        const response = await fetch(
          `/api/blackbaud/constituents/search?q=${encodeURIComponent(normalizedQuery)}`,
          { signal: controller.signal },
        );
        const payload = await response.json().catch(() => null);
        if (controller.signal.aborted) return;

        if (!response.ok) {
          setResults([]);
          setError(payload?.error || "Could not search Raiser's Edge NXT right now.");
          return;
        }

        setResults(Array.isArray(payload?.results) ? payload.results : []);
        setWarning(payload?.warning || "");
      } catch (searchError) {
        if (!controller.signal.aborted) {
          console.error("Constituent lookup error:", searchError);
          setResults([]);
          setError("Could not search Raiser's Edge NXT right now.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearching(false);
          setHasSearched(true);
        }
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [query]);

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
            : "Added to Future. Made. Phase II",
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
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#6B7280" }}>
        Loading constituent lookup...
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        backgroundColor: "#F8FAFC",
        padding: "28px 18px 48px",
      }}
    >
      <div style={{ maxWidth: "1480px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "24px" }}>
          <a
            href="/"
            aria-label="Return to home"
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              border: "1px solid #E5E7EB",
              display: "grid",
              placeItems: "center",
              color: "#374151",
              backgroundColor: "white",
            }}
          >
            <ArrowLeft size={20} />
          </a>
          <div>
            <h1 style={{ margin: 0, fontSize: "28px", color: "#111827" }}>Find a constituent</h1>
            <p style={{ margin: "6px 0 0", color: "#6B7280" }}>
              Search Raiser's Edge NXT and open a constituent profile in a new tab.
            </p>
          </div>
        </div>

        <section
          aria-label="Constituent search"
          style={{
            backgroundColor: "white",
            border: "1px solid #E2E8F0",
            borderRadius: "18px",
            boxShadow: "0 10px 28px rgba(15, 23, 42, 0.05)",
            padding: "24px",
          }}
        >
          <label
            htmlFor="constituent-search"
            style={{ display: "block", color: "#111827", fontSize: "15px", fontWeight: 800, marginBottom: "8px" }}
          >
            Search NXT
          </label>
          <div style={{ position: "relative" }}>
            <Search
              aria-hidden="true"
              size={21}
              color="#64748B"
              style={{ position: "absolute", left: "15px", top: "50%", transform: "translateY(-50%)" }}
            />
            <input
              id="constituent-search"
              name="constituent-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by first name, last name, or constituent name"
              autoComplete="off"
              style={{
                width: "100%",
                boxSizing: "border-box",
                minHeight: "52px",
                borderRadius: "12px",
                border: "1px solid #CBD5E1",
                padding: "12px 16px 12px 48px",
                color: "#111827",
                backgroundColor: "#FFFFFF",
                fontSize: "16px",
              }}
            />
          </div>
          <p style={{ margin: "10px 0 0", color: "#64748B", fontSize: "13px", lineHeight: 1.5 }}>
            Enter at least two characters. Results come directly from your Raiser's Edge NXT connection.
          </p>
        </section>

        {error ? (
          <div
            role="alert"
            style={{
              marginTop: "18px",
              border: "1px solid #FECACA",
              backgroundColor: "#FEF2F2",
              color: "#991B1B",
              borderRadius: "14px",
              padding: "14px 16px",
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        ) : null}

        {warning ? (
          <div
            role="status"
            style={{
              marginTop: "18px",
              border: "1px solid #FDE68A",
              backgroundColor: "#FFFBEB",
              color: "#92400E",
              borderRadius: "14px",
              padding: "14px 16px",
              fontWeight: 700,
            }}
          >
            {warning}
          </div>
        ) : null}

        {isSearching ? (
          <div style={{ marginTop: "22px", color: "#64748B", fontWeight: 700 }}>Searching NXT...</div>
        ) : null}

        {hasSearched && !isSearching && !error && results.length === 0 ? (
          <div
            style={{
              marginTop: "22px",
              border: "1px solid #E2E8F0",
              borderRadius: "16px",
              backgroundColor: "white",
              padding: "22px",
              color: "#475569",
            }}
          >
            No NXT constituents matched “{query.trim()}”. Try another version of the name.
          </div>
        ) : null}

        {results.length > 0 ? (
          <section aria-live="polite" style={{ marginTop: "22px" }}>
            <div style={{ color: "#334155", fontSize: "14px", fontWeight: 800, marginBottom: "10px" }}>
              {results.length} {results.length === 1 ? "match" : "matches"} in NXT
            </div>
            <div style={{ display: "grid", gap: "12px" }}>
              {results.map((result, index) => {
                const profileUrl = buildBlackbaudConstituentProfileUrl(
                  result.blackbaudConstituentId || result.blackbaudRecordId,
                );
                const constituentId = String(
                  result.blackbaudConstituentId || result.blackbaudRecordId || "",
                ).trim();
                const membershipState = constituentId
                  ? membershipStates[constituentId]
                  : null;
                const isAdding = membershipState?.status === "loading";
                const isAdded = membershipState?.status === "success";
                return (
                  <article
                    key={getResultKey(result, index)}
                    style={{
                      backgroundColor: "white",
                      border: "1px solid #DCE7F7",
                      borderRadius: "16px",
                      padding: "18px",
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
                        <h2 style={{ margin: 0, color: "#111827", fontSize: "20px" }}>
                          {result.name || "Unnamed constituent"}
                        </h2>
                        {result.lookupId ? (
                          <div style={{ color: "#64748B", fontSize: "13px", marginTop: "5px" }}>
                            Lookup ID: {result.lookupId}
                          </div>
                        ) : null}
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
                        {canManageFutureMadePhaseTwo && constituentId ? (
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
                                ? "On Future. Made. Phase II"
                                : "Add to Future. Made. Phase II"}
                          </button>
                        ) : null}
                        {profileUrl ? (
                          <a
                            href={profileUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: "8px",
                              minHeight: "40px",
                              padding: "9px 13px",
                              borderRadius: "999px",
                              border: "1px solid #93C5FD",
                              backgroundColor: "#EFF6FF",
                              color: "#1D4ED8",
                              textDecoration: "none",
                              fontSize: "14px",
                              fontWeight: 800,
                            }}
                          >
                            Open NXT profile
                            <ExternalLink size={16} aria-hidden="true" />
                          </a>
                        ) : null}
                      </div>
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: "14px",
                        marginTop: "16px",
                      }}
                    >
                      <ResultDetail label="Email" value={result.email} />
                      <ResultDetail label="Phone" value={result.phone} />
                      <ResultDetail label="Address" value={result.address} />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
