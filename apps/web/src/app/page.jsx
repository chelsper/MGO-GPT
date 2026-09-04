"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import useUser from "@/utils/useUser";
import useWorkspaceView from "@/utils/useWorkspaceView";
import WorkQueueAlertBadge from "@/components/WorkQueueAlertBadge";
import {
  canManageWorkspaceRole,
  canUseExecutiveViewRole,
  canViewWorkspaceAsRole,
  getWorkspaceRoleLabel,
} from "@/utils/workspaceRoles";
const MGO_ACTIONS = [
  {
    title: "My Prospects",
    href: "/my-top-prospects",
    description: "Work your ranked portfolio, next steps, and opportunity momentum.",
    section: "myWork",
  },
  {
    title: "My Reports",
    href: "/reports",
    description: "Review current fiscal-year portfolio giving and shared engagement reports.",
    section: "myWork",
  },
  {
    title: "Team Discussion",
    href: "/team-discussion",
    description: "Keep internal talking points, handoffs, and meeting prep tied to real work.",
    section: "myWork",
  },
  {
    title: "Log Update",
    href: "/action-opportunity-update",
    description: "Log an Action, update an Opportunity, and set the next step.",
    section: "teamSupport",
  },
  {
    title: "Knowledge Base",
    href: "/knowledge-base",
    description: "Search standards, scripts, and process guidance.",
    section: "teamSupport",
  },
  {
    title: "Find a Constituent",
    href: "/constituent-lookup",
    description: "Search Raiser's Edge NXT and open a constituent profile when needed.",
    section: "teamSupport",
  },
  {
    title: "Submission Tracker",
    href: "/submissions",
    description: "Check clarification requests and review outcomes when you need them.",
    section: "requestsReview",
  },
  {
    title: "Request List from DevData",
    href: "/request-list",
    description: "Request lists and reporting support from Advancement Services.",
    section: "requestsReview",
  },
  {
    title: "Request Data Update",
    href: "/data-requests",
    description: "Send contact updates or corrected constituent information to Advancement Services.",
    section: "requestsReview",
  },
  {
    title: "Suggest New Constituent",
    href: "/new-constituent",
    description: "Add a new constituent lead or suggest a record for review.",
    section: "requestsReview",
  },
];

const REVIEWER_ACTIONS = [
  {
    title: "Work Queue",
    href: "/submissions",
    description: "Review data updates, list requests, import batches, and NXT exceptions.",
    section: "requestsReview",
  },
  {
    title: "List Request Queue",
    href: "/list-requests",
    description: "Prioritize DevData requests in one shared Advancement Services queue.",
    section: "requestsReview",
  },
  {
    title: "Data Request Queue",
    href: "/data-requests",
    description: "Work contact updates and constituent record corrections from MGOs.",
    section: "requestsReview",
  },
  {
    title: "Constituency Import Preview",
    href: "/constituency-import",
    description: "Preview bulk constituency imports and hierarchy changes before NXT writes.",
    section: "requestsReview",
  },
  {
    title: "Family Import",
    href: "/family-import",
    description: "Create or link parents and family relationships in a separate, staged NXT workflow.",
    section: "requestsReview",
  },
  {
    title: "Prospect Pool",
    href: "/prospect-pool",
    description: "Assign new prospects to MGOs and track contact info requests.",
    section: "myWork",
  },
  {
    title: "Team Discussion",
    href: "/team-discussion",
    description: "Review internal discussion items tied to constituents, teammates, and opportunities.",
    section: "teamSupport",
  },
  {
    title: "Knowledge Base",
    href: "/knowledge-base",
    description: "Review standards, examples, and published guidance.",
    section: "teamSupport",
  },
  {
    title: "Find a Constituent",
    href: "/constituent-lookup",
    description: "Search Raiser's Edge NXT and open a constituent profile when needed.",
    section: "teamSupport",
  },
  {
    title: "Edit Knowledge Base",
    href: "/knowledge-base/manage",
    description: "Update shared standards, examples, and guidance.",
    section: "teamSupport",
  },
];

