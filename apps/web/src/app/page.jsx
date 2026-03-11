"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Menu, Settings, UserCircle2 } from "lucide-react";
import useUser from "@/utils/useUser";

const QUICK_ACTIONS = [
  {
    title: "Submission Tracker",
    href: "/submissions",
    description: "Track review status and follow-up on submitted work.",
  },
  {
    title: "My Top Prospects",
    href: "/my-top-prospects",
    description: "View your priority donor portfolio.",
  },
  {
    title: "Log Donor Updates",
    href: "/log-donor-update",
    description: "Capture updates with voice transcription.",
  },
  {
    title: "Update Opportunity",
    href: "/update-opportunity",
    description: "Update stage, amount, and notes.",
  },
  {
    title: "Suggest New Constituent",
    href: "/new-constituent",
    description: "Use business card photo to prefill contact info.",
  },
  {
    title: "Request List from DevData",
    href: "/request-list",
    description: "Submit list and data pull requests.",
  },
  {
    title: "Knowledge Base",
    href: "/knowledge-base",
    description: "Search tips, scripts, and process guidance.",
  },
];

export default function Page() {
  const { data: user, loading } = useUser();
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

  if (loading || !user) {
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
                  width: "290px",
                  backgroundColor: "white",
                  border: "1px solid #E5E7EB",
                  borderRadius: "16px",
                  boxShadow: "0 18px 45px rgba(15, 23, 42, 0.12)",
                  padding: "12px",
                }}
              >
                <div
                  style={{
                    padding: "8px 10px 12px",
                    borderBottom: "1px solid #E5E7EB",
                    marginBottom: "8px",
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
                    Navigation
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "#111827" }}>
                    MGO-GPT workspace
                  </div>
                  <div style={{ fontSize: "13px", color: "#6B7280", marginTop: "4px" }}>
                    Jump directly to the workflows you use most.
                  </div>
                </div>

                <a
                  href="/"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  style={{
                    display: "block",
                    borderRadius: "12px",
                    padding: "12px",
                    textDecoration: "none",
                    color: "#111827",
                    backgroundColor: "#F9FAFB",
                    marginBottom: "8px",
                  }}
                >
                  <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "4px" }}>
                    Dashboard
                  </div>
                  <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.45 }}>
                    Return to your main action hub and account overview.
                  </div>
                </a>

                <div style={{ display: "grid", gap: "8px" }}>
                  {QUICK_ACTIONS.map((action) => (
                    <a
                      key={`menu-${action.href}`}
                      href={action.href}
                      role="menuitem"
                      onClick={() => setMenuOpen(false)}
                      style={{
                        display: "block",
                        borderRadius: "12px",
                        padding: "12px",
                        textDecoration: "none",
                        color: "#111827",
                        border: "1px solid #E5E7EB",
                      }}
                    >
                      <div style={{ fontSize: "14px", fontWeight: 700, marginBottom: "4px" }}>
                        {action.title}
                      </div>
                      <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.45 }}>
                        {action.description}
                      </div>
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
                    {user?.name || "MGO-GPT User"}
                  </div>
                  <div
                    style={{
                      fontSize: "13px",
                      color: "#6B7280",
                      marginTop: "2px",
                      wordBreak: "break-word",
                    }}
                  >
                    {user?.email || "No email available"}
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
          <h1 style={{ margin: 0, fontSize: "28px", color: "#111827", fontWeight: 800 }}>MGO-GPT</h1>
        </div>

        <p style={{ margin: "0 0 22px", color: "#6B7280", fontSize: "14px" }}>
          Signed in as {user?.email || user?.name || "user"}
        </p>

        <h2 style={{ margin: "0 0 14px", fontSize: "18px", color: "#111827" }}>Quick Actions</h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "12px",
          }}
        >
          {QUICK_ACTIONS.map((action) => (
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
              <div style={{ fontWeight: 700, marginBottom: "8px", fontSize: "15px" }}>{action.title}</div>
              <div style={{ color: "#6B7280", fontSize: "13px", lineHeight: 1.45 }}>{action.description}</div>
            </a>
          ))}
        </div>
      </main>
    </div>
  );
}
