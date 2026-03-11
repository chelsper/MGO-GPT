"use client";

import { useEffect, useMemo, useState } from "react";
import useUser from "@/utils/useUser";
import { ArrowLeft } from "lucide-react";

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

export default function SubmissionsPage() {
  const { data: sessionUser, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [updatingId, setUpdatingId] = useState(null);

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

  async function updateStatus(id, status) {
    setUpdatingId(id);
    setActionMessage("");
    setError("");

    try {
      const response = await fetch("/api/submissions/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });

      if (!response.ok) {
        throw new Error("Failed to update submission status");
      }

      const updated = await response.json();
      setSubmissions((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      setActionMessage(`Submission #${updated.id} updated to ${updated.status}.`);
    } catch (err) {
      console.error(err);
      setError("Could not update submission status.");
    } finally {
      setUpdatingId(null);
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
          {submissionsLoading ? (
            <div style={{ padding: "18px 8px", color: "#6B7280", fontSize: "14px" }}>
              Loading submissions...
            </div>
          ) : submissions.length === 0 ? (
            <div style={{ padding: "18px 8px", color: "#6B7280", fontSize: "14px" }}>
              No submissions yet.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {submissions.map((submission) => {
                const colors = getStatusColors(submission.status);
                const emailMeta = getEmailStatusMeta(submission.notification_email_status);
                return (
                  <article
                    key={submission.id}
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
                            {TYPE_LABELS[submission.submission_type] || "Submission"}
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
                            {submission.status}
                          </span>
                        </div>
                        <div style={{ marginTop: "6px", fontSize: "14px", color: "#111827", fontWeight: 600 }}>
                          {submission.donor_name || submission.constituent_name || "Untitled submission"}
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
                            value={submission.status || "Pending"}
                            disabled={updatingId === submission.id}
                            onChange={(event) => updateStatus(submission.id, event.target.value)}
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
