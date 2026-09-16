"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  CalendarDays,
  MessageSquare,
  Users,
  UserRound,
  ListTodo,
} from "lucide-react";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import DiscussionConstituentPicker from "@/components/DiscussionConstituentPicker";
import { formatNextStepDate, nextStepDay } from "@/utils/nextStepWorklist";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

const DiscussionNextStepDialog = lazy(() => import("./DiscussionNextStepDialog"));

function formatShortDate(value) {
  if (!value) return "";
  return formatNextStepDate(value);
}

function toDateInputValue(value) {
  return nextStepDay(value);
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

function getLinkedConstituents(item) {
  if (Array.isArray(item.linked_constituents) && item.linked_constituents.length) {
    return item.linked_constituents;
  }
  if (!item.constituent_id || !item.constituent_name) return [];
  return [
    {
      constituent_id: item.constituent_id,
      blackbaudConstituentId: item.blackbaud_constituent_id,
      name: item.constituent_name,
    },
  ];
}

function getAnchorGroupKey(item) {
  if (item.prospect_id) return `prospect-${item.prospect_id}`;
  if (item.constituent_id) return `constituent-${item.constituent_id}`;
  if (item.prospect_opportunity_id) return `opportunity-${item.prospect_opportunity_id}`;
  if (item.initiative_name) return `initiative-${item.initiative_name}`;
  return `general-${getAnchorLabel(item)}`;
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

function classifyMeetingBucket(item) {
  const subject = String(item.subject || "").toLowerCase();
  const body = String(item.body || "").toLowerCase();
  const combined = `${subject} ${body}`;

  if (
    combined.includes("handoff") ||
    combined.includes("assign") ||
    combined.includes("owner") ||
    item.assigned_user_name
  ) {
    return "handoffs";
  }

  if (
    combined.includes("question") ||
    combined.includes("ask about") ||
    combined.includes("need input") ||
    combined.includes("?")
  ) {
    return "questions";
  }

  if (item.due_date) {
    return "followUps";
  }

  return "talkingPoints";
}

async function fetchTeammateOptions() {
  let primaryOptions = [];

  try {
    const response = await fetch("/api/users/mgos");
    const payload = await response.json().catch(() => null);
    if (response.ok) {
      primaryOptions = Array.isArray(payload) ? payload : [];
    }
  } catch (_error) {
    // Fall through to admin access fallback.
  }

  if (primaryOptions.length > 0) {
    return primaryOptions;
  }

  try {
    const response = await fetch("/api/admin/access");
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      return primaryOptions;
    }
    const users = Array.isArray(payload?.users) ? payload.users : [];
    return users
      .filter(
        (user) =>
          user.active !== false &&
          [
            "mgo",
            "advancement_services",
            "executive",
            "admin",
            "reviewer",
            "advancement_admin",
            "executive_admin",
          ].includes(user.role),
      )
      .map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      }));
  } catch (_error) {
    return primaryOptions;
  }
}

