"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, LogOut, Menu, Settings, UserCircle2 } from "lucide-react";
import useUser from "@/utils/useUser";

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
    title: "Log Donor Updates",
    href: "/log-donor-update",
    description: "Capture donor interactions with live dictation.",
  },
  {
    title: "Update Opportunity",
    href: "/update-opportunity",
    description: "Update stage, amount, and solicitation notes.",
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

const MGO_NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "My Top Prospects", href: "/my-top-prospects" },
  { label: "Submissions", href: "/submissions" },
  { label: "Log Donor Update", href: "/log-donor-update" },
  { label: "Update Opportunity", href: "/update-opportunity" },
  { label: "Suggest New Constituent", href: "/new-constituent" },
  { label: "Request List", href: "/request-list" },
];

const REVIEWER_NAV_ITEMS = [
  { label: "Dashboard", href: "/" },
  { label: "Review Queue", href: "/submissions" },
  { label: "List Requests", href: "/list-requests" },
  { label: "Knowledge Base", href: "/knowledge-base" },
  { label: "Edit Knowledge Base", href: "/knowledge-base/manage" },
];

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

  const isReviewer = profile?.role === "reviewer";
  const quickActions = useMemo(
    () => (isReviewer ? REVIEWER_ACTIONS : MGO_ACTIONS),
    [isReviewer],
  );
  const navItems = useMemo(
    () => (isReviewer ? REVIEWER_NAV_ITEMS : MGO_NAV_ITEMS),
    [isReviewer],
  );

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
                  <div style={{ marginTop: "8px", fontSize: "12px", color: "#6A5BFF", fontWeight: 700, textTransform: "capitalize" }}>
                    {profile?.role || "mgo"}
                  </div>
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
            {isReviewer ? "Advancement Services Hub" : "MGO-GPT"}
          </h1>
        </div>

        <p style={{ margin: "0 0 8px", color: "#111827", fontSize: "16px", fontWeight: 600 }}>
          {profile?.name || user?.name || user?.email}
        </p>
        <p style={{ margin: "0 0 22px", color: "#6B7280", fontSize: "14px" }}>
          {isReviewer
            ? "Review submissions, manage shared queues, and keep the knowledge base current."
            : "Capture field updates, request support, and track your work with Advancement Services."}
        </p>

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
            {isReviewer ? "Role focus" : "Today’s workflow"}
          </div>
          <div style={{ fontSize: "18px", fontWeight: 800, color: "#111827", marginBottom: "6px" }}>
            {isReviewer ? "Shared review operations" : "MGO submission workspace"}
          </div>
          <div style={{ fontSize: "14px", color: "#4B5563", lineHeight: 1.6 }}>
            {isReviewer
              ? "Everything here is shared across Advancement Services users, so queue priority, notes, and knowledge base edits stay visible to the whole team."
              : "Your forms flow into shared review queues, where Advancement Services can approve them or send them back with clarification notes."}
          </div>
        </div>

        <h2 style={{ margin: "0 0 14px", fontSize: "18px", color: "#111827" }}>
          {isReviewer ? "Reviewer Actions" : "Quick Actions"}
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px",
          }}
        >
          {quickActions.map((action) => (
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
      </main>
    </div>
  );
}
