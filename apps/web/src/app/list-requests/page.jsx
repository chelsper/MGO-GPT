"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import useUser from "@/utils/useUser";
import useWorkspaceView from "@/utils/useWorkspaceView";

const REQUEST_STATUSES = [
  "Pending",
  "Needs Clarification",
  "Ready for CRM",
  "Approved",
];

const QUEUE_PRIORITIES = [
  { value: 1, label: "Urgent" },
  { value: 2, label: "Normal" },
  { value: 3, label: "Backlog" },
];

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getPriorityLabel(priority) {
  return QUEUE_PRIORITIES.find((item) => item.value === priority)?.label || "Normal";
}

function formatList(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return String(value);
}

function formatCurrency(amount) {
  if (amount == null || amount === "") return "$0";
  return "$" + Number(amount).toLocaleString();
}

export default function ListRequestsQueuePage() {
  const { data: sessionUser, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [loadingData, setLoadingData] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    if (!loading && !sessionUser) {
      window.location.href = "/account/signin";
    }
  }, [loading, sessionUser]);

  const { isReviewerView } = useWorkspaceView(profile?.role);
  const isReviewer = isReviewerView;

  useEffect(() => {
    if (!sessionUser) return;

    let active = true;

    async function loadProfile() {
      setLoadingData(true);
      try {
        const profileResponse = await fetch("/api/users/profile");
        if (!profileResponse.ok) {
          throw new Error("Failed to load profile");
        }
        const profileData = await profileResponse.json();
        if (active) {
          setProfile(profileData.user || null);
        }
      } catch (err) {
        if (active) {
          console.error(err);
          setError(err.message || "Could not load list requests.");
        }
      } finally {
        if (active) {
          setLoadingData(false);
        }
      }
    }

    loadProfile();
    return () => {
      active = false;
    };
  }, [sessionUser]);

  useEffect(() => {
    if (!profile) return;
    if (!isReviewer) {
      window.location.href = "/";
      return;
    }

    let active = true;

    async function loadRequests() {
      setLoadingData(true);
      setError("");
      try {
        const requestsResponse = await fetch("/api/list-requests/all");
        if (!requestsResponse.ok) {
          const payload = await requestsResponse.json().catch(() => null);
          throw new Error(payload?.error || "Failed to load list requests");
        }
        const requestData = await requestsResponse.json();
        if (active) {
          setRequests(Array.isArray(requestData) ? requestData : []);
        }
      } catch (err) {
        if (active) {
          console.error(err);
          setError(err.message || "Could not load list requests.");
        }
      } finally {
        if (active) {
          setLoadingData(false);
        }
      }
    }

    loadRequests();
    return () => {
      active = false;
    };
  }, [isReviewer, profile]);

  const queueSummary = useMemo(() => {
    return requests.reduce(
      (summary, request) => {
        summary.total += 1;
        summary[request.status] = (summary[request.status] || 0) + 1;
        return summary;
      },
      { total: 0, Pending: 0, "Needs Clarification": 0, "Ready for CRM": 0, Approved: 0 },
    );
  }, [requests]);

  function setDraft(id, updates) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        status: current[id]?.status || "",
        queuePriority: current[id]?.queuePriority || "",
        reviewerNotes: current[id]?.reviewerNotes || "",
        ...updates,
      },
    }));
  }

  async function saveRequest(id) {
    setSavingId(id);
    setActionMessage("");
    setError("");

    try {
      const currentRequest = requests.find((item) => item.id === id);
      const draft = drafts[id] || {};
      const response = await fetch("/api/list-requests/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: draft.status || currentRequest?.status || "Pending",
          queuePriority:
            Number(draft.queuePriority) ||
            currentRequest?.queue_priority ||
            2,
          reviewerNotes:
            draft.reviewerNotes ?? currentRequest?.reviewer_notes ?? "",
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to update list request");
      }

      const updated = await response.json();
      setRequests((current) =>
        current
          .map((item) => (item.id === updated.id ? { ...item, ...updated } : item))
          .sort((a, b) => {
            if (a.queue_priority !== b.queue_priority) {
              return a.queue_priority - b.queue_priority;
            }
            return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
          }),
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setActionMessage(`List request #${updated.id} saved.`);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not update list request.");
    } finally {
      setSavingId(null);
    }
  }

  if (loading || loadingData || !profile) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          backgroundColor: "#F9FAFB",
          color: "#6B7280",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        Loading...
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#F9FAFB",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <main style={{ maxWidth: "1080px", margin: "0 auto", padding: "24px 18px 48px" }}>
        <a
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            color: "#6A5BFF",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 600,
            marginBottom: "18px",
          }}
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </a>

        <div
          style={{
            backgroundColor: "white",
            borderRadius: "18px",
            border: "1px solid #E5E7EB",
            padding: "24px",
            marginBottom: "18px",
            display: "flex",
            justifyContent: "space-between",
            gap: "16px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "28px", color: "#111827", fontWeight: 800 }}>
              Advancement Services List Queue
            </h1>
            <p style={{ margin: "10px 0 0", color: "#6B7280", fontSize: "14px", lineHeight: 1.6 }}>
              Prioritize DevData requests, leave clarification notes, and move work toward CRM delivery.
            </p>
          </div>
          <div
            style={{
              minWidth: "240px",
              backgroundColor: "#F9FAFB",
              border: "1px solid #E5E7EB",
              borderRadius: "14px",
              padding: "14px 16px",
              fontSize: "14px",
              color: "#111827",
              lineHeight: 1.7,
            }}
          >
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
              Queue snapshot
            </div>
            <div>Pending: {queueSummary.Pending}</div>
            <div>Needs Clarification: {queueSummary["Needs Clarification"]}</div>
            <div>Ready for CRM: {queueSummary["Ready for CRM"]}</div>
            <div>Total: {queueSummary.total}</div>
          </div>
        </div>

        {actionMessage ? (
          <div style={{ marginBottom: "14px", padding: "12px 14px", borderRadius: "12px", backgroundColor: "#ECFDF5", border: "1px solid #A7F3D0", color: "#065F46", fontSize: "14px", fontWeight: 600 }}>
            {actionMessage}
          </div>
        ) : null}
        {error ? (
          <div style={{ marginBottom: "14px", padding: "12px 14px", borderRadius: "12px", backgroundColor: "#FEF2F2", border: "1px solid #FECACA", color: "#991B1B", fontSize: "14px", fontWeight: 600 }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: "12px" }}>
          {requests.map((request) => {
            const draft = drafts[request.id];
            const status = draft?.status || request.status || "Pending";
            const queuePriority = Number(draft?.queuePriority || request.queue_priority || 2);
            const reviewerNotes = draft?.reviewerNotes ?? request.reviewer_notes ?? "";

            return (
              <article
                key={request.id}
                style={{
                  border: "1px solid #E5E7EB",
                  borderRadius: "16px",
                  padding: "18px",
                  backgroundColor: "white",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
                  <div>
                    <h2 style={{ margin: 0, fontSize: "18px", color: "#111827" }}>
                      {request.requester_name || request.requester_user_name || "List request"}
                    </h2>
                    <div style={{ marginTop: "6px", fontSize: "13px", color: "#6B7280" }}>
                      Needed by {request.date_needed || "Not specified"} · Submitted {formatDate(request.created_at)}
                    </div>
                    <div style={{ marginTop: "8px", fontSize: "14px", color: "#111827" }}>
                      {request.purpose}
                    </div>
                  </div>
                  <div style={{ minWidth: "240px", display: "grid", gap: "10px" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                        Queue priority
                      </label>
                      <select
                        value={queuePriority}
                        disabled={savingId === request.id}
                        onChange={(event) => setDraft(request.id, { queuePriority: Number(event.target.value) })}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", backgroundColor: "white", fontSize: "14px" }}
                      >
                        {QUEUE_PRIORITIES.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                        Status
                      </label>
                      <select
                        value={status}
                        disabled={savingId === request.id}
                        onChange={(event) => setDraft(request.id, { status: event.target.value })}
                        style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", backgroundColor: "white", fontSize: "14px" }}
                      >
                        {REQUEST_STATUSES.map((item) => (
                          <option key={item} value={item}>
                            {item}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "12px", marginTop: "16px" }}>
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                      Output
                    </div>
                    <div style={{ fontSize: "14px", color: "#111827" }}>{request.output_type || "Not specified"}</div>
                  </div>
                  {request.excel_fields?.length ? (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                        Selected fields
                      </div>
                      <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6 }}>
                        {formatList(request.excel_fields)}
                        {request.excel_fields_other ? `, Other: ${request.excel_fields_other}` : ""}
                      </div>
                    </div>
                  ) : null}
                  {request.who_included?.length ? (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                        Include
                      </div>
                      <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6 }}>
                        {formatList(request.who_included)}
                        {request.who_included_other ? `, Other: ${request.who_included_other}` : ""}
                      </div>
                    </div>
                  ) : null}
                  {request.exclusions?.length ? (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                        Exclusions
                      </div>
                      <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6 }}>
                        {formatList(request.exclusions)}
                        {request.exclusions_other ? `, Other: ${request.exclusions_other}` : ""}
                      </div>
                    </div>
                  ) : null}
                  {request.giving_level || request.giving_level_custom ? (
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                        Giving filter
                      </div>
                      <div style={{ fontSize: "14px", color: "#111827" }}>
                        {request.giving_level || "Custom"}
                        {request.giving_level_custom
                          ? ` (${formatCurrency(request.giving_level_custom)})`
                          : ""}
                      </div>
                    </div>
                  ) : null}
                  {request.gift_timeframe ||
                  request.gift_timeframe_custom_start ||
                  request.gift_timeframe_custom_end ? (
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                        Gift timeframe
                      </div>
                      <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6 }}>
                        {request.gift_timeframe || "Custom"}
                        {request.gift_timeframe_custom_start || request.gift_timeframe_custom_end
                          ? ` (${request.gift_timeframe_custom_start || "?"} to ${request.gift_timeframe_custom_end || "?"})`
                          : ""}
                      </div>
                    </div>
                  ) : null}
                  {request.location_filter && request.location_filter !== "none" ? (
                    <div style={{ gridColumn: "1 / -1" }}>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                        Location filter
                      </div>
                      <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6 }}>
                        {[
                          request.location_filter,
                          request.location_state,
                          request.location_city,
                          request.location_zip,
                          request.location_radius_address,
                          request.location_radius_miles
                            ? `${request.location_radius_miles} mile radius`
                            : "",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                      Priority lane
                    </div>
                    <div style={{ fontSize: "14px", color: "#111827" }}>{getPriorityLabel(request.queue_priority)}</div>
                  </div>
                  {request.reviewer_name ? (
                    <div>
                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                        Last reviewed by
                      </div>
                      <div style={{ fontSize: "14px", color: "#111827" }}>{request.reviewer_name}</div>
                    </div>
                  ) : null}
                </div>

                <div style={{ marginTop: "16px" }}>
                  <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                    Reviewer notes
                  </label>
                  <textarea
                    value={reviewerNotes}
                    disabled={savingId === request.id}
                    onChange={(event) => setDraft(request.id, { reviewerNotes: event.target.value })}
                    placeholder="Explain what is needed from the MGO or what is ready for CRM."
                    rows={4}
                    style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", backgroundColor: "white", fontSize: "14px", resize: "vertical", boxSizing: "border-box" }}
                  />
                </div>

                {request.special_instructions ? (
                  <div style={{ marginTop: "16px", padding: "12px 14px", borderRadius: "12px", backgroundColor: "#F9FAFB", border: "1px solid #E5E7EB" }}>
                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                      MGO instructions
                    </div>
                    <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                      {request.special_instructions}
                    </div>
                  </div>
                ) : null}

                <button
                  type="button"
                  onClick={() => saveRequest(request.id)}
                  disabled={savingId === request.id}
                  style={{
                    marginTop: "16px",
                    padding: "10px 14px",
                    borderRadius: "10px",
                    border: "none",
                    backgroundColor: "#6A5BFF",
                    color: "white",
                    fontSize: "14px",
                    fontWeight: 700,
                    cursor: savingId === request.id ? "wait" : "pointer",
                    opacity: savingId === request.id ? 0.7 : 1,
                  }}
                >
                  {savingId === request.id ? "Saving..." : "Save queue update"}
                </button>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
