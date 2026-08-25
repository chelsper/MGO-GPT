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

const fieldStyle = {
  width: "100%",
  border: "1px solid #CBD5E1",
  borderRadius: "9px",
  padding: "10px 11px",
  color: "#0F172A",
  font: "inherit",
  boxSizing: "border-box",
};

const fieldLabelStyle = {
  display: "grid",
  gap: "6px",
  color: "#334155",
  fontSize: "14px",
  fontWeight: 800,
};

function cloneDataConfiguration(value) {
  if (!value || typeof value !== "object") return null;
  return {
    ...value,
    constituencies: Array.isArray(value.constituencies) ? [...value.constituencies] : [],
    rows: Array.isArray(value.rows) ? value.rows.map((row) => ({ ...row })) : [],
  };
}

function createDraft(configuration) {
  return {
    title: String(configuration?.title || ""),
    description: String(configuration?.description || ""),
    visibility: configuration?.visibility || "all_users",
    specificUserIds: Array.isArray(configuration?.specificUserIds)
      ? configuration.specificUserIds.map((id) => Number(id)).filter(Number.isInteger)
      : [],
    dataConfiguration: cloneDataConfiguration(configuration?.dataConfiguration),
  };
}

function createCustomFieldDraft(configuration = null) {
  return {
    title: String(configuration?.title || ""),
    description: String(configuration?.description || ""),
    fieldCategory: String(configuration?.fieldCategory || ""),
    fieldDescription: String(configuration?.fieldDescription || ""),
    sourceQueryId: String(configuration?.sourceQueryId || ""),
    sourceQueryName: String(configuration?.sourceQueryName || ""),
    specificUserIds: Array.isArray(configuration?.specificUserIds)
      ? configuration.specificUserIds.map((id) => Number(id)).filter(Number.isInteger)
      : [],
    active: Boolean(configuration?.active),
  };
}

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

