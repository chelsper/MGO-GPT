"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { ArrowLeft, FileText, Upload } from "lucide-react";
import useUser from "@/utils/useUser";
import useWorkspaceView from "@/utils/useWorkspaceView";
import { isReviewerRole } from "@/utils/workspaceRoles";

const IMPORT_FIELDS = [
  {
    key: "blackbaudConstituentId",
    header: "NXT System ID",
    label: "NXT System ID",
    group: "Match fields",
    description: "Best match key when available. This is the internal Blackbaud record ID.",
    recommended: true,
  },
  {
    key: "lookupId",
    header: "NXT Lookup ID",
    label: "NXT Lookup ID",
    group: "Match fields",
    description: "Strong match key commonly visible on the NXT constituent profile.",
    recommended: true,
  },
  {
    key: "firstName",
    header: "First Name",
    label: "First Name",
    group: "Name fields",
    description: "Used for matching and for eventual new-record import work.",
    recommended: true,
  },
  {
    key: "lastName",
    header: "Last Name",
    label: "Last Name",
    group: "Name fields",
    description: "Used with First Name or Preferred Name for matching.",
    recommended: true,
  },
  {
    key: "preferredName",
    header: "Preferred Name",
    label: "Preferred Name",
    group: "Name fields",
    description: "Optional, but useful when the name used by MGOs differs from legal first name.",
  },
  {
    key: "email",
    header: "Email Address",
    label: "Email Address",
    group: "Match fields",
    description: "Useful supporting match data. Email-only matches still require human review.",
  },
  {
    key: "sourceConstituency",
    header: "Current Constituent Code",
    label: "Current Constituent Code",
    group: "Constituent code fields",
    description: "Use when replacing or end-dating an existing constituent code.",
  },
  {
    key: "targetConstituency",
    header: "New Constituent Code",
    label: "New Constituent Code",
    group: "Constituent code fields",
    description: "The constituent code to add or replace with.",
    recommended: true,
  },
  {
    key: "action",
    header: "Constituent Code Action",
    label: "Constituent Code Action",
    group: "Constituent code fields",
    description: "Optional row-level override: add, replace, end-date, or reorder.",
  },
  {
    key: "startDate",
    header: "Constituent Code Start Date",
    label: "Constituent Code Start Date",
    group: "Date fields",
    description: "Optional start date for the new constituent code.",
  },
  {
    key: "endDate",
    header: "Constituent Code End Date",
    label: "Constituent Code End Date",
    group: "Date fields",
    description: "Optional end date for end-date actions.",
  },
];

const DEFAULT_ACTIVE_FIELDS = {
  blackbaudConstituentId: false,
  lookupId: true,
  firstName: true,
  lastName: true,
  preferredName: false,
  email: true,
  sourceConstituency: false,
  targetConstituency: true,
  action: false,
  startDate: true,
  endDate: false,
};

const FIELD_GROUP_ORDER = [
  "Match fields",
  "Name fields",
  "Constituent code fields",
  "Date fields",
];

const CONSTITUENCY_BEHAVIORS = [
  {
    value: "add",
    label: "Add additional constituent code",
    description: "Use this for imports where the person may not already have the code.",
  },
  {
    value: "replace",
    label: "Update/replace existing constituent code",
    description: "Requires Current Constituent Code so the preview knows what would be replaced.",
  },
  {
    value: "end-date",
    label: "End-date existing constituent code",
    description: "Requires Current Constituent Code; End Date is strongly recommended.",
  },
  {
    value: "reorder",
    label: "Reorder constituent codes by hierarchy only",
    description: "No new code is required; this previews hierarchy cleanup.",
  },
];