const ADMIN_ACTIONS = [
  ...REVIEWER_ACTIONS,
  {
    title: "Blackbaud Mapping",
    href: "/blackbaud-mapping",
    description: "Define which app fields should map to NXT and which system owns each field.",
  },
  {
    title: "Access Management",
    href: "/access-management",
    description: "Invite JU users and manage workspace roles.",
  },
  {
    title: "Organization Settings",
    href: "/organization-configurations",
    description: "Configure organization profile, email notifications, and giving societies.",
  },
  {
    title: "Report Access & Configurations",
    href: "/report-configurations",
    description: "Manage shared report access, presentation, and supported data settings.",
  },
];

const ADMIN_WORKSPACE_ITEMS = [
  {
    label: "Field Settings",
    href: "/blackbaud-mapping",
    section: "Admin & Workspace",
    description: "Manage field mapping, ownership, and NXT sync behavior.",
  },
  {
    label: "Security & Access",
    href: "/access-management",
    section: "Admin & Workspace",
    description: "Manage workspace users, roles, invitations, and access.",
  },
  {
    label: "Organization Settings",
    href: "/organization-configurations",
    section: "Admin & Workspace",
    description: "Manage organization profile, email notifications, and giving society definitions.",
  },
  {
    label: "Report Access & Configurations",
    href: "/report-configurations",
    section: "Admin & Workspace",
    description: "Manage shared report access, presentation, and supported data settings.",
  },
  {
    label: "Knowledge Base Admin",
    href: "/knowledge-base/manage",
    section: "Admin & Workspace",
    description: "Edit shared standards, examples, and published guidance.",
  },
];

const PRIMARY_ACTION_PATHS = {
  mgo: ["/my-top-prospects", "/reports", "/team-discussion"],
  reviewer: ["/prospect-pool", "/team-discussion", "/knowledge-base/manage"],
  adminReviewer: ["/access-management", "/prospect-pool", "/team-discussion"],
};

const ROLE_WORKFLOW_STEPS = {
  mgo: [
    "Work My Prospects to move the right constituents forward.",
    "Use Team Discussion for handoffs, talking points, and follow-up with teammates.",
  ],
  reviewer: [
    "Review the pending submission queue first.",
    "Assign or enrich names in Prospect Pool.",
    "Clear list requests and knowledge updates next.",
  ],
  adminReviewer: [
    "Handle access or role changes first.",
    "Work the shared reviewer queues next.",
    "Use workspace admin tools only when access, mapping, or configuration needs attention.",
  ],
};

function getActionGroups({ isAdmin, isReviewer, quickActions }) {
  const key = isAdmin && isReviewer ? "adminReviewer" : isReviewer ? "reviewer" : "mgo";
  const primaryPaths = PRIMARY_ACTION_PATHS[key];
  const primary = quickActions.filter(
    (action) => action.section === "myWork" && primaryPaths.includes(action.href),
  );
  const teamSupport = quickActions.filter((action) => action.section === "teamSupport");
  const requestsReview = quickActions.filter((action) => action.section === "requestsReview");
  return { primary, teamSupport, requestsReview, workflow: ROLE_WORKFLOW_STEPS[key] };
}

function DiscussionAlertBadge({ count, compact = false }) {
  if (!count) return null;

  return (
    <span
      aria-label={`${count} open team discussion ${count === 1 ? "item" : "items"}`}
      title={`${count} open team discussion ${count === 1 ? "item" : "items"}`}
      style={{
        display: "inline-grid",
        placeItems: "center",
        minWidth: compact ? "18px" : "24px",
        height: compact ? "18px" : "24px",
        borderRadius: "999px",
        backgroundColor: "#F59E0B",
        color: "white",
        fontSize: compact ? "11px" : "13px",
        fontWeight: 900,
        lineHeight: 1,
        boxShadow: "0 0 0 3px rgba(245, 158, 11, 0.16)",
      }}
    >
      !
    </span>
  );
}

function parseWorklistDate(value) {
  const datePart = String(value || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;

  const timestamp = new Date(`${datePart}T00:00:00`).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
}

function formatWorklistDueDate(value) {
  const timestamp = parseWorklistDate(value);
  if (!timestamp) return "No date";

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(timestamp));
}