function ConfigurationCheckbox({ checked, description, label, onChange }) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: "10px",
        color: "#334155",
        cursor: "pointer",
      }}
    >
      <input checked={checked} onChange={onChange} type="checkbox" style={{ marginTop: "3px" }} />
      <span>
        <strong style={{ display: "block", color: "#0F172A", fontSize: "14px" }}>{label}</strong>
        <span style={{ display: "block", color: "#64748B", fontSize: "13px", lineHeight: 1.45 }}>
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
  const [customFieldReports, setCustomFieldReports] = useState([]);
  const [customFieldDraft, setCustomFieldDraft] = useState(() => createCustomFieldDraft());
  const [editingCustomFieldSlug, setEditingCustomFieldSlug] = useState("");
  const [savingCustomField, setSavingCustomField] = useState(false);
  const [customFieldStatus, setCustomFieldStatus] = useState("");

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
          throw new Error(payload?.error || "Could not load report configuration.");
        }

        const nextConfigurations = Array.isArray(payload?.configurations)
          ? payload.configurations
          : [];
        if (!nextConfigurations.length) {
          throw new Error("Report configuration could not be loaded.");
        }

        if (active) {
          setCanManage(Boolean(payload?.canManage));
          setConfigurations(nextConfigurations);
          setDrafts(
            Object.fromEntries(
              nextConfigurations.map((configuration) => [configuration.key, createDraft(configuration)]),
            ),
          );
          setCustomFieldReports(
            Array.isArray(payload?.customFieldReports) ? payload.customFieldReports : [],
          );
          setUsers(Array.isArray(payload?.users) ? payload.users : []);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load report configuration.",
          );
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
        ...createDraft(),
        ...current[reportKey],
        ...update,
      },
    }));
  }

  function updateDonorConfiguration(reportKey, update) {
    setDrafts((current) => {
      const draft = current[reportKey];
      const currentConfiguration = cloneDataConfiguration(draft?.dataConfiguration);
      if (!currentConfiguration) return current;

      const nextConfiguration =
        typeof update === "function" ? update(currentConfiguration) : { ...currentConfiguration, ...update };
      return {
        ...current,
        [reportKey]: {
          ...draft,
          dataConfiguration: cloneDataConfiguration(nextConfiguration),
        },
      };
    });
  }

  function updateDonorRow(reportKey, rowKey, update) {
    updateDonorConfiguration(reportKey, (configuration) => ({
      ...configuration,
      rows: (configuration.rows || []).map((row) =>
        row.key === rowKey ? { ...row, ...update } : row,
      ),
    }));
  }

  function addDonorRow(reportKey) {
    updateDonorConfiguration(reportKey, (configuration) => {
      const rows = Array.isArray(configuration.rows) ? configuration.rows : [];
      if (rows.length >= 12) return configuration;

      let rowNumber = rows.length + 1;
      let key = `donor-count-${rowNumber}`;
      const existingKeys = new Set(rows.map((row) => row.key));
      while (existingKeys.has(key)) {
        rowNumber += 1;
        key = `donor-count-${rowNumber}`;
      }

      return {
        ...configuration,
        rows: [
          ...rows,
          {
            key,
            label: `Donor count ${rowNumber}`,
            queryId: "",
            queryName: "",
            fiscalYearStart: "",
            fiscalYearEnd: "",
          },
        ],
      };
    });
  }

  function removeDonorRow(reportKey, rowKey) {
    updateDonorConfiguration(reportKey, (configuration) => {
      const rows = Array.isArray(configuration.rows) ? configuration.rows : [];
      if (rows.length <= 1) return configuration;
      return { ...configuration, rows: rows.filter((row) => row.key !== rowKey) };
    });
  }

  function toggleUser(reportKey, userId) {
    const selectedIds = drafts[reportKey]?.specificUserIds || [];
    updateDraft(reportKey, {
      specificUserIds: selectedIds.includes(userId)
        ? selectedIds.filter((id) => id !== userId)
        : [...selectedIds, userId],
    });
  }

  function toggleCustomFieldUser(userId) {
    setCustomFieldDraft((current) => ({
      ...current,
      specificUserIds: current.specificUserIds.includes(userId)
        ? current.specificUserIds.filter((id) => id !== userId)
        : [...current.specificUserIds, userId],
    }));
  }

  function beginCustomFieldEdit(configuration) {
    setEditingCustomFieldSlug(configuration.slug);
    setCustomFieldDraft(createCustomFieldDraft(configuration));
    setCustomFieldStatus("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function resetCustomFieldDraft({ clearStatus = true } = {}) {
    setEditingCustomFieldSlug("");
    setCustomFieldDraft(createCustomFieldDraft());
    if (clearStatus) setCustomFieldStatus("");
    setError("");
  }

  async function saveCustomFieldReport() {
    setSavingCustomField(true);
    setError("");
    setCustomFieldStatus("");
    try {
      const response = await fetch("/api/reports/configurations", {
        method: editingCustomFieldSlug ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...customFieldDraft,
          ...(editingCustomFieldSlug ? { customFieldReportSlug: editingCustomFieldSlug } : {}),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not save the Custom Field Report.");
      }

      if (payload?.configuration) {
        setCustomFieldReports((current) => {
          const remaining = current.filter((item) => item.slug !== payload.configuration.slug);
          return [...remaining, payload.configuration].sort((first, second) =>
            String(first.title || "").localeCompare(String(second.title || "")),
          );
        });
      }
      resetCustomFieldDraft({ clearStatus: false });
      setCustomFieldStatus(payload?.message || "Custom Field Report saved.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save the Custom Field Report.");
    } finally {
      setSavingCustomField(false);
    }
  }

  async function deleteCustomFieldReport(configuration) {
    const confirmed = window.confirm(
      `Delete ${configuration.title}? Its saved report snapshot will also be removed.`,
    );
    if (!confirmed) return;

    setSavingCustomField(true);
    setError("");
    setCustomFieldStatus("");
    try {
      const response = await fetch("/api/reports/configurations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customFieldReportSlug: configuration.slug }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not delete the Custom Field Report.");
      }

      setCustomFieldReports((current) => current.filter((item) => item.slug !== configuration.slug));
      if (editingCustomFieldSlug === configuration.slug) resetCustomFieldDraft();
      setCustomFieldStatus(payload?.message || "Custom Field Report deleted.");
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete the Custom Field Report.",
      );
    } finally {
      setSavingCustomField(false);
    }
  }

  async function saveConfiguration(configuration) {
    const draft = drafts[configuration.key] || createDraft(configuration);
    setSavingKey(configuration.key);
    setError("");
    setStatusByKey((current) => ({ ...current, [configuration.key]: "" }));
    try {
      const response = await fetch("/api/reports/configurations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportKey: configuration.key,
          title: draft.title,
          description: draft.description,
          visibility: draft.visibility,
          specificUserIds:
            draft.visibility === "specific_users" ? draft.specificUserIds : [],
          ...(configuration.key === "alumni-family-engagement"
            ? { dataConfiguration: draft.dataConfiguration }
            : {}),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not save report configuration.");
      }

      if (payload?.configuration) {
        setConfigurations((current) =>
          current.map((item) =>
            item.key === configuration.key ? payload.configuration : item,
          ),
        );
        setDrafts((current) => ({
          ...current,
          [configuration.key]: createDraft(payload.configuration),
        }));
      }
      setStatusByKey((current) => ({
        ...current,
        [configuration.key]: payload?.message || "Report configuration saved.",
      }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save report configuration.");
    } finally {
      setSavingKey("");
    }
  }

  if (loadingUser || loading) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#64748B" }}>
        Loading report configuration...
      </main>
    );
  }

  if (!user) return null;

  const standardConfigurations = configurations.filter(
    (configuration) => !String(configuration.key || "").startsWith("custom-field:"),
  );
  const selectedCustomUsers = customFieldDraft.specificUserIds.length;
  const canSaveCustomField =
    Boolean(customFieldDraft.title.trim()) &&
    Boolean(customFieldDraft.fieldCategory.trim()) &&
    Boolean(customFieldDraft.fieldDescription.trim()) &&
    /^\d+$/.test(customFieldDraft.sourceQueryId.trim()) &&
    (!customFieldDraft.active || selectedCustomUsers > 0);

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
            <h1 style={{ margin: 0, color: "#0F172A", fontSize: "30px" }}>Report Configuration</h1>
            <p style={{ margin: "6px 0 0", color: "#64748B" }}>
              Configure report names, data sources, and access. Blackbaud data access remains tied to each user&apos;s connection.
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
            <h2 style={{ margin: 0, color: "#0F172A" }}>Report configuration is managed by Advancement Services</h2>
            <p style={{ margin: "9px 0 0", color: "#64748B", lineHeight: 1.5 }}>
              Admins and Advancement Services users can choose who is able to view shared reports.
            </p>
          </section>
        ) : (
          <div style={{ display: "grid", gap: "20px" }}>
            {standardConfigurations.map((configuration) => {
              const draft = drafts[configuration.key] || createDraft(configuration);
              const donorConfiguration = draft.dataConfiguration;
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

                  <section
                    aria-label={`Presentation settings for ${configuration.title}`}
                    style={{
                      marginTop: "20px",
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                      gap: "14px",
                    }}
                  >
                    <label style={fieldLabelStyle}>
                      <span>Report title</span>
                      <input
                        style={fieldStyle}
                        type="text"
                        value={draft.title}
                        maxLength={120}
                        onChange={(event) => updateDraft(configuration.key, { title: event.target.value })}
                      />
                    </label>
                    <label style={{ ...fieldLabelStyle, gridColumn: "1 / -1" }}>
                      <span>Report description</span>
                      <textarea
                        style={{ ...fieldStyle, minHeight: "84px", resize: "vertical" }}
                        value={draft.description}
                        maxLength={1000}
                        onChange={(event) =>
                          updateDraft(configuration.key, { description: event.target.value })
                        }
                      />
                    </label>
                  </section>

                  {configuration.key === "alumni-family-engagement" && donorConfiguration ? (
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
                        Donors by Constituency
                      </h3>
                      <p style={{ margin: "7px 0 0", color: "#334155", lineHeight: 1.5 }}>
                        Configure the donor definition that corresponds to the saved NXT queries below. The saved
                        query is still the source of truth when the report refreshes, so changing these fields here
                        does not alter a query in NXT.
                      </p>

                      <div
                        style={{
                          marginTop: "16px",
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                          gap: "14px",
                        }}
                      >
                        <label style={fieldLabelStyle}>
                          <span>Internal source name</span>
                          <input
                            style={fieldStyle}
                            type="text"
                            value={donorConfiguration.sourceLabel}
                            maxLength={120}
                            onChange={(event) =>
                              updateDonorConfiguration(configuration.key, {
                                sourceLabel: event.target.value,
                              })
                            }
                          />
                        </label>
                        <div
                          style={{
                            border: "1px solid #BFDBFE",
                            borderRadius: "10px",
                            padding: "11px 12px",
                            color: "#334155",
                            fontSize: "13px",
                            lineHeight: 1.45,
                            backgroundColor: "rgba(255, 255, 255, 0.66)",
                          }}
                        >
                          Internal only. The public report uses the report title above.
                        </div>
                      </div>

                      <div
                        style={{
                          marginTop: "18px",
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(250px, 1fr))",
                          gap: "12px 20px",
                        }}
                      >
                        <ConfigurationCheckbox
                          checked={donorConfiguration.includeSoftCreditedDonors}
                          label="Include soft-credited donors"
                          description="Records the saved NXT query's Both setting and is enabled by default. To change the count, use a saved NXT query with the matching credit setting."
                          onChange={(event) =>
                            updateDonorConfiguration(configuration.key, {
                              includeSoftCreditedDonors: event.target.checked,
                            })
                          }
                        />
                        <ConfigurationCheckbox
                          checked={donorConfiguration.includeMatchingGiftCredits}
                          label="Include matching-gift credits"
                          description="Records the saved NXT query's Both setting. To change the count, use a saved NXT query with the matching credit setting."
                          onChange={(event) =>
                            updateDonorConfiguration(configuration.key, {
                              includeMatchingGiftCredits: event.target.checked,
                            })
                          }
                        />
                        <ConfigurationCheckbox
                          checked={donorConfiguration.includeInactiveConstituents}
                          label="Include inactive constituents"
                          description="Mirrors the saved NXT query option."
                          onChange={(event) =>
                            updateDonorConfiguration(configuration.key, {
                              includeInactiveConstituents: event.target.checked,
                            })
                          }
                        />
                        <ConfigurationCheckbox
                          checked={donorConfiguration.includeDeceasedConstituents}
                          label="Include deceased constituents"
                          description="Mirrors the saved NXT query option."
                          onChange={(event) =>
                            updateDonorConfiguration(configuration.key, {
                              includeDeceasedConstituents: event.target.checked,
                            })
                          }
                        />
                        <ConfigurationCheckbox
                          checked={donorConfiguration.includeConstituentsWithoutValidAddress}
                          label="Include constituents with no valid address"
                          description="Mirrors the saved NXT query option."
                          onChange={(event) =>
                            updateDonorConfiguration(configuration.key, {
                              includeConstituentsWithoutValidAddress: event.target.checked,
                            })
                          }
                        />
                      </div>

                      <label style={{ ...fieldLabelStyle, marginTop: "20px" }}>
                        <span>Constituency codes</span>
                        <textarea
                          style={{ ...fieldStyle, minHeight: "150px", resize: "vertical" }}
                          value={(donorConfiguration.constituencies || []).join("\n")}
                          onChange={(event) =>
                            updateDonorConfiguration(configuration.key, {
                              constituencies: event.target.value
                                .split(/\r?\n/)
                                .map((value) => value.trim())
                                .filter(Boolean),
                            })
                          }
                        />
                        <span style={{ color: "#64748B", fontSize: "13px", fontWeight: 500, lineHeight: 1.45 }}>
                          One NXT constituency code per line. Keep this aligned with the corresponding saved query.
                        </span>
                      </label>

                      <div style={{ marginTop: "22px", display: "grid", gap: "12px" }}>
                        <div>
                          <h4 style={{ margin: 0, color: "#1E3A8A", fontSize: "15px" }}>FY donor counts</h4>
                          <p style={{ margin: "5px 0 0", color: "#475569", fontSize: "13px", lineHeight: 1.45 }}>
                            Each row executes one saved NXT constituent query and uses the job&apos;s returned row count.
                          </p>
                        </div>

                        {(donorConfiguration.rows || []).map((row, index) => (
                          <article
                            key={row.key}
                            style={{
                              border: "1px solid #BFDBFE",
                              borderRadius: "12px",
                              padding: "15px",
                              backgroundColor: "rgba(255, 255, 255, 0.76)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "12px",
                                marginBottom: "13px",
                              }}
                            >
                              <strong style={{ color: "#1E3A8A" }}>Count row {index + 1}</strong>
                              <button
                                type="button"
                                disabled={(donorConfiguration.rows || []).length <= 1}
                                onClick={() => removeDonorRow(configuration.key, row.key)}
                                style={{
                                  border: "1px solid #CBD5E1",
                                  backgroundColor: "white",
                                  color: "#334155",
                                  borderRadius: "8px",
                                  padding: "7px 10px",
                                  fontWeight: 700,
                                  cursor:
                                    (donorConfiguration.rows || []).length <= 1
                                      ? "not-allowed"
                                      : "pointer",
                                  opacity: (donorConfiguration.rows || []).length <= 1 ? 0.55 : 1,
                                }}
                              >
                                Remove row
                              </button>
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
                                gap: "12px",
                              }}
                            >
                              <label style={fieldLabelStyle}>
                                <span>Custom label</span>
                                <input
                                  style={fieldStyle}
                                  type="text"
                                  value={row.label}
                                  maxLength={120}
                                  onChange={(event) =>
                                    updateDonorRow(configuration.key, row.key, {
                                      label: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label style={fieldLabelStyle}>
                                <span>Saved NXT query system record ID</span>
                                <input
                                  style={fieldStyle}
                                  type="text"
                                  inputMode="numeric"
                                  value={row.queryId}
                                  onChange={(event) =>
                                    updateDonorRow(configuration.key, row.key, {
                                      queryId: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label style={fieldLabelStyle}>
                                <span>Saved NXT query name</span>
                                <input
                                  style={fieldStyle}
                                  type="text"
                                  value={row.queryName}
                                  maxLength={200}
                                  onChange={(event) =>
                                    updateDonorRow(configuration.key, row.key, {
                                      queryName: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label style={fieldLabelStyle}>
                                <span>Fiscal year start</span>
                                <input
                                  style={fieldStyle}
                                  type="date"
                                  value={row.fiscalYearStart}
                                  onChange={(event) =>
                                    updateDonorRow(configuration.key, row.key, {
                                      fiscalYearStart: event.target.value,
                                    })
                                  }
                                />
                              </label>
                              <label style={fieldLabelStyle}>
                                <span>Fiscal year end</span>
                                <input
                                  style={fieldStyle}
                                  type="date"
                                  value={row.fiscalYearEnd}
                                  onChange={(event) =>
                                    updateDonorRow(configuration.key, row.key, {
                                      fiscalYearEnd: event.target.value,
                                    })
                                  }
                                />
                              </label>
                            </div>
                          </article>
                        ))}

                        <button
                          type="button"
                          disabled={(donorConfiguration.rows || []).length >= 12}
                          onClick={() => addDonorRow(configuration.key)}
                          style={{
                            width: "fit-content",
                            border: "1px solid #4F46E5",
                            backgroundColor: "white",
                            color: "#4338CA",
                            borderRadius: "9px",
                            padding: "9px 12px",
                            fontWeight: 800,
                            cursor: (donorConfiguration.rows || []).length >= 12 ? "not-allowed" : "pointer",
                            opacity: (donorConfiguration.rows || []).length >= 12 ? 0.55 : 1,
                          }}
                        >
                          Add donor-count row
                        </button>
                      </div>
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
                      {isSaving ? "Saving..." : "Save report configuration"}
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

            <section style={panelStyle}>
              <div style={{ borderBottom: "1px solid #E2E8F0", paddingBottom: "18px" }}>
                <h2 style={{ margin: 0, color: "#0F172A", fontSize: "21px" }}>Custom Field Reports</h2>
                <p style={{ margin: "7px 0 0", color: "#64748B", lineHeight: 1.5 }}>
                  Create a report from a saved NXT query whose criteria match an exact custom-field category and
                  description. The saved query remains the source of truth for the results.
                </p>
                <p style={{ margin: "10px 0 0", color: "#9A3412", lineHeight: 1.5, fontWeight: 800 }}>
                  A custom report is hidden until it is enabled and at least one active user is selected. Administrator
                  status does not grant automatic access.
                </p>
              </div>

              <section
                aria-label={editingCustomFieldSlug ? "Edit Custom Field Report" : "Create Custom Field Report"}
                style={{ marginTop: "20px" }}
              >
                <h3 style={{ color: "#334155", fontSize: "16px", margin: 0 }}>
                  {editingCustomFieldSlug ? "Edit Custom Field Report" : "Add Custom Field Report"}
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "14px",
                    marginTop: "15px",
                  }}
                >
                  <label style={fieldLabelStyle}>
                    <span>Report title</span>
                    <input
                      style={fieldStyle}
                      type="text"
                      value={customFieldDraft.title}
                      maxLength={120}
                      placeholder="Example: Future. Made. Phase II"
                      onChange={(event) =>
                        setCustomFieldDraft((current) => ({ ...current, title: event.target.value }))
                      }
                    />
                  </label>
                  <label style={fieldLabelStyle}>
                    <span>Saved NXT query system record ID</span>
                    <input
                      style={fieldStyle}
                      type="text"
                      inputMode="numeric"
                      value={customFieldDraft.sourceQueryId}
                      placeholder="Numbers only"
                      onChange={(event) =>
                        setCustomFieldDraft((current) => ({ ...current, sourceQueryId: event.target.value }))
                      }
                    />
                  </label>
                  <label style={fieldLabelStyle}>
                    <span>Exact NXT custom-field category</span>
                    <input
                      style={fieldStyle}
                      type="text"
                      value={customFieldDraft.fieldCategory}
                      placeholder="Example: Prospect Research"
                      maxLength={200}
                      onChange={(event) =>
                        setCustomFieldDraft((current) => ({ ...current, fieldCategory: event.target.value }))
                      }
                    />
                  </label>
                  <label style={fieldLabelStyle}>
                    <span>Exact NXT custom-field description</span>
                    <input
                      style={fieldStyle}
                      type="text"
                      value={customFieldDraft.fieldDescription}
                      placeholder="Example: Future. Made. Phase II"
                      maxLength={200}
                      onChange={(event) =>
                        setCustomFieldDraft((current) => ({ ...current, fieldDescription: event.target.value }))
                      }
                    />
                  </label>
                  <label style={fieldLabelStyle}>
                    <span>Saved NXT query name (optional)</span>
                    <input
                      style={fieldStyle}
                      type="text"
                      value={customFieldDraft.sourceQueryName}
                      maxLength={200}
                      onChange={(event) =>
                        setCustomFieldDraft((current) => ({ ...current, sourceQueryName: event.target.value }))
                      }
                    />
                  </label>
                  <label style={{ ...fieldLabelStyle, gridColumn: "1 / -1" }}>
                    <span>Report description (optional)</span>
                    <textarea
                      style={{ ...fieldStyle, minHeight: "76px", resize: "vertical" }}
                      value={customFieldDraft.description}
                      maxLength={1000}
                      onChange={(event) =>
                        setCustomFieldDraft((current) => ({ ...current, description: event.target.value }))
                      }
                    />
                  </label>
                </div>

                <section
                  style={{
                    marginTop: "20px",
                    padding: "16px",
                    borderRadius: "13px",
                    border: "1px solid #FED7AA",
                    backgroundColor: "#FFF7ED",
                  }}
                >
                  <ConfigurationCheckbox
                    checked={customFieldDraft.active}
                    label="Enable this report for the selected users"
                    description="Disabled reports are not shown in My Reports and cannot be opened, even by administrators."
                    onChange={(event) =>
                      setCustomFieldDraft((current) => ({ ...current, active: event.target.checked }))
                    }
                  />
                </section>

                <section style={{ marginTop: "20px" }} aria-label="Select custom report users">
                  <h4 style={{ color: "#334155", fontSize: "15px", margin: 0 }}>Users with access</h4>
                  <p style={{ margin: "6px 0 12px", color: "#64748B", lineHeight: 1.45, fontSize: "14px" }}>
                    Select every person who can see this report. This is the full access list; no role has a bypass.
                  </p>
                  <div style={{ display: "grid", gap: "8px", maxHeight: "360px", overflowY: "auto" }}>
                    {users.map((workspaceUser) => {
                      const userId = Number(workspaceUser.id);
                      const checked = customFieldDraft.specificUserIds.includes(userId);
                      return (
                        <label
                          key={workspaceUser.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "10px",
                            border: checked ? "2px solid #4F46E5" : "1px solid #E2E8F0",
                            borderRadius: "10px",
                            padding: "11px 12px",
                            cursor: "pointer",
                            backgroundColor: checked ? "#EEF2FF" : "white",
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCustomFieldUser(userId)}
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
                  {customFieldDraft.active && selectedCustomUsers === 0 ? (
                    <p style={{ color: "#B45309", margin: "10px 0 0", fontWeight: 700 }}>
                      Select at least one active user before enabling this report.
                    </p>
                  ) : null}
                </section>

                <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginTop: "20px" }}>
                  <button
                    type="button"
                    onClick={saveCustomFieldReport}
                    disabled={savingCustomField || !canSaveCustomField}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                      minHeight: "44px",
                      border: 0,
                      borderRadius: "10px",
                      padding: "0 16px",
                      backgroundColor: savingCustomField || !canSaveCustomField ? "#A5B4FC" : "#4F46E5",
                      color: "white",
                      fontWeight: 800,
                      cursor: savingCustomField || !canSaveCustomField ? "not-allowed" : "pointer",
                    }}
                  >
                    <Save size={17} />
                    {savingCustomField
                      ? "Saving..."
                      : editingCustomFieldSlug
                        ? "Save Custom Field Report"
                        : "Create Custom Field Report"}
                  </button>
                  {editingCustomFieldSlug ? (
                    <button
                      type="button"
                      onClick={resetCustomFieldDraft}
                      disabled={savingCustomField}
                      style={{
                        minHeight: "44px",
                        border: "1px solid #CBD5E1",
                        borderRadius: "10px",
                        backgroundColor: "white",
                        color: "#334155",
                        padding: "0 14px",
                        fontWeight: 800,
                        cursor: savingCustomField ? "not-allowed" : "pointer",
                      }}
                    >
                      Cancel edit
                    </button>
                  ) : null}
                  {customFieldStatus ? (
                    <span role="status" style={{ color: "#047857", fontWeight: 800 }}>
                      {customFieldStatus}
                    </span>
                  ) : null}
                </div>
              </section>

              <section style={{ marginTop: "28px" }} aria-label="Configured Custom Field Reports">
                <h3 style={{ color: "#334155", fontSize: "16px", margin: 0 }}>Configured reports</h3>
                {customFieldReports.length ? (
                  <div style={{ display: "grid", gap: "12px", marginTop: "12px" }}>
                    {customFieldReports.map((configuration) => {
                      const selectedUsers = configuration.specificUserIds
                        .map((userId) => users.find((workspaceUser) => Number(workspaceUser.id) === Number(userId)))
                        .filter(Boolean);
                      return (
                        <article
                          key={configuration.slug}
                          style={{
                            border: "1px solid #E2E8F0",
                            borderRadius: "13px",
                            padding: "16px",
                            backgroundColor: configuration.active ? "#F0FDF4" : "#F8FAFC",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-start",
                              justifyContent: "space-between",
                              gap: "12px",
                              flexWrap: "wrap",
                            }}
                          >
                            <div>
                              <strong style={{ color: "#0F172A", fontSize: "17px" }}>{configuration.title}</strong>
                              <p style={{ margin: "5px 0 0", color: "#64748B", lineHeight: 1.45 }}>
                                {configuration.fieldCategory}: {configuration.fieldDescription} · Query {configuration.sourceQueryId}
                              </p>
                            </div>
                            <span
                              style={{
                                borderRadius: "999px",
                                padding: "5px 9px",
                                fontSize: "13px",
                                fontWeight: 800,
                                color: configuration.active ? "#166534" : "#92400E",
                                backgroundColor: configuration.active ? "#DCFCE7" : "#FEF3C7",
                              }}
                            >
                              {configuration.active ? "Enabled" : "Hidden"}
                            </span>
                          </div>
                          <p style={{ margin: "10px 0 0", color: "#475569", lineHeight: 1.45, fontSize: "14px" }}>
                            Visible to: {selectedUsers.length
                              ? selectedUsers.map((workspaceUser) => workspaceUser.name || workspaceUser.email).join(", ")
                              : "No users selected"}
                          </p>
                          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
                            <button
                              type="button"
                              onClick={() => beginCustomFieldEdit(configuration)}
                              disabled={savingCustomField}
                              style={{
                                border: "1px solid #4F46E5",
                                borderRadius: "9px",
                                backgroundColor: "white",
                                color: "#4338CA",
                                padding: "8px 11px",
                                fontWeight: 800,
                                cursor: savingCustomField ? "not-allowed" : "pointer",
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteCustomFieldReport(configuration)}
                              disabled={savingCustomField}
                              style={{
                                border: "1px solid #FCA5A5",
                                borderRadius: "9px",
                                backgroundColor: "white",
                                color: "#B91C1C",
                                padding: "8px 11px",
                                fontWeight: 800,
                                cursor: savingCustomField ? "not-allowed" : "pointer",
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ margin: "10px 0 0", color: "#64748B" }}>
                    No Custom Field Reports have been configured. Nothing is visible to users yet.
                  </p>
                )}
              </section>
            </section>
          </div>
        )}
      </div>
    </main>
  );
}