function makeTemplateRows(fields) {
  const headers = fields.map((field) => field.header);
  const rowOne = fields.map((field) => {
    switch (field.key) {
      case "blackbaudConstituentId":
        return "";
      case "lookupId":
        return "123456";
      case "firstName":
        return "Jane";
      case "lastName":
        return "Dolphin";
      case "preferredName":
        return "Jane";
      case "email":
        return "jane@example.com";
      case "sourceConstituency":
        return "Student";
      case "targetConstituency":
        return "Alumni - Bachelor's Degree";
      case "action":
        return "replace";
      case "startDate":
        return "2026-05-01";
      case "endDate":
        return "";
      default:
        return "";
    }
  });
  const rowTwo = fields.map((field) => {
    switch (field.key) {
      case "blackbaudConstituentId":
        return "";
      case "lookupId":
        return "234567";
      case "firstName":
        return "Sam";
      case "lastName":
        return "Dolphin";
      case "preferredName":
        return "";
      case "email":
        return "sam@example.com";
      case "sourceConstituency":
        return "";
      case "targetConstituency":
        return "Alumni - Graduate Degree";
      case "action":
        return "add";
      case "startDate":
        return "2026-05-01";
      case "endDate":
        return "";
      default:
        return "";
    }
  });
  return Papa.unparse([headers, rowOne, rowTwo]);
}

function parseCsv(text) {
  const parsed = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => String(header || "").trim(),
  });

  const rows = Array.isArray(parsed.data)
    ? parsed.data.filter((row) =>
        Object.values(row || {}).some((value) => String(value || "").trim()),
      )
    : [];
  const headers = parsed.meta?.fields?.filter(Boolean) || [];
  return { rows, headers, errors: parsed.errors || [] };
}

function statusTone(status) {
  switch (status) {
    case "Ready":
      return { bg: "#DCFCE7", fg: "#166534", border: "#BBF7D0" };
    case "Needs Review":
      return { bg: "#FEF3C7", fg: "#92400E", border: "#FDE68A" };
    case "Skipped":
      return { bg: "#E0F2FE", fg: "#075985", border: "#BAE6FD" };
    case "Conflict":
      return { bg: "#FEE2E2", fg: "#991B1B", border: "#FECACA" };
    default:
      return { bg: "#F3F4F6", fg: "#374151", border: "#E5E7EB" };
  }
}

function Pill({ children, tone = "neutral" }) {
  const tones = {
    blue: { bg: "#EFF6FF", fg: "#1D4ED8", border: "#BFDBFE" },
    green: { bg: "#DCFCE7", fg: "#166534", border: "#BBF7D0" },
    amber: { bg: "#FEF3C7", fg: "#92400E", border: "#FDE68A" },
    red: { bg: "#FEE2E2", fg: "#991B1B", border: "#FECACA" },
    neutral: { bg: "#F3F4F6", fg: "#374151", border: "#E5E7EB" },
  };
  const colors = tones[tone] || tones.neutral;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        borderRadius: "999px",
        border: `1px solid ${colors.border}`,
        backgroundColor: colors.bg,
        color: colors.fg,
        padding: "5px 10px",
        fontSize: "12px",
        fontWeight: 800,
      }}
    >
      {children}
    </span>
  );
}

function renderList(values) {
  if (!Array.isArray(values) || values.length === 0) return "None found";
  return values.join(" -> ");
}

function HeaderCode({ children }) {
  return (
    <code
      style={{
        display: "inline-flex",
        borderRadius: "8px",
        border: "1px solid #CBD5E1",
        backgroundColor: "#F8FAFC",
        padding: "4px 7px",
        color: "#0F172A",
        fontWeight: 800,
      }}
    >
      {children}
    </code>
  );
}

