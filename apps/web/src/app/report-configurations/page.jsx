"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import useUser from "@/utils/useUser";
import { getWorkspaceRoleLabel } from "@/utils/workspaceRoles";

const panelStyle = {
  backgroundColor: "white",
  border: "1px solid #E2E8F0",
  borderRadius: "18px",
  padding: "24px",
  boxShadow: "0 10px 28px rgba(15, 23, 42, 0.05)",
};

function AudienceOption({ checked, description, name, onChange, title, value }) {
  return (
    <label
      style={{
        display: "flex",
        gap: "13px",
        alignItems: "flex-start",
        border: checked ? "2px solid #4F46E5" : "1px solid #CBD5E1",
        borderRadius: "13px",
        padding: "15px",
        cursor: "pointer",
        backgroundColor: checked ? "#EEF2FF" : "white",
      }}
    >
      <input
        type="radio"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        style={{ marginTop: "3px" }}
      />
      <span>
        <strong style={{ display: "block", color: "#0F172A" }}>{title}</strong>
        <span style={{ color: "#64748B", display: "block", lineHeight: 1.45, marginTop: "4px" }}>
          {description}
        </span>
      </span>
    </label>
  );
}

export default function ReportConfigurationsPage() {
  const { data: user, loading: loadingUser } = useUser();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [canManage, setCanManage] = useState(false);
  const [visibility, setVisibility] = useState("all_users");
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (!loadingUser && !user) {
      window.location.href = "/account/signin";
    }
  }, [loadingUser, user]);

  useEffect(() => {
    if (!user) return undefined;

    let active = true;
    async function loadConfiguration() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/reports/configurations");
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || "Could not load report access.");
        }
        const configuration = Array.isArray(payload?.configurations)
          ? payload.configurations.find((item) => item.key === "portfolio-fy-giving")
          : null;
        if (!configuration) {
          throw new Error("Portfolio Giving access could not be loaded.");
        }
        if (active) {
          setCanManage(Boolean(payload?.canManage));
          setVisibility(configuration.visibility || "all_users");
          setSelectedUserIds(
            Array.isArray(configuration.specificUserIds)
              ? configuration.specificUserIds.map((id) => Number(id)).filter(Number.isInteger)
              : [],
          );
          setUsers(Array.isArray(payload?.users) ? payload.users : []);
        }
      } catch (loadError) {
        if (active) {
          setError(loadError instanceof Error ? loadError.message : "Could not load report access.");
        }
      } finally {
        if (active) setLoading(false);
      }
    }

    loadConfiguration();
    return () => {
      active = false;
    };
  }, [user]);

  function toggleUser(userId) {
    setSelectedUserIds((currentIds) =>
      currentIds.includes(userId)
        ? currentIds.filter((id) => id !== userId)
        : [...currentIds, userId],
    );
  }

  async function saveConfiguration() {
    setSaving(true);
    setError("");
    setStatus("");
    try {
      const response = await fetch("/api/reports/configurations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportKey: "portfolio-fy-giving",
          visibility,
          specificUserIds: visibility === "specific_users" ? selectedUserIds : [],
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not save report access.");
      }
      setStatus(payload?.message || "Report access saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save report access.");
    } finally {
      setSaving(false);
    }
  }

  if (loadingUser || loading) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#64748B" }}>
        Loading report access...
      </main>
    );
  }

  if (!user) return null;

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", padding: "28px 18px 48px" }}>
      <div style={{ maxWidth: "980px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "24px" }}>
          <a
            href="/"
            aria-label="Return to home"
            style={{
              width: "42px",
              height: "42px",
              display: "grid",
              placeItems: "center",
              backgroundColor: "white",
              border: "1px solid #E2E8F0",
              borderRadius: "12px",
              color: "#334155",
            }}
          >
            <ArrowLeft size={20} />
          </a>
          <div>
            <h1 style={{ margin: 0, color: "#0F172A", fontSize: "30px" }}>Report Access</h1>
            <p style={{ margin: "6px 0 0", color: "#64748B" }}>
              Share reports by audience while preserving MGO workspace boundaries.
            </p>
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            style={{
              marginBottom: "18px",
              padding: "14px 16px",
              borderRadius: "13px",
              border: "1px solid #FECACA",
              backgroundColor: "#FEF2F2",
              color: "#991B1B",
              fontWeight: 700,
            }}
          >
            {error}
          </div>
        ) : null}

        {!canManage ? (
          <section style={panelStyle}>
            <h2 style={{ margin: 0, color: "#0F172A" }}>Report access is managed by Advancement Services</h2>
            <p style={{ margin: "9px 0 0", color: "#64748B", lineHeight: 1.5 }}>
              Admins and Advancement Services users can choose who is able to view shared reports.
            </p>
          </section>
        ) : (
          <section style={panelStyle}>
            <div style={{ borderBottom: "1px solid #E2E8F0", paddingBottom: "18px" }}>
              <h2 style={{ margin: 0, color: "#0F172A", fontSize: "21px" }}>Portfolio Giving</h2>
              <p style={{ margin: "7px 0 0", color: "#64748B", lineHeight: 1.5 }}>
                Current fiscal-year giving activity for an MGO portfolio. Admins retain access so they can manage this setting.
              </p>
            </div>

            <fieldset style={{ border: 0, padding: 0, margin: "22px 0 0" }}>
              <legend style={{ color: "#334155", fontSize: "15px", fontWeight: 800, marginBottom: "12px" }}>
                Who can view this report?
              </legend>
              <div style={{ display: "grid", gap: "11px" }}>
                <AudienceOption
                  checked={visibility === "all_users"}
                  description="Every active user can open the report. An MGO still sees only their own portfolio unless they are an Executive."
                  name="report-visibility"
                  onChange={() => setVisibility("all_users")}
                  title="All active users"
                  value="all_users"
                />
                <AudienceOption
                  checked={visibility === "executive"}
                  description="Executives can use their read-only MGO workspace selector. MGO users do not gain access."
                  name="report-visibility"
                  onChange={() => setVisibility("executive")}
                  title="Executives"
                  value="executive"
                />
                <AudienceOption
                  checked={visibility === "specific_users"}
                  description="Choose individual active users who should be able to open this report."
                  name="report-visibility"
                  onChange={() => setVisibility("specific_users")}
                  title="Specific users"
                  value="specific_users"
                />
              </div>
            </fieldset>

            {visibility === "specific_users" ? (
              <section style={{ marginTop: "20px" }} aria-label="Select report users">
                <h3 style={{ color: "#334155", fontSize: "15px", margin: "0 0 10px" }}>Selected users</h3>
                <div style={{ display: "grid", gap: "8px", maxHeight: "360px", overflowY: "auto" }}>
                  {users.map((workspaceUser) => {
                    const userId = Number(workspaceUser.id);
                    const checked = selectedUserIds.includes(userId);
                    return (
                      <label
                        key={workspaceUser.id}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          border: "1px solid #E2E8F0",
                          borderRadius: "10px",
                          padding: "11px 12px",
                          cursor: "pointer",
                        }}
                      >
                        <input
                          type="checkbox"
                          name={`report-user-${workspaceUser.id}`}
                          checked={checked}
                          onChange={() => toggleUser(userId)}
                        />
                        <span style={{ minWidth: 0 }}>
                          <strong style={{ display: "block", color: "#0F172A" }}>
                            {workspaceUser.name || workspaceUser.email}
                          </strong>
                          <span style={{ color: "#64748B", fontSize: "13px" }}>
                            {workspaceUser.email} · {getWorkspaceRoleLabel(workspaceUser.role)}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                {selectedUserIds.length === 0 ? (
                  <p style={{ color: "#B45309", margin: "10px 0 0", fontWeight: 700 }}>
                    Select at least one active user before saving.
                  </p>
                ) : null}
              </section>
            ) : null}

            <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", marginTop: "24px" }}>
              <button
                type="button"
                onClick={saveConfiguration}
                disabled={saving || (visibility === "specific_users" && selectedUserIds.length === 0)}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  minHeight: "44px",
                  border: 0,
                  borderRadius: "10px",
                  padding: "0 16px",
                  backgroundColor: saving ? "#A5B4FC" : "#4F46E5",
                  color: "white",
                  fontWeight: 800,
                  cursor: saving ? "wait" : "pointer",
                }}
              >
                <Save size={17} />
                {saving ? "Saving..." : "Save report access"}
              </button>
              {status ? <span role="status" style={{ color: "#047857", fontWeight: 800 }}>{status}</span> : null}
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
