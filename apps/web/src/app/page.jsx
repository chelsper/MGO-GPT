"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, LogOut, Menu, Settings, UserCircle2 } from "lucide-react";
import useUser from "@/utils/useUser";
import useWorkspaceView from "@/utils/useWorkspaceView";
import { getSyncBadge } from "@/app/api/utils/nxtTerminologyMap";

const MGO_ACTIONS = [
  {
    title: "Today",
    href: "/#today-worklist",
    description: "See overdue next steps, upcoming follow-up, and internal discussion in one place.",
    section: "myWork",
  },
  {
    title: "My Prospects",
    href: "/my-top-prospects",
    description: "Work your ranked portfolio, next steps, and opportunity momentum.",
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
    title: "Suggest New Constituent",
    href: "/new-constituent",
    description: "Add a new constituent lead or suggest a record for review.",
    section: "requestsReview",
  },
];

const REVIEWER_ACTIONS = [
  {
    title: "Today",
    href: "/#today-worklist",
    description: "See open queue work, clarification requests, and team discussion needing attention.",
    section: "myWork",
  },
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
];

const MGO_NAV_ITEMS = [
  { label: "Today", href: "/#today-worklist", section: "My Work" },
  { label: "My Prospects", href: "/my-top-prospects", section: "My Work" },
  { label: "Team Discussion", href: "/team-discussion", section: "My Work" },
  { label: "Log Update", href: "/action-opportunity-update", section: "Team & Support" },
  { label: "Prospect Pool", href: "/prospect-pool", section: "Team & Support" },
  { label: "Knowledge Base", href: "/knowledge-base", section: "Team & Support" },
  { label: "Submission Tracker", href: "/submissions", section: "Requests & Review" },
  { label: "Request List from DevData", href: "/request-list", section: "Requests & Review" },
  { label: "Suggest New Constituent", href: "/new-constituent", section: "Requests & Review" },
];

const REVIEWER_NAV_ITEMS = [
  { label: "Today", href: "/#today-worklist", section: "My Work" },
  { label: "Prospect Pool", href: "/prospect-pool", section: "My Work" },
  { label: "Team Discussion", href: "/team-discussion", section: "Team & Support" },
  { label: "Knowledge Base", href: "/knowledge-base", section: "Team & Support" },
  { label: "Edit Knowledge Base", href: "/knowledge-base/manage", section: "Team & Support" },
  { label: "Submission Tracker", href: "/submissions", section: "Requests & Review" },
  { label: "List Requests", href: "/list-requests", section: "Requests & Review" },
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
    label: "Workspace Settings",
    href: "/settings",
    section: "Admin & Workspace",
    description: "Review account settings and workspace-level admin controls.",
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
  mgo: ["/#today-worklist", "/my-top-prospects", "/team-discussion"],
  reviewer: ["/prospect-pool", "/team-discussion", "/knowledge-base/manage"],
  adminReviewer: ["/access-management", "/prospect-pool", "/team-discussion"],
};

const ROLE_WORKFLOW_STEPS = {
  mgo: [
    "Start in Today to see what needs attention now.",
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
    "Switch to MGO view only when testing that workflow.",
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

function formatShortDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatCurrency(amount) {
  if (!amount) return "$0";
  return `$${Number(amount).toLocaleString()}`;
}

function renderWorklistMeta(item) {
  if (item.next_action_due_date) return `Due ${formatShortDate(item.next_action_due_date)}`;
  if (item.due_date) return `Due ${formatShortDate(item.due_date)}`;
  if (item.activity_at) return `Updated ${formatShortDate(item.activity_at)}`;
  if (item.updated_at) return `Updated ${formatShortDate(item.updated_at)}`;
  if (item.date_submitted) return `Submitted ${formatShortDate(item.date_submitted)}`;
  return "";
}

function buildProspectWorkspaceHref(prospectId, panel = "") {
  if (!prospectId) return "/my-top-prospects";
  const params = new URLSearchParams({ prospectId: String(prospectId) });
  if (panel) params.set("panel", panel);
  return `/my-top-prospects?${params.toString()}`;
}

function buildProspectListHref(params = {}) {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) searchParams.set(key, String(value));
  });
  const query = searchParams.toString();
  return query ? `/my-top-prospects?${query}` : "/my-top-prospects";
}

function buildSubmissionHref(submissionId) {
  if (!submissionId) return "/submissions";
  return `/submissions#submission-${encodeURIComponent(submissionId)}`;
}

function buildDiscussionHref(discussionId) {
  if (!discussionId) return "/team-discussion";
  const params = new URLSearchParams({
    discussionId: String(discussionId),
    edit: "1",
  });
  return `/team-discussion?${params.toString()}`;
}