export default function ConstituencyImportPage() {
  const { data: user, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [activeFields, setActiveFields] = useState(DEFAULT_ACTIVE_FIELDS);
  const [defaultAction, setDefaultAction] = useState("add");
  const [rawCsv, setRawCsv] = useState(() =>
    makeTemplateRows(IMPORT_FIELDS.filter((field) => DEFAULT_ACTIVE_FIELDS[field.key])),
  );
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [parseMessage, setParseMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  const profileRole = profile?.user?.role || profile?.workspaceUser?.role || user?.role || "";
  const { effectiveRole } = useWorkspaceView(profileRole);
  const isReviewer = isReviewerRole(effectiveRole);

  const selectedFields = useMemo(
    () => IMPORT_FIELDS.filter((field) => activeFields[field.key]),
    [activeFields],
  );
  const expectedHeaders = selectedFields.map((field) => field.header);
  const mappings = useMemo(
    () =>
      selectedFields.reduce((acc, field) => {
        acc[field.key] = field.header;
        return acc;
      }, {}),
    [selectedFields],
  );
  const missingHeaders = expectedHeaders.filter((header) => !headers.includes(header));
  const extraHeaders = headers.filter((header) => !expectedHeaders.includes(header));
  const mappedIdentityField = Boolean(
    activeFields.blackbaudConstituentId ||
      activeFields.lookupId ||
      activeFields.email ||
      (activeFields.firstName && activeFields.lastName),
  );
  const canPreview =
    rows.length > 0 &&
    mappedIdentityField &&
    missingHeaders.length === 0 &&
    (activeFields.targetConstituency || defaultAction === "reorder");

  useEffect(() => {
    if (loading) return;
    let active = true;
    setLoadingProfile(true);
    fetch("/api/users/profile")
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || "Failed to load profile");
        if (active) setProfile(payload);
      })
      .catch((profileError) => {
        if (active) {
          setError(profileError instanceof Error ? profileError.message : "Failed to load profile");
        }
      })
      .finally(() => {
        if (active) setLoadingProfile(false);
      });
    return () => {
      active = false;
    };
  }, [loading]);

  useEffect(() => {
    const parsed = parseCsv(rawCsv);
    setRows(parsed.rows);
    setHeaders(parsed.headers);
    setPreview(null);
    if (parsed.errors.length > 0) {
      setParseMessage(`Parsed ${parsed.rows.length} rows with ${parsed.errors.length} CSV warning(s).`);
    } else {
      setParseMessage(parsed.rows.length ? `Parsed ${parsed.rows.length} rows.` : "");
    }
  }, [rawCsv]);

  const summaryCards = useMemo(() => {
    const summary = preview?.summary || {};
    return [
      ["Ready", summary.ready || 0, "green"],
      ["Needs Review", summary.needsReview || 0, "amber"],
      ["Conflicts", summary.conflict || 0, "red"],
      ["Skipped", summary.skipped || 0, "blue"],
      ["Total", summary.total || rows.length || 0, "neutral"],
    ];
  }, [preview, rows.length]);

  function toggleField(key) {
    setActiveFields((current) => ({ ...current, [key]: !current[key] }));
    setPreview(null);
  }

  function useTemplateCsv() {
    setRawCsv(makeTemplateRows(selectedFields));
  }

  function downloadTemplateCsv() {
    const csv = makeTemplateRows(selectedFields);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "constituency-import-template.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function handleFileUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setRawCsv(String(reader.result || ""));
    reader.readAsText(file);
  }

  async function requestPreview() {
    setPreviewing(true);
    setError("");
    setPreview(null);
    try {
      const response = await fetch("/api/constituency-import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows,
          mappings,
          defaults: { defaultAction },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to preview constituency import");
      }
      setPreview(payload);
    } catch (previewError) {
      setError(
        previewError instanceof Error
          ? previewError.message
          : "Failed to preview constituency import",
      );
    } finally {
      setPreviewing(false);
    }
  }

  function downloadPreviewCsv() {
    if (!preview?.rows?.length) return;
    const csv = Papa.unparse(
      preview.rows.map((row) => ({
        rowNumber: row.rowNumber,
        status: row.status,
        confidence: row.confidence,
        matchMethod: row.matchMethod,
        firstName: row.input?.firstName || "",
        lastName: row.input?.lastName || "",
        preferredName: row.input?.preferredName || "",
        inputLookupId: row.input?.lookupId || "",
        inputSystemId: row.input?.blackbaudConstituentId || "",
        matchedName: row.match?.name || "",
        matchedLookupId: row.match?.lookupId || "",
        matchedSystemId: row.match?.blackbaudConstituentId || "",
        action: row.input?.action || "",
        sourceConstituency: row.input?.sourceConstituency || "",
        targetConstituency: row.input?.targetConstituency || "",
        currentCodes: renderList(row.currentCodes),
        proposedCodes: renderList(row.proposedCodes),
        reasons: (row.reasons || []).join(" | "),
      })),
    );
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "constituency-import-preview.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  if (loading || loadingProfile) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#6B7280" }}>
        Loading import preview...
      </main>
    );
  }

  if (!isReviewer) {
    return (
      <main style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", padding: "28px 18px 48px" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <a
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              color: "#4F46E5",
              fontWeight: 800,
              textDecoration: "none",
              marginBottom: "16px",
            }}
          >
            <ArrowLeft size={18} /> Return to home
          </a>
          <section
            style={{
              backgroundColor: "white",
              border: "1px solid #FECACA",
              borderRadius: "20px",
              padding: "24px",
            }}
          >
            <Pill tone="red">Advancement Services only</Pill>
            <h1 style={{ margin: "14px 0 0", color: "#111827" }}>
              Constituency imports need reviewer access
            </h1>
            <p style={{ color: "#6B7280", lineHeight: 1.5 }}>
              This preview tool is intentionally limited to Advancement Services and workspace
              admins because it inspects NXT constituency data.
            </p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", padding: "28px 18px 56px" }}>
      <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "18px",
            marginBottom: "18px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "14px" }}>
            <a
              href="/"
              aria-label="Return to home"
              style={{
                width: "44px",
                height: "44px",
                borderRadius: "12px",
                border: "1px solid #E5E7EB",
                display: "grid",
                placeItems: "center",
                color: "#374151",
                backgroundColor: "white",
              }}
            >
              <ArrowLeft size={20} />
            </a>
            <div>
              <h1 style={{ margin: 0, fontSize: "30px", color: "#111827" }}>
                Constituency Import Preview
              </h1>
              <p style={{ margin: "6px 0 0", color: "#6B7280" }}>
                Configure exact CSV headers, preview matches, and review constituent-code changes.
              </p>
            </div>
          </div>
          <Pill tone="blue">Preview only: no NXT writes</Pill>
        </header>

        <section
          style={{
            backgroundColor: "#ECFDF5",
            border: "1px solid #A7F3D0",
            borderRadius: "18px",
            padding: "16px 18px",
            marginBottom: "18px",
            color: "#065F46",
            lineHeight: 1.5,
          }}
        >
          This version is template-first: choose the fields you are importing, use the exact CSV
          headers shown here, then upload the file. Strong ID matches can be ready later; name and
          email matches stay in human review.
        </section>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
            gap: "18px",
            alignItems: "start",
          }}
        >
          <div style={{ display: "grid", gap: "18px" }}>
            <section
              style={{
                backgroundColor: "white",
                border: "1px solid #E5E7EB",
                borderRadius: "20px",
                padding: "20px",
                display: "grid",
                gap: "16px",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: "22px", color: "#111827" }}>
                  1. Choose import fields and behavior
                </h2>
                <p style={{ margin: "6px 0 0", color: "#6B7280", lineHeight: 1.5 }}>
                  Turn on only the NXT fields represented in your import. The CSV must use the
                  exact column headers shown on each active field.
                </p>
              </div>

              <div
                style={{
                  border: "1px solid #C7D2FE",
                  borderRadius: "16px",
                  backgroundColor: "#EEF2FF",
                  padding: "16px",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <label
                  style={{
                    display: "grid",
                    gap: "6px",
                    fontSize: "13px",
                    fontWeight: 900,
                    color: "#312E81",
                  }}
                >
                  If the row matches an existing NXT record
                  <select
                    name="constituencyBehavior"
                    value={defaultAction}
                    onChange={(event) => {
                      const nextAction = event.target.value;
                      setDefaultAction(nextAction);
                      setActiveFields((current) => ({
                        ...current,
                        sourceConstituency:
                          nextAction === "replace" || nextAction === "end-date"
                            ? true
                            : current.sourceConstituency,
                        targetConstituency:
                          nextAction === "add" || nextAction === "replace"
                            ? true
                            : current.targetConstituency,
                        endDate: nextAction === "end-date" ? true : current.endDate,
                      }));
                      setPreview(null);
                    }}
                    style={{
                      border: "1px solid #A5B4FC",
                      borderRadius: "12px",
                      padding: "11px 12px",
                      backgroundColor: "white",
                      color: "#111827",
                      fontWeight: 800,
                    }}
                  >
                    {CONSTITUENCY_BEHAVIORS.map((behavior) => (
                      <option key={behavior.value} value={behavior.value}>
                        {behavior.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p style={{ margin: 0, color: "#4338CA", lineHeight: 1.45 }}>
                  {
                    CONSTITUENCY_BEHAVIORS.find((behavior) => behavior.value === defaultAction)
                      ?.description
                  }
                </p>
              </div>

              {FIELD_GROUP_ORDER.map((group) => {
                const groupFields = IMPORT_FIELDS.filter((field) => field.group === group);
                return (
                  <div key={group} style={{ display: "grid", gap: "10px" }}>
                    <h3 style={{ margin: "4px 0 0", color: "#111827", fontSize: "16px" }}>
                      {group}
                    </h3>
                    <div style={{ display: "grid", gap: "10px" }}>
                      {groupFields.map((field) => {
                        const active = Boolean(activeFields[field.key]);
                        return (
                          <button
                            key={field.key}
                            type="button"
                            onClick={() => toggleField(field.key)}
                            style={{
                              display: "grid",
                              gridTemplateColumns: "auto 1fr",
                              gap: "12px",
                              textAlign: "left",
                              border: active ? "2px solid #6D5DFB" : "1px solid #E5E7EB",
                              borderRadius: "14px",
                              padding: "13px",
                              backgroundColor: active ? "#F5F3FF" : "white",
                              cursor: "pointer",
                            }}
                          >
                            <span
                              aria-hidden="true"
                              style={{
                                width: "22px",
                                height: "22px",
                                borderRadius: "7px",
                                border: active ? "2px solid #6D5DFB" : "2px solid #CBD5E1",
                                backgroundColor: active ? "#6D5DFB" : "white",
                                color: "white",
                                display: "grid",
                                placeItems: "center",
                                fontSize: "14px",
                                fontWeight: 900,
                              }}
                            >
                              {active ? "✓" : ""}
                            </span>
                            <span>
                              <span
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "8px",
                                  flexWrap: "wrap",
                                  color: "#111827",
                                  fontWeight: 900,
                                }}
                              >
                                {field.label}
                                {field.recommended ? <Pill tone="green">Recommended</Pill> : null}
                              </span>
                              <span style={{ display: "block", marginTop: "6px" }}>
                                CSV header: <HeaderCode>{field.header}</HeaderCode>
                              </span>
                              <span
                                style={{
                                  display: "block",
                                  marginTop: "6px",
                                  color: "#6B7280",
                                  lineHeight: 1.45,
                                }}
                              >
                                {field.description}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </section>

            <section
              style={{
                backgroundColor: "white",
                border: "1px solid #E5E7EB",
                borderRadius: "20px",
                padding: "20px",
                display: "grid",
                gap: "14px",
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: "22px", color: "#111827" }}>
                  2. Prepare exact CSV headers
                </h2>
                <p style={{ margin: "6px 0 0", color: "#6B7280", lineHeight: 1.5 }}>
                  Your file should include these active headers. Extra columns are ignored in the
                  preview; missing active headers block preview.
                </p>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {expectedHeaders.map((header) => (
                  <HeaderCode key={header}>{header}</HeaderCode>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
                <button
                  type="button"
                  onClick={useTemplateCsv}
                  style={{
                    border: "1px solid #C7D2FE",
                    borderRadius: "999px",
                    backgroundColor: "white",
                    color: "#4338CA",
                    padding: "10px 14px",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Put template in upload box
                </button>
                <button
                  type="button"
                  onClick={downloadTemplateCsv}
                  style={{
                    border: "1px solid #D1D5DB",
                    borderRadius: "999px",
                    backgroundColor: "white",
                    color: "#374151",
                    padding: "10px 14px",
                    fontWeight: 900,
                    cursor: "pointer",
                  }}
                >
                  Download template CSV
                </button>
              </div>
            </section>
          </div>

          <aside
            style={{
              backgroundColor: "white",
              border: "1px solid #E5E7EB",
              borderRadius: "20px",
              padding: "20px",
              position: "sticky",
              top: "16px",
              display: "grid",
              gap: "14px",
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: "20px", color: "#111827" }}>
                Preview checklist
              </h2>
              <p style={{ margin: "6px 0 0", color: "#6B7280", lineHeight: 1.5 }}>
                Nothing on this page writes to NXT.
              </p>
            </div>
            <div style={{ display: "grid", gap: "8px" }}>
              <Pill tone={mappedIdentityField ? "green" : "amber"}>
                {mappedIdentityField
                  ? "Identity fields active"
                  : "Activate ID, lookup, email, or first/last name"}
              </Pill>
              <Pill tone={activeFields.targetConstituency || defaultAction === "reorder" ? "green" : "amber"}>
                {activeFields.targetConstituency || defaultAction === "reorder"
                  ? "Constituent code behavior set"
                  : "Activate New Constituent Code"}
              </Pill>
              <Pill tone={rows.length ? "green" : "amber"}>
                {rows.length ? `${rows.length} rows parsed` : "Upload CSV rows"}
              </Pill>
              <Pill tone={missingHeaders.length === 0 ? "green" : "red"}>
                {missingHeaders.length === 0
                  ? "All active headers present"
                  : `${missingHeaders.length} active header(s) missing`}
              </Pill>
            </div>
            {error ? (
              <div
                style={{
                  border: "1px solid #FECACA",
                  borderRadius: "14px",
                  backgroundColor: "#FEF2F2",
                  color: "#991B1B",
                  padding: "12px",
                  fontWeight: 800,
                }}
              >
                {error}
              </div>
            ) : null}
            <button
              type="button"
              onClick={requestPreview}
              disabled={!canPreview || previewing}
              style={{
                border: "none",
                borderRadius: "14px",
                backgroundColor: !canPreview || previewing ? "#CBD5E1" : "#6D5DFB",
                color: "white",
                padding: "13px 16px",
                fontWeight: 900,
                fontSize: "15px",
                cursor: !canPreview || previewing ? "not-allowed" : "pointer",
              }}
            >
              {previewing ? "Previewing..." : "Preview import"}
            </button>
            {preview?.rows?.length ? (
              <button
                type="button"
                onClick={downloadPreviewCsv}
                style={{
                  display: "inline-flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "8px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "14px",
                  backgroundColor: "white",
                  color: "#374151",
                  padding: "12px 16px",
                  fontWeight: 900,
                  cursor: "pointer",
                }}
              >
                <FileText size={16} /> Export preview CSV
              </button>
            ) : null}
          </aside>
        </section>

        <section
          style={{
            marginTop: "18px",
            backgroundColor: "white",
            border: "1px solid #E5E7EB",
            borderRadius: "20px",
            padding: "20px",
            display: "grid",
            gap: "16px",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, fontSize: "22px", color: "#111827" }}>
                3. Upload CSV and review preview
              </h2>
              <p style={{ margin: "6px 0 0", color: "#6B7280" }}>
                Paste CSV content or upload a file exported from a data append.
              </p>
            </div>
            <label
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                alignSelf: "start",
                border: "1px solid #C7D2FE",
                borderRadius: "999px",
                color: "#4338CA",
                padding: "10px 14px",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              <Upload size={16} /> Upload CSV
              <input
                id="constituency-import-file"
                name="constituency-import-file"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileUpload}
                style={{ display: "none" }}
              />
            </label>
          </div>

          <textarea
            name="constituency-import-csv"
            value={rawCsv}
            onChange={(event) => setRawCsv(event.target.value)}
            rows={8}
            spellCheck={false}
            style={{
              width: "100%",
              boxSizing: "border-box",
              border: "1px solid #D1D5DB",
              borderRadius: "14px",
              padding: "14px",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: "13px",
              color: "#111827",
              backgroundColor: "#F9FAFB",
            }}
          />
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
            <Pill tone={rows.length ? "green" : "neutral"}>
              {rows.length ? `${rows.length} rows parsed` : "No rows parsed"}
            </Pill>
            {parseMessage ? <span style={{ color: "#6B7280" }}>{parseMessage}</span> : null}
          </div>
          {missingHeaders.length ? (
            <div
              style={{
                border: "1px solid #FECACA",
                borderRadius: "14px",
                backgroundColor: "#FEF2F2",
                color: "#991B1B",
                padding: "12px",
                fontWeight: 800,
              }}
            >
              Missing active CSV headers: {missingHeaders.join(", ")}
            </div>
          ) : null}
          {extraHeaders.length ? (
            <div
              style={{
                border: "1px solid #FDE68A",
                borderRadius: "14px",
                backgroundColor: "#FFFBEB",
                color: "#92400E",
                padding: "12px",
                fontWeight: 800,
              }}
            >
              Extra CSV headers will be ignored in this preview: {extraHeaders.join(", ")}
            </div>
          ) : null}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
              gap: "10px",
            }}
          >
            {summaryCards.map(([label, value, tone]) => (
              <div
                key={label}
                style={{
                  border: "1px solid #E5E7EB",
                  borderRadius: "14px",
                  padding: "14px",
                  backgroundColor: "#F9FAFB",
                }}
              >
                <div style={{ color: "#6B7280", fontSize: "12px", fontWeight: 900, textTransform: "uppercase" }}>
                  {label}
                </div>
                <div
                  style={{
                    marginTop: "8px",
                    fontSize: "26px",
                    fontWeight: 900,
                    color: statusTone(label === "Conflicts" ? "Conflict" : label).fg,
                  }}
                >
                  {value}
                </div>
                <div style={{ marginTop: "4px" }}>
                  <Pill tone={tone}>{label}</Pill>
                </div>
              </div>
            ))}
          </div>

          {preview?.warnings?.length ? (
            <div
              style={{
                border: "1px solid #FDE68A",
                borderRadius: "14px",
                backgroundColor: "#FFFBEB",
                color: "#92400E",
                padding: "12px",
                fontWeight: 800,
              }}
            >
              {preview.warnings.join(" ")}
            </div>
          ) : null}

          {preview?.rows?.length ? (
            <div style={{ display: "grid", gap: "12px" }}>
              {preview.rows.map((row) => {
                const colors = statusTone(row.status);
                return (
                  <article
                    key={row.rowNumber}
                    style={{
                      border: `1px solid ${colors.border}`,
                      borderLeft: `6px solid ${colors.fg}`,
                      borderRadius: "16px",
                      padding: "16px",
                      display: "grid",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "start",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div style={{ color: "#6B7280", fontSize: "12px", fontWeight: 900 }}>
                          ROW {row.rowNumber}
                        </div>
                        <h3 style={{ margin: "4px 0 0", color: "#111827" }}>
                          {row.input?.constituentName ||
                            row.input?.lookupId ||
                            row.input?.blackbaudConstituentId ||
                            "Unnamed row"}
                        </h3>
                        <p style={{ margin: "6px 0 0", color: "#6B7280" }}>
                          {row.match?.name
                            ? `Matched to ${row.match.name}${row.match.lookupId ? ` · Lookup ID ${row.match.lookupId}` : ""}`
                            : "No NXT match selected"}
                        </p>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                        <span
                          style={{
                            border: `1px solid ${colors.border}`,
                            borderRadius: "999px",
                            backgroundColor: colors.bg,
                            color: colors.fg,
                            padding: "6px 10px",
                            fontSize: "12px",
                            fontWeight: 900,
                          }}
                        >
                          {row.status}
                        </span>
                        <Pill tone="neutral">{row.confidence}% confidence</Pill>
                        <Pill tone="blue">{row.matchMethod}</Pill>
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "12px",
                      }}
                    >
                      <div>
                        <div style={{ color: "#6B7280", fontSize: "12px", fontWeight: 900, textTransform: "uppercase" }}>
                          Requested change
                        </div>
                        <div style={{ marginTop: "6px", color: "#111827", fontWeight: 800 }}>
                          {row.input?.action || defaultAction}: {row.input?.sourceConstituency || "None"} to{" "}
                          {row.input?.targetConstituency || "None"}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: "#6B7280", fontSize: "12px", fontWeight: 900, textTransform: "uppercase" }}>
                          Current NXT constituencies
                        </div>
                        <div style={{ marginTop: "6px", color: "#111827" }}>
                          {renderList(row.currentCodes)}
                        </div>
                      </div>
                      <div>
                        <div style={{ color: "#6B7280", fontSize: "12px", fontWeight: 900, textTransform: "uppercase" }}>
                          Proposed preview
                        </div>
                        <div style={{ marginTop: "6px", color: "#111827" }}>
                          {renderList(row.proposedCodes)}
                        </div>
                      </div>
                    </div>

                    {row.reasons?.length ? (
                      <div
                        style={{
                          border: "1px solid #E5E7EB",
                          borderRadius: "12px",
                          padding: "10px 12px",
                          color: "#4B5563",
                          backgroundColor: "#F9FAFB",
                        }}
                      >
                        {row.reasons.join(" ")}
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          ) : (
            <div
              style={{
                border: "1px dashed #CBD5E1",
                borderRadius: "16px",
                padding: "28px",
                textAlign: "center",
                color: "#64748B",
              }}
            >
              Preview results will appear here after you upload matching headers and run the preview.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
