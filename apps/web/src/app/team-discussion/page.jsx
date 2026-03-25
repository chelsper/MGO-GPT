"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare, Users, UserRound, ListTodo } from "lucide-react";
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

function getAnchorLabel(item) {
  return (
    item.prospect_name ||
    item.constituent_name ||
    item.opportunity_title ||
    item.initiative_name ||
    "General internal discussion"
  );
}

function groupItems(items, keyBuilder) {
  const groups = new Map();
  items.forEach((item) => {
    const { key, label, description } = keyBuilder(item);
    if (!groups.has(key)) {
      groups.set(key, { key, label, description, items: [] });
    }
    groups.get(key).items.push(item);
  });
  return Array.from(groups.values());
}

function DiscussionCard({ item, onToggle, pending }) {
  const anchorLabel = getAnchorLabel(item);

  return (
    <div
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
          <div style={{ marginTop: "4px", fontSize: "13px", color: "#6B7280", lineHeight: 1.5 }}>
            {anchorLabel}
            {item.assigned_user_name ? ` · Assigned to ${item.assigned_user_name}` : ""}
            {item.created_by_name ? ` · Added by ${item.created_by_name}` : ""}
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
          onClick={() => onToggle(item)}
          disabled={pending}
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
            href={`/my-top-prospects?prospectId=${encodeURIComponent(item.prospect_id)}`}
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
  );
}

