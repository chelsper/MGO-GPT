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

function getAudienceDescriptions(configuration) {
  const isGlobalQuery = ["future-made-phase-ii", "alumni-family-engagement"].includes(
    configuration.key,
  );
  const isTeamStandings = configuration.key === "executive-team-standings";

  if (isGlobalQuery) {
    return {
      allUsers:
        "Every active user can run this saved query globally. Results do not depend on a selected MGO workspace.",
      executives:
        "Executives can run this saved query globally. MGO users do not gain access.",
      specificUsers:
        "Choose individual active users who should be able to run this saved query globally.",
    };
  }

  if (isTeamStandings) {
    return {
      allUsers:
        "Every active user can view the local team standings. No Blackbaud report data is loaded.",
      executives:
        "Executives can view the local team standings. MGO users do not gain access.",
      specificUsers:
        "Choose individual active users who should be able to view the local team standings.",
    };
  }

  return {
    allUsers:
      "Every active user can open the report. An MGO still sees only their own portfolio unless they are an Executive.",
    executives:
      "Executives can use their read-only MGO workspace selector. MGO users do not gain access.",
    specificUsers: "Choose individual active users who should be able to open this report.",
  };
}

export default function ReportConfigurationsPage() {
  const { data: user, loading: loadingUser } = useUser();
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [error, setError] = useState("");
  const [statusByKey, setStatusByKey] = useState({});
  const [canManage, setCanManage] = useState(false);
  const [configurations, setConfigurations] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [users, setUsers] = useState([]);

  useEffect(() => {
    if (!loadingUser && !user) {
      window.location.href = "/account/signin";
    }
  }, [loadingUser, user]);

  useEffect(() => {
    if (!user) return undefined;

    let active = true;
    async function loadConfigurations() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch("/api/reports/configurations", { cache: "no-store" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || "Could not load report access.");
        }

        const nextConfigurations = Array.isArray(payload?.configurations)
          ? payload.configurations
          : [];
        if (!nextConfigurations.length) {
          throw new Error("Report access could not be loaded.");
        }

        if (active) {
          setCanManage(Boolean(payload?.canManage));
          setConfigurations(nextConfigurations);
          setDrafts(
            Object.fromEntries(
              nextConfigurations.map((configuration) => [
                configuration.key,
                {
                  visibility: configuration.visibility || "all_users",
                  specificUserIds: Array.isArray(configuration.specificUserIds)
                    ? configuration.specificUserIds
                        .map((id) => Number(id))
                        .filter(Number.isInteger)
                    : [],
                },
              ]),
            ),
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

    loadConfigurations();
    return () => {
      active = false;
    };
  }, [user]);

  function updateDraft(reportKey, update) {
    setDrafts((current) => ({
      ...current,
      [reportKey]: {
        visibility: current[reportKey]?.visibility || "all_users",
        specificUserIds: current[reportKey]?.specificUserIds || [],
        ...update,
      },
    }));
  }

  function toggleUser(reportKey, userId) {
    const selectedIds = drafts[reportKey]?.specificUserIds || [];
    updateDraft(reportKey, {
      specificUserIds: selectedIds.includes(userId)
        ? selectedIds.filter((id) => id !== userId)
        : [...selectedIds, userId],
    });
  }

  async function saveConfiguration(configuration) {
    const draft = drafts[configuration.key] || {
      visibility: "all_users",
      specificUserIds: [],
    };
    setSavingKey(configuration.key);
    setError("");
    setStatusByKey((current) => ({ ...current, [configuration.key]: "" }));
    try {
      const response = await fetch("/api/reports/configurations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportKey: configuration.key,
          visibility: draft.visibility,
          specificUserIds:
            draft.visibility === "specific_users" ? draft.specificUserIds : [],
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not save report access.");
      }

      if (payload?.configuration) {
        setConfigurations((current) =>
          current.map((item) =>
            item.key === configuration.key ? payload.configuration : item,
          ),
        );
      }
      setStatusByKey((current) => ({
        ...current,
        [configuration.key]: payload?.message || "Report access saved.",
      }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save report access.");
    } finally {
      setSavingKey("");
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
              Share reports by audience. Blackbaud data access remains tied to each user&apos;s connection.
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
          <div style={{ display: "grid", gap: "20px" }}>
            {configurations.map((configuration) => {
              const draft = drafts[configuration.key] || {
                visibility: "all_users",
                specificUserIds: [],
              };
              const descriptions = getAudienceDescriptions(configuration);
              const isSaving = savingKey === configuration.key;

              return (
                <section key={configuration.key} style={panelStyle}>
                  <div style={{ borderBottom: "1px solid #E2E8F0", paddingBottom: "18px" }}>
                    <h2 style={{ margin: 0, color: "#0F172A", fontSize: "21px" }}>
                      {configuration.title}
                    </h2>
                    <p style={{ margin: "7px 0 0", color: "#64748B", lineHeight: 1.5 }}>
                      {configuration.description}
                    </p>
                    {configuration.key === "future-made-phase-ii" ? (
                      <p style={{ margin: "10px 0 0", color: "#1D4ED8", lineHeight: 1.5, fontWeight: 700 }}>
                        This report always uses the full saved NXT query, not the selected MGO portfolio.
                      </p>
                    ) : null}
                    {configuration.key === "executive-team-standings" ? (
                      <p style={{ margin: "10px 0 0", color: "#166534", lineHeight: 1.5, fontWeight: 700 }}>
                        This report uses JUMGOGPT portfolio, opportunity, and next-step records. It does not load Blackbaud revenue data.
                      </p>
                    ) : null}
                  </div>

                  {configuration.key === "alumni-family-engagement" ? (
                    <section
                      style={{
                        marginTop: "20px",
                        border: "1px solid #BFDBFE",
                        backgroundColor: "#EFF6FF",
                        borderRadius: "14px",
                        padding: "18px",
                      }}
                    >
                      <h3 style={{ margin: 0, color: "#1E3A8A", fontSize: "16px" }}>
                        Alumni donor source
                      </h3>
                      <p style={{ margin: "7px 0 0", color: "#334155", lineHeight: 1.5 }}>
                        This first version uses two saved NXT queries and keeps the last successful snapshot. It
                        refreshes nightly at 6 PM Eastern or when a user explicitly refreshes it.
                      </p>
                      <p style={{ margin: "14px 0 0", color: "#334155", lineHeight: 1.5, fontSize: "14px" }}>
                        FY27 Alumni Donor Total uses saved NXT query ID 30976. FY26 Alumni Donor Total uses saved
                        NXT query ID 30679.
                      </p>
                      <p style={{ margin: "10px 0 0", color: "#334155", lineHeight: 1.5, fontSize: "14px" }}>
                        Per-fiscal-year labels and additional saved-query rows will be configured in the next report
                        configuration phase.
                      </p>
                    </section>
                  ) : null}

                  <fieldset style={{ border: 0, padding: 0, margin: "22px 0 0" }}>
                    <legend style={{ color: "#334155", fontSize: "15px", fontWeight: 800, marginBottom: "12px" }}>
                      Who can view this report?
                    </legend>
                    <div style={{ display: "grid", gap: "11px" }}>
                      <AudienceOption
                        checked={draft.visibility === "all_users"}
                        description={descriptions.allUsers}
                        name={`report-visibility-${configuration.key}`}
                        onChange={() => updateDraft(configuration.key, { visibility: "all_users" })}
                        title="All active users"
                        value="all_users"
                      />
                      <AudienceOption
                        checked={draft.visibility === "executive"}
                        description={descriptions.executives}
                        name={`report-visibility-${configuration.key}`}
                        onChange={() => updateDraft(configuration.key, { visibility: "executive" })}
                        title="Executives"
                        value="executive"
                      />
                      <AudienceOption
                        checked={draft.visibility === "specific_users"}
                        description={descriptions.specificUsers}
                        name={`report-visibility-${configuration.key}`}
                        onChange={() => updateDraft(configuration.key, { visibility: "specific_users" })}
                        title="Specific users"
                        value="specific_users"
                      />
                    </div>
                  </fieldset>

                  {draft.visibility === "specific_users" ? (
                    <section style={{ marginTop: "20px" }} aria-label={`Select users for ${configuration.title}`}>
                      <h3 style={{ color: "#334155", fontSize: "15px", margin: "0 0 10px" }}>Selected users</h3>
                      <div style={{ display: "grid", gap: "8px", maxHeight: "360px", overflowY: "auto" }}>
                        {users.map((workspaceUser) => {
                          const userId = Number(workspaceUser.id);
                          const checked = draft.specificUserIds.includes(userId);
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
                                name={`report-${configuration.key}-user-${workspaceUser.id}`}
                                checked={checked}
                                onChange={() => toggleUser(configuration.key, userId)}
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
                      {draft.specificUserIds.length === 0 ? (
                        <p style={{ color: "#B45309", margin: "10px 0 0", fontWeight: 700 }}>
                          Select at least one active user before saving.
                        </p>
                      ) : null}
                    </section>
                  ) : null}

                  <p style={{ margin: "18px 0 0", color: "#64748B", lineHeight: 1.5, fontSize: "14px" }}>
                    {configuration.key === "executive-team-standings"
                      ? "This report uses only JUMGOGPT operational data and does not require a Blackbaud connection to load."
                      : "Each person still needs a connected Blackbaud account with permission to read the report's data."}
                  </p>

                  <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", marginTop: "20px" }}>
                    <button
                      type="button"
                      onClick={() => saveConfiguration(configuration)}
                      disabled={
                        isSaving ||
                        (draft.visibility === "specific_users" && draft.specificUserIds.length === 0)
                      }
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "8px",
                        minHeight: "44px",
                        border: 0,
                        borderRadius: "10px",
                        padding: "0 16px",
                        backgroundColor: isSaving ? "#A5B4FC" : "#4F46E5",
                        color: "white",
                        fontWeight: 800,
                        cursor: isSaving ? "wait" : "pointer",
                      }}
                    >
                      <Save size={17} />
                      {isSaving ? "Saving..." : "Save report access"}
                    </button>
                    {statusByKey[configuration.key] ? (
                      <span role="status" style={{ color: "#047857", fontWeight: 800 }}>
                        {statusByKey[configuration.key]}
                      </span>
                    ) : null}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