function DiscussionCard({
  item,
  onToggle,
  onEdit,
  onSave,
  onCancelEdit,
  teammateOptions,
  editingItem,
  pending,
  recentlySaved,
  onCreateNextStep,
  workspaceId,
}) {
  const anchorLabel = getAnchorLabel(item);
  const isEditing = editingItem?.id === item.id;
  const dueDateLabel = item.due_date ? "Update due date" : "Set due date";
  const linkedConstituents = getLinkedConstituents(item);

  const toggleTaggedUser = (userId) => {
    const normalized = String(userId);
    const current = new Set((editingItem?.taggedUserIds || []).map(String));
    if (current.has(normalized)) {
      current.delete(normalized);
    } else {
      current.add(normalized);
    }
    onEdit(item, { taggedUserIds: Array.from(current) });
  };

  return (
    <div
      id={`discussion-card-${item.id}`}
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
        {item.can_create_next_step && <button type="button" disabled={pending || isEditing}
          onClick={() => onCreateNextStep(item)} className="min-h-11 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-bold text-indigo-800 disabled:opacity-50">
          Create next step
        </button>}
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
        <button
          type="button"
          onClick={() => (isEditing ? onCancelEdit() : onEdit(item))}
          disabled={pending}
          style={{
            border: "1px solid #D1D5DB",
            backgroundColor: isEditing ? "#111827" : "white",
            color: isEditing ? "white" : "#374151",
            borderRadius: "999px",
            padding: "8px 12px",
            fontSize: "12px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          {isEditing ? "Editing details" : "Edit details"}
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
        {recentlySaved ? (
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              borderRadius: "999px",
              padding: "8px 12px",
              backgroundColor: "#ECFDF5",
              color: "#065F46",
              border: "1px solid #A7F3D0",
              fontSize: "12px",
              fontWeight: 700,
            }}
          >
            Saved
          </span>
        ) : null}
      </div>
      {item.next_steps?.length > 0 && <div className="mt-3 grid gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900" aria-label="Linked next steps">
        <p className="font-semibold">Linked next steps</p>
        {item.next_steps.map(task => {
          const topic = linkedConstituents.find(value => task.source_topic_key === (value.blackbaudConstituentId ? `nxt:${value.blackbaudConstituentId}` : `local:${value.constituent_id}`));
          return <div key={task.id} className="flex flex-wrap items-center justify-between gap-2">
            <span>{task.owner_name}{topic ? ` · ${topic.name}` : ""} · {task.status === "Done" ? "Completed" : "Open"}{task.due_date ? ` · Due ${formatShortDate(task.due_date)}` : ""}</span>
            {String(task.owner_user_id) === String(workspaceId) && <a className="inline-flex min-h-11 items-center font-semibold underline"
              href={`/follow-ups?tab=next-steps&nextStepId=${task.id}&status=${task.status}`}>View next step</a>}
          </div>;
        })}
        <p className="text-xs">Follow-up status is separate from this discussion's status.</p>
      </div>}
      {item.tagged_users?.length ? (
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
          {item.tagged_users.map((taggedUser) => (
            <span
              key={`${item.id}-${taggedUser.user_id}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                borderRadius: "999px",
                backgroundColor: "#F5F3FF",
                color: "#5B21B6",
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              @{taggedUser.name || taggedUser.email}
            </span>
          ))}
        </div>
      ) : null}
      {linkedConstituents.length ? (
        <div style={{ marginTop: "12px" }}>
          <div style={{ marginBottom: "6px", color: "#64748B", fontSize: "11px", fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase" }}>
            Discussion topics
          </div>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            {linkedConstituents.map((constituent) => {
              const profileUrl = buildBlackbaudConstituentProfileUrl(
                constituent.blackbaudConstituentId,
              );
              const content = (
                <>
                  <UserRound size={14} aria-hidden="true" />
                  {constituent.name}
                </>
              );
              const style = {
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "7px 10px",
                borderRadius: "999px",
                backgroundColor: "#EFF6FF",
                color: "#1E40AF",
                border: "1px solid #BFDBFE",
                fontSize: "12px",
                fontWeight: 700,
                textDecoration: "none",
              };
              return profileUrl ? (
                <a
                  key={constituent.blackbaudConstituentId || constituent.constituent_id}
                  href={profileUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={style}
                  title="Open NXT profile"
                >
                  {content}
                </a>
              ) : (
                <span
                  key={constituent.constituent_id || constituent.name}
                  style={style}
                >
                  {content}
                </span>
              );
            })}
          </div>
        </div>
      ) : null}
      {isEditing ? (
        <div
          style={{
            marginTop: "14px",
            paddingTop: "14px",
            borderTop: "1px solid #E5E7EB",
            display: "grid",
            gap: "12px",
          }}
        >
          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151" }}>Title</span>
            <input
              value={editingItem.subject}
              onChange={(event) => onEdit(item, { subject: event.target.value })}
              style={{
                width: "100%",
                borderRadius: "12px",
                border: "1px solid #D1D5DB",
                padding: "10px 12px",
                fontSize: "14px",
              }}
            />
          </label>

          <label style={{ display: "grid", gap: "6px" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151" }}>Notes</span>
            <textarea
              rows={3}
              value={editingItem.body}
              onChange={(event) => onEdit(item, { body: event.target.value })}
              style={{
                width: "100%",
                borderRadius: "12px",
                border: "1px solid #D1D5DB",
                padding: "10px 12px",
                fontSize: "14px",
                resize: "vertical",
              }}
            />
          </label>

          <DiscussionConstituentPicker
            selected={editingItem.linkedConstituents || []}
            onChange={(linkedConstituents) => onEdit(item, { linkedConstituents })}
            disabled={pending}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
              gap: "12px",
            }}
          >
            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151" }}>
                {dueDateLabel}
              </span>
              <input
                type="date"
                value={editingItem.dueDate}
                onChange={(event) => onEdit(item, { dueDate: event.target.value })}
                style={{
                  width: "100%",
                  borderRadius: "12px",
                  border: "1px solid #D1D5DB",
                  padding: "10px 12px",
                  fontSize: "14px",
                }}
              />
            </label>

            <label style={{ display: "grid", gap: "6px" }}>
              <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151" }}>Assign to teammate</span>
              <select
                value={editingItem.assignedUserId}
                onChange={(event) => onEdit(item, { assignedUserId: event.target.value })}
                style={{
                  width: "100%",
                  borderRadius: "12px",
                  border: "1px solid #D1D5DB",
                  padding: "10px 12px",
                  fontSize: "14px",
                }}
              >
                <option value="">No assignee</option>
                {teammateOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name || option.email}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div style={{ display: "grid", gap: "8px" }}>
            <div style={{ fontSize: "12px", fontWeight: 700, color: "#374151" }}>
              Tag additional people
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
              {teammateOptions.map((option) => {
                const selected = (editingItem.taggedUserIds || []).map(String).includes(
                  String(option.id),
                );
                return (
                  <button
                    key={`tag-${item.id}-${option.id}`}
                    type="button"
                    onClick={() => toggleTaggedUser(option.id)}
                    style={{
                      border: selected ? "1px solid #6A5BFF" : "1px solid #D1D5DB",
                      backgroundColor: selected ? "#F5F3FF" : "white",
                      color: selected ? "#5B21B6" : "#374151",
                      borderRadius: "999px",
                      padding: "8px 12px",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    @{option.name || option.email}
                  </button>
                );
              })}
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => onSave(item)}
              disabled={pending || !editingItem.subject.trim()}
              style={{
                border: "none",
                backgroundColor: "#6A5BFF",
                color: "white",
                borderRadius: "999px",
                padding: "10px 14px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {pending ? "Saving..." : "Save changes"}
            </button>
            <button
              type="button"
              onClick={onCancelEdit}
              disabled={pending}
              style={{
                border: "1px solid #D1D5DB",
                backgroundColor: "white",
                color: "#374151",
                borderRadius: "999px",
                padding: "10px 14px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function TeamDiscussionView({ user, workspaceId, active = true }) {
  const [nextStepItem, setNextStepItem] = useState(null);
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("status") === "Resolved" ? "Resolved" : "Open");
  const openedLink = useRef(null);
  const [viewMode, setViewMode] = useState("date");
  const [editingItem, setEditingItem] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createSubject, setCreateSubject] = useState("");
  const [createBody, setCreateBody] = useState("");
  const [createDueDate, setCreateDueDate] = useState("");
  const [createAssignedUserId, setCreateAssignedUserId] = useState("");
  const [createTaggedUserIds, setCreateTaggedUserIds] = useState([]);
  const [createLinkedConstituents, setCreateLinkedConstituents] = useState([]);
  const [createError, setCreateError] = useState("");
  const [recentlySavedId, setRecentlySavedId] = useState(null);

  const { data: discussionItems = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["team-discussion", user.id, workspaceId, statusFilter],
    queryFn: async () => {
      const response = await fetch(`/api/discussion-items?status=${encodeURIComponent(statusFilter)}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load discussion items");
      }
      return payload;
    },
    enabled: active,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const { data: teammateOptions = [] } = useQuery({
    queryKey: ["discussion-teammates", user.id, workspaceId],
    queryFn: fetchTeammateOptions,
    enabled: active,
    refetchOnWindowFocus: false,
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
    onSuccess: (_payload, variables) => {
      setRecentlySavedId(String(variables.id));
      setEditingItem(null);
      queryClient.invalidateQueries({ queryKey: ["team-discussion"] });
    },
  });
  const createMutation = useMutation({
    mutationFn: async (body) => {
      const response = await fetch("/api/discussion-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to create discussion item");
      }
      return payload;
    },
    onSuccess: () => {
      setShowCreateForm(false);
      setCreateSubject("");
      setCreateBody("");
      setCreateDueDate("");
      setCreateAssignedUserId("");
      setCreateTaggedUserIds([]);
      setCreateLinkedConstituents([]);
      setCreateError("");
      queryClient.invalidateQueries({ queryKey: ["team-discussion"] });
    },
    onError: (error) => {
      setCreateError(error instanceof Error ? error.message : "Failed to create discussion item");
    },
  });

  useEffect(() => {
    if (!editingItem) return;
    const freshItem = discussionItems.find((item) => item.id === editingItem.id);
    if (!freshItem) {
      setEditingItem(null);
    }
  }, [discussionItems, editingItem]);

  useEffect(() => {
    if (!recentlySavedId) return undefined;
    const timeoutId = window.setTimeout(() => {
      setRecentlySavedId(null);
    }, 2500);
    return () => window.clearTimeout(timeoutId);
  }, [recentlySavedId]);

  useEffect(() => {
    if (typeof window === "undefined" || !discussionItems.length) return;

    const params = new URLSearchParams(window.location.search);
    const discussionId = params.get("discussionId");
    const shouldEdit = params.get("edit") === "1";
    if (!discussionId || openedLink.current === discussionId) return;

    const matchedItem = discussionItems.find(
      (item) => String(item.id) === String(discussionId),
    );
    if (!matchedItem) return;
    openedLink.current = discussionId;

    if (shouldEdit) setEditingItem({
      id: matchedItem.id,
      subject: matchedItem.subject || "",
      body: matchedItem.body || "",
      dueDate: toDateInputValue(matchedItem.due_date),
      assignedUserId: matchedItem.assigned_user_id
        ? String(matchedItem.assigned_user_id)
        : "",
      taggedUserIds: (matchedItem.tagged_users || []).map((taggedUser) =>
        String(taggedUser.user_id),
      ),
      linkedConstituents: getLinkedConstituents(matchedItem),
    });
    setViewMode("date");
    setStatusFilter(matchedItem.status || "Open");

    window.setTimeout(() => {
      const target = document.getElementById(`discussion-card-${matchedItem.id}`);
      target?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }, [discussionItems]);

  const filteredItems = useMemo(() => {
    const currentUserId = Number(workspaceId || 0);

    if (viewMode === "assignedToMe") {
      return discussionItems.filter(
        (item) => Number(item.assigned_user_id || 0) === currentUserId,
      );
    }
    return discussionItems;
  }, [discussionItems, workspaceId, viewMode]);

  const groupedItems = useMemo(() => {
    if (viewMode === "assignment") {
      return groupItems(filteredItems, (item) => ({
        key: item.assigned_user_id ? `assigned-${item.assigned_user_id}` : "unassigned",
        label: item.assigned_user_name || "No assignee",
        description: item.assigned_user_name
          ? "Discussion items owned by this teammate"
          : "Discussion items still waiting for an owner",
      }));
    }

    if (viewMode === "constituent") {
      const constituentItems = filteredItems.flatMap((item) => {
        const linked = getLinkedConstituents(item);
        return linked.length
          ? linked.map((constituent) => ({ ...item, constituent_group: constituent }))
          : [item];
      });
      return groupItems(constituentItems, (item) => {
        const constituent = item.constituent_group;
        const anchorLabel = constituent?.name || getAnchorLabel(item);
        return {
          key: constituent
            ? `constituent-${constituent.blackbaudConstituentId || constituent.constituent_id}`
            : getAnchorGroupKey(item),
          label: anchorLabel,
          description: constituent
            ? "Discussion connected to this constituent"
            : item.prospect_name
            ? "Discussion connected to a prospect workspace"
            : item.constituent_name
              ? "Discussion connected to a constituent"
              : item.opportunity_title
                ? "Discussion connected to an opportunity"
                : "General discussion thread",
        };
      });
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

    if (viewMode === "meeting") {
      const buckets = {
        talkingPoints: [],
        questions: [],
        handoffs: [],
        followUps: [],
      };

      filteredItems.forEach((item) => {
        buckets[classifyMeetingBucket(item)].push(item);
      });

      return [
        {
          key: "meeting-talking-points",
          label: "Talking points",
          description: "Items to raise in conversation or keep visible during the meeting",
          items: buckets.talkingPoints,
        },
        {
          key: "meeting-open-questions",
          label: "Open questions",
          description: "Items where you need an answer, decision, or guidance",
          items: buckets.questions,
        },
        {
          key: "meeting-handoffs",
          label: "Handoffs",
          description: "Items with a teammate owner or explicit handoff need",
          items: buckets.handoffs,
        },
        {
          key: "meeting-follow-ups",
          label: "Follow-up reminders",
          description: "Items that already have a due date or next follow-up attached",
          items: buckets.followUps,
        },
      ].filter((group) => group.items.length);
    }

    const buckets = {
      overdue: [],
      upcoming: [],
      unscheduled: [],
    };

    const today = getStandingsPeriods().asOf;
    filteredItems.forEach((item) => {
      const due = nextStepDay(item.due_date);
      if (!due) {
        buckets.unscheduled.push(item);
        return;
      }
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

  if (isLoading) {
    return (
      <div
        style={{
          minHeight: "140px",
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

  const viewTabs = [
    { value: "date", label: "By date", icon: CalendarDays },
    { value: "constituent", label: "By person", icon: UserRound },
    { value: "assignment", label: "By assignment", icon: Users },
    { value: "assignedToMe", label: "Assigned to me", icon: ListTodo },
    { value: "meeting", label: "Meeting view", icon: ListTodo },
  ];

  if (isError) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-900">
    Team Discussion could not be loaded. <button type="button" className="underline" onClick={() => refetch()}>Try again</button>
  </div>;

  const toggleCreateTaggedUser = (userId) => {
    const normalized = String(userId);
    setCreateTaggedUserIds((current) => {
      const next = new Set(current.map(String));
      if (next.has(normalized)) {
        next.delete(normalized);
      } else {
        next.add(normalized);
      }
      return Array.from(next);
    });
  };

  const handleCreateDiscussionItem = () => {
    setCreateError("");
    createMutation.mutate({
      subject: createSubject,
      body: createBody,
      dueDate: createDueDate || null,
      assignedUserId: createAssignedUserId || null,
      taggedUserIds: createTaggedUserIds,
      linkedConstituents: createLinkedConstituents,
    });
  };

  return (
    <div
      style={{
        backgroundColor: "#F9FAFB",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <div>
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
              <h2 style={{ margin: "0 0 8px", fontSize: "22px", color: "#111827" }}>
                Team discussion
              </h2>
              <p style={{ margin: 0, fontSize: "15px", color: "#4B5563", lineHeight: 1.6 }}>
                Work talking points, handoffs, open questions, and follow-up tied to real fundraising work.
              </p>
            </div>
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

          <div
            style={{
              marginTop: "16px",
              paddingTop: "16px",
              borderTop: "1px solid #E5E7EB",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827", marginBottom: "4px" }}>
                  Add discussion item
                </div>
                <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.5 }}>
                  Capture a talking point, handoff, or open question without leaving this workspace.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateForm((current) => !current)}
                style={{
                  border: "1px solid #D1D5DB",
                  backgroundColor: showCreateForm ? "#111827" : "white",
                  color: showCreateForm ? "white" : "#374151",
                  borderRadius: "999px",
                  padding: "9px 14px",
                  fontSize: "12px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {showCreateForm ? "Hide composer" : "Add discussion item"}
              </button>
            </div>

            {showCreateForm ? (
              <div
                style={{
                  display: "grid",
                  gap: "12px",
                  marginTop: "14px",
                  padding: "16px",
                  borderRadius: "16px",
                  backgroundColor: "#F9FAFB",
                  border: "1px solid #E5E7EB",
                }}
              >
                <label style={{ display: "grid", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151" }}>Title</span>
                  <input
                    value={createSubject}
                    onChange={(event) => setCreateSubject(event.target.value)}
                    placeholder="What do we need to discuss?"
                    style={{
                      width: "100%",
                      borderRadius: "12px",
                      border: "1px solid #D1D5DB",
                      padding: "10px 12px",
                      fontSize: "14px",
                    }}
                  />
                </label>

                <label style={{ display: "grid", gap: "6px" }}>
                  <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151" }}>Notes</span>
                  <textarea
                    rows={3}
                    value={createBody}
                    onChange={(event) => setCreateBody(event.target.value)}
                    placeholder="Context, talking points, or handoff details"
                    style={{
                      width: "100%",
                      borderRadius: "12px",
                      border: "1px solid #D1D5DB",
                      padding: "10px 12px",
                      fontSize: "14px",
                      resize: "vertical",
                    }}
                  />
                </label>

                <DiscussionConstituentPicker
                  selected={createLinkedConstituents}
                  onChange={setCreateLinkedConstituents}
                  disabled={createMutation.isPending}
                />

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "12px",
                  }}
                >
                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151" }}>Due date</span>
                    <input
                      type="date"
                      value={createDueDate}
                      onChange={(event) => setCreateDueDate(event.target.value)}
                      style={{
                        width: "100%",
                        borderRadius: "12px",
                        border: "1px solid #D1D5DB",
                        padding: "10px 12px",
                        fontSize: "14px",
                      }}
                    />
                  </label>

                  <label style={{ display: "grid", gap: "6px" }}>
                    <span style={{ fontSize: "12px", fontWeight: 700, color: "#374151" }}>Assign to teammate</span>
                    <select
                      value={createAssignedUserId}
                      onChange={(event) => setCreateAssignedUserId(event.target.value)}
                      style={{
                        width: "100%",
                        borderRadius: "12px",
                        border: "1px solid #D1D5DB",
                        padding: "10px 12px",
                        fontSize: "14px",
                      }}
                    >
                      <option value="">No assignee</option>
                      {teammateOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name || option.email}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                <div style={{ display: "grid", gap: "8px" }}>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#374151" }}>
                    Tag additional people
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                    {teammateOptions.map((option) => {
                      const selected = createTaggedUserIds.map(String).includes(String(option.id));
                      return (
                        <button
                          key={`create-tag-${option.id}`}
                          type="button"
                          onClick={() => toggleCreateTaggedUser(option.id)}
                          style={{
                            border: selected ? "1px solid #6A5BFF" : "1px solid #D1D5DB",
                            backgroundColor: selected ? "#F5F3FF" : "white",
                            color: selected ? "#5B21B6" : "#374151",
                            borderRadius: "999px",
                            padding: "8px 12px",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          @{option.name || option.email}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {createError ? (
                  <div style={{ fontSize: "12px", color: "#991B1B" }}>{createError}</div>
                ) : null}

                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleCreateDiscussionItem}
                    disabled={createMutation.isPending || !createSubject.trim()}
                    style={{
                      border: "none",
                      backgroundColor: "#6A5BFF",
                      color: "white",
                      borderRadius: "999px",
                      padding: "10px 14px",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {createMutation.isPending ? "Creating..." : "Create discussion item"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateForm(false);
                      setCreateError("");
                    }}
                    disabled={createMutation.isPending}
                    style={{
                      border: "1px solid #D1D5DB",
                      backgroundColor: "white",
                      color: "#374151",
                      borderRadius: "999px",
                      padding: "10px 14px",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
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
                  workspaceId={workspaceId}
                  onCreateNextStep={setNextStepItem}
                  teammateOptions={teammateOptions}
                  editingItem={editingItem}
                  onEdit={(currentItem, partial = {}) => {
                    setEditingItem((previous) => {
                      if (!previous || previous.id !== currentItem.id) {
                        return {
                          id: currentItem.id,
                          subject: currentItem.subject || "",
                          body: currentItem.body || "",
                          dueDate: toDateInputValue(currentItem.due_date),
                          assignedUserId: currentItem.assigned_user_id
                            ? String(currentItem.assigned_user_id)
                            : "",
                          taggedUserIds: (currentItem.tagged_users || []).map((taggedUser) =>
                            String(taggedUser.user_id),
                          ),
                          linkedConstituents: getLinkedConstituents(currentItem),
                          ...partial,
                        };
                      }
                      return { ...previous, ...partial };
                    });
                  }}
                  onSave={(currentItem) => {
                    if (!editingItem || editingItem.id !== currentItem.id) return;
                    updateMutation.mutate({
                      id: currentItem.id,
                      body: {
                        subject: editingItem.subject,
                        body: editingItem.body,
                        dueDate: editingItem.dueDate || null,
                        assignedUserId: editingItem.assignedUserId || null,
                        taggedUserIds: editingItem.taggedUserIds || [],
                        linkedConstituents: editingItem.linkedConstituents || [],
                      },
                    });
                  }}
                  onCancelEdit={() => setEditingItem(null)}
                  onToggle={(currentItem) =>
                    updateMutation.mutate({
                      id: currentItem.id,
                      body: {
                        status: currentItem.status === "Open" ? "Resolved" : "Open",
                      },
                    })
                  }
                  pending={updateMutation.isPending}
                  recentlySaved={recentlySavedId === String(item.id)}
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
      </div>
      {nextStepItem && <Suspense fallback={<p role="status">Opening next-step form...</p>}>
        <DiscussionNextStepDialog item={nextStepItem} viewerId={user.id} workspaceId={workspaceId}
          onClose={() => setNextStepItem(null)} onSaved={() => {
            for (const key of ["team-discussion", "next-step-worklist", "pending-actions", "worklist"])
              queryClient.invalidateQueries({ queryKey: [key] });
          }} />
      </Suspense>}
    </div>
  );
}
