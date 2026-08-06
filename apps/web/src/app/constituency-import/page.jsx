"use client";

import { useEffect, useMemo, useState } from "react";
import Papa from "papaparse";
import { ArrowLeft, FileText, Upload } from "lucide-react";
import useUser from "@/utils/useUser";
import useWorkspaceView from "@/utils/useWorkspaceView";
import { isReviewerRole } from "@/utils/workspaceRoles";

const SAMPLE_CSV = `Constituent Name,NXT Lookup ID,Current Constituency,New Constituency,Action,Start Date,End Date
Jane Dolphin,123456,Student,Alumni - Bachelor's Degree,replace,2026-05-01,
Sam Dolphin,234567,Alumni - Bachelor's Degree,Alumni - Graduate Degree,add,2026-05-01,`;

const FIELD_LABELS = {
  constituentName: "Constituent name",
  blackbaudConstituentId: "NXT system ID",
  lookupId: "NXT lookup ID",
  email: "Email address",
  sourceConstituency: "Current/source constituency",
  targetConstituency: "New/target constituency",
  action: "Action",
  startDate: "Start date",
  endDate: "End date",
};

const FIELD_ORDER = [
  "constituentName",
  "blackbaudConstituentId",
  "lookupId",
  "email",
  "sourceConstituency",
  "targetConstituency",
  "action",
  "startDate",
  "endDate",
];

