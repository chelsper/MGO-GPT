"use client";

import { useEffect, useMemo, useState } from "react";
import useUser from "@/utils/useUser";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";

const REVIEW_STATUSES = [
  "Pending",
  "Approved",
  "Needs Clarification",
  "Ready for CRM",
];

const TYPE_LABELS = {
  donor_update: "Donor Update",
  opportunity_update: "Opportunity Update",
  constituent_suggestion: "Constituent Suggestion",
};

const LIST_REQUEST_STATUSES = [
  "Pending",
  "Needs Clarification",
  "Ready for CRM",
  "Approved",
];

const QUEUE_PRIORITY_LABELS = {
  1: "Urgent",
  2: "Normal",
  3: "Backlog",
};

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getStatusColors(status) {
  const map = {
    Pending: { bg: "#FEF3C7", fg: "#92400E" },
    Approved: { bg: "#DCFCE7", fg: "#166534" },
    "Needs Clarification": { bg: "#FEE2E2", fg: "#991B1B" },
    "Ready for CRM": { bg: "#DBEAFE", fg: "#1D4ED8" },
  };
  return map[status] || { bg: "#E5E7EB", fg: "#374151" };
}

function getEmailStatusMeta(status) {
  const map = {
    sent: { label: "Email sent", bg: "#DCFCE7", fg: "#166534" },
    failed: { label: "Email failed", bg: "#FEE2E2", fg: "#991B1B" },
    skipped: { label: "Email skipped", bg: "#FEF3C7", fg: "#92400E" },
    processing: { label: "Sending email", bg: "#DBEAFE", fg: "#1D4ED8" },
    not_requested: { label: "Email not requested", bg: "#E5E7EB", fg: "#374151" },
  };

  return map[status] || map.not_requested;
}

function getListRequestTitle(request) {
  return (
    request.purpose_other ||
    request.purpose ||
    request.output_type ||
    "List request"
  );
}

function formatList(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return String(value);
}

