"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import useUser from "@/utils/useUser";
import { isReviewerRole } from "@/utils/workspaceRoles";

const STATUS_OPTIONS = ["Open", "In Progress", "Completed", "Declined"];

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusStyle(status) {
  const map = {
    Open: { bg: "#FEF3C7", fg: "#92400E", border: "#FDE68A" },
    "In Progress": { bg: "#DBEAFE", fg: "#1D4ED8", border: "#BFDBFE" },
    Completed: { bg: "#DCFCE7", fg: "#166534", border: "#BBF7D0" },
    Declined: { bg: "#FEE2E2", fg: "#991B1B", border: "#FECACA" },
  };
  return map[status] || map.Open;
}

export default function DataRequestsPage() {
  const { data: user, loading } = useUser();
  const [requests, setRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [drafts, setDrafts] = useState({});
  const isReviewer = isReviewerRole(user?.role);

  async function loadQueue() {
    setLoadingQueue(true);
    setError("");
    try {
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const response = await fetch(`/api/data-requests${query}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load data requests");
      }
      setRequests(Array.isArray(payload) ? payload : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load data requests");
    } finally {
      setLoadingQueue(false);
    }
  }

  useEffect(() => {
    if (!loading) {
      loadQueue();
    }
  }, [loading, statusFilter]);

  const summary = useMemo(
    () =>
      requests.reduce(
        (acc, item) => {
          acc.total += 1;
          if (item.status === "Open") acc.open += 1;
          if (item.status === "In Progress") acc.inProgress += 1;
          return acc;
        },
        { total: 0, open: 0, inProgress: 0 },
      ),
    [requests],
  );

  function setDraft(id, updates) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        status: current[id]?.status ?? requests.find((item) => item.id === id)?.status ?? "Open",
        reviewerNotes:
          current[id]?.reviewerNotes ??
          requests.find((item) => item.id === id)?.reviewer_notes ??
          "",
        ...updates,
      },
    }));
  }

  async function saveRequest(item) {
    if (!isReviewer) return;
    const draft = drafts[item.id] || {};
    setSavingId(item.id);
    setError("");
    try {
      const response = await fetch(`/api/data-requests/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: draft.status || item.status,
          reviewerNotes: draft.reviewerNotes ?? item.reviewer_notes ?? "",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update data request");
      }
      setRequests((current) =>
        current.map((request) => (request.id === item.id ? { ...request, ...payload } : request)),
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update data request");
    } finally {
      setSavingId(null);
    }
  }

  if (loading || loadingQueue) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#6B7280" }}>
        Loading data request queue...
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", padding: "28px 18px 48px" }}>
      <div style={{ maxWidth: "1100px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "18px" }}>
          <a
            href="/"
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
            <h1 style={{ margin: 0, fontSize: "28px", color: "#111827" }}>
              Data Request & Update Queue
            </h1>
            <p style={{ margin: "6px 0 0", color: "#6B7280" }}>
              {isReviewer
                ? "Review contact updates, corrected information, and record-change requests from MGOs."
                : "Track the data updates you sent to Advancement Services."}
            </p>
          </div>
        </div>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
            marginBottom: "18px",
          }}
        >
          {[
            ["Open", summary.open],
            ["In progress", summary.inProgress],
            ["Total shown", summary.total],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                backgroundColor: "white",
                border: "1px solid #E5E7EB",
                borderRadius: "16px",
                padding: "16px",
              }}
            >
              <div style={{ color: "#6B7280", fontSize: "12px", fontWeight: 800, textTransform: "uppercase" }}>
                {label}
              </div>
              <div style={{ marginTop: "8px", fontSize: "28px", fontWeight: 800, color: "#111827" }}>
                {value}
              </div>
            </div>
          ))}
        </section>

        <div style={{ marginBottom: "14px", display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: "12px",
              border: "1px solid #D1D5DB",
              backgroundColor: "white",
              fontSize: "14px",
            }}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>

        {error ? (
          <div style={{ marginBottom: "14px", padding: "12px 14px", borderRadius: "12px", backgroundColor: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA" }}>
            {error}
          </div>
        ) : null}

        <section style={{ display: "grid", gap: "12px" }}>
          {requests.length === 0 ? (
            <div style={{ backgroundColor: "white", border: "1px dashed #CBD5E1", borderRadius: "16px", padding: "28px", textAlign: "center", color: "#64748B" }}>
              No data requests match this view.
            </div>
          ) : null}

          {requests.map((item) => {
            const badge = statusStyle(item.status);
            const draft = drafts[item.id] || {};
            return (
              <article
                key={item.id}
                style={{
                  backgroundColor: "white",
                  border: "1px solid #E5E7EB",
                  borderRadius: "18px",
                  padding: "18px",
                  display: "grid",
                  gridTemplateColumns: isReviewer ? "minmax(0, 1fr) minmax(260px, 340px)" : "1fr",
                  gap: "16px",
                }}
              >
                <div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                    <span style={{ padding: "5px 10px", borderRadius: "999px", backgroundColor: badge.bg, color: badge.fg, border: `1px solid ${badge.border}`, fontSize: "12px", fontWeight: 800 }}>
                      {item.status}
                    </span>
                    <span style={{ padding: "5px 10px", borderRadius: "999px", backgroundColor: "#EEF2FF", color: "#3730A3", fontSize: "12px", fontWeight: 800 }}>
                      {item.request_type}
                    </span>
                    {item.source_context ? (
                      <span style={{ padding: "5px 10px", borderRadius: "999px", backgroundColor: "#F8FAFC", color: "#475569", fontSize: "12px", fontWeight: 700 }}>
                        {item.source_context.replaceAll("_", " ")}
                      </span>
                    ) : null}
                  </div>
                  <h2 style={{ margin: 0, fontSize: "20px", color: "#111827" }}>
                    {item.constituent_name || "Unknown constituent"}
                  </h2>
                  <div style={{ marginTop: "6px", color: "#64748B", fontSize: "13px" }}>
                    Requested by {item.requester_name || item.requester_email || "Unknown"} · {formatDate(item.created_at)}
                    {item.blackbaud_constituent_id ? ` · NXT ID ${item.blackbaud_constituent_id}` : ""}
                  </div>
                  <p style={{ margin: "14px 0 0", color: "#111827", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {item.request_note || "No note provided."}
                  </p>
                  {item.provided_data ? (
                    <pre style={{ margin: "12px 0 0", padding: "12px", borderRadius: "12px", backgroundColor: "#F8FAFC", color: "#334155", overflowX: "auto", fontSize: "12px" }}>
                      {JSON.stringify(item.provided_data, null, 2)}
                    </pre>
                  ) : null}
                  {item.reviewer_notes ? (
                    <div style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "12px", backgroundColor: "#F0FDF4", color: "#166534", border: "1px solid #BBF7D0" }}>
                      <strong>Advancement Services note:</strong> {item.reviewer_notes}
                    </div>
                  ) : null}
                </div>

                {isReviewer ? (
                  <div style={{ backgroundColor: "#F8FAFC", borderRadius: "14px", padding: "14px" }}>
                    <label style={{ display: "grid", gap: "6px", fontSize: "13px", color: "#111827", fontWeight: 700 }}>
                      Status
                      <select
                        value={draft.status ?? item.status}
                        onChange={(event) => setDraft(item.id, { status: event.target.value })}
                        style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", backgroundColor: "white" }}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: "6px", fontSize: "13px", color: "#111827", fontWeight: 700, marginTop: "12px" }}>
                      Reviewer note
                      <textarea
                        rows={4}
                        value={draft.reviewerNotes ?? item.reviewer_notes ?? ""}
                        onChange={(event) => setDraft(item.id, { reviewerNotes: event.target.value })}
                        placeholder="Add how this was resolved or what is still needed."
                        style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", resize: "vertical" }}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={savingId === item.id}
                      onClick={() => saveRequest(item)}
                      style={{
                        marginTop: "12px",
                        width: "100%",
                        padding: "11px 14px",
                        border: "none",
                        borderRadius: "12px",
                        backgroundColor: savingId === item.id ? "#94A3B8" : "#0F766E",
                        color: "white",
                        fontWeight: 800,
                        cursor: savingId === item.id ? "wait" : "pointer",
                      }}
                    >
                      {savingId === item.id ? "Saving..." : "Save queue update"}
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
