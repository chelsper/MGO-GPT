"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, LogOut, Menu, Settings, UserCircle2 } from "lucide-react";
import useUser from "@/utils/useUser";
import useWorkspaceView from "@/utils/useWorkspaceView";
import {
  canManageWorkspaceRole,
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
    title: "Portfolio Giving",
    href: "/reports",
    description: "Review current fiscal-year gift activity across your portfolio.",
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
    title: "Review Submissions",
    href: "/submissions",
    description: "Approve submissions or push them back to MGOs with notes.",
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
    title: "Organization Configurations",
    href: "/organization-configurations",
    description: "Configure giving societies and portable organization rules.",
  },
];

const MGO_NAV_ITEMS = [
  { label: "My Prospects", href: "/my-top-prospects", section: "My Work" },
  { label: "Portfolio Giving", href: "/reports", section: "My Work" },
  { label: "Team Discussion", href: "/team-discussion", section: "My Work" },
  { label: "Log Update", href: "/action-opportunity-update", section: "Team & Support" },
  { label: "Prospect Pool", href: "/prospect-pool", section: "Team & Support" },
  { label: "Knowledge Base", href: "/knowledge-base", section: "Team & Support" },
  { label: "Find a Constituent", href: "/constituent-lookup", section: "Team & Support" },
  { label: "Submission Tracker", href: "/submissions", section: "Requests & Review" },
  { label: "Request List from DevData", href: "/request-list", section: "Requests & Review" },
  { label: "Data Requests", href: "/data-requests", section: "Requests & Review" },
  { label: "Suggest New Constituent", href: "/new-constituent", section: "Requests & Review" },
];

const REVIEWER_NAV_ITEMS = [
  { label: "Prospect Pool", href: "/prospect-pool", section: "My Work" },
  { label: "Team Discussion", href: "/team-discussion", section: "Team & Support" },
  { label: "Knowledge Base", href: "/knowledge-base", section: "Team & Support" },
  { label: "Edit Knowledge Base", href: "/knowledge-base/manage", section: "Team & Support" },
  { label: "Find a Constituent", href: "/constituent-lookup", section: "Team & Support" },
  { label: "Submission Tracker", href: "/submissions", section: "Requests & Review" },
  { label: "List Requests", href: "/list-requests", section: "Requests & Review" },
  { label: "Data Requests", href: "/data-requests", section: "Requests & Review" },
  { label: "Import Preview", href: "/constituency-import", section: "Requests & Review" },
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
    label: "Giving Societies",
    href: "/organization-configurations",
    section: "Admin & Workspace",
    description: "Manage annual and lifetime giving society definitions.",
  },
  {
    label: "Knowledge Base Admin",
    href: "/knowledge-base/manage",
    section: "Admin & Workspace",
    description: "Edit shared standards, examples, and published guidance.",
  },
];

const ADMIN_NAV_ITEMS = [...REVIEWER_NAV_ITEMS, ...ADMIN_WORKSPACE_ITEMS];

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

