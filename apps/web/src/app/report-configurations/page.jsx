"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Save } from "lucide-react";
import useUser from "@/utils/useUser";
import { getWorkspaceRoleLabel } from "@/utils/workspaceRoles";
import {
  AVAILABLE_CONSTITUENCY_CODES,
} from "@/app/api/utils/alumniDonorConfiguration";
import {
  getReportTypeDefinitions,
  REPORT_TYPES,
} from "@/app/api/utils/reportRegistry";

const REPORT_TYPE_OPTIONS = getReportTypeDefinitions();

const AUDIENCE_OPTIONS = Object.freeze({
  all_users: Object.freeze({ title: "All active users", descriptionKey: "allUsers" }),
  executive: Object.freeze({ title: "Executives", descriptionKey: "executives" }),
  specific_users: Object.freeze({ title: "Specific users", descriptionKey: "specificUsers" }),
});

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
    giftTypes: Array.isArray(value.giftTypes) ? [...value.giftTypes] : [],
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

function getConfigurationCapabilities(configuration) {
  const capabilities = configuration?.configurationCapabilities || {};
  const access = capabilities.access || {};
  const configuredVisibilities = Array.isArray(access.allowedVisibilities)
    ? access.allowedVisibilities.filter((visibility) => AUDIENCE_OPTIONS[visibility])
    : [];
  const allowedVisibilities = configuredVisibilities.length
    ? configuredVisibilities
    : ["all_users", "executive", "specific_users"];

  return {
    canEditTitle: capabilities.canEditTitle !== false,
    canEditDescription: capabilities.canEditDescription !== false,
    dataConfiguration: capabilities.dataConfiguration || null,
    access: {
      enabled: access.enabled !== false,
      allowedVisibilities,
      requiresSpecificUsers: access.requiresSpecificUsers !== false,
      adminRoleBypass: access.adminRoleBypass !== false,
    },
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
        {description ? (
          <span style={{ display: "block", color: "#64748B", fontSize: "13px", lineHeight: 1.45 }}>
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function getAudienceDescriptions(configuration) {
  if (configuration.audienceMode === "global_custom_field") {
    return {
      allUsers:
        "Every active user can run this saved query globally. Results do not depend on a selected MGO workspace.",
      executives:
        "Executives can run this saved query globally. MGO users do not gain access.",
      specificUsers:
        "Choose individual active users who should be able to run this saved query globally.",
    };
  }

  if (configuration.audienceMode === "team_standings") {
    return {
      allUsers:
        "Every active user can view the local team standings. No Blackbaud report data is loaded.",
      executives:
        "Executives can view the local team standings. MGO users do not gain access.",
      specificUsers:
        "Choose individual active users who should be able to view the local team standings.",
    };
  }

  if (configuration.audienceMode === "shared_snapshot") {
    return {
      allUsers:
        "Every active user can view this shared donor snapshot. Normal report visits do not make a new NXT request.",
      executives:
        "Executives can view this shared donor snapshot. MGO users do not gain access.",
      specificUsers:
        "Choose individual active users who should be able to view this shared donor snapshot.",
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
  const [activeReportType, setActiveReportType] = useState(REPORT_TYPES.MGO_GPT);
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

  function toggleDonorListValue(reportKey, field, value, checked) {
    updateDonorConfiguration(reportKey, (configuration) => {
      const currentValues = Array.isArray(configuration[field]) ? configuration[field] : [];
      const normalizedValue = String(value || "").trim().toLocaleLowerCase("en-US");
      const existingValues = currentValues.filter(
        (entry) => String(entry || "").trim().toLocaleLowerCase("en-US") !== normalizedValue,
      );
      return {
        ...configuration,
        [field]: checked ? [...existingValues, value] : existingValues,
      };
    });
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
    const capabilities = getConfigurationCapabilities(configuration);
    const isSpecificUsersVisibility = draft.visibility === "specific_users";
    setSavingKey(configuration.key);
    setError("");
    setStatusByKey((current) => ({ ...current, [configuration.key]: "" }));
    try {
      const response = await fetch("/api/reports/configurations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reportKey: configuration.key,
          ...(capabilities.canEditTitle ? { title: draft.title } : {}),
          ...(capabilities.canEditDescription ? { description: draft.description } : {}),
          ...(capabilities.access.enabled
            ? {
                visibility: draft.visibility,
                specificUserIds:
                  isSpecificUsersVisibility ? draft.specificUserIds : [],
              }
            : {}),
          ...(capabilities.dataConfiguration === "alumni_donor_count"
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
  const activeReportTypeDefinition = REPORT_TYPE_OPTIONS.find(
    (reportType) => reportType.key === activeReportType,
  );
  const visibleStandardConfigurations = standardConfigurations.filter(
    (configuration) => configuration.reportType === activeReportType,
  );
  const isCustomFieldReportType = activeReportType === REPORT_TYPES.CUSTOM_FIELD;
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
            <section style={{ ...panelStyle, padding: "18px" }} aria-label="Report configuration categories">
              <p style={{ margin: 0, color: "#475569", lineHeight: 1.5 }}>
                Organize existing report configurations by source. This catalog does not change report refreshes,
                NXT requests, caching, or report URLs.
              </p>
              <div
                role="tablist"
                aria-label="Report configuration categories"
                style={{ display: "flex", gap: "9px", flexWrap: "wrap", marginTop: "16px" }}
              >
                {REPORT_TYPE_OPTIONS.map((reportType) => {
                  const selected = reportType.key === activeReportType;
                  return (
                    <button
                      key={reportType.key}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActiveReportType(reportType.key)}
                      style={{
                        minHeight: "40px",
                        border: selected ? "1px solid #4338CA" : "1px solid #CBD5E1",
                        borderRadius: "999px",
                        backgroundColor: selected ? "#EEF2FF" : "white",
                        color: selected ? "#3730A3" : "#334155",
                        padding: "0 14px",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      {reportType.label}
                    </button>
                  );
                })}
              </div>
              {activeReportTypeDefinition ? (
                <p style={{ margin: "12px 0 0", color: "#64748B", lineHeight: 1.45, fontSize: "14px" }}>
                  {activeReportTypeDefinition.description}
                </p>
              ) : null}
            </section>

            {visibleStandardConfigurations.length ? (
              visibleStandardConfigurations.map((configuration) => {
              const draft = drafts[configuration.key] || createDraft(configuration);
              const donorConfiguration = draft.dataConfiguration;
              const descriptions = getAudienceDescriptions(configuration);
              const capabilities = getConfigurationCapabilities(configuration);
              const hasEditablePresentation =
                capabilities.canEditTitle || capabilities.canEditDescription;
              const supportsSpecificUsers = capabilities.access.allowedVisibilities.includes("specific_users");
              const isSpecificUsersVisibility =
                supportsSpecificUsers && draft.visibility === "specific_users";
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
                    {configuration.presentationNote ? (
                      <p
                        style={{
                          margin: "10px 0 0",
                          color: configuration.presentationNoteTone === "success" ? "#166534" : "#1D4ED8",
                          lineHeight: 1.5,
                          fontWeight: 700,
                        }}
                      >
                        {configuration.presentationNote}
                      </p>
                    ) : null}
                  </div>

                  {hasEditablePresentation ? (
                    <section
                      aria-label={`Presentation settings for ${configuration.title}`}
                      style={{
                        marginTop: "20px",
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                        gap: "14px",
                      }}
                    >
                      {capabilities.canEditTitle ? (
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
                      ) : null}
                      {capabilities.canEditDescription ? (
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
                      ) : null}
                    </section>
                  ) : null}

                  {capabilities.dataConfiguration === "alumni_donor_count" && donorConfiguration ? (
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
                        Count distinct constituents with a compact NXT Query API job. The job is generated from
                        these settings, returns only a row count, and never changes a saved NXT query or downloads
                        constituent records.
                      </p>

                      <p style={{ margin: "9px 0 0", color: "#475569", fontSize: "13px", lineHeight: 1.45 }}>
                        The default definition mirrors the supplied <strong>Alumni Donors FY27</strong> query:
                        constituency-code field 2217, gift-date field 8471, and distinct constituent results.
                      </p>

                      <div style={{ marginTop: "20px" }}>
                        <h4 style={{ margin: 0, color: "#1E3A8A", fontSize: "15px" }}>
                          Constituency codes
                        </h4>
                        <p style={{ margin: "5px 0 0", color: "#475569", fontSize: "13px", lineHeight: 1.45 }}>
                          Select the active NXT codes that identify a donor for this report. A constituent only needs
                          one selected code to count.
                        </p>
                        <div
                          style={{
                            marginTop: "12px",
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                            gap: "10px 18px",
                          }}
                        >
                          {AVAILABLE_CONSTITUENCY_CODES.map((code) => (
                            <ConfigurationCheckbox
                              key={code}
                              checked={(donorConfiguration.constituencies || []).some(
                                (entry) =>
                                  String(entry || "").trim().toLocaleLowerCase("en-US") ===
                                  code.toLocaleLowerCase("en-US"),
                              )}
                              label={code}
                              onChange={(event) =>
                                toggleDonorListValue(
                                  configuration.key,
                                  "constituencies",
                                  code,
                                  event.target.checked,
                                )
                              }
                            />
                          ))}
                        </div>
                      </div>

                      <label style={{ ...fieldLabelStyle, marginTop: "20px" }}>
                        <span>Other NXT constituency codes</span>
                        <textarea
                          style={{ ...fieldStyle, minHeight: "88px", resize: "vertical" }}
                          value={(donorConfiguration.constituencies || [])
                            .filter(
                              (entry) =>
                                !AVAILABLE_CONSTITUENCY_CODES.some(
                                  (code) =>
                                    code.toLocaleLowerCase("en-US") ===
                                    String(entry || "").trim().toLocaleLowerCase("en-US"),
                                ),
                            )
                            .join("\n")}
                          onChange={(event) => {
                            const selectedKnownCodes = (donorConfiguration.constituencies || []).filter((entry) =>
                              AVAILABLE_CONSTITUENCY_CODES.some(
                                (code) =>
                                  code.toLocaleLowerCase("en-US") ===
                                  String(entry || "").trim().toLocaleLowerCase("en-US"),
                              ),
                            );
                            updateDonorConfiguration(configuration.key, {
                              constituencies: [
                                ...selectedKnownCodes,
                                ...event.target.value
                                  .split(/\r?\n/)
                                  .map((value) => value.trim())
                                  .filter(Boolean),
                              ],
                            });
                          }}
                        />
                        <span style={{ color: "#64748B", fontSize: "13px", fontWeight: 500, lineHeight: 1.45 }}>
                          Add any active NXT constituency code not shown above as <code>12345 | Display label</code>,
                          one per line. The numeric NXT code ID is required.
                        </span>
                      </label>

                      <div
                        style={{
                          marginTop: "20px",
                          borderTop: "1px solid #BFDBFE",
                          paddingTop: "18px",
                        }}
                      >
                        <h4 style={{ margin: 0, color: "#1E3A8A", fontSize: "15px" }}>NXT inclusion rules</h4>
                        <p style={{ margin: "5px 0 0", color: "#475569", fontSize: "13px", lineHeight: 1.45 }}>
                          These settings map directly to NXT Query API options. No separate gift-type selector is
                          shown because the supplied NXT query definition does not include a gift-type field.
                        </p>
                        <div
                          style={{
                            marginTop: "12px",
                            display: "grid",
                            gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))",
                            gap: "10px 18px",
                          }}
                        >
                          <ConfigurationCheckbox
                            checked={donorConfiguration.includeSoftCreditedDonors !== false}
                            label="Include soft-credited donors"
                            description="Uses NXT's Both credit option, so qualifying soft-credit recipients count."
                            onChange={(event) =>
                              updateDonorConfiguration(configuration.key, {
                                includeSoftCreditedDonors: event.target.checked,
                              })
                            }
                          />
                          <ConfigurationCheckbox
                            checked={donorConfiguration.includeMatchingGiftCredits !== false}
                            label="Include matching-gift credits"
                            description="Uses NXT's Both matching-gift credit option."
                            onChange={(event) =>
                              updateDonorConfiguration(configuration.key, {
                                includeMatchingGiftCredits: event.target.checked,
                              })
                            }
                          />
                          <ConfigurationCheckbox
                            checked={donorConfiguration.includeInactiveConstituents !== false}
                            label="Include inactive constituents"
                            onChange={(event) =>
                              updateDonorConfiguration(configuration.key, {
                                includeInactiveConstituents: event.target.checked,
                              })
                            }
                          />
                          <ConfigurationCheckbox
                            checked={donorConfiguration.includeDeceasedConstituents !== false}
                            label="Include deceased constituents"
                            onChange={(event) =>
                              updateDonorConfiguration(configuration.key, {
                                includeDeceasedConstituents: event.target.checked,
                              })
                            }
                          />
                          <ConfigurationCheckbox
                            checked={donorConfiguration.includeConstituentsWithNoValidAddress !== false}
                            label="Include constituents with no valid address"
                            onChange={(event) =>
                              updateDonorConfiguration(configuration.key, {
                                includeConstituentsWithNoValidAddress: event.target.checked,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div style={{ marginTop: "22px", display: "grid", gap: "12px" }}>
                        <div>
                          <h4 style={{ margin: 0, color: "#1E3A8A", fontSize: "15px" }}>FY donor counts</h4>
                          <p style={{ margin: "5px 0 0", color: "#475569", fontSize: "13px", lineHeight: 1.45 }}>
                            Each row runs one count-only NXT query job for its fiscal-year dates. The completed job's
                            row count is saved as the report total; no donor list is downloaded.
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

                  {capabilities.access.enabled ? (
                    <fieldset style={{ border: 0, padding: 0, margin: "22px 0 0" }}>
                      <legend style={{ color: "#334155", fontSize: "15px", fontWeight: 800, marginBottom: "12px" }}>
                        Who can view this report?
                      </legend>
                      <div style={{ display: "grid", gap: "11px" }}>
                        {capabilities.access.allowedVisibilities.map((visibility) => {
                          const option = AUDIENCE_OPTIONS[visibility];
                          return (
                            <AudienceOption
                              key={visibility}
                              checked={draft.visibility === visibility}
                              description={descriptions[option.descriptionKey]}
                              name={`report-visibility-${configuration.key}`}
                              onChange={() => updateDraft(configuration.key, { visibility })}
                              title={option.title}
                              value={visibility}
                            />
                          );
                        })}
                      </div>
                    </fieldset>
                  ) : null}

                  {isSpecificUsersVisibility ? (
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
                    {configuration.adapterKey === "executive-team-standings"
                      ? "This report uses only JUMGOGPT operational data and does not require a Blackbaud connection to load."
                      : "Each person still needs a connected Blackbaud account with permission to read the report's data."}
                  </p>

                  <div style={{ display: "flex", alignItems: "center", gap: "14px", flexWrap: "wrap", marginTop: "20px" }}>
                    <button
                      type="button"
                      onClick={() => saveConfiguration(configuration)}
                      disabled={
                        isSaving ||
                        (isSpecificUsersVisibility &&
                          capabilities.access.requiresSpecificUsers &&
                          draft.specificUserIds.length === 0)
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
              })
            ) : (
              <section style={panelStyle}>
                <h2 style={{ margin: 0, color: "#0F172A", fontSize: "21px" }}>
                  No built-in reports in this category yet
                </h2>
                <p style={{ margin: "8px 0 0", color: "#64748B", lineHeight: 1.5 }}>
                  Existing report behavior is unchanged. This category will show configured reports as they are
                  introduced.
                </p>
              </section>
            )}

            {isCustomFieldReportType ? (
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
            ) : null}
          </div>
        )}
      </div>
    </main>
  );
}
