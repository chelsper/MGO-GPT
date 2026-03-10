"use client";

import { useEffect } from "react";
import { Menu, UserCircle2 } from "lucide-react";
import useUser from "@/utils/useUser";

const QUICK_ACTIONS = [
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

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = "/account/signin";
    }
  }, [loading, user]);

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
          <button
            type="button"
            aria-label="Menu"
            style={{
              width: "40px",
              height: "40px",
              borderRadius: "10px",
              border: "1px solid #E5E7EB",
              backgroundColor: "#F9FAFB",
              display: "grid",
              placeItems: "center",
              cursor: "default",
            }}
          >
            <Menu size={18} color="#111827" />
          </button>

          <a
            href="/account/logout"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              padding: "9px 12px",
              borderRadius: "10px",
              border: "1px solid #E5E7EB",
              backgroundColor: "white",
              color: "#111827",
              textDecoration: "none",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            <UserCircle2 size={16} />
            Account
          </a>
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
