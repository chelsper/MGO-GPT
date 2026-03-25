"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare } from "lucide-react";
import useUser from "@/utils/useUser";
import { getSyncBadge } from "@/app/api/utils/nxtTerminologyMap";

function formatShortDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function TeamDiscussionPage() {
  const { data: user, loading } = useUser();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("open");

  const { data: discussionItems = [], isLoading } = useQuery({
    queryKey: ["team-discussion", activeTab],
    queryFn: async () => {
      const status = activeTab === "resolved" ? "Resolved" : "Open";
      const response = await fetch(`/api/discussion-items?status=${encodeURIComponent(status)}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load discussion items");
      }
      return payload;
    },
    enabled: Boolean(user),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, body }) => {
      const response = await fetch(`/api/discussion-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update discussion item");
      }
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["team-discussion"] });
    },
  });

  const groupedItems = useMemo(() => {
    const byBucket = {
      overdue: [],
      upcoming: [],
      unscheduled: [],
    };

    discussionItems.forEach((item) => {
      if (!item.due_date) {
        byBucket.unscheduled.push(item);
        return;
      }
      const due = new Date(item.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (due < today) {
        byBucket.overdue.push(item);
        return;
      }
      byBucket.upcoming.push(item);
    });

    return byBucket;
  }, [discussionItems]);

  if (loading || isLoading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          backgroundColor: "#F9FAFB",
          color: "#6B7280",
        }}
      >
        Loading team discussion...
      </div>
    );
  }

  const internalBadge = getSyncBadge("internal");

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#F9FAFB",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <main style={{ maxWidth: "980px", margin: "0 auto", padding: "24px 18px 40px" }}>
        <a
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            marginBottom: "16px",
            color: "#6B7280",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 600,
          }}
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </a>

        <div
          style={{
            backgroundColor: "white",
            border: "1px solid #E5E7EB",
            borderRadius: "18px",
            padding: "20px",
            marginBottom: "18px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "#6B7280",
                  marginBottom: "8px",
                }}
              >
                Team Discussion
              </div>
              <h1 style={{ margin: "0 0 8px", fontSize: "30px", color: "#111827" }}>
                Internal discussion tied to real fundraising work
              </h1>
              <p style={{ margin: 0, fontSize: "15px", color: "#4B5563", lineHeight: 1.6 }}>
                Use this hub for talking points, handoffs, meeting prep, and internal reminders connected to a constituent, opportunity, or teammate.
              </p>
            </div>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "5px 12px",
                borderRadius: "999px",
                fontSize: "11px",
                fontWeight: 700,
                backgroundColor: internalBadge.bg,
                color: internalBadge.text,
                border: `1px solid ${internalBadge.border}`,
              }}
            >
              {internalBadge.label}
            </span>
          </div>

          <div
            style={{
              display: "inline-flex",
              border: "1px solid #E5E7EB",
              borderRadius: "999px",
              padding: "4px",
              gap: "4px",
              backgroundColor: "#F9FAFB",
              marginTop: "18px",
            }}
          >
            {[
              { value: "open", label: "Open items" },
              { value: "resolved", label: "Resolved" },
            ].map((option) => {
              const selected = activeTab === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setActiveTab(option.value)}
                  style={{
                    border: "none",
                    borderRadius: "999px",
                    padding: "8px 12px",
                    backgroundColor: selected ? "#6A5BFF" : "transparent",
                    color: selected ? "white" : "#4B5563",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        </div>

        {["overdue", "upcoming", "unscheduled"].map((bucket) => {
          const items = groupedItems[bucket];
          const labels = {
            overdue: "Overdue",
            upcoming: "Upcoming",
            unscheduled: "No due date",
          };

          if (!items.length) return null;

          return (
            <section key={bucket} style={{ marginBottom: "18px" }}>
              <h2 style={{ margin: "0 0 12px", fontSize: "18px", color: "#111827" }}>
                {labels[bucket]}
              </h2>
              <div style={{ display: "grid", gap: "12px" }}>
                {items.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      backgroundColor: "white",
                      border: "1px solid #E5E7EB",
                      borderRadius: "16px",
                      padding: "16px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        alignItems: "flex-start",
                        flexWrap: "wrap",
                        marginBottom: "8px",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>
                          {item.subject}
                        </div>
                        <div style={{ marginTop: "4px", fontSize: "13px", color: "#6B7280" }}>
                          {item.prospect_name || item.initiative_name || "General internal discussion"}
                          {item.assigned_user_name ? ` · Shared with ${item.assigned_user_name}` : ""}
                        </div>
                      </div>
                      {item.due_date ? (
                        <div style={{ fontSize: "13px", fontWeight: 700, color: "#374151" }}>
                          Due {formatShortDate(item.due_date)}
                        </div>
                      ) : null}
                    </div>
                    {item.body ? (
                      <div style={{ fontSize: "14px", color: "#374151", lineHeight: 1.6, marginBottom: "10px" }}>
                        {item.body}
                      </div>
                    ) : null}
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                      <button
                        type="button"
                        onClick={() =>
                          updateMutation.mutate({
                            id: item.id,
                            body: { status: item.status === "Open" ? "Resolved" : "Open" },
                          })
                        }
                        disabled={updateMutation.isPending}
                        style={{
                          border: "1px solid #D1D5DB",
                          backgroundColor: "white",
                          color: "#374151",
                          borderRadius: "999px",
                          padding: "8px 12px",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        {item.status === "Open" ? "Mark resolved" : "Reopen"}
                      </button>
                      {item.prospect_id ? (
                        <a
                          href="/my-top-prospects"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            textDecoration: "none",
                            color: "#6A5BFF",
                            fontSize: "12px",
                            fontWeight: 700,
                            padding: "8px 0",
                          }}
                        >
                          <MessageSquare size={14} />
                          Open in prospect workspace
                        </a>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          );
        })}

        {!discussionItems.length ? (
          <div
            style={{
              backgroundColor: "white",
              border: "1px solid #E5E7EB",
              borderRadius: "16px",
              padding: "18px",
              color: "#6B7280",
              lineHeight: 1.6,
            }}
          >
            {activeTab === "resolved"
              ? "No resolved discussion items yet."
              : "No open discussion items right now. Add one from a prospect workspace when you need to share context or keep an internal follow-up visible."}
          </div>
        ) : null}
      </main>
    </div>
  );
}