function getHomepageAttentionItems(worklist) {
  const today = new Date();
  const todayTimestamp = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
  ).getTime();
  const upcomingEndTimestamp = todayTimestamp + 7 * 24 * 60 * 60 * 1000;
  const overdue = [];
  const upcoming = [];

  const addItem = (bucket, item) => {
    if (!item?.dueDate) return;
    bucket.push(item);
  };

  (Array.isArray(worklist?.overdueNextSteps) ? worklist.overdueNextSteps : []).forEach((item) => {
    addItem(overdue, {
      id: `next-step-${item.id}`,
      source: "Next step",
      title: item.next_action_text || "Untitled next step",
      context: item.prospect_name || "Prospect",
      dueDate: item.next_action_due_date,
      href: `/my-top-prospects?prospectId=${encodeURIComponent(item.id)}&panel=next-step`,
    });
  });

  (Array.isArray(worklist?.upcomingNextSteps) ? worklist.upcomingNextSteps : []).forEach((item) => {
    addItem(upcoming, {
      id: `next-step-${item.id}`,
      source: "Next step",
      title: item.next_action_text || "Untitled next step",
      context: item.prospect_name || "Prospect",
      dueDate: item.next_action_due_date,
      href: `/my-top-prospects?prospectId=${encodeURIComponent(item.id)}&panel=next-step`,
    });
  });

  (Array.isArray(worklist?.discussionItems) ? worklist.discussionItems : []).forEach((item) => {
    const dueTimestamp = parseWorklistDate(item.due_date);
    if (!dueTimestamp) return;

    const discussionItem = {
      id: `discussion-${item.id}`,
      source: "Team discussion",
      title: item.subject || "Untitled discussion",
      context: item.prospect_name || item.assigned_user_name || "Team discussion",
      dueDate: item.due_date,
      href: "/team-discussion",
    };

    if (dueTimestamp < todayTimestamp) {
      addItem(overdue, discussionItem);
    } else if (dueTimestamp <= upcomingEndTimestamp) {
      addItem(upcoming, discussionItem);
    }
  });

  const sortByDueDate = (left, right) => {
    const leftTimestamp = parseWorklistDate(left.dueDate) || Number.MAX_SAFE_INTEGER;
    const rightTimestamp = parseWorklistDate(right.dueDate) || Number.MAX_SAFE_INTEGER;
    return leftTimestamp - rightTimestamp;
  };

  return {
    overdue: overdue.sort(sortByDueDate).slice(0, 3),
    upcoming: upcoming.sort(sortByDueDate).slice(0, 3),
  };
}

