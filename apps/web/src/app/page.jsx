"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, LogOut, Menu, Settings, UserCircle2 } from "lucide-react";
import useUser from "@/utils/useUser";
import useWorkspaceView from "@/utils/useWorkspaceView";
import { getSyncBadge } from "@/app/api/utils/nxtTerminologyMap";

const MGO_ACTIONS = [
  {
    title: "Submission Tracker",
    href: "/submissions",
    description: "Track review status, clarification requests, and completed work.",
  },
  {
    title: "My Top Prospects",
    href: "/my-top-prospects",
    description: "View your priority donor portfolio.",
  },
  {
    title: "My Prospect Pool",
    href: "/prospect-pool",
    description: "See new names assigned to you and request missing contact details.",
  },
  {
    title: "Action & Opportunity Updates",
    href: "/action-opportunity-update",
    description: "Log relationship activity, opportunity changes, or both in one update.",
  },
  {
    title: "Suggest New Constituent",
    href: "/new-constituent",
    description: "Submit new constituent leads with card parsing.",
  },
  {
    title: "Request List from DevData",
    href: "/request-list",
    description: "Submit list and data pull requests to Advancement Services.",
  },
  {
    title: "Knowledge Base",
    href: "/knowledge-base",
    description: "Search standards, scripts, and process guidance.",
  },
];

const REVIEWER_ACTIONS = [
  {
    title: "Review Submissions",
    href: "/submissions",
    description: "Approve submissions or push them back to MGOs with notes.",
  },
  {
    title: "List Request Queue",
    href: "/list-requests",
    description: "Prioritize DevData requests in one shared Advancement Services queue.",
  },
  {
    title: "Prospect Pool",
    href: "/prospect-pool",
    description: "Assign new prospects to MGOs and track contact info requests.",
  },
  {
    title: "Edit Knowledge Base",
    href: "/knowledge-base/manage",
    description: "Update standards, examples, and guidance for the team.",
  },
  {
    title: "Read Knowledge Base",
    href: "/knowledge-base",
    description: "Review the current published knowledge base content.",
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
];

const MGO_NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "My Top Prospects", href: "/my-top-prospects" },
  { label: "My Prospect Pool", href: "/prospect-pool" },
  { label: "Submissions", href: "/submissions" },
  { label: "Action & Opportunity Updates", href: "/action-opportunity-update" },
  { label: "Suggest New Constituent", href: "/new-constituent" },
  { label: "Request List", href: "/request-list" },
];

const REVIEWER_NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "Review Queue", href: "/submissions" },
  { label: "List Requests", href: "/list-requests" },
  { label: "Prospect Pool", href: "/prospect-pool" },
  { label: "Knowledge Base", href: "/knowledge-base" },
  { label: "Edit Knowledge Base", href: "/knowledge-base/manage" },
];

const ADMIN_NAV_ITEMS = [
  ...REVIEWER_NAV_ITEMS,
  { label: "Blackbaud Mapping", href: "/blackbaud-mapping" },
  { label: "Access Management", href: "/access-management" },
];

const PRIMARY_ACTION_PATHS = {
  mgo: [
    "/action-opportunity-update",
    "/my-top-prospects",
    "/submissions",
  ],
  reviewer: ["/submissions", "/prospect-pool", "/list-requests"],
  adminReviewer: ["/access-management", "/submissions", "/prospect-pool"],
};

const ROLE_WORKFLOW_STEPS = {
  mgo: [
    "Capture the donor update or opportunity change.",
    "Review follow-ups in Top Prospects and Prospect Pool.",
    "Watch for clarification requests in Submissions.",
  ],
  reviewer: [
    "Review the pending submission queue first.",
    "Assign or enrich names in Prospect Pool.",
    "Clear list requests and knowledge updates next.",
  ],
  adminReviewer: [
    "Handle access or role changes first.",
    "Work the shared reviewer queues next.",
    "Switch to MGO view only when testing that workflow.",
  ],
};

function getActionGroups({ isAdmin, isReviewer, quickActions }) {
  const key = isAdmin && isReviewer ? "adminReviewer" : isReviewer ? "reviewer" : "mgo";
  const primaryPaths = PRIMARY_ACTION_PATHS[key];
  const primary = quickActions.filter((action) => primaryPaths.includes(action.href));
  const secondary = quickActions.filter((action) => !primaryPaths.includes(action.href));
  return { primary, secondary, workflow: ROLE_WORKFLOW_STEPS[key] };
}

function formatShortDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function renderWorklistMeta(item) {
  if (item.next_action_due_date) return `Due ${formatShortDate(item.next_action_due_date)}`;
  if (item.due_date) return `Due ${formatShortDate(item.due_date)}`;
  if (item.activity_at) return `Updated ${formatShortDate(item.activity_at)}`;
  if (item.updated_at) return `Updated ${formatShortDate(item.updated_at)}`;
  if (item.date_submitted) return `Submitted ${formatShortDate(item.date_submitted)}`;
  return "";
}

export default function Page() {
  const { data: user, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
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
  const roleLabel = isAdmin
    ? `Admin · ${isReviewer ? "Advancement Services view" : "MGO view"}`
    : effectiveRole || "mgo";

  const quickActions = useMemo(
    () => {
      if (!isAdmin) {
        return isReviewer ? REVIEWER_ACTIONS : MGO_ACTIONS;
      }

      return isReviewer ? ADMIN_ACTIONS : MGO_ACTIONS;
    },
    [isAdmin, isReviewer],
  );
  const navItems = useMemo(
    () => {
      if (!isAdmin) {
        return isReviewer ? REVIEWER_NAV_ITEMS : MGO_NAV_ITEMS;
      }

      return isReviewer ? ADMIN_NAV_ITEMS : MGO_NAV_ITEMS;
    },
    [isAdmin, isReviewer],
  );
  const { primary: primaryActions, secondary: secondaryActions, workflow } = useMemo(
    () => getActionGroups({ isAdmin, isReviewer, quickActions }),
    [isAdmin, isReviewer, quickActions],
  );
  const {
    data: worklist,
    isLoading: worklistLoading,
  } = useQuery({
    queryKey: ["home-worklist", profile?.id, roleLabel],
    queryFn: async () => {
      const response = await fetch("/api/worklist");
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load today's worklist");
      }
      return payload;
    },
    enabled: Boolean(profile?.id),
  });

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

                <div style={{ display: "grid", gap: "8px" }}>
                  {navItems.map((item) => (
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
                      }}
                    >
                      {item.label}
                    </a>
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
                              onClick={() => setViewMode(option.value)}
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
                  Settings
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
                ? "Workspace Administration"
                : "MGO Workspace"
              : isReviewer
                ? "Advancement Services Hub"
                : "MGO-GPT"}
          </h1>
        </div>

        <p style={{ margin: "0 0 8px", color: "#111827", fontSize: "16px", fontWeight: 600 }}>
          {profile?.name || user?.name || user?.email}
        </p>
        <p style={{ margin: "0 0 22px", color: "#6B7280", fontSize: "14px" }}>
          {isAdmin
            ? isReviewer
              ? "Manage access, assign workspace roles, and oversee shared team operations."
              : "Work the app as an MGO while keeping administrative access available when you need it."
            : isReviewer
              ? "Review submissions, manage shared queues, and keep the knowledge base current."
              : "Capture field updates, request support, and track your work with Advancement Services."}
        </p>

        {isAdmin ? (
          <div
            style={{
              marginBottom: "18px",
              backgroundColor: "white",
              border: "1px solid #E5E7EB",
              borderRadius: "16px",
              padding: "16px 18px",
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
                  fontSize: "12px",
                  fontWeight: 700,
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                  color: "#6B7280",
                  marginBottom: "6px",
                }}
              >
                Workspace view
              </div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>
                You are currently in {isReviewer ? "Advancement Services" : "MGO"} view.
              </div>
              <div style={{ marginTop: "4px", fontSize: "13px", color: "#6B7280" }}>
                Switch views to work the shared reviewer queues or the MGO workflow without changing your admin role.
              </div>
            </div>

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
                    onClick={() => setViewMode(option.value)}
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
          </div>
        ) : null}

        <div
          style={{
            marginBottom: "18px",
            backgroundColor: isReviewer ? "#EEF2FF" : "#F5F3FF",
            border: `1px solid ${isReviewer ? "#C7D2FE" : "#DDD6FE"}`,
            borderRadius: "16px",
            padding: "18px 20px",
          }}
        >
          <div style={{ fontSize: "12px", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: "#6B7280", marginBottom: "8px" }}>
            {isAdmin
              ? isReviewer
                ? "Admin focus"
                : "Admin MGO view"
              : isReviewer
                ? "Role focus"
                : "Today’s workflow"}
          </div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#111827", marginBottom: "6px" }}>
            {isAdmin
              ? isReviewer
                ? "Access and workflow control"
                : "MGO submission workspace"
              : isReviewer
                ? "Shared review operations"
                : "MGO submission workspace"}
          </div>
          <div style={{ fontSize: "14px", color: "#4B5563", lineHeight: 1.6 }}>
            {isAdmin
              ? isReviewer
                ? "You control who can access the workspace, what role they receive, and you can still work the shared Advancement Services queues."
                : "You are looking at the MGO workspace. Use the account toggle any time you want to return to Advancement Services or admin operations."
              : isReviewer
                ? "Everything here is shared across Advancement Services users, so queue priority, notes, and knowledge base edits stay visible to the whole team."
                : "Your forms flow into shared review queues, where Advancement Services can approve them or send them back with clarification notes."}
          </div>
        </div>

        <div
          style={{
            backgroundColor: "white",
            borderRadius: "16px",
            border: "1px solid #E5E7EB",
            padding: "18px 20px",
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
              marginBottom: "14px",
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
                Today
              </div>
              <h2 style={{ margin: "0 0 6px", fontSize: "22px", color: "#111827" }}>
                {isReviewer
                  ? "Work the shared queues and discussion items that need attention now."
                  : "See what needs attention, what is overdue, and what to move forward next."}
              </h2>
              <p style={{ margin: 0, fontSize: "14px", color: "#6B7280", lineHeight: 1.6 }}>
                {isReviewer
                  ? "This is the companion worklist for Advancement Services. Use it to clear queue work and keep team follow-up moving."
                  : "This is your companion worklist on top of NXT. It keeps next steps, internal discussion, and clarification work in one place."}
              </p>
            </div>
            <div
              style={{
                padding: "10px 12px",
                borderRadius: "12px",
                border: "1px solid #E5E7EB",
                backgroundColor: "#F9FAFB",
                minWidth: "220px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  color: "#6B7280",
                  marginBottom: "6px",
                }}
              >
                Terminology
              </div>
              <div style={{ fontSize: "13px", color: "#374151", lineHeight: 1.55 }}>
                Use NXT terms for synced records. Use <strong>Internal only</strong> for team discussion and reminders that live in the companion layer.
              </div>
            </div>
          </div>

          {worklistLoading ? (
            <div style={{ fontSize: "14px", color: "#6B7280" }}>Loading today&apos;s worklist...</div>
          ) : worklist ? (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                {(worklist.role === "reviewer"
                  ? [
                      ["Pending queue", worklist.summary.pendingSubmissions, "#EEF2FF"],
                      ["Needs clarification", worklist.summary.clarificationRequests, "#FEF3C7"],
                      ["Pool needs attention", worklist.summary.poolNeedsAttention, "#ECFDF5"],
                      ["Open discussion", worklist.summary.openDiscussionItems, "#F3F4F6"],
                    ]
                  : [
                      ["Overdue next steps", worklist.summary.overdueNextSteps, "#FEE2E2"],
                      ["Due this week", worklist.summary.upcomingNextSteps, "#FEF3C7"],
                      ["Needs follow-up", worklist.summary.staleProspects, "#EEF2FF"],
                      ["Open discussion", worklist.summary.openDiscussionItems, "#F3F4F6"],
                    ]).map(([label, count, color]) => (
                  <div
                    key={label}
                    style={{
                      backgroundColor: color,
                      border: "1px solid #E5E7EB",
                      borderRadius: "14px",
                      padding: "14px 16px",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        color: "#6B7280",
                        marginBottom: "8px",
                      }}
                    >
                      {label}
                    </div>
                    <div style={{ fontSize: "28px", fontWeight: 800, color: "#111827" }}>{count}</div>
                  </div>
                ))}
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: "14px",
                }}
              >
                {(worklist.role === "reviewer"
                  ? [
                      {
                        title: "Needs clarification",
                        href: "/submissions",
                        badge: getSyncBadge("internal"),
                        items: worklist.clarificationThreads.map((item) => ({
                          title: item.donor_name || "Unnamed submission",
                          subtitle: item.submission_type === "opportunity_update" ? "Opportunity update" : "Submission",
                          meta: renderWorklistMeta(item),
                        })),
                        empty: "No clarification threads are open right now.",
                      },
                      {
                        title: "Prospect Pool follow-up",
                        href: "/prospect-pool",
                        badge: getSyncBadge("internal"),
                        items: worklist.poolItems.map((item) => ({
                          title: item.prospect_name,
                          subtitle: item.assigned_user_name
                            ? `Assigned to ${item.assigned_user_name}`
                            : "Needs assignment",
                          meta: item.needs_contact_info ? "Contact info requested" : renderWorklistMeta(item),
                        })),
                        empty: "No Prospect Pool items need attention right now.",
                      },
                      {
                        title: "Team discussion",
                        href: "/submissions",
                        badge: getSyncBadge("internal"),
                        items: worklist.discussionItems.map((item) => ({
                          title: item.subject,
                          subtitle: item.assigned_user_name
                            ? `For ${item.assigned_user_name}`
                            : "Open internal discussion",
                          meta: renderWorklistMeta(item),
                        })),
                        empty: "No open team discussion items right now.",
                      },
                    ]
                  : [
                      {
                        title: "Overdue next steps",
                        href: "/my-top-prospects",
                        badge: getSyncBadge("internal"),
                        items: worklist.overdueNextSteps.map((item) => ({
                          title: item.prospect_name,
                          subtitle: item.next_action_text,
                          meta: renderWorklistMeta(item),
                        })),
                        empty: "No overdue next steps right now.",
                      },
                      {
                        title: "Upcoming follow-up",
                        href: "/my-top-prospects",
                        badge: getSyncBadge("internal"),
                        items: worklist.upcomingNextSteps.map((item) => ({
                          title: item.prospect_name,
                          subtitle: item.next_action_text,
                          meta: renderWorklistMeta(item),
                        })),
                        empty: "Nothing due in the next 7 days.",
                      },
                      {
                        title: "Team discussion",
                        href: "/my-top-prospects",
                        badge: getSyncBadge("internal"),
                        items: worklist.discussionItems.map((item) => ({
                          title: item.subject,
                          subtitle: item.prospect_name || item.initiative_name || "Internal discussion",
                          meta: renderWorklistMeta(item),
                        })),
                        empty: "No open team discussion items right now.",
                      },
                      {
                        title: "Needs clarification",
                        href: "/submissions",
                        badge: getSyncBadge("internal"),
                        items: worklist.clarificationRequests.map((item) => ({
                          title: item.donor_name || "Unnamed submission",
                          subtitle: item.reviewer_notes || "Reviewer requested follow-up",
                          meta: renderWorklistMeta(item),
                        })),
                        empty: "No submissions need clarification right now.",
                      },
                    ]).map((section) => (
                  <div
                    key={section.title}
                    style={{
                      border: "1px solid #E5E7EB",
                      borderRadius: "14px",
                      padding: "16px",
                      backgroundColor: "#FCFCFD",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        alignItems: "center",
                        marginBottom: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ fontSize: "17px", fontWeight: 700, color: "#111827" }}>
                        {section.title}
                      </div>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "4px 10px",
                          borderRadius: "999px",
                          fontSize: "11px",
                          fontWeight: 700,
                          backgroundColor: section.badge.bg,
                          color: section.badge.text,
                          border: `1px solid ${section.badge.border}`,
                        }}
                      >
                        {section.badge.label}
                      </span>
                    </div>
                    {section.items.length ? (
                      <div style={{ display: "grid", gap: "10px" }}>
                        {section.items.slice(0, 4).map((item) => (
                          <div
                            key={`${section.title}-${item.title}-${item.meta}`}
                            style={{
                              border: "1px solid #E5E7EB",
                              borderRadius: "12px",
                              padding: "12px 14px",
                              backgroundColor: "white",
                            }}
                          >
                            <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827", marginBottom: "4px" }}>
                              {item.title}
                            </div>
                            <div style={{ fontSize: "13px", color: "#374151", lineHeight: 1.5, marginBottom: "4px" }}>
                              {item.subtitle}
                            </div>
                            <div style={{ fontSize: "12px", color: "#6B7280" }}>{item.meta}</div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: "14px", color: "#6B7280", lineHeight: 1.6 }}>
                        {section.empty}
                      </div>
                    )}
                    <a
                      href={section.href}
                      style={{
                        display: "inline-flex",
                        marginTop: "12px",
                        color: "#6A5BFF",
                        fontSize: "13px",
                        fontWeight: 700,
                        textDecoration: "none",
                      }}
                    >
                      Open {section.title}
                    </a>
                  </div>
                ))}
              </div>
            </>
          ) : null}
        </div>

        <div
          style={{
            backgroundColor: "white",
            borderRadius: "16px",
            border: "1px solid #E5E7EB",
            padding: "18px 20px",
            marginBottom: "18px",
          }}
        >
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
            Start here
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: "16px",
            }}
          >
            <div>
              <h2 style={{ margin: "0 0 8px", fontSize: "22px", color: "#111827" }}>
                {isReviewer
                  ? "Focus on the queues that move work forward today."
                  : "Start with the work that keeps donor momentum moving."}
              </h2>
              <p style={{ margin: 0, fontSize: "14px", color: "#6B7280", lineHeight: 1.6 }}>
                {isReviewer
                  ? "Use the primary tasks below in order. They match the way the team actually clears requests and keeps records moving."
                  : "Use the primary tasks below in order. They follow the normal MGO rhythm: capture updates, work your portfolio, then track review responses."}
              </p>
            </div>
            <div
              style={{
                backgroundColor: "#F9FAFB",
                border: "1px solid #E5E7EB",
                borderRadius: "14px",
                padding: "14px 16px",
              }}
            >
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
                Suggested flow
              </div>
              <div style={{ display: "grid", gap: "8px" }}>
                {workflow.map((step, index) => (
                  <div key={step} style={{ display: "flex", gap: "10px", alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: "22px",
                        height: "22px",
                        borderRadius: "999px",
                        backgroundColor: "#EEF2FF",
                        color: "#4338CA",
                        fontSize: "12px",
                        fontWeight: 800,
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      {index + 1}
                    </div>
                    <div style={{ fontSize: "13px", color: "#374151", lineHeight: 1.5 }}>
                      {step}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <h2 style={{ margin: "0 0 14px", fontSize: "18px", color: "#111827" }}>
          Primary tasks
        </h2>

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
                textDecoration: "none",
                backgroundColor: "white",
                border: index === 0 ? "2px solid #C7D2FE" : "1px solid #E5E7EB",
                borderRadius: "14px",
                padding: "18px",
                color: "#111827",
              }}
            >
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
                {index === 0 ? "Best next step" : "Primary task"}
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

        {secondaryActions.length ? (
          <>
            <h2 style={{ margin: "0 0 14px", fontSize: "18px", color: "#111827" }}>
              Secondary tools
            </h2>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "12px",
              }}
            >
              {secondaryActions.map((action) => (
                <a
                  key={action.href}
                  href={action.href}
                  style={{
                    textDecoration: "none",
                    backgroundColor: "white",
                    border: "1px solid #E5E7EB",
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

        <footer
          style={{
            marginTop: "28px",
            paddingTop: "18px",
            borderTop: "1px solid #E5E7EB",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px",
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              border: "1px solid #E5E7EB",
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

          <div
            style={{
              backgroundColor: "white",
              border: "1px solid #E5E7EB",
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
              Need help?
            </div>
            <div style={{ fontSize: "14px", color: "#374151", lineHeight: 1.6 }}>
              {isReviewer
                ? "Review process guidance and shared standards live in the knowledge base."
                : "Use the knowledge base for process guidance, scripts, and submission standards."}
            </div>
            <a
              href={isReviewer ? "/knowledge-base/manage" : "/knowledge-base"}
              style={{
                display: "inline-flex",
                marginTop: "10px",
                color: "#6A5BFF",
                fontSize: "13px",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              {isReviewer ? "Open knowledge base editor" : "Open knowledge base"}
            </a>
          </div>

          <div
            style={{
              backgroundColor: "white",
              border: "1px solid #E5E7EB",
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
              Workspace status
            </div>
            <div style={{ fontSize: "14px", color: "#374151", lineHeight: 1.6 }}>
              {isReviewer
                ? "Submission reviews, list-request priorities, and knowledge-base changes are shared across Advancement Services."
                : "Your submissions and list requests flow into shared Advancement Services queues and stay visible in your tracker."}
            </div>
            <a
              href="/submissions"
              style={{
                display: "inline-flex",
                marginTop: "10px",
                color: "#6A5BFF",
                fontSize: "13px",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Open tracker
            </a>
          </div>
        </footer>
      </main>
    </div>
  );
}