export default function SubmissionsPage() {
  const { data: sessionUser, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("submissions");
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [listRequests, setListRequests] = useState([]);
  const [listRequestsLoading, setListRequestsLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [updatingListRequestId, setUpdatingListRequestId] = useState(null);
  const [reviewFilter, setReviewFilter] = useState("Pending");
  const [listRequestFilter, setListRequestFilter] = useState("Pending");
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [clarificationDrafts, setClarificationDrafts] = useState({});
  const [listRequestDrafts, setListRequestDrafts] = useState({});
  const [expandedSubmissionGroups, setExpandedSubmissionGroups] = useState({});

  function getSubmissionDisplayName(submission) {
    return submission.donor_name || submission.constituent_name || "Untitled submission";
  }

  useEffect(() => {
    if (!loading && !sessionUser) {
      window.location.href = "/account/signin";
    }
  }, [loading, sessionUser]);

  useEffect(() => {
    if (!sessionUser) return;

    let active = true;

    async function loadProfile() {
      setProfileLoading(true);
      try {
        const response = await fetch("/api/users/profile");
        if (!response.ok) {
          throw new Error("Failed to load profile");
        }
        const data = await response.json();
        if (active) {
          setProfile(data.user || null);
        }
      } catch (err) {
        if (active) {
          console.error(err);
          setError("Could not load your profile.");
        }
      } finally {
        if (active) {
          setProfileLoading(false);
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

    let active = true;

    async function loadSubmissions() {
      setSubmissionsLoading(true);
      setError("");
      try {
        const endpoint =
          profile.role === "reviewer"
            ? "/api/submissions/all"
            : "/api/submissions/my-submissions";
        const response = await fetch(endpoint);
        if (!response.ok) {
          throw new Error("Failed to load submissions");
        }
        const data = await response.json();
        if (active) {
          setSubmissions(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (active) {
          console.error(err);
          setError("Could not load submissions.");
        }
      } finally {
        if (active) {
          setSubmissionsLoading(false);
        }
      }
    }

    loadSubmissions();
    return () => {
      active = false;
    };
  }, [profile]);

  useEffect(() => {
    if (!profile) return;

    let active = true;

    async function loadListRequests() {
      setListRequestsLoading(true);
      setError("");
      try {
        const endpoint =
          profile.role === "reviewer"
            ? "/api/list-requests/all"
            : "/api/list-requests/my-requests";
        const response = await fetch(endpoint);
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "Failed to load list requests");
        }
        const data = await response.json();
        if (active) {
          setListRequests(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (active) {
          console.error(err);
          setError("Could not load list requests.");
        }
      } finally {
        if (active) {
          setListRequestsLoading(false);
        }
      }
    }

    loadListRequests();
    return () => {
      active = false;
    };
  }, [profile]);

  const heading = useMemo(() => {
    if (profile?.role === "reviewer") {
      return {
        title: "Advancement Services Queue",
        subtitle: "Review incoming submissions and move them toward CRM completion.",
      };
    }

    return {
      title: "My Submission Tracker",
      subtitle: "See what you submitted, when it was reviewed, and what needs follow-up.",
    };
  }, [profile]);

  const reviewerCounts = useMemo(() => {
    if (profile?.role !== "reviewer") return {};

    return submissions.reduce((counts, submission) => {
      const key = submission.status || "Pending";
      counts[key] = (counts[key] || 0) + 1;
      counts.All = (counts.All || 0) + 1;
      return counts;
    }, {});
  }, [profile, submissions]);

  const reviewerListRequestCounts = useMemo(() => {
    if (profile?.role !== "reviewer") return {};

    return listRequests.reduce((counts, request) => {
      const key = request.status || "Pending";
      counts[key] = (counts[key] || 0) + 1;
      counts.All = (counts.All || 0) + 1;
      return counts;
    }, {});
  }, [profile, listRequests]);

  const visibleSubmissionGroups = useMemo(() => {
    let next = [...submissions];

    if (profile?.role === "reviewer" && reviewFilter !== "All") {
      next = next.filter((submission) => (submission.status || "Pending") === reviewFilter);
    }

    const grouped = new Map();

    for (const submission of next) {
      const groupKey = submission.constituent_id
        ? `constituent:${submission.constituent_id}`
        : `submission:${submission.id}`;

      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          id: groupKey,
          constituentId: submission.constituent_id || null,
          title: getSubmissionDisplayName(submission),
          submissions: [],
          latestAt: 0,
        });
      }

      const entry = grouped.get(groupKey);
      entry.submissions.push(submission);
      const submittedAt = new Date(
        submission.date_submitted || submission.created_at || 0,
      ).getTime();
      if (submittedAt >= entry.latestAt) {
        entry.latestAt = submittedAt;
        entry.title = getSubmissionDisplayName(submission);
      }
    }

    const groups = Array.from(grouped.values())
      .map((group) => ({
        ...group,
        submissions: [...group.submissions].sort((a, b) => {
          const aDate = new Date(a.date_submitted || a.created_at || 0).getTime();
          const bDate = new Date(b.date_submitted || b.created_at || 0).getTime();
          return bDate - aDate;
        }),
      }))
      .sort((a, b) => b.latestAt - a.latestAt);

    return groups;
  }, [profile, reviewFilter, submissions]);

  const visibleListRequests = useMemo(() => {
    let next = [...listRequests];

    if (profile?.role === "reviewer" && listRequestFilter !== "All") {
      next = next.filter((request) => (request.status || "Pending") === listRequestFilter);
    }

    return next.sort((a, b) => {
      if (profile?.role === "reviewer" && a.queue_priority !== b.queue_priority) {
        return a.queue_priority - b.queue_priority;
      }
      const aDate = new Date(a.updated_at || a.created_at || 0).getTime();
      const bDate = new Date(b.updated_at || b.created_at || 0).getTime();
      return bDate - aDate;
    });
  }, [listRequests, listRequestFilter, profile]);

  function setReviewDraft(id, updates) {
    setReviewDrafts((current) => ({
      ...current,
      [id]: {
        status: current[id]?.status || "",
        reviewerNotes: current[id]?.reviewerNotes || "",
        ...updates,
      },
    }));
  }

  function setClarificationDraft(id, value) {
    setClarificationDrafts((current) => ({
      ...current,
      [id]: value,
    }));
  }

  function setListRequestDraft(id, updates) {
    setListRequestDrafts((current) => ({
      ...current,
      [id]: {
        status: current[id]?.status || "",
        queuePriority: current[id]?.queuePriority || "",
        reviewerNotes: current[id]?.reviewerNotes || "",
        ...updates,
      },
    }));
  }

  function toggleSubmissionGroup(groupId) {
    setExpandedSubmissionGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }

  async function saveReview(id) {
    setUpdatingId(id);
    setActionMessage("");
    setError("");

    try {
      const currentSubmission = submissions.find((item) => item.id === id);
      const draft = reviewDrafts[id] || {};
      const response = await fetch("/api/submissions/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: draft.status || currentSubmission?.status || "Pending",
          reviewerNotes:
            draft.reviewerNotes ?? currentSubmission?.reviewer_notes ?? "",
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to update submission review");
      }

      const updated = await response.json();
      setSubmissions((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      setReviewDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setActionMessage(`Submission #${updated.id} review saved.`);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not update submission review.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function resubmitForReview(id) {
    setUpdatingId(id);
    setActionMessage("");
    setError("");

    try {
      const clarificationResponse = String(clarificationDrafts[id] || "").trim();
      const response = await fetch("/api/submissions/resubmit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          clarificationResponse,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to resubmit submission");
      }

      const updated = await response.json();
      setSubmissions((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      setClarificationDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setActionMessage(`Submission #${updated.id} was resubmitted for review.`);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not resubmit submission.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function saveListRequestReview(id) {
    setUpdatingListRequestId(id);
    setActionMessage("");
    setError("");

    try {
      const currentRequest = listRequests.find((item) => item.id === id);
      const draft = listRequestDrafts[id] || {};
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
      setListRequests((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      setListRequestDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setActionMessage(`List request #${updated.id} review saved.`);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not update list request.");
    } finally {
      setUpdatingListRequestId(null);
    }
  }

  if (loading || !sessionUser || profileLoading) {
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
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: "28px", color: "#111827", fontWeight: 800 }}>
                {heading.title}
              </h1>
              <p style={{ margin: "10px 0 0", color: "#6B7280", fontSize: "14px", lineHeight: 1.6 }}>
                {heading.subtitle}
              </p>
            </div>
            <div
              style={{
                minWidth: "220px",
                backgroundColor: "#F9FAFB",
                border: "1px solid #E5E7EB",
                borderRadius: "14px",
                padding: "14px 16px",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Signed in as
              </div>
              <div style={{ marginTop: "8px", fontSize: "15px", fontWeight: 700, color: "#111827" }}>
                {profile?.name || sessionUser?.name || "User"}
              </div>
              <div style={{ marginTop: "4px", fontSize: "13px", color: "#6B7280" }}>
                {profile?.email || sessionUser?.email}
              </div>
              <div style={{ marginTop: "10px", fontSize: "13px", fontWeight: 600, color: "#6A5BFF", textTransform: "capitalize" }}>
                Role: {profile?.role || "mgo"}
              </div>
            </div>
          </div>
        </div>

        {actionMessage ? (
          <div
            style={{
              marginBottom: "14px",
              padding: "12px 14px",
              borderRadius: "12px",
              backgroundColor: "#ECFDF5",
              border: "1px solid #A7F3D0",
              color: "#065F46",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {actionMessage}
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              marginBottom: "14px",
              padding: "12px 14px",
              borderRadius: "12px",
              backgroundColor: "#FEF2F2",
              border: "1px solid #FECACA",
              color: "#991B1B",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        ) : null}

        <div
          style={{
            backgroundColor: "white",
            borderRadius: "18px",
            border: "1px solid #E5E7EB",
            padding: "18px",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              padding: "4px 4px 16px",
              borderBottom: "1px solid #E5E7EB",
              marginBottom: "18px",
            }}
          >
            {[
              { id: "submissions", label: "Submissions", count: submissions.length },
              { id: "listRequests", label: "List Requests", count: listRequests.length },
            ].map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    borderRadius: "999px",
                    border: selected ? "2px solid #6A5BFF" : "1px solid #D1D5DB",
                    backgroundColor: selected ? "#EDE9FE" : "white",
                    color: selected ? "#5B21B6" : "#374151",
                    padding: "10px 14px",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {tab.label} ({tab.count})
                </button>
              );
            })}
          </div>

          {profile?.role === "reviewer" && activeTab === "submissions" ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                flexWrap: "wrap",
                padding: "4px 4px 16px",
                borderBottom: "1px solid #E5E7EB",
                marginBottom: "18px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#6B7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: "10px",
                  }}
                >
                  Filter queue
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {["Pending", "Needs Clarification", "Ready for CRM", "Approved", "All"].map(
                    (status) => {
                      const selected = reviewFilter === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setReviewFilter(status)}
                          style={{
                            borderRadius: "999px",
                            border: selected ? "2px solid #6A5BFF" : "1px solid #D1D5DB",
                            backgroundColor: selected ? "#EDE9FE" : "white",
                            color: selected ? "#5B21B6" : "#374151",
                            padding: "8px 12px",
                            fontSize: "13px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {status} ({reviewerCounts[status] || 0})
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              <div
                style={{
                  minWidth: "220px",
                  padding: "12px 14px",
                  borderRadius: "14px",
                  backgroundColor: "#F9FAFB",
                  border: "1px solid #E5E7EB",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#6B7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: "8px",
                  }}
                >
                  Queue snapshot
                </div>
                <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.7 }}>
                  <div>Pending: {reviewerCounts.Pending || 0}</div>
                  <div>Needs Clarification: {reviewerCounts["Needs Clarification"] || 0}</div>
                  <div>Ready for CRM: {reviewerCounts["Ready for CRM"] || 0}</div>
                  <div>Total: {reviewerCounts.All || 0}</div>
                </div>
              </div>
            </div>
          ) : null}

          {profile?.role === "reviewer" && activeTab === "listRequests" ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                flexWrap: "wrap",
                padding: "4px 4px 16px",
                borderBottom: "1px solid #E5E7EB",
                marginBottom: "18px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#6B7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: "10px",
                  }}
                >
                  Filter list queue
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {["Pending", "Needs Clarification", "Ready for CRM", "Approved", "All"].map(
                    (status) => {
                      const selected = listRequestFilter === status;
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setListRequestFilter(status)}
                          style={{
                            borderRadius: "999px",
                            border: selected ? "2px solid #6A5BFF" : "1px solid #D1D5DB",
                            backgroundColor: selected ? "#EDE9FE" : "white",
                            color: selected ? "#5B21B6" : "#374151",
                            padding: "8px 12px",
                            fontSize: "13px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {status} ({reviewerListRequestCounts[status] || 0})
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              <div
                style={{
                  minWidth: "220px",
                  padding: "12px 14px",
                  borderRadius: "14px",
                  backgroundColor: "#F9FAFB",
                  border: "1px solid #E5E7EB",
                }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#6B7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: "8px",
                  }}
                >
                  Queue snapshot
                </div>
                <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.7 }}>
                  <div>Pending: {reviewerListRequestCounts.Pending || 0}</div>
                  <div>Needs Clarification: {reviewerListRequestCounts["Needs Clarification"] || 0}</div>
                  <div>Ready for CRM: {reviewerListRequestCounts["Ready for CRM"] || 0}</div>
                  <div>Total: {reviewerListRequestCounts.All || 0}</div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === "submissions" ? (
          submissionsLoading ? (
            <div style={{ padding: "18px 8px", color: "#6B7280", fontSize: "14px" }}>
              Loading submissions...
            </div>
          ) : visibleSubmissionGroups.length === 0 ? (
            <div style={{ padding: "18px 8px", color: "#6B7280", fontSize: "14px" }}>
              {profile?.role === "reviewer"
                ? "No submissions match the current filter."
                : "No submissions yet."}
            </div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {visibleSubmissionGroups.map((group) => {
                const isCollapsible =
                  profile?.role !== "reviewer" &&
                  group.constituentId &&
                  group.submissions.length > 1;
                const isExpanded = isCollapsible
                  ? Boolean(expandedSubmissionGroups[group.id])
                  : true;

                return (
                  <article
                    key={group.id}
                    style={{
                      border: "1px solid #E5E7EB",
                      borderRadius: "16px",
                      padding: "16px",
                      backgroundColor: "#FFFFFF",
                    }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        gap: "14px",
                        flexWrap: "wrap",
                        alignItems: "flex-start",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <h2 style={{ margin: 0, fontSize: "17px", color: "#111827" }}>
                            {group.title}
                          </h2>
                          {group.constituentId ? (
                            <span
                              style={{
                                backgroundColor: "#EDE9FE",
                                color: "#5B21B6",
                                padding: "4px 10px",
                                borderRadius: "999px",
                                fontSize: "12px",
                                fontWeight: 700,
                              }}
                            >
                              Linked workflow thread
                            </span>
                          ) : null}
                        </div>
                        <div style={{ marginTop: "6px", fontSize: "14px", color: "#6B7280" }}>
                          {group.submissions.length} submission{group.submissions.length === 1 ? "" : "s"} in this thread
                        </div>
                        <div style={{ marginTop: "6px", fontSize: "13px", color: "#6B7280" }}>
                          Latest activity {formatDate(group.latestAt)}
                        </div>
                      </div>
                      {isCollapsible ? (
                        <button
                          type="button"
                          onClick={() => toggleSubmissionGroup(group.id)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "8px 12px",
                            borderRadius: "999px",
                            border: "1px solid #D1D5DB",
                            backgroundColor: "white",
                            color: "#374151",
                            fontSize: "13px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp size={16} />
                              Hide related submissions
                            </>
                          ) : (
                            <>
                              <ChevronDown size={16} />
                              View all related submissions
                            </>
                          )}
                        </button>
                      ) : null}
                    </div>

                    <div
                      style={{
                        display: isExpanded ? "grid" : "none",
                        gap: "12px",
                        marginTop: "16px",
                      }}
                    >
                      {group.submissions.map((submission) => {
                        const colors = getStatusColors(submission.status);
                        const emailMeta = getEmailStatusMeta(submission.notification_email_status);
                        const draft = reviewDrafts[submission.id];
                        const selectedStatus = draft?.status || submission.status || "Pending";
                        const reviewerNotes =
                          draft?.reviewerNotes ?? submission.reviewer_notes ?? "";
                        const clarificationResponse =
                          clarificationDrafts[submission.id] ?? "";

                        return (
                          <div
                            key={submission.id}
                            style={{
                              border: "1px solid #E5E7EB",
                              borderRadius: "14px",
                              padding: "16px",
                              backgroundColor: "#FFFFFF",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: "14px",
                                flexWrap: "wrap",
                                alignItems: "flex-start",
                              }}
                            >
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                  <h3 style={{ margin: 0, fontSize: "16px", color: "#111827" }}>
                                    {TYPE_LABELS[submission.submission_type] || "Submission"}
                                  </h3>
                                  <span
                                    style={{
                                      backgroundColor: colors.bg,
                                      color: colors.fg,
                                      padding: "4px 10px",
                                      borderRadius: "999px",
                                      fontSize: "12px",
                                      fontWeight: 700,
                                    }}
                                  >
                                    {submission.status}
                                  </span>
                                </div>
                                <div style={{ marginTop: "6px", fontSize: "13px", color: "#6B7280" }}>
                                  Submitted {formatDate(submission.date_submitted || submission.created_at)}
                                </div>
                              </div>

                              {profile?.role === "reviewer" ? (
                                <div style={{ minWidth: "220px" }}>
                                  <label
                                    style={{
                                      display: "block",
                                      fontSize: "12px",
                                      fontWeight: 700,
                                      color: "#6B7280",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.04em",
                                      marginBottom: "8px",
                                    }}
                                  >
                                    Review status
                                  </label>
                                  <select
                                    value={selectedStatus}
                                    disabled={updatingId === submission.id}
                                    onChange={(event) =>
                                      setReviewDraft(submission.id, { status: event.target.value })
                                    }
                                    style={{
                                      width: "100%",
                                      padding: "10px 12px",
                                      borderRadius: "10px",
                                      border: "1px solid #D1D5DB",
                                      backgroundColor: "white",
                                      fontSize: "14px",
                                    }}
                                  >
                                    {REVIEW_STATUSES.map((status) => (
                                      <option key={status} value={status}>
                                        {status}
                                      </option>
                                    ))}
                                  </select>
                                  <label
                                    style={{
                                      display: "block",
                                      fontSize: "12px",
                                      fontWeight: 700,
                                      color: "#6B7280",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.04em",
                                      margin: "12px 0 8px",
                                    }}
                                  >
                                    Reviewer notes
                                  </label>
                                  <textarea
                                    value={reviewerNotes}
                                    disabled={updatingId === submission.id}
                                    onChange={(event) =>
                                      setReviewDraft(submission.id, {
                                        reviewerNotes: event.target.value,
                                      })
                                    }
                                    placeholder="Add context, follow-up questions, or CRM instructions."
                                    rows={4}
                                    style={{
                                      width: "100%",
                                      padding: "10px 12px",
                                      borderRadius: "10px",
                                      border: "1px solid #D1D5DB",
                                      backgroundColor: "white",
                                      fontSize: "14px",
                                      resize: "vertical",
                                      boxSizing: "border-box",
                                    }}
                                  />
                                  <button
                                    type="button"
                                    disabled={updatingId === submission.id}
                                    onClick={() => saveReview(submission.id)}
                                    style={{
                                      marginTop: "10px",
                                      width: "100%",
                                      padding: "10px 12px",
                                      borderRadius: "10px",
                                      border: "none",
                                      backgroundColor: "#6A5BFF",
                                      color: "white",
                                      fontSize: "14px",
                                      fontWeight: 700,
                                      cursor: updatingId === submission.id ? "wait" : "pointer",
                                      opacity: updatingId === submission.id ? 0.7 : 1,
                                    }}
                                  >
                                    {updatingId === submission.id ? "Saving..." : "Save review"}
                                  </button>
                                </div>
                              ) : submission.status === "Needs Clarification" ? (
                                <div style={{ minWidth: "260px" }}>
                                  <label
                                    style={{
                                      display: "block",
                                      fontSize: "12px",
                                      fontWeight: 700,
                                      color: "#6B7280",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.04em",
                                      marginBottom: "8px",
                                    }}
                                  >
                                    Clarification response
                                  </label>
                                  <textarea
                                    value={clarificationResponse}
                                    disabled={updatingId === submission.id}
                                    onChange={(event) =>
                                      setClarificationDraft(
                                        submission.id,
                                        event.target.value,
                                      )
                                    }
                                    placeholder="Respond to Advancement Services and send this back for review."
                                    rows={4}
                                    style={{
                                      width: "100%",
                                      padding: "10px 12px",
                                      borderRadius: "10px",
                                      border: "1px solid #D1D5DB",
                                      backgroundColor: "white",
                                      fontSize: "14px",
                                      resize: "vertical",
                                      boxSizing: "border-box",
                                    }}
                                  />
                                  <button
                                    type="button"
                                    disabled={
                                      updatingId === submission.id ||
                                      !clarificationResponse.trim()
                                    }
                                    onClick={() => resubmitForReview(submission.id)}
                                    style={{
                                      marginTop: "10px",
                                      width: "100%",
                                      padding: "10px 12px",
                                      borderRadius: "10px",
                                      border: "none",
                                      backgroundColor: "#6A5BFF",
                                      color: "white",
                                      fontSize: "14px",
                                      fontWeight: 700,
                                      cursor:
                                        updatingId === submission.id ||
                                        !clarificationResponse.trim()
                                          ? "not-allowed"
                                          : "pointer",
                                      opacity:
                                        updatingId === submission.id ||
                                        !clarificationResponse.trim()
                                          ? 0.7
                                          : 1,
                                    }}
                                  >
                                    {updatingId === submission.id
                                      ? "Resubmitting..."
                                      : "Resubmit for review"}
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                                gap: "12px",
                                marginTop: "16px",
                              }}
                            >
                              <div>
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                  Submitted by
                                </div>
                                <div style={{ fontSize: "14px", color: "#111827" }}>
                                  {submission.officer_name || "Unknown"}
                                </div>
                              </div>

                              {submission.reviewer_name ? (
                                <div>
                                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                    Reviewed by
                                  </div>
                                  <div style={{ fontSize: "14px", color: "#111827" }}>
                                    {submission.reviewer_name}
                                  </div>
                                </div>
                              ) : null}

                              <div>
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                  Email delivery
                                </div>
                                <div
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    padding: "4px 10px",
                                    borderRadius: "999px",
                                    backgroundColor: emailMeta.bg,
                                    color: emailMeta.fg,
                                    fontSize: "12px",
                                    fontWeight: 700,
                                  }}
                                >
                                  {emailMeta.label}
                                </div>
                                {submission.notification_email_recipient ? (
                                  <div style={{ marginTop: "6px", fontSize: "13px", color: "#6B7280" }}>
                                    To: {submission.notification_email_recipient}
                                  </div>
                                ) : null}
                                {submission.notification_email_sent_at ? (
                                  <div style={{ marginTop: "4px", fontSize: "13px", color: "#6B7280" }}>
                                    Sent {formatDate(submission.notification_email_sent_at)}
                                  </div>
                                ) : null}
                              </div>

                              {submission.next_step ? (
                                <div>
                                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                    Next step
                                  </div>
                                  <div style={{ fontSize: "14px", color: "#111827" }}>
                                    {submission.next_step}
                                  </div>
                                </div>
                              ) : null}

                              {submission.interaction_type ? (
                                <div>
                                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                    Interaction
                                  </div>
                                  <div style={{ fontSize: "14px", color: "#111827", textTransform: "capitalize" }}>
                                    {submission.interaction_type}
                                  </div>
                                </div>
                              ) : null}

                              {submission.reviewer_notes ? (
                                <div style={{ gridColumn: "1 / -1" }}>
                                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                    Reviewer notes
                                  </div>
                                  <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                                    {submission.reviewer_notes}
                                  </div>
                                </div>
                              ) : null}
                            </div>

                            {submission.notes ? (
                              <div
                                style={{
                                  marginTop: "16px",
                                  padding: "12px 14px",
                                  borderRadius: "12px",
                                  backgroundColor: "#F9FAFB",
                                  border: "1px solid #E5E7EB",
                                }}
                              >
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                                  Notes
                                </div>
                                <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                                  {submission.notes}
                                </div>
                              </div>
                            ) : null}

                            {submission.notification_email_error ? (
                              <div
                                style={{
                                  marginTop: "16px",
                                  padding: "12px 14px",
                                  borderRadius: "12px",
                                  backgroundColor: "#FEF2F2",
                                  border: "1px solid #FECACA",
                                }}
                              >
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#991B1B", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                                  Email error
                                </div>
                                <div style={{ fontSize: "13px", color: "#991B1B", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                                  {submission.notification_email_error}
                                </div>
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          )) : listRequestsLoading ? (
            <div style={{ padding: "18px 8px", color: "#6B7280", fontSize: "14px" }}>
              Loading list requests...
            </div>
          ) : visibleListRequests.length === 0 ? (
            <div style={{ padding: "18px 8px", color: "#6B7280", fontSize: "14px" }}>
              {profile?.role === "reviewer"
                ? "No list requests match the current filter."
                : "No list requests yet."}
            </div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {visibleListRequests.map((request) => {
                const colors = getStatusColors(request.status);
                const draft = listRequestDrafts[request.id];
                const selectedStatus = draft?.status || request.status || "Pending";
                const reviewerNotes =
                  draft?.reviewerNotes ?? request.reviewer_notes ?? "";
                const queuePriority =
                  draft?.queuePriority || request.queue_priority || 2;

                return (
                  <article
                    key={request.id}
                    style={{
                      border: "1px solid #E5E7EB",
                      borderRadius: "16px",
                      padding: "16px",
                      backgroundColor: "#FFFFFF",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "14px",
                        flexWrap: "wrap",
                        alignItems: "flex-start",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <h2 style={{ margin: 0, fontSize: "17px", color: "#111827" }}>
                            {getListRequestTitle(request)}
                          </h2>
                          <span
                            style={{
                              backgroundColor: colors.bg,
                              color: colors.fg,
                              padding: "4px 10px",
                              borderRadius: "999px",
                              fontSize: "12px",
                              fontWeight: 700,
                            }}
                          >
                            {request.status}
                          </span>
                          {profile?.role === "reviewer" ? (
                            <span
                              style={{
                                backgroundColor: "#F3F4F6",
                                color: "#374151",
                                padding: "4px 10px",
                                borderRadius: "999px",
                                fontSize: "12px",
                                fontWeight: 700,
                              }}
                            >
                              {QUEUE_PRIORITY_LABELS[request.queue_priority] || "Normal"}
                            </span>
                          ) : null}
                        </div>
                        <div style={{ marginTop: "6px", fontSize: "13px", color: "#6B7280" }}>
                          Requested {formatDate(request.created_at)}
                        </div>
                      </div>

                      {profile?.role === "reviewer" ? (
                        <div style={{ minWidth: "240px" }}>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                            Review status
                          </label>
                          <select
                            value={selectedStatus}
                            disabled={updatingListRequestId === request.id}
                            onChange={(event) =>
                              setListRequestDraft(request.id, { status: event.target.value })
                            }
                            style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", backgroundColor: "white", fontSize: "14px" }}
                          >
                            {LIST_REQUEST_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", margin: "12px 0 8px" }}>
                            Queue priority
                          </label>
                          <select
                            value={queuePriority}
                            disabled={updatingListRequestId === request.id}
                            onChange={(event) =>
                              setListRequestDraft(request.id, { queuePriority: Number(event.target.value) })
                            }
                            style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", backgroundColor: "white", fontSize: "14px" }}
                          >
                            {Object.entries(QUEUE_PRIORITY_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", margin: "12px 0 8px" }}>
                            Reviewer notes
                          </label>
                          <textarea
                            value={reviewerNotes}
                            disabled={updatingListRequestId === request.id}
                            onChange={(event) =>
                              setListRequestDraft(request.id, { reviewerNotes: event.target.value })
                            }
                            rows={4}
                            placeholder="Clarify scope, note priority, or share delivery context."
                            style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", backgroundColor: "white", fontSize: "14px", resize: "vertical", boxSizing: "border-box" }}
                          />
                          <button
                            type="button"
                            disabled={updatingListRequestId === request.id}
                            onClick={() => saveListRequestReview(request.id)}
                            style={{ marginTop: "10px", width: "100%", padding: "10px 12px", borderRadius: "10px", border: "none", backgroundColor: "#6A5BFF", color: "white", fontSize: "14px", fontWeight: 700, cursor: updatingListRequestId === request.id ? "wait" : "pointer", opacity: updatingListRequestId === request.id ? 0.7 : 1 }}
                          >
                            {updatingListRequestId === request.id ? "Saving..." : "Save review"}
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "12px",
                        marginTop: "16px",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                          Requested by
                        </div>
                        <div style={{ fontSize: "14px", color: "#111827" }}>
                          {request.requester_name || request.requester_user_name || "Unknown"}
                        </div>
                      </div>
                      {request.date_needed ? (
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                            Date needed
                          </div>
                          <div style={{ fontSize: "14px", color: "#111827" }}>
                            {formatDate(request.date_needed)}
                          </div>
                        </div>
                      ) : null}
                      {request.output_type ? (
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                            Output type
                          </div>
                          <div style={{ fontSize: "14px", color: "#111827" }}>
                            {request.output_type}
                          </div>
                        </div>
                      ) : null}
                      {request.excel_fields?.length ? (
                        <div style={{ gridColumn: "1 / -1" }}>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                            Selected fields
                          </div>
                          <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6 }}>
                            {formatList(request.excel_fields)}
                            {request.excel_fields_other
                              ? `, Other: ${request.excel_fields_other}`
                              : ""}
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
                            {request.who_included_other
                              ? `, Other: ${request.who_included_other}`
                              : ""}
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
                            {request.exclusions_other
                              ? `, Other: ${request.exclusions_other}`
                              : ""}
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
                      {request.assigned_mgo ? (
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                            Assigned MGO
                          </div>
                          <div style={{ fontSize: "14px", color: "#111827" }}>
                            {request.assigned_mgo}
                          </div>
                        </div>
                      ) : null}
                      {request.reviewer_name ? (
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                            Reviewed by
                          </div>
                          <div style={{ fontSize: "14px", color: "#111827" }}>
                            {request.reviewer_name}
                          </div>
                        </div>
                      ) : null}
                      {request.reviewer_notes ? (
                        <div style={{ gridColumn: "1 / -1" }}>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                            Reviewer notes
                          </div>
                          <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                            {request.reviewer_notes}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {request.special_instructions ? (
                      <div
                        style={{
                          marginTop: "16px",
                          padding: "12px 14px",
                          borderRadius: "12px",
                          backgroundColor: "#F9FAFB",
                          border: "1px solid #E5E7EB",
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                          Special instructions
                        </div>
                        <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                          {request.special_instructions}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