export default function TeamDiscussionPage() {
  const { data: user, loading } = useUser();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("Open");
  const [viewMode, setViewMode] = useState("all");

  const { data: discussionItems = [], isLoading } = useQuery({
    queryKey: ["team-discussion", statusFilter],
    queryFn: async () => {
      const response = await fetch(`/api/discussion-items?status=${encodeURIComponent(statusFilter)}`);
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

  const filteredItems = useMemo(() => {
    const currentUserId = Number(user?.id || 0);

    if (viewMode === "assignedToMe") {
      return discussionItems.filter(
        (item) => Number(item.assigned_user_id || 0) === currentUserId,
      );
    }

    if (viewMode === "createdByMe") {
      return discussionItems.filter(
        (item) => Number(item.created_by || 0) === currentUserId,
      );
    }

    if (viewMode === "shared") {
      return discussionItems.filter((item) => {
        const creatorId = Number(item.created_by || 0);
        const assigneeId = Number(item.assigned_user_id || 0);
        return creatorId === currentUserId && assigneeId > 0 && assigneeId !== currentUserId;
      });
    }

    if (viewMode === "assigned") {
      return discussionItems.filter((item) => item.assigned_user_name);
    }
    return discussionItems;
  }, [discussionItems, user?.id, viewMode]);

  const groupedItems = useMemo(() => {
    if (viewMode === "teammate") {
      return groupItems(filteredItems, (item) => ({
        key: item.assigned_user_id ? `assigned-${item.assigned_user_id}` : `creator-${item.created_by || "none"}`,
        label: item.assigned_user_name || item.created_by_name || "Unassigned discussion",
        description: item.assigned_user_name
          ? "Discussion items assigned to this teammate"
          : "Discussion items without a teammate assignment",
      }));
    }

    if (viewMode === "constituent") {
      return groupItems(filteredItems, (item) => {
        const anchorLabel = getAnchorLabel(item);
        return {
          key: `${item.prospect_id || item.constituent_id || item.prospect_opportunity_id || item.initiative_name || anchorLabel}`,
          label: anchorLabel,
          description: item.prospect_name
            ? "Discussion connected to a prospect workspace"
            : item.constituent_name
              ? "Discussion connected to a constituent"
              : item.opportunity_title
                ? "Discussion connected to an opportunity"
                : "General discussion thread",
        };
      });
    }

    if (viewMode === "assigned") {
      return [
        {
          key: "assigned-items",
          label: "Assigned items",
          description: "Discussion items that have an explicit teammate owner",
          items: filteredItems,
        },
      ];
    }

    if (viewMode === "assignedToMe") {
      return [
        {
          key: "assigned-to-me",
          label: "Assigned to me",
          description: "Internal discussion items that need your follow-up",
          items: filteredItems,
        },
      ].filter((group) => group.items.length);
    }

    if (viewMode === "createdByMe") {
      return [
        {
          key: "created-by-me",
          label: "Created by me",
          description: "Discussion items you opened for your own tracking or teammate handoff",
          items: filteredItems,
        },
      ].filter((group) => group.items.length);
    }

    if (viewMode === "shared") {
      return [
        {
          key: "shared-with-teammate",
          label: "Shared with teammate",
          description: "Discussion items you created and handed off to another teammate",
          items: filteredItems,
        },
      ].filter((group) => group.items.length);
    }

    const buckets = {
      overdue: [],
      upcoming: [],
      unscheduled: [],
    };

    filteredItems.forEach((item) => {
      if (!item.due_date) {
        buckets.unscheduled.push(item);
        return;
      }
      const due = new Date(item.due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (due < today) {
        buckets.overdue.push(item);
        return;
      }
      buckets.upcoming.push(item);
    });

    return [
      { key: "overdue", label: "Overdue", description: "Needs discussion or follow-up now", items: buckets.overdue },
      { key: "upcoming", label: "Upcoming", description: "Scheduled for upcoming follow-up", items: buckets.upcoming },
      { key: "unscheduled", label: "No due date", description: "Open discussion without a set date", items: buckets.unscheduled },
    ].filter((group) => group.items.length);
  }, [filteredItems, viewMode]);

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
  const viewTabs = [
    { value: "all", label: "All", icon: MessageSquare },
    { value: "assignedToMe", label: "Assigned to me", icon: ListTodo },
    { value: "createdByMe", label: "Created by me", icon: MessageSquare },
    { value: "shared", label: "Shared with teammate", icon: Users },
    { value: "assigned", label: "Assigned items", icon: ListTodo },
    { value: "teammate", label: "By teammate", icon: Users },
    { value: "constituent", label: "By constituent", icon: UserRound },
  ];

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
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              marginTop: "18px",
              alignItems: "center",
            }}
          >
            <div
              style={{
                display: "inline-flex",
                border: "1px solid #E5E7EB",
                borderRadius: "999px",
                padding: "4px",
                gap: "4px",
                backgroundColor: "#F9FAFB",
              }}
            >
              {[
                { value: "Open", label: "Open" },
                { value: "Resolved", label: "Resolved" },
              ].map((option) => {
                const selected = statusFilter === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setStatusFilter(option.value)}
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

            <div
              style={{
                display: "inline-flex",
                border: "1px solid #E5E7EB",
                borderRadius: "999px",
                padding: "4px",
                gap: "4px",
                backgroundColor: "#F9FAFB",
                flexWrap: "wrap",
              }}
            >
              {viewTabs.map((tab) => {
                const selected = viewMode === tab.value;
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.value}
                    type="button"
                    onClick={() => setViewMode(tab.value)}
                    style={{
                      border: "none",
                      borderRadius: "999px",
                      padding: "8px 12px",
                      backgroundColor: selected ? "#111827" : "transparent",
                      color: selected ? "white" : "#4B5563",
                      fontSize: "13px",
                      fontWeight: 700,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Icon size={14} />
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {groupedItems.map((group) => (
          <section key={group.key} style={{ marginBottom: "18px" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                gap: "12px",
                marginBottom: "12px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <h2 style={{ margin: "0 0 4px", fontSize: "18px", color: "#111827" }}>
                  {group.label}
                </h2>
                <div style={{ fontSize: "13px", color: "#6B7280" }}>{group.description}</div>
              </div>
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280" }}>
                {group.items.length} item{group.items.length === 1 ? "" : "s"}
              </div>
            </div>
            <div style={{ display: "grid", gap: "12px" }}>
              {group.items.map((item) => (
                <DiscussionCard
                  key={item.id}
                  item={item}
                  onToggle={(currentItem) =>
                    updateMutation.mutate({
                      id: currentItem.id,
                      body: {
                        status: currentItem.status === "Open" ? "Resolved" : "Open",
                      },
                    })
                  }
                  pending={updateMutation.isPending}
                />
              ))}
            </div>
          </section>
        ))}

        {!groupedItems.length ? (
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
            {statusFilter === "Resolved"
              ? "No resolved discussion items in this view yet."
              : "No discussion items match this view yet. Add one from a prospect workspace when you need to capture a talking point, teammate handoff, or internal reminder."}
          </div>
        ) : null}
      </main>
    </div>
  );
}