const DETECTORS = {
  constituentName: ["constituent name", "name", "full name", "donor name"],
  blackbaudConstituentId: [
    "nxt system id",
    "system id",
    "blackbaud constituent id",
    "record id",
    "constituent id",
  ],
  lookupId: ["nxt lookup id", "lookup id", "lookup"],
  email: ["email", "email address", "preferred email"],
  sourceConstituency: [
    "current constituency",
    "source constituency",
    "old constituency",
    "from constituency",
    "constituency",
  ],
  targetConstituency: [
    "new constituency",
    "target constituency",
    "to constituency",
    "add constituency",
    "replacement constituency",
  ],
  action: ["action", "operation", "update action"],
  startDate: ["start date", "date from", "begin date"],
  endDate: ["end date", "date to", "stop date"],
};

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function detectMappings(headers) {
  const normalizedHeaders = headers.map((header) => ({
    header,
    normalized: normalizeHeader(header),
  }));

  return FIELD_ORDER.reduce((acc, field) => {
    const candidates = DETECTORS[field] || [];
    const exact = normalizedHeaders.find((item) => candidates.includes(item.normalized));
    const partial = normalizedHeaders.find((item) =>
      candidates.some((candidate) => item.normalized.includes(candidate)),
    );
    acc[field] = (exact || partial)?.header || "";
    return acc;
  }, {});
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

function FieldSelect({ field, headers, value, onChange }) {
  return (
    <label
      style={{
        display: "grid",
        gap: "6px",
        fontSize: "13px",
        fontWeight: 800,
        color: "#374151",
      }}
    >
      {FIELD_LABELS[field]}
      <select
        name={`mapping-${field}`}
        value={value || ""}
        onChange={(event) => onChange(field, event.target.value)}
        style={{
          border: "1px solid #D1D5DB",
          borderRadius: "10px",
          padding: "10px 12px",
          backgroundColor: "white",
          color: "#111827",
        }}
      >
        <option value="">Not mapped</option>
        {headers.map((header) => (
          <option key={header} value={header}>
            {header}
          </option>
        ))}
      </select>
    </label>
  );
}

function renderList(values) {
  if (!Array.isArray(values) || values.length === 0) return "None found";
  return values.join(" -> ");
}

export default function ConstituencyImportPage() {
  const { data: user, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [rawCsv, setRawCsv] = useState(SAMPLE_CSV);
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mappings, setMappings] = useState({});
  const [defaultAction, setDefaultAction] = useState("replace");
  const [parseMessage, setParseMessage] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);

  const profileRole = profile?.user?.role || profile?.workspaceUser?.role || user?.role || "";
  const { effectiveRole } = useWorkspaceView(profileRole);
  const isReviewer = isReviewerRole(effectiveRole);

  const mappedIdentityField = Boolean(
    mappings.blackbaudConstituentId ||
      mappings.lookupId ||
      mappings.email ||
      mappings.constituentName,
  );
  const canPreview =
    rows.length > 0 &&
    mappedIdentityField &&
    (mappings.targetConstituency || defaultAction === "reorder");

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
    setMappings((current) => {
      const detected = detectMappings(parsed.headers);
      return FIELD_ORDER.reduce((acc, field) => {
        acc[field] = current[field] && parsed.headers.includes(current[field])
          ? current[field]
          : detected[field] || "";
        return acc;
      }, {});
    });
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

  function updateMapping(field, value) {
    setMappings((current) => ({ ...current, [field]: value }));
    setPreview(null);
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
        inputName: row.input?.constituentName || "",
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
                Match rows to NXT and preview constituency hierarchy changes before any import.
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
          Start here with a small file. Strong ID matches can become ready for import later; name
          and email matches are intentionally held for review so Advancement Services can avoid bad
          merges, duplicates, and accidental constituency changes.
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
                gap: "14px",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
                <div>
                  <h2 style={{ margin: 0, fontSize: "22px", color: "#111827" }}>
                    1. Add rows
                  </h2>
                  <p style={{ margin: "6px 0 0", color: "#6B7280", lineHeight: 1.5 }}>
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
                  2. Map columns
                </h2>
                <p style={{ margin: "6px 0 0", color: "#6B7280", lineHeight: 1.5 }}>
                  Use NXT system ID or lookup ID when possible. Email/name matching is useful for
                  triage, but not enough to treat a row as import-ready.
                </p>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "12px",
                }}
              >
                {FIELD_ORDER.map((field) => (
                  <FieldSelect
                    key={field}
                    field={field}
                    headers={headers}
                    value={mappings[field] || ""}
                    onChange={updateMapping}
                  />
                ))}
              </div>
              <label
                style={{
                  display: "grid",
                  gap: "6px",
                  maxWidth: "280px",
                  fontSize: "13px",
                  fontWeight: 800,
                  color: "#374151",
                }}
              >
                Default action when no action column is mapped
                <select
                  name="defaultAction"
                  value={defaultAction}
                  onChange={(event) => {
                    setDefaultAction(event.target.value);
                    setPreview(null);
                  }}
                  style={{
                    border: "1px solid #D1D5DB",
                    borderRadius: "10px",
                    padding: "10px 12px",
                    backgroundColor: "white",
                  }}
                >
                  <option value="replace">Replace current with new</option>
                  <option value="add">Add new constituency</option>
                  <option value="end-date">End-date current constituency</option>
                  <option value="reorder">Reorder by hierarchy only</option>
                </select>
              </label>
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
                {mappedIdentityField ? "Identity mapped" : "Map an identity field"}
              </Pill>
              <Pill tone={mappings.targetConstituency || defaultAction === "reorder" ? "green" : "amber"}>
                {mappings.targetConstituency || defaultAction === "reorder"
                  ? "Change data mapped"
                  : "Map a new constituency"}
              </Pill>
              <Pill tone={rows.length ? "green" : "amber"}>
                {rows.length ? `${rows.length} rows ready to preview` : "Add rows"}
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
                3. Review preview
              </h2>
              <p style={{ margin: "6px 0 0", color: "#6B7280" }}>
                Ready rows can become candidates for a future import step. Needs Review and
                Conflict rows should be cleaned up first.
              </p>
            </div>
            {preview?.previewOnly ? <Pill tone="blue">Preview-only result</Pill> : null}
          </div>

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
                          {row.input?.constituentName || row.input?.lookupId || row.input?.blackbaudConstituentId || "Unnamed row"}
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
              Preview results will appear here after you map columns and run the preview.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
