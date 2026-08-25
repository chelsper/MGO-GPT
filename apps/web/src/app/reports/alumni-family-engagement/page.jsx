"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import useUser from "@/utils/useUser";
import SharedReportHeader from "@/app/reports/SharedReportHeader";

const POLL_INTERVAL_MS = 1250;
const MAX_POLL_ATTEMPTS = 48;

function wait(milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function DonorTotal({ label, value }) {
  return (
    <article
      style={{
        border: "1px solid #BFDBFE",
        borderRadius: "18px",
        backgroundColor: "white",
        padding: "22px 24px",
      }}
    >
      <p
        style={{
          margin: 0,
          color: "#1E3A8A",
          fontSize: "15px",
          fontWeight: 800,
        }}
      >
        {label}
      </p>
      <strong style={{ display: "block", marginTop: "9px", color: "#166534", fontSize: "42px" }}>
        {formatNumber(value)}
      </strong>
    </article>
  );
}

export default function AlumniFamilyEngagementPage() {
  const { data: user, loading: loadingUser } = useUser();
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [statusText, setStatusText] = useState("");
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    if (!loadingUser && !user) {
      window.location.href = "/account/signin";
    }
  }, [loadingUser, user]);

  useEffect(() => {
    if (!user) return undefined;

    let active = true;
    const controller = new AbortController();

    async function requestReport(path) {
      const response = await fetch(path, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok && response.status !== 202) {
        throw new Error(payload?.error || "Could not load Alumni & Family Engagement.");
      }
      return { response, payload };
    }

    async function loadReport() {
      setIsLoading(true);
      setError("");
      setStatusText(
        refreshVersion > 0
          ? "Preparing the configured Alumni donor total queries..."
          : "Loading the saved report snapshot...",
      );
      try {
        const refreshSuffix = refreshVersion > 0 ? "?refresh=1" : "";
        let { response, payload } = await requestReport(
          `/api/reports/alumni-family-engagement${refreshSuffix}`,
        );

        for (let attempt = 0; response.status === 202 && attempt < MAX_POLL_ATTEMPTS; attempt += 1) {
          if (!active) return;
          setStatusText("Waiting for NXT to finish the configured Alumni donor total queries...");
          const poll = payload?.poll && typeof payload.poll === "object" ? payload.poll : null;
          const pollParameters = new URLSearchParams(
            Object.entries(poll || {}).filter(([, value]) => String(value || "").trim()),
          );
          if (!pollParameters.size) {
            throw new Error("The configured Alumni donor refresh did not return polling information.");
          }
          await wait(POLL_INTERVAL_MS);
          if (!active) return;
          ({ response, payload } = await requestReport(
            `/api/reports/alumni-family-engagement?${pollParameters.toString()}`,
          ));
        }

        if (response.status === 202) {
          throw new Error("The configured Alumni donor queries are taking longer than expected. Please try refreshing this report.");
        }
        if (!active) return;
        setReport(payload);
        setStatusText("");
      } catch (loadError) {
        if (!active || loadError?.name === "AbortError") return;
        setError(
          loadError instanceof Error ? loadError.message : "Could not load Alumni & Family Engagement.",
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
  }, [refreshVersion, user]);

  if (loadingUser || !user) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#64748B" }}>
        Loading report...
      </main>
    );
  }

  const isRefreshRequired = report?.status === "refresh_required";
  const totals = Array.isArray(report?.totals) ? report.totals : [];
  const reportTitle = String(report?.report?.title || "Alumni & Family Engagement");
  const reportDescription = String(
    report?.report?.description || "Alumni donor totals from the saved NXT queries.",
  );

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", padding: "28px 18px 48px" }}>
      <div style={{ maxWidth: "1240px", margin: "0 auto" }}>
        <SharedReportHeader
          activeReportKey="alumni-family-engagement"
          eyebrow="Shared engagement report"
          title={reportTitle}
          description={reportDescription}
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
              Normal visits use the last successful snapshot and do not make another NXT request. A refresh runs
              each configured saved total query once.
            </p>
          </section>
        ) : null}

        {isRefreshRequired ? (
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
            <strong>No saved {reportTitle} snapshot is available.</strong>
            <p style={{ margin: "8px 0 0", lineHeight: 1.5 }}>
              Select Refresh data once. The configured saved totals will then remain available until the next 6 PM
              Eastern refresh or another manual refresh.
            </p>
          </section>
        ) : null}

        {report?.status === "complete" ? (
          <section style={{ display: "grid", gap: "14px", maxWidth: "560px" }}>
            {totals.map((total) => (
              <DonorTotal key={total.key} label={total.label} value={total.total} />
            ))}
          </section>
        ) : null}
      </div>
    </main>
  );
}
