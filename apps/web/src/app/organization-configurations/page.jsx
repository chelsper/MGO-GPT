"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, GripVertical, Plus } from "lucide-react";
import useUser from "@/utils/useUser";
import { canManageWorkspaceRole } from "@/utils/workspaceRoles";

const MONTH_OPTIONS = [
  ["1", "January"],
  ["2", "February"],
  ["3", "March"],
  ["4", "April"],
  ["5", "May"],
  ["6", "June"],
  ["7", "July"],
  ["8", "August"],
  ["9", "September"],
  ["10", "October"],
  ["11", "November"],
  ["12", "December"],
];

const TIME_ZONE_OPTIONS = [
  ["America/New_York", "Eastern Time (America/New_York)"],
  ["America/Chicago", "Central Time (America/Chicago)"],
  ["America/Denver", "Mountain Time (America/Denver)"],
  ["America/Phoenix", "Arizona Time (America/Phoenix)"],
  ["America/Los_Angeles", "Pacific Time (America/Los_Angeles)"],
  ["Pacific/Honolulu", "Hawaii Time (Pacific/Honolulu)"],
  ["UTC", "UTC"],
];

const DATE_FORMAT_OPTIONS = ["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"];

const pageStyle = {
  minHeight: "100vh",
  background: "#F9FAFB",
  color: "#111827",
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

const shellStyle = {
  maxWidth: "1180px",
  margin: "0 auto",
  padding: "36px 24px 72px",
};

const cardStyle = {
  background: "white",
  border: "1px solid #E5E7EB",
  borderRadius: "22px",
  boxShadow: "0 14px 40px rgba(15, 23, 42, 0.04)",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #D1D5DB",
  borderRadius: "12px",
  padding: "12px 14px",
  fontSize: "16px",
  fontFamily: "inherit",
};

const labelStyle = {
  display: "block",
  color: "#374151",
  fontSize: "13px",
  fontWeight: 900,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  marginBottom: "8px",
};

function slugify(value) {
  return String(value || "giving society")
    .trim()
    .toLowerCase()
    .replace(/['\u2019]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizeSocietyForForm(society, index = 0) {
  return {
    key: society?.key || `giving_society_${Date.now()}_${index}`,
    name: society?.name || "New Giving Society",
    basis: society?.basis || "annual",
    periodBasis:
      society?.basis === "lifetime"
        ? "lifetime"
        : society?.periodBasis || society?.period_basis || "calendar_year",
    fiscalYearStartMonth:
      society?.fiscalYearStartMonth || society?.fiscal_year_start_month || 7,
    minimumAmount:
      society?.minimumAmount ?? society?.minimum_amount ?? society?.minimum ?? 0,
    maximumAmount:
      society?.maximumAmount ?? society?.maximum_amount ?? society?.maximum ?? "",
    countSources:
      Array.isArray(society?.countSources)
        ? society.countSources
        : Array.isArray(society?.count_sources)
          ? society.count_sources
          : ["received_revenue", "recognition_credit"],
    displayAlongside: society?.displayAlongside ?? society?.display_alongside ?? false,
    active: society?.active !== false,
    displayOrder: society?.displayOrder || society?.display_order || index + 1,
  };
}

function formatMoneyInput(value) {
  if (value === null || value === undefined || value === "") return "";
  const amount = Number(value);
  return Number.isFinite(amount) ? String(amount) : "";
}

function normalizeInstitutionSettingsForForm(settings) {
  return {
    institutionName: settings?.institutionName || "",
    shortName: settings?.shortName || "",
    applicationName: settings?.applicationName || "",
    advancementServicesNotificationEmail:
      settings?.advancementServicesNotificationEmail || "devdata@ju.edu",
    notificationSenderName: settings?.notificationSenderName || "JUMGOGPT",
    timeZone: settings?.timeZone || "America/New_York",
    currencyCode: settings?.currencyCode || "USD",
    dateFormat: settings?.dateFormat || "MM/DD/YYYY",
    fiscalYearStartMonth: Number(settings?.fiscalYearStartMonth || 7),
    allowedEmailDomains: Array.isArray(settings?.allowedEmailDomains)
      ? settings.allowedEmailDomains
      : [],
    terminology: {
      mgo: settings?.terminology?.mgo || "MGO",
      advancementServices:
        settings?.terminology?.advancementServices || "Advancement Services",
      executive: settings?.terminology?.executive || "Executive",
    },
  };
}

function SaveFeedback({ error, statusMessage }) {
  const message = error || statusMessage;
  if (!message) return null;

  const isError = Boolean(error);
  return (
    <div
      role={isError ? "alert" : "status"}
      aria-live={isError ? "assertive" : "polite"}
      style={{
        flex: "1 1 320px",
        minWidth: 0,
        borderRadius: "16px",
        border: isError ? "1px solid #FCA5A5" : "1px solid #86EFAC",
        background: isError ? "#FEF2F2" : "#F0FDF4",
        color: isError ? "#991B1B" : "#166534",
        padding: "14px 16px",
        fontWeight: 850,
        lineHeight: 1.45,
      }}
    >
      <div style={{ fontSize: "14px", fontWeight: 950, marginBottom: "2px" }}>
        {isError ? "Action needed" : "Saved"}
      </div>
      {message}
    </div>
  );
}

export default function OrganizationConfigurationsPage() {
  const { data: sessionUser, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [institutionSettings, setInstitutionSettings] = useState(null);
  const [societies, setSocieties] = useState([]);
  const [countSourceOptions, setCountSourceOptions] = useState([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [institutionSettingsSaving, setInstitutionSettingsSaving] = useState(false);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const [institutionSettingsError, setInstitutionSettingsError] = useState("");
  const [institutionSettingsStatus, setInstitutionSettingsStatus] = useState("");
  const [draggedSocietyKey, setDraggedSocietyKey] = useState("");
  const [recentlyAddedSocietyKey, setRecentlyAddedSocietyKey] = useState("");
  const societyRefs = useRef({});

  async function loadConfigurations() {
    const [profileResponse, configResponse, institutionSettingsResponse] = await Promise.all([
      fetch("/api/users/profile"),
      fetch("/api/admin/giving-societies"),
      fetch("/api/admin/organization-settings"),
    ]);

    const profileData = await profileResponse.json().catch(() => null);
    if (!profileResponse.ok || !canManageWorkspaceRole(profileData?.user?.role)) {
      throw new Error("Forbidden - workspace administrators only");
    }

    const configData = await configResponse.json().catch(() => null);
    if (!configResponse.ok) {
      throw new Error(
        configData?.error || "Failed to load giving society configuration",
      );
    }

    const institutionSettingsData = await institutionSettingsResponse
      .json()
      .catch(() => null);
    if (!institutionSettingsResponse.ok) {
      throw new Error(
        institutionSettingsData?.error || "Failed to load institution profile",
      );
    }

    setProfile(profileData.user || null);
    setSocieties((configData.societies || []).map(normalizeSocietyForForm));
    setCountSourceOptions(configData.countSourceOptions || []);
    setInstitutionSettings(
      normalizeInstitutionSettingsForForm(institutionSettingsData?.settings),
    );
  }

  useEffect(() => {
    if (!loading && !sessionUser) {
      window.location.href = "/account/signin";
    }
  }, [loading, sessionUser]);

  useEffect(() => {
    if (!sessionUser) return;

    let active = true;
    (async () => {
      setPageLoading(true);
      setError("");
      try {
        await loadConfigurations();
      } catch (err) {
        if (!active) return;
        console.error(err);
        setError(
          err instanceof Error
            ? err.message
            : "Failed to load organization configurations",
        );
      } finally {
        if (active) setPageLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [sessionUser]);

  const activeAnnualCount = useMemo(
    () =>
      societies.filter(
        (society) => society.active && society.basis === "annual",
      ).length,
    [societies],
  );

  const activeLifetimeCount = useMemo(
    () =>
      societies.filter(
        (society) => society.active && society.basis === "lifetime",
      ).length,
    [societies],
  );

  const societiesByBasis = useMemo(
    () => ({
      annual: societies
        .map((society, index) => ({ society, index }))
        .filter(({ society }) => society.basis === "annual"),
      lifetime: societies
        .map((society, index) => ({ society, index }))
        .filter(({ society }) => society.basis === "lifetime"),
    }),
    [societies],
  );

  useEffect(() => {
    if (!recentlyAddedSocietyKey) return;
    const node = societyRefs.current[recentlyAddedSocietyKey];
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [recentlyAddedSocietyKey, societiesByBasis]);

  function orderSocietiesForDisplay(items) {
    const basisOrder = { annual: 0, lifetime: 1 };
    return [...items]
      .sort((left, right) => {
        const leftBasis = basisOrder[left.basis] ?? 99;
        const rightBasis = basisOrder[right.basis] ?? 99;
        if (leftBasis !== rightBasis) return leftBasis - rightBasis;
        if (Number(left.displayOrder) !== Number(right.displayOrder)) {
          return Number(left.displayOrder) - Number(right.displayOrder);
        }
        return left.name.localeCompare(right.name);
      })
      .map((society, index) => ({ ...society, displayOrder: index + 1 }));
  }

  function updateSociety(index, updates) {
    setSocieties((current) =>
      current.map((society, societyIndex) => {
        if (societyIndex !== index) return society;
        const next = { ...society, ...updates };
        if (updates.name && (!next.key || next.key.startsWith("giving_society_"))) {
          next.key = slugify(updates.name) || next.key;
        }
        if (next.basis === "lifetime") {
          next.periodBasis = "lifetime";
        } else if (next.periodBasis === "lifetime") {
          next.periodBasis = "calendar_year";
        }
        return next;
      }),
    );
  }

  function moveSociety(index, direction) {
    setSocieties((current) => {
      const currentSociety = current[index];
      if (!currentSociety) return current;
      const sameBasisIndexes = current
        .map((society, societyIndex) => ({ society, societyIndex }))
        .filter(({ society }) => society.basis === currentSociety.basis)
        .map(({ societyIndex }) => societyIndex);
      const basisPosition = sameBasisIndexes.indexOf(index);
      const targetIndex = sameBasisIndexes[basisPosition + direction];
      if (targetIndex == null) return current;
      return reorderSocietiesWithinBasis(current, index, targetIndex);
    });
  }

  function reorderSocietiesWithinBasis(current, fromIndex, toIndex) {
    const source = current[fromIndex];
    const target = current[toIndex];
    if (!source || !target || source.basis !== target.basis) return current;

    const basisSocieties = current.filter((society) => society.basis === source.basis);
    const sourcePosition = basisSocieties.findIndex((society) => society.key === source.key);
    const targetPosition = basisSocieties.findIndex((society) => society.key === target.key);
    if (sourcePosition < 0 || targetPosition < 0 || sourcePosition === targetPosition) {
      return current;
    }

    const nextBasisSocieties = [...basisSocieties];
    const [movedSociety] = nextBasisSocieties.splice(sourcePosition, 1);
    nextBasisSocieties.splice(targetPosition, 0, movedSociety);

    const byBasis = {
      annual: current.filter((society) => society.basis === "annual"),
      lifetime: current.filter((society) => society.basis === "lifetime"),
    };
    byBasis[source.basis] = nextBasisSocieties;

    return orderSocietiesForDisplay([...byBasis.annual, ...byBasis.lifetime]);
  }

  function dropSocietyOnTarget(targetIndex) {
    if (!draggedSocietyKey) return;
    setSocieties((current) => {
      const fromIndex = current.findIndex((society) => society.key === draggedSocietyKey);
      return reorderSocietiesWithinBasis(current, fromIndex, targetIndex);
    });
    setDraggedSocietyKey("");
  }

  function addSociety(basis = "annual") {
    const key = `giving_society_${Date.now()}`;
    const periodBasis = basis === "lifetime" ? "lifetime" : "calendar_year";
    const label = basis === "lifetime" ? "lifetime" : "annual";
    setSocieties((current) =>
      orderSocietiesForDisplay([
        ...current,
        normalizeSocietyForForm(
          {
            key,
            name: "New Giving Society",
            basis,
            periodBasis,
            minimumAmount: 0,
            maximumAmount: "",
            active: true,
            displayAlongside: false,
            countSources:
              basis === "lifetime"
                ? ["committed"]
                : ["received_revenue", "recognition_credit"],
          },
          current.length,
        ),
      ]),
    );
    setRecentlyAddedSocietyKey(key);
    setStatusMessage(
      `New ${label} society added below. Configure it, then save changes.`,
    );
  }

  function deleteSociety(index) {
    const society = societies[index];
    if (!society || societies.length <= 1) return;
    const confirmed = window.confirm(
      `Delete ${society.name}? This removes the configuration after you save changes.`,
    );
    if (!confirmed) return;

    setSocieties((current) =>
      orderSocietiesForDisplay(
        current.filter((_, societyIndex) => societyIndex !== index),
      ),
    );
    if (recentlyAddedSocietyKey === society.key) {
      setRecentlyAddedSocietyKey("");
    }
    setStatusMessage(`${society.name} removed. Save configurations to make this permanent.`);
  }

  function toggleCountSource(index, sourceKey) {
    setSocieties((current) =>
      current.map((society, societyIndex) => {
        if (societyIndex !== index) return society;
        const existing = new Set(society.countSources || []);
        if (existing.has(sourceKey)) {
          existing.delete(sourceKey);
        } else {
          existing.add(sourceKey);
        }
        const countSources = Array.from(existing);
        return {
          ...society,
          countSources: countSources.length
            ? countSources
            : ["received_revenue", "recognition_credit"],
        };
      }),
    );
  }

  async function saveConfigurations() {
    setSaving(true);
    setError("");
    setStatusMessage("");

    try {
      const payload = {
        societies: orderSocietiesForDisplay(societies).map((society, index) => ({
          ...society,
          key: society.key || slugify(society.name, `giving_society_${index + 1}`),
          displayOrder: index + 1,
          minimumAmount: Number(society.minimumAmount || 0),
          maximumAmount:
            society.maximumAmount === "" || society.maximumAmount == null
              ? null
              : Number(society.maximumAmount),
        })),
      };

      const response = await fetch("/api/admin/giving-societies", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to save giving societies");
      }

      setSocieties((data.societies || []).map(normalizeSocietyForForm));
      setRecentlyAddedSocietyKey("");
      setStatusMessage("Giving society configuration saved.");
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error ? err.message : "Failed to save giving societies",
      );
    } finally {
      setSaving(false);
    }
  }

  function updateInstitutionSettings(updates) {
    setInstitutionSettings((current) => ({
      ...normalizeInstitutionSettingsForForm(current),
      ...updates,
    }));
  }

  function updateInstitutionTerminology(key, value) {
    setInstitutionSettings((current) => {
      const normalized = normalizeInstitutionSettingsForForm(current);
      return {
        ...normalized,
        terminology: {
          ...normalized.terminology,
          [key]: value,
        },
      };
    });
  }

  async function saveInstitutionSettings() {
    if (!institutionSettings) return;

    setInstitutionSettingsSaving(true);
    setInstitutionSettingsError("");
    setInstitutionSettingsStatus("");

    try {
      const response = await fetch("/api/admin/organization-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: institutionSettings }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(data?.error || "Failed to save institution profile");
      }

      setInstitutionSettings(
        normalizeInstitutionSettingsForForm(data?.settings),
      );
      setInstitutionSettingsStatus("Institution profile saved.");
    } catch (err) {
      console.error(err);
      setInstitutionSettingsError(
        err instanceof Error ? err.message : "Failed to save institution profile",
      );
    } finally {
      setInstitutionSettingsSaving(false);
    }
  }

  if (loading || pageLoading) {
    return (
      <main style={pageStyle}>
        <div style={shellStyle}>Loading organization configurations...</div>
      </main>
    );
  }

  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <header
          style={{
            display: "flex",
            gap: "18px",
            alignItems: "center",
            marginBottom: "28px",
          }}
        >
          <button
            type="button"
            onClick={() => (window.location.href = "/")}
            aria-label="Return to home"
            style={{
              width: "54px",
              height: "54px",
              borderRadius: "14px",
              border: "1px solid #E5E7EB",
              background: "white",
              color: "#374151",
              display: "inline-grid",
              placeItems: "center",
              cursor: "pointer",
            }}
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: "40px", lineHeight: 1 }}>
              Organization Configurations
            </h1>
            <p style={{ margin: "10px 0 0", color: "#6B7280", fontSize: "18px" }}>
              Configure institutional defaults, giving societies, and organizational recognition.
            </p>
          </div>
        </header>

        {error && societies.length === 0 ? (
          <div
            style={{
              ...cardStyle,
              borderColor: "#FCA5A5",
              background: "#FEF2F2",
              color: "#991B1B",
              padding: "18px 22px",
              marginBottom: "20px",
              fontWeight: 800,
            }}
          >
            {error}
          </div>
        ) : null}

        <section
          style={{
            ...cardStyle,
            padding: "28px",
            marginBottom: "24px",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "18px",
          }}
        >
          <div>
            <div style={labelStyle}>Signed In As</div>
            <div style={{ fontSize: "22px", fontWeight: 900 }}>
              {profile?.name || sessionUser?.name || "Workspace admin"}
            </div>
            <div style={{ color: "#6B7280", marginTop: "4px" }}>
              {profile?.email || sessionUser?.email}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Active Annual Societies</div>
            <div style={{ fontSize: "36px", fontWeight: 950 }}>
              {activeAnnualCount}
            </div>
          </div>
          <div>
            <div style={labelStyle}>Active Lifetime Societies</div>
            <div style={{ fontSize: "36px", fontWeight: 950 }}>
              {activeLifetimeCount}
            </div>
          </div>
        </section>

        <section
          style={{
            ...cardStyle,
            padding: "28px",
            marginBottom: "24px",
            background: "linear-gradient(135deg, #FFFFFF 0%, #F5F7FF 100%)",
          }}
        >
          <div style={{ marginBottom: "22px" }}>
            <h2 style={{ margin: 0, fontSize: "28px" }}>Institution Profile</h2>
            <p style={{ margin: "8px 0 0", color: "#4B5563", fontSize: "16px" }}>
              Manage institutional defaults and where users' app requests are
              delivered for Advancement Services review.
            </p>
            <p
              style={{
                margin: "10px 0 0",
                color: "#1D4ED8",
                fontSize: "14px",
                lineHeight: 1.45,
                fontWeight: 750,
              }}
            >
              These settings do not change sign-in rules, fiscal-year calculations,
              or direct NXT write behavior.
            </p>
          </div>

          <div
            style={{
              marginTop: "20px",
              border: "1px solid #C7D2FE",
              borderRadius: "16px",
              background: "#EEF2FF",
              padding: "18px",
            }}
          >
            <h3 style={{ margin: 0, fontSize: "19px" }}>Notification Delivery</h3>
            <p style={{ margin: "8px 0 16px", color: "#4B5563", lineHeight: 1.45 }}>
              JUMGOGPT sends this inbox an email whenever a user submits a request
              or update for Advancement Services. Successful direct NXT writes do
              not send a notification.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "16px",
              }}
            >
              <label>
                <span style={labelStyle}>Advancement Services Notification Email</span>
                <input
                  type="email"
                  value={institutionSettings?.advancementServicesNotificationEmail || ""}
                  onChange={(event) =>
                    updateInstitutionSettings({
                      advancementServicesNotificationEmail: event.target.value,
                    })
                  }
                  style={inputStyle}
                />
              </label>
              <label>
                <span style={labelStyle}>Sender Display Name</span>
                <input
                  value={institutionSettings?.notificationSenderName || "JUMGOGPT"}
                  onChange={(event) =>
                    updateInstitutionSettings({ notificationSenderName: event.target.value })
                  }
                  style={inputStyle}
                />
              </label>
            </div>
            <p style={{ margin: "14px 0 0", color: "#4B5563", fontSize: "13px", lineHeight: 1.45 }}>
              The sending address remains the verified Resend address configured in
              Vercel. This setting safely changes only the sender name recipients see.
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: "16px",
            }}
          >
            <label>
              <span style={labelStyle}>Institution Name</span>
              <input
                value={institutionSettings?.institutionName || ""}
                onChange={(event) =>
                  updateInstitutionSettings({ institutionName: event.target.value })
                }
                style={inputStyle}
              />
            </label>
            <label>
              <span style={labelStyle}>Short Name</span>
              <input
                value={institutionSettings?.shortName || ""}
                onChange={(event) =>
                  updateInstitutionSettings({ shortName: event.target.value })
                }
                style={inputStyle}
              />
            </label>
            <label>
              <span style={labelStyle}>Application Name</span>
              <input
                value={institutionSettings?.applicationName || ""}
                onChange={(event) =>
                  updateInstitutionSettings({ applicationName: event.target.value })
                }
                style={inputStyle}
              />
            </label>
            <label>
              <span style={labelStyle}>Time Zone</span>
              <select
                value={institutionSettings?.timeZone || "America/New_York"}
                onChange={(event) =>
                  updateInstitutionSettings({ timeZone: event.target.value })
                }
                style={inputStyle}
              >
                {TIME_ZONE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span style={labelStyle}>Currency Code</span>
              <input
                value={institutionSettings?.currencyCode || "USD"}
                maxLength={3}
                onChange={(event) =>
                  updateInstitutionSettings({
                    currencyCode: event.target.value.toUpperCase(),
                  })
                }
                style={inputStyle}
              />
            </label>
            <label>
              <span style={labelStyle}>Date Format</span>
              <select
                value={institutionSettings?.dateFormat || "MM/DD/YYYY"}
                onChange={(event) =>
                  updateInstitutionSettings({ dateFormat: event.target.value })
                }
                style={inputStyle}
              >
                {DATE_FORMAT_OPTIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span style={labelStyle}>Fiscal Year Starts</span>
              <select
                value={String(institutionSettings?.fiscalYearStartMonth || 7)}
                onChange={(event) =>
                  updateInstitutionSettings({
                    fiscalYearStartMonth: Number(event.target.value),
                  })
                }
                style={inputStyle}
              >
                {MONTH_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
              gap: "16px",
              marginTop: "18px",
            }}
          >
            <label>
              <span style={labelStyle}>Institution Email Domains</span>
              <textarea
                value={(institutionSettings?.allowedEmailDomains || []).join("\n")}
                onChange={(event) =>
                  updateInstitutionSettings({
                    allowedEmailDomains: event.target.value
                      .split(/[\n,;]+/)
                      .map((domain) => domain.trim())
                      .filter(Boolean),
                  })
                }
                rows={4}
                placeholder="ju.edu"
                style={{ ...inputStyle, minHeight: "108px", resize: "vertical" }}
              />
              <span
                style={{
                  display: "block",
                  marginTop: "7px",
                  color: "#6B7280",
                  fontSize: "13px",
                  lineHeight: 1.4,
                }}
              >
                One domain per line. This is currently documented configuration
                only; access remains governed by the existing sign-in setup.
              </span>
            </label>

            <div
              style={{
                border: "1px solid #C7D2FE",
                borderRadius: "16px",
                background: "#EEF2FF",
                padding: "16px",
              }}
            >
              <div style={labelStyle}>Workspace Terminology</div>
              <div style={{ display: "grid", gap: "12px" }}>
                <label>
                  <span style={{ color: "#4B5563", fontWeight: 800, fontSize: "13px" }}>
                    MGO Label
                  </span>
                  <input
                    value={institutionSettings?.terminology?.mgo || "MGO"}
                    onChange={(event) =>
                      updateInstitutionTerminology("mgo", event.target.value)
                    }
                    style={{ ...inputStyle, marginTop: "6px" }}
                  />
                </label>
                <label>
                  <span style={{ color: "#4B5563", fontWeight: 800, fontSize: "13px" }}>
                    Advancement Services Label
                  </span>
                  <input
                    value={
                      institutionSettings?.terminology?.advancementServices ||
                      "Advancement Services"
                    }
                    onChange={(event) =>
                      updateInstitutionTerminology(
                        "advancementServices",
                        event.target.value,
                      )
                    }
                    style={{ ...inputStyle, marginTop: "6px" }}
                  />
                </label>
                <label>
                  <span style={{ color: "#4B5563", fontWeight: 800, fontSize: "13px" }}>
                    Executive Label
                  </span>
                  <input
                    value={institutionSettings?.terminology?.executive || "Executive"}
                    onChange={(event) =>
                      updateInstitutionTerminology("executive", event.target.value)
                    }
                    style={{ ...inputStyle, marginTop: "6px" }}
                  />
                </label>
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: "16px",
              flexWrap: "wrap",
              marginTop: "24px",
            }}
          >
            <SaveFeedback
              error={institutionSettingsError}
              statusMessage={institutionSettingsStatus}
            />
            <button
              type="button"
              onClick={saveInstitutionSettings}
              disabled={institutionSettingsSaving || !institutionSettings}
              style={{
                border: 0,
                borderRadius: "999px",
                background: "#4338CA",
                color: "white",
                padding: "14px 24px",
                fontWeight: 950,
                fontSize: "16px",
                cursor: institutionSettingsSaving ? "wait" : "pointer",
                opacity: institutionSettingsSaving || !institutionSettings ? 0.7 : 1,
              }}
            >
              {institutionSettingsSaving
                ? "Saving..."
                : "Save Organization Settings"}
            </button>
          </div>
        </section>

        <section style={{ ...cardStyle, padding: "28px" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
              alignItems: "flex-start",
              marginBottom: "22px",
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: "28px" }}>Giving Societies</h2>
              <p style={{ margin: "8px 0 0", color: "#6B7280", fontSize: "16px" }}>
                Configure annual and lifetime badges, what counts toward them,
                and whether lower-level societies can display alongside higher
                recognition in the same category.
              </p>
            </div>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={() => addSociety("annual")}
                style={{
                  display: "inline-flex",
                  gap: "8px",
                  alignItems: "center",
                  border: "1px solid #C7D2FE",
                  background: "#EEF2FF",
                  color: "#4338CA",
                  borderRadius: "999px",
                  padding: "12px 16px",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                <Plus size={18} />
                Add annual society
              </button>
              <button
                type="button"
                onClick={() => addSociety("lifetime")}
                style={{
                  display: "inline-flex",
                  gap: "8px",
                  alignItems: "center",
                  border: "1px solid #93C5FD",
                  background: "#EFF6FF",
                  color: "#1D4ED8",
                  borderRadius: "999px",
                  padding: "12px 16px",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                <Plus size={18} />
                Add lifetime society
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: "26px" }}>
            {[
              {
                key: "annual",
                title: "Annual Societies",
                description:
                  "Drag to set the annual hierarchy. The highest qualifying annual badge displays by default.",
              },
              {
                key: "lifetime",
                title: "Lifetime Societies",
                description:
                  "Drag to set the lifetime hierarchy. Lifetime badges can display separately from annual badges.",
              },
            ].map((group) => {
              const groupedSocieties = societiesByBasis[group.key] || [];
              return (
                <section
                  key={group.key}
                  style={{
                    border: "1px solid #E5E7EB",
                    borderRadius: "20px",
                    padding: "18px",
                    background: "#F9FAFB",
                  }}
                >
                  <div style={{ marginBottom: "16px" }}>
                    <h3 style={{ margin: 0, fontSize: "22px" }}>{group.title}</h3>
                    <p
                      style={{
                        margin: "6px 0 0",
                        color: "#6B7280",
                        lineHeight: 1.45,
                      }}
                    >
                      {group.description}
                    </p>
                  </div>

                  {groupedSocieties.length ? (
                    <div style={{ display: "grid", gap: "14px" }}>
                      {groupedSocieties.map(({ society, index }, groupIndex) => {
                        const isDragged = draggedSocietyKey === society.key;
                        const isRecentlyAdded = recentlyAddedSocietyKey === society.key;
                        return (
                          <article
                            key={society.key || index}
                            ref={(node) => {
                              if (node && society.key) {
                                societyRefs.current[society.key] = node;
                              }
                            }}
                            draggable
                            onDragStart={() => setDraggedSocietyKey(society.key)}
                            onDragEnd={() => setDraggedSocietyKey("")}
                            onDragOver={(event) => event.preventDefault()}
                            onDrop={() => dropSocietyOnTarget(index)}
                            style={{
                              border: isDragged
                                ? "2px solid #6D5DFB"
                                : isRecentlyAdded
                                  ? "2px solid #22C55E"
                                  : "1px solid #E5E7EB",
                              borderRadius: "18px",
                              padding: "22px",
                              background: isRecentlyAdded
                                ? "#F0FDF4"
                                : society.active
                                  ? "#FFFFFF"
                                  : "#F9FAFB",
                              boxShadow: isRecentlyAdded
                                ? "0 0 0 4px rgba(34, 197, 94, 0.12)"
                                : "none",
                              opacity: isDragged ? 0.72 : 1,
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: "16px",
                                alignItems: "center",
                                marginBottom: "18px",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  gap: "12px",
                                  alignItems: "center",
                                }}
                              >
                                <GripVertical
                                  size={22}
                                  aria-hidden="true"
                                  style={{ color: "#9CA3AF", flex: "0 0 auto" }}
                                />
                                <div>
                                  <div style={labelStyle}>
                                    {group.key === "annual" ? "Annual" : "Lifetime"}{" "}
                                    Hierarchy {groupIndex + 1}
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: "10px",
                                      alignItems: "center",
                                      flexWrap: "wrap",
                                    }}
                                  >
                                    <strong style={{ fontSize: "22px" }}>
                                      {society.name}
                                    </strong>
                                    {isRecentlyAdded ? (
                                      <span
                                        style={{
                                          border: "1px solid #86EFAC",
                                          borderRadius: "999px",
                                          background: "#DCFCE7",
                                          color: "#166534",
                                          fontSize: "12px",
                                          fontWeight: 900,
                                          padding: "5px 9px",
                                        }}
                                      >
                                        New unsaved
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: "8px",
                                  flexWrap: "wrap",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() => moveSociety(index, -1)}
                                  disabled={groupIndex === 0}
                                  style={{
                                    border: "1px solid #D1D5DB",
                                    borderRadius: "999px",
                                    background: "white",
                                    padding: "9px 12px",
                                    fontWeight: 800,
                                    opacity: groupIndex === 0 ? 0.45 : 1,
                                    cursor:
                                      groupIndex === 0 ? "not-allowed" : "pointer",
                                  }}
                                >
                                  Move up
                                </button>
                                <button
                                  type="button"
                                  onClick={() => moveSociety(index, 1)}
                                  disabled={groupIndex === groupedSocieties.length - 1}
                                  style={{
                                    border: "1px solid #D1D5DB",
                                    borderRadius: "999px",
                                    background: "white",
                                    padding: "9px 12px",
                                    fontWeight: 800,
                                    opacity:
                                      groupIndex === groupedSocieties.length - 1
                                        ? 0.45
                                        : 1,
                                    cursor:
                                      groupIndex === groupedSocieties.length - 1
                                        ? "not-allowed"
                                        : "pointer",
                                  }}
                                >
                                  Move down
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateSociety(index, {
                                      active: !society.active,
                                    })
                                  }
                                  style={{
                                    border: "1px solid #D1D5DB",
                                    borderRadius: "999px",
                                    background: society.active
                                      ? "#FEF2F2"
                                      : "#F0FDF4",
                                    color: society.active ? "#991B1B" : "#166534",
                                    padding: "9px 12px",
                                    fontWeight: 900,
                                    cursor: "pointer",
                                  }}
                                >
                                  {society.active ? "Deactivate" : "Reactivate"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteSociety(index)}
                                  disabled={societies.length <= 1}
                                  style={{
                                    border: "1px solid #FCA5A5",
                                    borderRadius: "999px",
                                    background: "#FFFFFF",
                                    color: "#B91C1C",
                                    padding: "9px 12px",
                                    fontWeight: 900,
                                    opacity: societies.length <= 1 ? 0.45 : 1,
                                    cursor:
                                      societies.length <= 1
                                        ? "not-allowed"
                                        : "pointer",
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(auto-fit, minmax(220px, 1fr))",
                                gap: "16px",
                              }}
                            >
                              <label>
                                <span style={labelStyle}>Society Name</span>
                                <input
                                  value={society.name}
                                  onChange={(event) =>
                                    updateSociety(index, {
                                      name: event.target.value,
                                    })
                                  }
                                  style={inputStyle}
                                />
                              </label>

                              <label>
                                <span style={labelStyle}>Basis</span>
                                <select
                                  value={society.basis}
                                  onChange={(event) =>
                                    updateSociety(index, {
                                      basis: event.target.value,
                                    })
                                  }
                                  style={inputStyle}
                                >
                                  <option value="annual">Annual</option>
                                  <option value="lifetime">Lifetime</option>
                                </select>
                              </label>

                              <label>
                                <span style={labelStyle}>Period</span>
                                <select
                                  value={society.periodBasis}
                                  onChange={(event) =>
                                    updateSociety(index, {
                                      periodBasis: event.target.value,
                                    })
                                  }
                                  disabled={society.basis === "lifetime"}
                                  style={{
                                    ...inputStyle,
                                    background:
                                      society.basis === "lifetime"
                                        ? "#F3F4F6"
                                        : "white",
                                  }}
                                >
                                  <option value="calendar_year">
                                    Calendar Year
                                  </option>
                                  <option value="fiscal_year">Fiscal Year</option>
                                  <option value="lifetime">Lifetime</option>
                                </select>
                              </label>

                              <label>
                                <span style={labelStyle}>Fiscal Year Starts</span>
                                <select
                                  value={String(society.fiscalYearStartMonth)}
                                  onChange={(event) =>
                                    updateSociety(index, {
                                      fiscalYearStartMonth: Number(
                                        event.target.value,
                                      ),
                                    })
                                  }
                                  disabled={society.periodBasis !== "fiscal_year"}
                                  style={{
                                    ...inputStyle,
                                    background:
                                      society.periodBasis !== "fiscal_year"
                                        ? "#F3F4F6"
                                        : "white",
                                  }}
                                >
                                  {MONTH_OPTIONS.map(([value, label]) => (
                                    <option key={value} value={value}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </label>

                              <label>
                                <span style={labelStyle}>Minimum Amount</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={formatMoneyInput(society.minimumAmount)}
                                  onChange={(event) =>
                                    updateSociety(index, {
                                      minimumAmount: event.target.value,
                                    })
                                  }
                                  style={inputStyle}
                                />
                              </label>

                              <label>
                                <span style={labelStyle}>Maximum Amount</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={formatMoneyInput(society.maximumAmount)}
                                  onChange={(event) =>
                                    updateSociety(index, {
                                      maximumAmount: event.target.value,
                                    })
                                  }
                                  placeholder="No cap"
                                  style={inputStyle}
                                />
                              </label>
                            </div>

                            <label
                              style={{
                                display: "flex",
                                gap: "12px",
                                alignItems: "flex-start",
                                border: "1px solid #BFDBFE",
                                borderRadius: "14px",
                                background: "#EFF6FF",
                                padding: "14px",
                                marginTop: "18px",
                                cursor: "pointer",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={Boolean(society.displayAlongside)}
                                onChange={(event) =>
                                  updateSociety(index, {
                                    displayAlongside: event.target.checked,
                                  })
                                }
                                style={{ marginTop: "3px" }}
                              />
                              <span>
                                <strong>
                                  Display this badge alongside higher-ranking{" "}
                                  {society.basis} societies
                                </strong>
                                <span
                                  style={{
                                    display: "block",
                                    color: "#1D4ED8",
                                    fontSize: "13px",
                                    lineHeight: 1.35,
                                    marginTop: "4px",
                                  }}
                                >
                                  The highest qualifying {society.basis} badge
                                  always displays. Turn this on when this society
                                  should also appear if someone qualifies for a
                                  higher badge in the same category.
                                </span>
                              </span>
                            </label>

                            <div style={{ marginTop: "18px" }}>
                              <div style={labelStyle}>What Counts</div>
                              <div
                                style={{
                                  display: "grid",
                                  gridTemplateColumns:
                                    "repeat(auto-fit, minmax(250px, 1fr))",
                                  gap: "12px",
                                }}
                              >
                                {countSourceOptions.map((option) => (
                                  <label
                                    key={option.key}
                                    style={{
                                      display: "flex",
                                      gap: "10px",
                                      alignItems: "flex-start",
                                      border: "1px solid #E5E7EB",
                                      borderRadius: "14px",
                                      padding: "14px",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={(society.countSources || []).includes(
                                        option.key,
                                      )}
                                      onChange={() =>
                                        toggleCountSource(index, option.key)
                                      }
                                      style={{ marginTop: "3px" }}
                                    />
                                    <span>
                                      <strong>{option.label}</strong>
                                      <span
                                        style={{
                                          display: "block",
                                          color: "#6B7280",
                                          fontSize: "13px",
                                          lineHeight: 1.35,
                                          marginTop: "4px",
                                        }}
                                      >
                                        {option.description}
                                      </span>
                                    </span>
                                  </label>
                                ))}
                              </div>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  ) : (
                    <div
                      style={{
                        border: "1px dashed #D1D5DB",
                        borderRadius: "16px",
                        padding: "18px",
                        color: "#6B7280",
                        background: "white",
                      }}
                    >
                      No {group.key} societies configured yet.
                    </div>
                  )}
                </section>
              );
            })}
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: "16px",
              flexWrap: "wrap",
              marginTop: "24px",
            }}
          >
            <SaveFeedback error={error} statusMessage={statusMessage} />
            <button
              type="button"
              onClick={saveConfigurations}
              disabled={saving}
              style={{
                border: 0,
                borderRadius: "999px",
                background: "#111827",
                color: "white",
                padding: "14px 24px",
                fontWeight: 950,
                fontSize: "16px",
                cursor: saving ? "wait" : "pointer",
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? "Saving..." : "Save Configurations"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}