function groupNavItems(navItems) {
  const order = ["My Work", "Team & Support", "Requests & Review", "Admin & Workspace"];
  return order
    .map((section) => ({
      section,
      items: navItems.filter((item) => item.section === section),
    }))
    .filter((group) => group.items.length);
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

export default function Page() {
  const queryClient = useQueryClient();
  const { data: user, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [workspaceSwitchMessage, setWorkspaceSwitchMessage] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);
  const menuRef = useRef(null);

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

  useEffect(() => {
    if (!accountMenuOpen && !menuOpen) return;

    const handlePointerDown = (event) => {
      if (!accountMenuRef.current?.contains(event.target)) {
        setAccountMenuOpen(false);
      }
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    };

    const handleEscape = (event) => {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [accountMenuOpen, menuOpen]);

  const { isAdmin, adminViewMode, effectiveRole, isMgoView, isReviewerView, setViewMode } = useWorkspaceView(
    profile?.role,
  );
  const isReviewer = isReviewerView;
  const canManageWorkspace = canManageWorkspaceRole(profile?.role);
  const roleLabel = isAdmin
    ? `Admin · ${isReviewer ? "Advancement Services view" : "MGO view"}`
    : profile?.role === "advancement_admin"
      ? getWorkspaceRoleLabel(profile.role)
      : effectiveRole || "mgo";

  const quickActions = useMemo(
    () => {
      if (!isAdmin && !canManageWorkspace) {
        return isReviewer ? REVIEWER_ACTIONS : MGO_ACTIONS;
      }

      return isReviewer ? ADMIN_ACTIONS : MGO_ACTIONS;
    },
    [canManageWorkspace, isAdmin, isReviewer],
  );
  const navItems = useMemo(
    () => {
      if (!isAdmin && !canManageWorkspace) {
        return isReviewer ? REVIEWER_NAV_ITEMS : MGO_NAV_ITEMS;
      }

      return isReviewer ? ADMIN_NAV_ITEMS : MGO_NAV_ITEMS;
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
  const groupedNavItems = useMemo(() => groupNavItems(navItems), [navItems]);
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
    enabled: Boolean(isAdmin),
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
    enabled: Boolean(isAdmin && isMgoView),
  });
  const actingUser = actingWorkspaceStatus?.actingUser || null;
  const { data: worklist } = useQuery({
    queryKey: ["homepage-worklist", profile?.id, actingUser?.id || "self", isReviewer ? "reviewer" : "mgo"],
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
  });
  const openDiscussionItems = Number(worklist?.summary?.openDiscussionItems || 0);

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
    if (!isAdmin || !isMgoView) return;

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
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          backgroundColor: "white",
          borderBottom: "1px solid #E5E7EB",
          padding: "14px 18px",
        }}
      >
        <div
          style={{
            maxWidth: "960px",
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              type="button"
              aria-label="Open navigation menu"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              onClick={() => setMenuOpen((open) => !open)}
              style={{
                width: "40px",
                height: "40px",
                borderRadius: "10px",
                border: "1px solid #E5E7EB",
                backgroundColor: "#F9FAFB",
                display: "grid",
                placeItems: "center",
                cursor: "pointer",
              }}
            >
              <Menu size={18} color="#111827" />
            </button>

            {menuOpen ? (
              <div
                role="menu"
                aria-label="Primary navigation"
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  left: 0,
                  width: "240px",
                  backgroundColor: "white",
                  border: "1px solid #E5E7EB",
                  borderRadius: "14px",
                  boxShadow: "0 18px 45px rgba(15, 23, 42, 0.12)",
                  padding: "10px",
                }}
              >
                <div
                  style={{
                    padding: "8px 10px 10px",
                    borderBottom: "1px solid #E5E7EB",
                    marginBottom: "6px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "#6B7280",
                      marginBottom: "6px",
                    }}
                  >
                    Menu
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>
                    {isReviewer ? "Advancement Services" : "MGO workspace"}
                  </div>
                  <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "4px" }}>
                    {isReviewer ? "Shared team navigation" : "Primary workflow navigation"}
                  </div>
                </div>

                <div style={{ display: "grid", gap: "12px" }}>
                  {groupedNavItems.map((group) => (
                    <div key={group.section}>
                      <div
                        style={{
                          fontSize: "11px",
                          fontWeight: 700,
                          letterSpacing: "0.04em",
                          textTransform: "uppercase",
                          color: "#6B7280",
                          margin: "0 0 6px 4px",
                        }}
                      >
                        {group.section}
                      </div>
                      <div style={{ display: "grid", gap: "8px" }}>
                        {group.items.map((item) => (
                          <a
                            key={`menu-${item.href}`}
                            href={item.href}
                            role="menuitem"
                            onClick={() => setMenuOpen(false)}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              borderRadius: "10px",
                              padding: "10px 12px",
                              textDecoration: "none",
                              color: "#111827",
                              border: "1px solid #E5E7EB",
                              fontSize: "14px",
                              fontWeight: 600,
                              backgroundColor:
                                group.section === "My Work" ? "#FCFCFD" : "white",
                              justifyContent: "space-between",
                              gap: "10px",
                            }}
                          >
                            <span>{item.label}</span>
                            {item.href === "/team-discussion" ? (
                              <DiscussionAlertBadge count={openDiscussionItems} compact />
                            ) : null}
                          </a>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div ref={accountMenuRef} style={{ position: "relative" }}>
            <button
              type="button"
              aria-expanded={accountMenuOpen}
              aria-haspopup="menu"
              onClick={() => setAccountMenuOpen((open) => !open)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                padding: "9px 12px",
                borderRadius: "10px",
                border: "1px solid #E5E7EB",
                backgroundColor: "white",
                color: "#111827",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              <UserCircle2 size={16} />
              Account
              <ChevronDown
                size={16}
                color="#6B7280"
                style={{
                  transform: accountMenuOpen ? "rotate(180deg)" : "rotate(0deg)",
                  transition: "transform 150ms ease",
                }}
              />
            </button>

            {accountMenuOpen ? (
              <div
                role="menu"
                aria-label="Account menu"
                style={{
                  position: "absolute",
                  top: "calc(100% + 8px)",
                  right: 0,
                  width: "250px",
                  backgroundColor: "white",
                  border: "1px solid #E5E7EB",
                  borderRadius: "14px",
                  boxShadow: "0 18px 45px rgba(15, 23, 42, 0.12)",
                  padding: "10px",
                }}
              >
                <div
                  style={{
                    padding: "10px 12px 12px",
                    borderBottom: "1px solid #E5E7EB",
                    marginBottom: "6px",
                  }}
                >
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 700,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      color: "#6B7280",
                      marginBottom: "6px",
                    }}
                  >
                    Signed in as
                  </div>
                  <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>
                    {profile?.name || user?.name || "MGO-GPT User"}
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      color: "#6B7280",
                      marginTop: "2px",
                      wordBreak: "break-word",
                    }}
                  >
                    {profile?.email || user?.email || "No email available"}
                  </div>
                  <div
                    style={{
                      marginTop: "8px",
                      fontSize: "12px",
                      color: "#6A5BFF",
                      fontWeight: 700,
                      textTransform: "capitalize",
                    }}
                  >
                    {roleLabel}
                  </div>
                  {isAdmin ? (
                    <div style={{ marginTop: "10px" }}>
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
                        View as
                      </div>
                      <div
                        style={{
                          display: "inline-flex",
                          border: "1px solid #E5E7EB",
                          borderRadius: "999px",
                          padding: "3px",
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
                                padding: "6px 10px",
                                fontSize: "12px",
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
                    </div>
                  ) : null}
                  {isAdmin && isMgoView ? (
                    <div style={{ marginTop: "10px" }}>
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
                        View as MGO
                      </div>
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
                        <option value={profile?.id || ""}>My MGO workspace</option>
                        {mgoUsers
                          .filter((mgoUser) => String(mgoUser.id) !== String(profile?.id || ""))
                          .map((mgoUser) => (
                            <option key={mgoUser.id} value={mgoUser.id}>
                              {mgoUser.name || mgoUser.email}
                            </option>
                          ))}
                      </select>
                    </div>
                  ) : null}
                </div>

                <a
                  href="/settings"
                  role="menuitem"
                  onClick={() => setAccountMenuOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    borderRadius: "10px",
                    padding: "10px 12px",
                    color: "#111827",
                    textDecoration: "none",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  <Settings size={16} color="#6B7280" />
                  My Account &amp; Connections
                </a>

                <a
                  href="/account/logout"
                  role="menuitem"
                  onClick={() => setAccountMenuOpen(false)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    borderRadius: "10px",
                    padding: "10px 12px",
                    color: "#B91C1C",
                    textDecoration: "none",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  <LogOut size={16} color="#B91C1C" />
                  Sign out
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </header>

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
              {isMgoView ? (
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
                    <option value={profile?.id || ""}>View as: My MGO workspace</option>
                    {mgoUsers
                      .filter((mgoUser) => String(mgoUser.id) !== String(profile?.id || ""))
                      .map((mgoUser) => (
                        <option key={mgoUser.id} value={mgoUser.id}>
                          View as: {mgoUser.name || mgoUser.email}
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

        <div style={{ marginBottom: "10px", fontSize: "18px", color: "#111827", fontWeight: 700 }}>
          My Work
        </div>

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
              <div style={{ fontWeight: 700, marginBottom: "8px", fontSize: "17px" }}>
                {action.title}
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