function buildTodaySectionHref(sectionId) {
  return sectionId ? `/#${sectionId}` : "/#today-worklist";
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

function getResumeWorkItem(worklist, isReviewer) {
  if (!worklist) return null;

  if (isReviewer) {
    const clarification = worklist.clarificationThreads?.[0];
    if (clarification) {
      return {
        eyebrow: "Resume working",
        title: clarification.donor_name || "Open clarification",
        description:
          clarification.reviewer_notes || "A submission needs clarification.",
        href: buildSubmissionHref(clarification.id),
      };
    }

    const discussion = worklist.discussionItems?.[0];
    if (discussion) {
      return {
        eyebrow: "Resume working",
        title: discussion.subject || "Open discussion",
        description: discussion.prospect_name || "Continue the open discussion thread.",
        href: buildDiscussionHref(discussion.id),
      };
    }

    return {
      eyebrow: "Resume working",
      title: "Open today’s worklist",
      description: "Review the shared queues and keep work moving.",
      href: "/#today-worklist",
    };
  }

  const overdue = worklist.overdueNextSteps?.[0];
  if (overdue) {
    return {
      eyebrow: "Resume working",
      title: overdue.prospect_name || "Open prospect",
      description: overdue.next_action_text || "Continue this follow-up.",
      href: buildProspectWorkspaceHref(overdue.id, "next-step"),
    };
  }

  const discussion = worklist.discussionItems?.[0];
  if (discussion) {
    return {
      eyebrow: "Resume working",
      title: discussion.subject || "Open discussion",
      description: discussion.prospect_name || "Review the open team discussion item.",
      href: buildDiscussionHref(discussion.id),
    };
  }

  return {
    eyebrow: "Resume working",
    title: "Open My Prospects",
    description: "Pick up your next step and keep the work moving.",
    href: "/my-top-prospects",
  };
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
  const { primary: primaryActions, teamSupport, requestsReview, workflow } = useMemo(
    () => getActionGroups({ isAdmin, isReviewer, quickActions }),
    [isAdmin, isReviewer, quickActions],
  );
  const adminWorkspaceItems = useMemo(
    () => (isAdmin && isReviewer ? ADMIN_WORKSPACE_ITEMS : []),
    [isAdmin, isReviewer],
  );
  const groupedNavItems = useMemo(() => groupNavItems(navItems), [navItems]);
  const {
    data: worklist,
    isLoading: worklistLoading,
  } = useQuery({
    queryKey: ["home-worklist", profile?.id, effectiveRole],
    queryFn: async () => {
      const response = await fetch(
        `/api/worklist?view=${encodeURIComponent(effectiveRole || "mgo")}`,
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load today's worklist");
      }
      return payload;
    },
    enabled: Boolean(profile?.id),
  });
  const resumeWorkItem = useMemo(
    () => getResumeWorkItem(worklist, isReviewer),
    [isReviewer, worklist],
  );

  async function handleViewModeChange(nextMode) {
    if (!isAdmin) return;

    if (nextMode === "mgo") {
      try {
        await fetch("/api/admin/workspace-user", { method: "DELETE" });
      } catch (error) {
        console.error("Failed to clear acting workspace user:", error);
      }
    }

    setViewMode(nextMode);

    if (nextMode === "mgo" && typeof window !== "undefined") {
      window.location.replace("/my-top-prospects");
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
                            }}
                          >
                            {item.label}
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
          </div>
        ) : null}

        <div
          id="today-worklist"
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
                  : "See what needs attention today and move your prospects forward."}
              </h2>
              <p style={{ margin: 0, fontSize: "14px", color: "#6B7280", lineHeight: 1.6 }}>
                {isReviewer
                  ? "This is the companion worklist for Advancement Services. Use it to clear queue work and keep team follow-up moving."
                  : "This companion worklist sits on top of Raiser's Edge NXT and keeps next steps, internal discussion, and prospect movement in one place."}
              </p>
            </div>
          </div>

          {worklistLoading ? (
            <div style={{ fontSize: "14px", color: "#6B7280" }}>Loading today&apos;s worklist...</div>
          ) : worklist ? (
            <>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
                  gap: "12px",
                  marginBottom: "16px",
                }}
              >
                {(worklist.role === "reviewer"
                  ? [
                      {
                        label: "Pending queue",
                        count: worklist.summary.pendingSubmissions,
                        color: "#EEF2FF",
                        href: "/submissions",
                      },
                      {
                        label: "Needs clarification",
                        count: worklist.summary.clarificationRequests,
                        color: "#FEF3C7",
                        href: "/submissions",
                      },
                      {
                        label: "Pool needs attention",
                        count: worklist.summary.poolNeedsAttention,
                        color: "#ECFDF5",
                        href: "/prospect-pool",
                      },
                      {
                        label: "Open discussion",
                        count: worklist.summary.openDiscussionItems,
                        color: "#F3F4F6",
                        href: "/team-discussion",
                      },
                    ]
                  : [
                      {
                        label: "Total ask",
                        count: formatCurrency(worklist.summary.totalAskAmount),
                        color: "#EEF2FF",
                        href: buildProspectListHref(),
                      },
                      {
                        label: "Due this week",
                        count: worklist.summary.upcomingNextSteps,
                        color: "#FEF3C7",
                        href: buildTodaySectionHref("today-next-steps"),
                      },
                      {
                        label: "Overdue next steps",
                        count: worklist.summary.overdueNextSteps,
                        color: "#FEE2E2",
                        href: buildTodaySectionHref("today-next-steps"),
                      },
                    ]).map((card) => (
                  <a
                    key={card.label}
                    href={card.href}
                    style={{
                      backgroundColor: card.color,
                      border: "1px solid #E5E7EB",
                      borderRadius: "14px",
                      padding: "12px 14px",
                      textDecoration: "none",
                      display: "block",
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
                      {card.label}
                    </div>
                    <div style={{ fontSize: "24px", fontWeight: 800, color: "#111827" }}>
                      {card.count}
                    </div>
                  </a>
                ))}
              </div>

              {worklist.role !== "reviewer" ? (
                <div
                  id="today-next-steps"
                  style={{
                    backgroundColor: "#FCFCFD",
                    border: "1px solid #E5E7EB",
                    borderRadius: "14px",
                    padding: "16px",
                    marginBottom: "16px",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: "12px",
                      flexWrap: "wrap",
                      marginBottom: "12px",
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
                        Next Steps
                      </div>
                      <div style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>
                        Work the next prospect movement that needs a decision now
                      </div>
                    </div>
                    <a
                      href="/my-top-prospects"
                      style={{
                        fontSize: "13px",
                        fontWeight: 700,
                        color: "#6A5BFF",
                        textDecoration: "none",
                      }}
                    >
                      Open My Prospects
                    </a>
                  </div>

                  {[...worklist.overdueNextSteps, ...worklist.upcomingNextSteps, ...worklist.staleProspects]
                    .sort((left, right) => {
                      const leftTime = left.next_action_due_date
                        ? new Date(left.next_action_due_date).getTime()
                        : Number.MAX_SAFE_INTEGER;
                      const rightTime = right.next_action_due_date
                        ? new Date(right.next_action_due_date).getTime()
                        : Number.MAX_SAFE_INTEGER;
                      return leftTime - rightTime;
                    })
                    .slice(0, 2).length ? (
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "12px",
                      }}
                    >
                      {[...worklist.overdueNextSteps, ...worklist.upcomingNextSteps, ...worklist.staleProspects]
                        .sort((left, right) => {
                          const leftTime = left.next_action_due_date
                            ? new Date(left.next_action_due_date).getTime()
                            : Number.MAX_SAFE_INTEGER;
                          const rightTime = right.next_action_due_date
                            ? new Date(right.next_action_due_date).getTime()
                            : Number.MAX_SAFE_INTEGER;
                          return leftTime - rightTime;
                        })
                        .slice(0, 2)
                        .map((item) => (
                        <div
                          key={`next-step-${item.id}-${item.next_action_due_date || "none"}`}
                          style={{
                            display: "grid",
                            gap: "6px",
                            color: "#111827",
                            backgroundColor: "white",
                            border: "1px solid #E5E7EB",
                            borderRadius: "12px",
                            padding: "14px",
                          }}
                          >
                            <div
                              style={{
                                display: "flex",
                              justifyContent: "space-between",
                              gap: "10px",
                              alignItems: "flex-start",
                            }}
                            >
                              <div style={{ fontSize: "15px", fontWeight: 700 }}>
                                {item.prospect_name || "Unnamed prospect"}
                              </div>
                              <div
                                style={{
                                  fontSize: "12px",
                                  fontWeight: 700,
                                  color: item.next_action_due_date ? "#B45309" : "#6B7280",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {item.next_action_due_date
                                  ? formatShortDate(item.next_action_due_date)
                                  : "No date"}
                              </div>
                            </div>
                            <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280" }}>
                              {item.next_action_due_date
                                ? new Date(item.next_action_due_date).getTime() < new Date().setHours(0,0,0,0)
                                  ? "Overdue"
                                  : "Due soon"
                                : "No recent activity"}
                            </div>
                            <div style={{ fontSize: "13px", color: "#4B5563", lineHeight: 1.5 }}>
                              {item.next_action_text || "Set the next step for this prospect."}
                            </div>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "4px" }}>
                              <a
                                href={buildProspectWorkspaceHref(item.id, "action")}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  padding: "8px 12px",
                                  borderRadius: "999px",
                                  backgroundColor: "#6A5BFF",
                                  color: "white",
                                  textDecoration: "none",
                                  fontSize: "12px",
                                  fontWeight: 700,
                                }}
                              >
                                Log Action
                              </a>
                              <a
                                href={buildProspectWorkspaceHref(item.id, "next-step")}
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  padding: "8px 12px",
                                  borderRadius: "999px",
                                  border: "1px solid #FED7AA",
                                  backgroundColor: "#FFF7ED",
                                  color: "#C2410C",
                                  textDecoration: "none",
                                  fontSize: "12px",
                                  fontWeight: 700,
                                }}
                              >
                                Set Next Step
                              </a>
                            </div>
                          </div>
                      ))}
                    </div>
                  ) : (
                    <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.6 }}>
                      No next steps need attention right now.
                    </div>
                  )}
                </div>
              ) : null}

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
                          primaryActionLabel: "Open clarification",
                          primaryActionHref: buildSubmissionHref(item.id),
                        })),
                        empty: "No clarification threads are open right now.",
                      },
                      {
                        title: "Team discussion",
                        href: "/team-discussion",
                        badge: getSyncBadge("internal"),
                        items: worklist.discussionItems.map((item) => ({
                          title: item.subject,
                          subtitle: item.assigned_user_name
                            ? `For ${item.assigned_user_name}`
                            : "Open internal discussion",
                          meta: renderWorklistMeta(item),
                          primaryActionLabel: "Open discussion",
                          primaryActionHref: buildDiscussionHref(item.id),
                        })),
                        empty: "No open team discussion items right now.",
                      },
                    ]
                  : [
                      {
                        title: "Team discussion",
                        href: "/team-discussion",
                        items: worklist.discussionItems.map((item) => ({
                          title: item.subject,
                          subtitle: item.prospect_name || item.initiative_name || "Internal discussion",
                          meta: renderWorklistMeta(item),
                          primaryActionLabel: "Open discussion",
                          primaryActionHref: buildDiscussionHref(item.id),
                        })),
                        empty: "No open team discussion items right now.",
                      },
                      {
                        title: "Needs clarification",
                        href: "/submissions",
                        items: worklist.clarificationRequests.map((item) => ({
                          title: item.donor_name || "Unnamed submission",
                          subtitle: item.reviewer_notes || "Reviewer requested follow-up",
                          meta: renderWorklistMeta(item),
                          primaryActionLabel: "Open clarification",
                          primaryActionHref: buildSubmissionHref(item.id),
                        })),
                        empty: "No submissions need clarification right now.",
                      },
                    ]).map((section) => (
                  <div
                    key={section.title}
                    id={section.id}
                    style={{
                      border: "1px solid #F3F4F6",
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
                    </div>
                    {section.items.length ? (
                      <div style={{ display: "grid", gap: "10px" }}>
                        {section.items.slice(0, 2).map((item) => (
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
                            {item.primaryActionHref ? (
                              <div
                                style={{
                                  display: "flex",
                                  gap: "10px",
                                  flexWrap: "wrap",
                                  marginTop: "10px",
                                }}
                              >
                                <a
                                  href={item.primaryActionHref}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    padding: "8px 12px",
                                    borderRadius: "999px",
                                    backgroundColor: "#111827",
                                    color: "white",
                                    textDecoration: "none",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                  }}
                                >
                                  {item.primaryActionLabel || "Open"}
                                </a>
                                {item.secondaryActionHref ? (
                                  <a
                                    href={item.secondaryActionHref}
                                    style={{
                                      display: "inline-flex",
                                      alignItems: "center",
                                      padding: "8px 12px",
                                      borderRadius: "999px",
                                      border: "1px solid #D1D5DB",
                                      backgroundColor: "white",
                                      color: "#374151",
                                      textDecoration: "none",
                                      fontSize: "12px",
                                      fontWeight: 700,
                                    }}
                                  >
                                    {item.secondaryActionLabel || "Open"}
                                  </a>
                                ) : null}
                              </div>
                            ) : null}
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

        <div style={{ marginBottom: "10px", fontSize: "18px", color: "#111827", fontWeight: 700 }}>
          Daily streams
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
              onClick={(event) => {
                if (action.href !== "/#today-worklist") return;
                event.preventDefault();
                const target = document.getElementById("today-worklist");
                if (target) {
                  target.scrollIntoView({ behavior: "smooth", block: "start" });
                  window.history.replaceState({}, "", "/#today-worklist");
                } else {
                  window.location.href = action.href;
                }
              }}
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
                {index === 0 ? "Start here" : "Daily stream"}
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
                    textDecoration: "none",
                    backgroundColor: "white",
                    border: "1px solid #F3F4F6",
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
                    backgroundColor: "#FCFCFD",
                    border: "1px solid #F3F4F6",
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
                    backgroundColor: "white",
                    border: "1px solid #E5E7EB",
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