export default function Page() {
  const queryClient = useQueryClient();
  const { data: user, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [workspaceSwitchMessage, setWorkspaceSwitchMessage] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = "/account/signin";
    }
  }, [loading, user]);

  useEffect(() => {
    if (!user) return;

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
      } catch (error) {
        console.error(error);
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
  }, [user]);

  const { isAdmin, adminViewMode, effectiveRole, isMgoView, isReviewerView, setViewMode } = useWorkspaceView(
    profile?.role,
  );
  const isReviewer = isReviewerView;
  const canManageWorkspace = canManageWorkspaceRole(profile?.role);
  const canSwitchMgoWorkspace = canUseExecutiveViewRole(profile?.role);
  const roleLabel = isAdmin
    ? `Admin · ${isReviewer ? "Advancement Services view" : "MGO view"}`
    : getWorkspaceRoleLabel(profile?.role) || (isReviewer ? "Advancement Services" : "MGO");

  const quickActions = useMemo(
    () => {
      if (!isAdmin && !canManageWorkspace) {
        return isReviewer ? REVIEWER_ACTIONS : MGO_ACTIONS;
      }

      return isReviewer ? ADMIN_ACTIONS : MGO_ACTIONS;
    },
    [canManageWorkspace, isAdmin, isReviewer],
  );
  const { primary: primaryActions, teamSupport, requestsReview, workflow } = useMemo(
    () => getActionGroups({ isAdmin: isAdmin || canManageWorkspace, isReviewer, quickActions }),
    [canManageWorkspace, isAdmin, isReviewer, quickActions],
  );
  const adminWorkspaceItems = useMemo(
    () => ((isAdmin || canManageWorkspace) && isReviewer ? ADMIN_WORKSPACE_ITEMS : []),
    [canManageWorkspace, isAdmin, isReviewer],
  );
  const {
    data: actingWorkspaceStatus,
  } = useQuery({
    queryKey: ["acting-workspace-status", profile?.id, effectiveRole],
    queryFn: async () => {
      const response = await fetch("/api/admin/workspace-user");
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load acting workspace");
      }
      return payload;
    },
    enabled: Boolean(canSwitchMgoWorkspace && isMgoView),
  });
  const {
    data: mgoUsers = [],
  } = useQuery({
    queryKey: ["workspace-mgo-users", profile?.id, effectiveRole],
    queryFn: async () => {
      const response = await fetch("/api/users/mgos");
      const payload = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load MGO users");
      }
      return Array.isArray(payload) ? payload : [];
    },
    enabled: Boolean(canSwitchMgoWorkspace && isMgoView),
  });
  const actingUser = actingWorkspaceStatus?.actingUser || null;
  const { data: worklist, isError: worklistFailed } = useQuery({
    queryKey: ["app-shell-worklist", profile?.id, effectiveRole],
    queryFn: async () => {
      const response = await fetch(`/api/worklist?view=${encodeURIComponent(isReviewer ? "reviewer" : "mgo")}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load worklist");
      }
      return payload;
    },
    enabled: Boolean(user && profile),
    staleTime: 60 * 1000,
    refetchInterval: isReviewer ? 60 * 1000 : false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: isReviewer ? "always" : true,
  });
  const queueCounts = isReviewer ? worklist?.queueCounts : undefined;
  const openDiscussionItems = Number(worklist?.summary?.openDiscussionItems || 0);
  const attentionItems = useMemo(() => getHomepageAttentionItems(worklist), [worklist]);
  const hasAttentionItems = isMgoView && (attentionItems.overdue.length || attentionItems.upcoming.length);

  async function handleViewModeChange(nextMode) {
    if (!isAdmin) return;

    if (nextMode === "mgo") {
      try {
        await fetch("/api/admin/workspace-user", { method: "DELETE" });
      } catch (error) {
        console.error("Failed to clear acting workspace user:", error);
      }
    }

    setWorkspaceSwitchMessage("");
    setViewMode(nextMode);

    if (nextMode === "mgo" && typeof window !== "undefined") {
      window.location.replace("/");
    }
  }

  async function handleActingWorkspaceChange(nextUserId) {
    if (!canSwitchMgoWorkspace || !isMgoView) return;

    try {
      setWorkspaceSwitchMessage("");

      if (!nextUserId || String(nextUserId) === String(profile?.id || "")) {
        const response = await fetch("/api/admin/workspace-user", { method: "DELETE" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to return to your workspace");
        }
        queryClient.setQueryData(["acting-workspace-status", profile?.id, effectiveRole], {
          adminUser: profile,
          actingUser: null,
        });
        setWorkspaceSwitchMessage("Viewing your MGO workspace");
      } else {
        const response = await fetch("/api/admin/workspace-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: Number(nextUserId) }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to switch MGO workspace");
        }
        queryClient.setQueryData(["acting-workspace-status", profile?.id, effectiveRole], {
          adminUser: profile,
          actingUser: payload?.actingUser || null,
        });
        setWorkspaceSwitchMessage(
          payload?.actingUser?.name
            ? `Viewing ${payload.actingUser.name}'s MGO workspace`
            : "Workspace updated",
        );
      }

      if (typeof window !== "undefined") {
        window.location.replace("/");
      }
    } catch (error) {
      console.error("Failed to switch acting MGO workspace:", error);
      setWorkspaceSwitchMessage(
        error instanceof Error ? error.message : "Failed to switch workspace",
      );
    }
  }

  if (loading || !user || profileLoading) {
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

  const primarySectionStyle = {
    background:
      "linear-gradient(180deg, rgba(0, 122, 94, 0.06) 0%, rgba(0, 122, 94, 0.02) 100%)",
    border: "1px solid rgba(0, 122, 94, 0.22)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7)",
  };

  const secondaryCardStyle = {
    backgroundColor: "#FBFDFC",
    border: "1px solid rgba(0, 122, 94, 0.12)",
  };

  const supportCardStyle = {
    backgroundColor: "#FCFCFD",
    border: "1px solid #F3F4F6",
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#F9FAFB",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <main style={{ maxWidth: "960px", margin: "0 auto", padding: "24px 18px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <img
            src="https://ucarecdn.com/8291db54-6f2a-43f4-9fc2-e6ced1ab623d/-/format/auto/"
            alt="MGO-GPT Logo"
            style={{ width: "30px", height: "30px", borderRadius: "8px" }}
          />
          <h1 style={{ margin: 0, fontSize: "28px", color: "#111827", fontWeight: 800 }}>
            {isAdmin
              ? isReviewer
                ? "Advancement Services workspace"
                : "MGO Workspace"
              : isReviewer
                ? "Advancement Services Hub"
                : "Today"}
          </h1>
        </div>

        <p style={{ margin: "0 0 6px", color: "#111827", fontSize: "16px", fontWeight: 600 }}>
          {profile?.name || user?.name || user?.email}
        </p>
        <p style={{ margin: "0 0 18px", color: "#6B7280", fontSize: "14px" }}>
          {isAdmin
            ? isReviewer
              ? "Work the shared queues and keep team momentum moving."
              : "Work the MGO companion layer while keeping admin tools available in the background."
            : isReviewer
              ? "Review submissions, manage shared queues, and keep the knowledge base current."
              : "Work your prospects, log fundraising movement, and keep next steps moving."}
        </p>

        {isAdmin ? (
          <div
            style={{
              marginBottom: "16px",
              backgroundColor: "#FCFCFD",
              border: "1px solid #E5E7EB",
              borderRadius: "14px",
              padding: "14px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
            }}
          >
              <div>
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: "#6B7280",
                    marginBottom: "6px",
                  }}
                >
                  Workspace view
                </div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#111827" }}>
                You are currently in {isReviewer ? "Advancement Services" : "MGO"} view.
              </div>
              <div style={{ marginTop: "4px", fontSize: "13px", color: "#6B7280" }}>
                Switch view when you need to test or manage another workflow.
              </div>
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
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
                  { value: "reviewer", label: "Advancement Services" },
                  { value: "mgo", label: "MGO" },
                ].map((option) => {
                  const active = adminViewMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => handleViewModeChange(option.value)}
                      style={{
                        border: "none",
                        borderRadius: "999px",
                        padding: "8px 12px",
                        fontSize: "13px",
                        fontWeight: 700,
                        cursor: "pointer",
                        color: active ? "white" : "#4B5563",
                        backgroundColor: active ? "#6A5BFF" : "transparent",
                      }}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              {canSwitchMgoWorkspace && isMgoView ? (
                <div style={{ minWidth: "240px", flex: "1 1 260px" }}>
                  <select
                    value={actingUser?.id || profile?.id || ""}
                    onChange={(event) => handleActingWorkspaceChange(event.target.value)}
                    style={{
                      width: "100%",
                      border: "1px solid #D1D5DB",
                      borderRadius: "10px",
                      padding: "10px 12px",
                      fontSize: "13px",
                      color: "#111827",
                      backgroundColor: "white",
                    }}
                  >
                    <option value={profile?.id || ""}>View as: My workspace</option>
                    {mgoUsers
                      .filter(
                        (mgoUser) =>
                          canViewWorkspaceAsRole(profile?.role, mgoUser.role) &&
                          String(mgoUser.id) !== String(profile?.id || ""),
                      )
                      .map((mgoUser) => (
                        <option key={mgoUser.id} value={mgoUser.id}>
                          View as: {mgoUser.name || mgoUser.email}
                          {getWorkspaceRoleLabel(mgoUser.role) === "Executive"
                            ? " (Executive)"
                            : ""}
                        </option>
                      ))}
                  </select>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {workspaceSwitchMessage ? (
          <div
            style={{
              marginBottom: "12px",
              fontSize: "13px",
              color: workspaceSwitchMessage.toLowerCase().includes("failed") ? "#B91C1C" : "#4B5563",
            }}
          >
            {workspaceSwitchMessage}
          </div>
        ) : null}

        {hasAttentionItems ? (
          <section
            aria-labelledby="attention-upcoming-title"
            style={{
              marginBottom: "24px",
              backgroundColor: "white",
              border: "1px solid #E5E7EB",
              borderRadius: "16px",
              padding: "18px",
              boxShadow: "0 8px 24px rgba(15, 23, 42, 0.04)",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "space-between",
                gap: "16px",
                marginBottom: "14px",
              }}
            >
              <div>
                <div
                  style={{
                    color: "#6B7280",
                    fontSize: "11px",
                    fontWeight: 800,
                    letterSpacing: "0.05em",
                    textTransform: "uppercase",
                    marginBottom: "5px",
                  }}
                >
                  Today&apos;s focus
                </div>
                <h2
                  id="attention-upcoming-title"
                  style={{ margin: 0, color: "#111827", fontSize: "19px", lineHeight: 1.25 }}
                >
                  Attention &amp; Upcoming
                </h2>
              </div>
              <a
                href="/team-discussion"
                style={{
                  color: "#4F46E5",
                  fontSize: "13px",
                  fontWeight: 800,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                View all discussions
              </a>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "12px",
              }}
            >
              {[
                {
                  title: "Needs attention",
                  empty: "Nothing overdue.",
                  items: attentionItems.overdue,
                  accent: "#B45309",
                  background: "#FFF7ED",
                  border: "#FED7AA",
                  dateLabel: "Overdue",
                },
                {
                  title: "Coming up",
                  empty: "Nothing due in the next seven days.",
                  items: attentionItems.upcoming,
                  accent: "#1D4ED8",
                  background: "#EFF6FF",
                  border: "#BFDBFE",
                  dateLabel: "Due",
                },
              ].map((group) => (
                <div
                  key={group.title}
                  style={{
                    backgroundColor: group.background,
                    border: `1px solid ${group.border}`,
                    borderRadius: "12px",
                    padding: "14px",
                  }}
                >
                  <div style={{ color: group.accent, fontSize: "14px", fontWeight: 800, marginBottom: "10px" }}>
                    {group.title}
                  </div>
                  {group.items.length ? (
                    <div style={{ display: "grid", gap: "8px" }}>
                      {group.items.map((item) => (
                        <a
                          key={item.id}
                          href={item.href}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "minmax(0, 1fr) auto",
                            gap: "10px",
                            alignItems: "start",
                            color: "#111827",
                            textDecoration: "none",
                            backgroundColor: "rgba(255, 255, 255, 0.78)",
                            border: `1px solid ${group.border}`,
                            borderRadius: "10px",
                            padding: "10px",
                          }}
                        >
                          <div style={{ minWidth: 0 }}>
                            <div
                              style={{
                                color: group.accent,
                                fontSize: "10px",
                                fontWeight: 800,
                                letterSpacing: "0.04em",
                                textTransform: "uppercase",
                                marginBottom: "3px",
                              }}
                            >
                              {item.source}
                            </div>
                            <div
                              style={{
                                fontSize: "13px",
                                fontWeight: 800,
                                lineHeight: 1.35,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {item.title}
                            </div>
                            <div
                              style={{
                                color: "#6B7280",
                                fontSize: "12px",
                                marginTop: "2px",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {item.context}
                            </div>
                          </div>
                          <div style={{ color: group.accent, fontSize: "12px", fontWeight: 800, whiteSpace: "nowrap" }}>
                            {group.dateLabel} {formatWorklistDueDate(item.dueDate)}
                          </div>
                        </a>
                      ))}
                    </div>
                  ) : (
                    <div style={{ color: "#6B7280", fontSize: "13px" }}>{group.empty}</div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <div style={{ marginBottom: "10px", fontSize: "18px", color: "#111827", fontWeight: 700 }}>
          My Work
        </div>

        {isReviewer ? (
          <p role={worklistFailed ? "status" : undefined} style={{ color: worklistFailed ? "#92400E" : "#6B7280", fontSize: "13px", margin: "0 0 14px", lineHeight: 1.5 }}>
            {worklistFailed
              ? "Queue alerts could not refresh. Any displayed counts are from the last successful check; open a queue to verify its current work."
              : "Numbered alerts show outstanding work, not unread messages. Import alerts count batches, not rows. Completed work and successful direct-to-NXT updates do not trigger alerts. Counts refresh every minute while this page is open."}
          </p>
        ) : null}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            gap: "14px",
            marginBottom: "18px",
          }}
        >
          {primaryActions.map((action, index) => (
            <a
              key={action.href}
              href={action.href}
              style={{
                position: "relative",
                textDecoration: "none",
                backgroundColor: "white",
                border:
                  index === 0
                    ? "1px solid rgba(0, 122, 94, 0.28)"
                    : "1px solid rgba(0, 122, 94, 0.14)",
                borderRadius: "14px",
                padding: "18px",
                color: "#111827",
                ...(index === 0 ? primarySectionStyle : secondaryCardStyle),
              }}
            >
              {action.href === "/team-discussion" ? (
                <div style={{ position: "absolute", top: "14px", right: "14px" }}>
                  <DiscussionAlertBadge count={openDiscussionItems} />
                </div>
              ) : null}
                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 800,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                    color: "#6B7280",
                    marginBottom: "8px",
                  }}
                >
                  {index === 0 ? "Primary" : "Workspace"}
                </div>
              <div style={{ fontWeight: 700, marginBottom: "8px", fontSize: "17px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                <span>{action.title}</span>
                <WorkQueueAlertBadge href={action.href} counts={queueCounts} />
              </div>
              <div style={{ color: "#6B7280", fontSize: "14px", lineHeight: 1.55 }}>
                {action.description}
              </div>
            </a>
          ))}
        </div>

        {teamSupport.length ? (
          <>
            <h2 style={{ margin: "0 0 12px", fontSize: "18px", color: "#111827" }}>
              Supporting tools
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "12px",
                marginBottom: "18px",
              }}
            >
              {teamSupport.map((action) => (
                <a
                  key={action.href}
                  href={action.href}
                  style={{
                    position: "relative",
                    textDecoration: "none",
                    backgroundColor: "#FBFDFC",
                    border: "1px solid rgba(0, 122, 94, 0.12)",
                    borderRadius: "12px",
                    padding: "16px",
                    color: "#111827",
                  }}
                >
                  {action.href === "/team-discussion" ? (
                    <div style={{ position: "absolute", top: "12px", right: "12px" }}>
                      <DiscussionAlertBadge count={openDiscussionItems} compact />
                    </div>
                  ) : null}
                  <div style={{ fontWeight: 700, marginBottom: "8px", fontSize: "15px" }}>
                    {action.title}
                  </div>
                  <div style={{ color: "#6B7280", fontSize: "13px", lineHeight: 1.45 }}>
                    {action.description}
                  </div>
                </a>
              ))}
            </div>
          </>
        ) : null}

        {requestsReview.length ? (
          <>
            <h2 style={{ margin: "0 0 12px", fontSize: "18px", color: "#111827" }}>
              Requests & Review
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "12px",
                marginBottom: "22px",
              }}
            >
              {requestsReview.map((action) => (
                <a
                  key={action.href}
                  href={action.href}
                  style={{
                    textDecoration: "none",
                    ...supportCardStyle,
                    borderRadius: "12px",
                    padding: "16px",
                    color: "#111827",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: "8px", fontSize: "15px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "8px" }}>
                    <span>{action.title}</span>
                    <WorkQueueAlertBadge href={action.href} counts={queueCounts} compact />
                  </div>
                  <div style={{ color: "#6B7280", fontSize: "13px", lineHeight: 1.45 }}>
                    {action.description}
                  </div>
                </a>
              ))}
            </div>
          </>
        ) : null}

        {adminWorkspaceItems.length ? (
          <>
            <h2 style={{ margin: "0 0 12px", fontSize: "18px", color: "#111827" }}>
              Admin & Workspace
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "12px",
                marginBottom: "22px",
              }}
            >
              {adminWorkspaceItems.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  style={{
                    textDecoration: "none",
                    backgroundColor: "#FBFDFC",
                    border: "1px solid rgba(0, 122, 94, 0.12)",
                    borderRadius: "12px",
                    padding: "16px",
                    color: "#111827",
                  }}
                >
                  <div style={{ fontWeight: 700, marginBottom: "8px", fontSize: "15px" }}>
                    {item.label}
                  </div>
                  <div style={{ color: "#6B7280", fontSize: "13px", lineHeight: 1.45 }}>
                    {item.description}
                  </div>
                </a>
              ))}
            </div>
          </>
        ) : null}

        <footer
          style={{
            marginTop: "28px",
            paddingTop: "18px",
            borderTop: "1px solid #E5E7EB",
            display: "grid",
            gridTemplateColumns: "minmax(220px, 1fr)",
            gap: "12px",
          }}
        >
          <div
            style={{
              backgroundColor: "#FCFCFD",
              borderRadius: "14px",
              padding: "14px 16px",
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
              Signed in
            </div>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>
              {profile?.name || user?.name || user?.email}
            </div>
            <div style={{ marginTop: "4px", fontSize: "13px", color: "#6B7280" }}>
              {profile?.email || user?.email}
            </div>
            <div
              style={{
                marginTop: "8px",
                fontSize: "12px",
                fontWeight: 700,
                color: "#6A5BFF",
                textTransform: "capitalize",
              }}
            >
              {roleLabel}
            </div>
          </div>

        </footer>
      </main>
    </div>
  );
}
