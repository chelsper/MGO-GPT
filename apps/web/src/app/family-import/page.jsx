"use client";

import { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import {
  ArrowLeft,
  Check,
  Download,
  FileText,
  Search,
  Upload,
} from "lucide-react";
import useUser from "@/utils/useUser";
import {
  FAMILY_IMPORT_MAX_ROWS,
  FAMILY_IMPORT_TEMPLATE_HEADERS,
  createFamilyImportTemplateRow,
  displayPersonName,
  getFamilyRowReadiness,
} from "@/utils/familyImport";
import { isReviewerRole } from "@/utils/workspaceRoles";

const COLORS = {
  ink: "#111827",
  muted: "#64748B",
  line: "#D9E2F0",
  violet: "#6256EA",
  violetTint: "#F3F1FF",
  blue: "#2563EB",
  blueTint: "#EFF6FF",
  green: "#047857",
  greenTint: "#ECFDF5",
  amber: "#A45112",
  amberTint: "#FFFBEB",
  red: "#B42318",
  redTint: "#FEF2F2",
};

const CARD_STYLE = {
  backgroundColor: "white",
  border: `1px solid ${COLORS.line}`,
  borderRadius: "18px",
  padding: "20px",
};

function getTone(status) {
  switch (String(status || "").toLowerCase()) {
    case "ready":
      return { background: "#DCFCE7", border: "#86EFAC", color: "#166534" };
    case "applied":
      return { background: "#DBEAFE", border: "#93C5FD", color: "#1D4ED8" };
    case "failed":
      return { background: "#FEE2E2", border: "#FCA5A5", color: "#B91C1C" };
    case "skipped":
      return { background: "#E0E7FF", border: "#A5B4FC", color: "#4338CA" };
    default:
      return { background: "#FEF3C7", border: "#FCD34D", color: "#A45112" };
  }
}

function Pill({ children, status = "Needs Review" }) {
  const tone = getTone(status);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        border: `1px solid ${tone.border}`,
        borderRadius: "999px",
        backgroundColor: tone.background,
        color: tone.color,
        padding: "5px 9px",
        fontSize: "12px",
        fontWeight: 900,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

function Button({ children, tone = "primary", disabled = false, style, ...props }) {
  const colors =
    tone === "primary"
      ? { backgroundColor: COLORS.violet, borderColor: COLORS.violet, color: "white" }
      : tone === "danger"
        ? { backgroundColor: "#C2410C", borderColor: "#C2410C", color: "white" }
        : tone === "success"
          ? { backgroundColor: COLORS.green, borderColor: COLORS.green, color: "white" }
          : { backgroundColor: "white", borderColor: "#A5B4FC", color: "#4338CA" };
  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        border: "1px solid",
        borderRadius: "11px",
        padding: "10px 13px",
        fontWeight: 900,
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.55 : 1,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        ...colors,
        ...style,
      }}
      {...props}
    >
      {children}
    </button>
  );
}

function Field({ label, children, hint }) {
  return (
    <label style={{ display: "grid", gap: "6px" }}>
      <span style={{ color: "#334155", fontSize: "12px", fontWeight: 900, letterSpacing: "0.03em" }}>
        {label}
      </span>
      {children}
      {hint ? <span style={{ color: COLORS.muted, fontSize: "12px", lineHeight: 1.4 }}>{hint}</span> : null}
    </label>
  );
}

function TextInput(props) {
  return (
    <input
      {...props}
      style={{
        width: "100%",
        border: `1px solid ${COLORS.line}`,
        borderRadius: "10px",
        backgroundColor: "white",
        color: COLORS.ink,
        minHeight: "40px",
        padding: "9px 10px",
        outline: "none",
        ...props.style,
      }}
    />
  );
}

function Select({ children, ...props }) {
  return (
    <select
      {...props}
      style={{
        width: "100%",
        border: `1px solid ${COLORS.line}`,
        borderRadius: "10px",
        backgroundColor: "white",
        color: COLORS.ink,
        minHeight: "40px",
        padding: "9px 10px",
        outline: "none",
        ...props.style,
      }}
    >
      {children}
    </select>
  );
}

function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString([], { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function cleanText(value) {
  return String(value || "").trim();
}

function describeSourcePerson(person) {
  const parts = [];
  if (cleanText(person?.systemId)) parts.push(`System ID ${person.systemId}`);
  if (cleanText(person?.lookupId)) parts.push(`Lookup ID ${person.lookupId}`);
  if (cleanText(person?.email)) parts.push(person.email);
  if (cleanText(person?.phone)) parts.push(person.phone);
  if (cleanText(person?.addressLine1)) {
    parts.push([person.addressLine1, person.city, person.state, person.postalCode].filter(Boolean).join(", "));
  }
  return parts.length ? parts.join(" | ") : "No identifying details were supplied.";
}

function responseError(message, response, payload) {
  const error = new Error(message);
  error.status = response.status;
  error.payload = payload;
  return error;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw responseError(payload?.error || "The Family Import request failed.", response, payload);
  }
  return payload;
}

function FamilyPersonPanel({
  activeRow,
  targetKey,
  person,
  selection,
  candidates,
  query,
  lookupBusy,
  onQueryChange,
  onLookup,
  onSelectCandidate,
  onChooseCreate,
}) {
  const isStudent = targetKey === "student";
  const label = isStudent ? "Student" : targetKey === "parent2" ? "Parent 2" : "Parent 1";
  const hasSourceIdentifier = cleanText(person?.systemId) || cleanText(person?.lookupId);
  const selectedCandidate = selection?.mode === "existing" ? selection.candidate : null;
  const createSelected = selection?.mode === "create";
  const canCreate = !isStudent && cleanText(person?.firstName) && cleanText(person?.lastName);

  return (
    <section
      style={{
        border: `1px solid ${selectedCandidate || createSelected ? "#86EFAC" : COLORS.line}`,
        backgroundColor: selectedCandidate || createSelected ? "#F0FDF4" : "white",
        borderRadius: "15px",
        padding: "15px",
        display: "grid",
        gap: "13px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "flex-start" }}>
        <div>
          <div style={{ color: "#334155", fontSize: "12px", fontWeight: 900, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {label}
          </div>
          <div style={{ color: COLORS.ink, fontSize: "19px", fontWeight: 900, marginTop: "3px" }}>
            {displayPersonName(person, isStudent ? "Unnamed student" : `Unnamed ${label.toLowerCase()}`)}
          </div>
          <p style={{ margin: "5px 0 0", color: COLORS.muted, fontSize: "13px", lineHeight: 1.45 }}>
            {describeSourcePerson(person)}
          </p>
        </div>
        {selectedCandidate ? <Pill status="Ready">NXT selected</Pill> : null}
        {createSelected ? <Pill status="Ready">Create confirmed</Pill> : null}
      </div>

      {selectedCandidate ? (
        <div style={{ backgroundColor: "#DCFCE7", borderRadius: "10px", padding: "10px 11px", color: "#166534", fontSize: "14px", lineHeight: 1.45 }}>
          <strong>{selectedCandidate.name || "Selected NXT constituent"}</strong>
          {selectedCandidate.lookupId ? ` | Lookup ID ${selectedCandidate.lookupId}` : ""}
          {selectedCandidate.blackbaudConstituentId ? ` | System ID ${selectedCandidate.blackbaudConstituentId}` : ""}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: "8px" }}>
        <TextInput
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={hasSourceIdentifier ? "Optional: search another name, email, or ID" : "Search by name, email, or NXT ID"}
          aria-label={`Search NXT for ${label}`}
        />
        <Button
          tone="secondary"
          onClick={() => onLookup(targetKey, query)}
          disabled={lookupBusy}
          style={{ minWidth: "108px" }}
        >
          <Search size={16} />
          {lookupBusy ? "Searching" : "Search NXT"}
        </Button>
      </div>

      {hasSourceIdentifier ? (
        <Button
          tone="secondary"
          onClick={() => onLookup(targetKey, "")}
          disabled={lookupBusy}
          style={{ justifySelf: "start", padding: "8px 10px", fontSize: "13px" }}
        >
          Verify CSV NXT identity
        </Button>
      ) : null}

      {candidates?.length ? (
        <div style={{ display: "grid", gap: "7px" }}>
          <div style={{ color: "#334155", fontSize: "12px", fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.04em" }}>
            Select the exact existing NXT record
          </div>
          {candidates.map((candidate) => {
            const isSelected = selectedCandidate?.blackbaudConstituentId === candidate.blackbaudConstituentId;
            return (
              <button
                key={candidate.blackbaudConstituentId}
                type="button"
                onClick={() => onSelectCandidate(targetKey, candidate)}
                style={{
                  border: `1px solid ${isSelected ? COLORS.violet : COLORS.line}`,
                  borderRadius: "10px",
                  backgroundColor: isSelected ? COLORS.violetTint : "white",
                  color: COLORS.ink,
                  cursor: "pointer",
                  padding: "10px 11px",
                  textAlign: "left",
                }}
              >
                <strong>{candidate.name || "Unnamed constituent"}</strong>
                <span style={{ display: "block", marginTop: "3px", color: COLORS.muted, fontSize: "13px" }}>
                  {candidate.lookupId ? `Lookup ID ${candidate.lookupId}` : "No lookup ID"}
                  {candidate.blackbaudConstituentId ? ` | System ID ${candidate.blackbaudConstituentId}` : ""}
                  {candidate.email ? ` | ${candidate.email}` : ""}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}

      {canCreate ? (
        <div style={{ borderTop: `1px solid ${COLORS.line}`, paddingTop: "12px", display: "grid", gap: "9px" }}>
          <label style={{ display: "flex", gap: "9px", alignItems: "flex-start", color: "#374151", lineHeight: 1.4 }}>
            <input
              type="checkbox"
              checked={Boolean(createSelected && selection?.confirmed)}
              onChange={(event) => onChooseCreate(targetKey, event.target.checked)}
              style={{ marginTop: "3px" }}
            />
            <span>
              <strong>Create this new {label.toLowerCase()} in NXT only if no correct match exists.</strong>
              <span style={{ display: "block", color: COLORS.muted, fontSize: "13px", marginTop: "2px" }}>
                Existing NXT records are linked, never overwritten. Profile and contact fields are used only for a newly created parent.
              </span>
            </span>
          </label>
        </div>
      ) : null}

      {isStudent ? (
        <p style={{ margin: 0, color: COLORS.muted, fontSize: "13px", lineHeight: 1.45 }}>
          Students must be selected from an existing NXT constituent. This workflow never creates a student record.
        </p>
      ) : null}

      {activeRow?.status === "Applied" ? (
        <p style={{ margin: 0, color: COLORS.muted, fontSize: "13px" }}>
          This family has been applied and is locked to preserve its NXT audit trail.
        </p>
      ) : null}
    </section>
  );
}

function RelationshipFields({ label, relationship, onChange, disabled = false, spouse = false }) {
  return (
    <section
      style={{
        border: `1px solid ${COLORS.line}`,
        backgroundColor: "#FAFCFF",
        borderRadius: "14px",
        padding: "14px",
        display: "grid",
        gap: "11px",
      }}
    >
      <div style={{ color: COLORS.ink, fontWeight: 900 }}>{label}</div>
      {spouse ? (
        <label style={{ display: "flex", alignItems: "center", gap: "8px", color: "#334155", fontWeight: 700 }}>
          <input
            type="checkbox"
            checked={relationship?.enabled === true}
            onChange={(event) => onChange("enabled", event.target.checked)}
            disabled={disabled}
          />
          Add or preserve a spouse relationship between Parent 1 and Parent 2
        </label>
      ) : null}
      {(!spouse || relationship?.enabled) ? (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "10px" }}>
            <Field label="Relation Code">
              <TextInput
                value={relationship?.type || ""}
                onChange={(event) => onChange("type", event.target.value)}
                disabled={disabled}
                placeholder={spouse ? "Spouse" : "Parent"}
              />
            </Field>
            <Field label="Reciprocal Relation Code">
              <TextInput
                value={relationship?.reciprocalType || ""}
                onChange={(event) => onChange("reciprocalType", event.target.value)}
                disabled={disabled}
                placeholder={spouse ? "Spouse" : "Child"}
              />
            </Field>
          </div>
          {spouse ? (
            <Field label="Household Head">
              <Select
                value={relationship?.householdHead || "parent1"}
                onChange={(event) => onChange("householdHead", event.target.value)}
                disabled={disabled}
              >
                <option value="parent1">Parent 1 is household head</option>
                <option value="parent2">Parent 2 is household head</option>
              </Select>
            </Field>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

function StatusMetric({ label, value, status }) {
  return (
    <div style={{ border: `1px solid ${COLORS.line}`, borderRadius: "14px", padding: "14px", backgroundColor: "white" }}>
      <div style={{ color: COLORS.muted, fontSize: "12px", fontWeight: 900, letterSpacing: "0.05em", textTransform: "uppercase" }}>
        {label}
      </div>
      <div style={{ marginTop: "6px", color: getTone(status).color, fontSize: "28px", fontWeight: 900 }}>{value || 0}</div>
    </div>
  );
}

function getInitialActiveRowId(rows) {
  const preferred = (rows || []).find((row) => !["Applied", "Skipped"].includes(row.status));
  return String((preferred || rows?.[0])?.id || "");
}

export default function FamilyImportPage() {
  const { user, loading: loadingUser } = useUser();
  const fileInputRef = useRef(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [sourceFilename, setSourceFilename] = useState("");
  const [parseMessage, setParseMessage] = useState("");
  const [runs, setRuns] = useState([]);
  const [runPayload, setRunPayload] = useState(null);
  const [activeRowId, setActiveRowId] = useState("");
  const [draftReview, setDraftReview] = useState(null);
  const [lookupQueries, setLookupQueries] = useState({});
  const [lookupResults, setLookupResults] = useState({});
  const [busyLookupKey, setBusyLookupKey] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [pageError, setPageError] = useState("");
  const [pageNotice, setPageNotice] = useState("");

  const canUseFamilyImport = isReviewerRole(user?.role);
  const rows = runPayload?.rows || [];
  const activeRow = rows.find((row) => String(row.id) === String(activeRowId)) || null;
  const activeInput = activeRow?.input || null;
  const draftReadiness = activeInput && draftReview
    ? getFamilyRowReadiness(activeInput, draftReview)
    : activeRow?.readiness || null;

  async function loadRuns() {
    const payload = await requestJson("/api/family-import/runs?limit=20");
    setRuns(payload.runs || []);
    return payload.runs || [];
  }

  async function loadRun(runId) {
    const payload = await requestJson(`/api/family-import/runs?id=${encodeURIComponent(runId)}`);
    setRunPayload(payload);
    setActiveRowId((currentId) => {
      const exists = payload.rows?.some((row) => String(row.id) === String(currentId));
      return exists ? currentId : getInitialActiveRowId(payload.rows);
    });
    await loadRuns();
    return payload;
  }

  useEffect(() => {
    if (!canUseFamilyImport) return;
    loadRuns()
      .then((nextRuns) => {
        if (nextRuns[0]?.id) return loadRun(nextRuns[0].id);
        return null;
      })
      .catch((error) => setPageError(error.message));
  }, [canUseFamilyImport]);

  useEffect(() => {
    if (!activeRow) {
      setDraftReview(null);
      return;
    }
    setDraftReview(activeRow.review || null);
    setLookupQueries({});
    setLookupResults({});
  }, [activeRow?.id, activeRow?.updatedAt]);

  function downloadTemplate() {
    const csv = Papa.unparse([createFamilyImportTemplateRow()], {
      columns: FAMILY_IMPORT_TEMPLATE_HEADERS,
    });
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "family-import-template.csv";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function handleFileSelected(event) {
    const file = event.target.files?.[0];
    setParsedRows([]);
    setSourceFilename("");
    setParseMessage("");
    setPageError("");
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: "greedy",
      complete: (result) => {
        const rowsToUpload = (result.data || []).filter((row) =>
          Object.values(row || {}).some((value) => cleanText(value)),
        );
        setParsedRows(rowsToUpload);
        setSourceFilename(file.name);
        if (rowsToUpload.length > FAMILY_IMPORT_MAX_ROWS) {
          setParseMessage(`This file has ${rowsToUpload.length} rows. Family Import allows up to ${FAMILY_IMPORT_MAX_ROWS} rows per file.`);
          return;
        }
        if (result.errors?.length) {
          setParseMessage(`Parsed ${rowsToUpload.length} rows with ${result.errors.length} CSV formatting warning(s).`);
          return;
        }
        setParseMessage(`${rowsToUpload.length} family row${rowsToUpload.length === 1 ? "" : "s"} parsed. No NXT calls have been made.`);
      },
      error: () => setParseMessage("The file could not be read as CSV."),
    });
  }

  async function createRun() {
    if (!parsedRows.length) {
      setPageError("Choose a CSV file before creating a Family Import review.");
      return;
    }
    if (parsedRows.length > FAMILY_IMPORT_MAX_ROWS) {
      setPageError(`Family Import supports up to ${FAMILY_IMPORT_MAX_ROWS} rows per upload.`);
      return;
    }
    setUploading(true);
    setPageError("");
    setPageNotice("");
    try {
      const payload = await requestJson("/api/family-import/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows: parsedRows, sourceFilename }),
      });
      setRunPayload(payload);
      setActiveRowId(getInitialActiveRowId(payload.rows));
      setPageNotice("The family review was saved. NXT has not been contacted.");
      await loadRuns();
    } catch (error) {
      setPageError(error.message);
    } finally {
      setUploading(false);
    }
  }

  function updateSelection(targetKey, selection) {
    setDraftReview((current) => ({
      ...(current || {}),
      selections: {
        ...(current?.selections || {}),
        [targetKey]: selection,
      },
    }));
  }

  function updateRelationship(key, field, value) {
    setDraftReview((current) => ({
      ...(current || {}),
      relationships: {
        ...(current?.relationships || {}),
        [key]: {
          ...(current?.relationships?.[key] || {}),
          [field]: value,
        },
      },
    }));
  }

  async function lookupPerson(targetKey, query) {
    if (!activeRow || !runPayload?.run?.id) return;
    setBusyLookupKey(targetKey);
    setPageError("");
    try {
      const payload = await requestJson(
        `/api/family-import/runs/${encodeURIComponent(runPayload.run.id)}/rows/${encodeURIComponent(activeRow.id)}/lookup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ targetKey, query: cleanText(query) || undefined }),
        },
      );
      setLookupResults((current) => ({ ...current, [targetKey]: payload.candidates || [] }));
      if (!payload.candidates?.length) {
        setPageNotice(`No NXT records were found for ${targetKey === "student" ? "the student" : targetKey === "parent2" ? "Parent 2" : "Parent 1"}. Try a different search or explicitly create a new parent only when appropriate.`);
      }
    } catch (error) {
      setPageError(error.message);
    } finally {
      setBusyLookupKey("");
    }
  }

  async function saveReview() {
    if (!activeRow || !runPayload?.run?.id || !draftReview) return null;
    setSaving(true);
    setPageError("");
    try {
      const payload = await requestJson(
        `/api/family-import/runs/${encodeURIComponent(runPayload.run.id)}/rows/${encodeURIComponent(activeRow.id)}/review`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ review: draftReview }),
        },
      );
      await loadRun(runPayload.run.id);
      setPageNotice(payload.row?.status === "Ready" ? "Family review saved and ready for the explicit NXT write." : "Family review saved. Complete the required selections before sending it to NXT.");
      return payload.row;
    } catch (error) {
      setPageError(error.message);
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function applyFamily() {
    const savedRow = await saveReview();
    if (!savedRow?.readiness?.ready) return;

    setApplying(true);
    setPageError("");
    try {
      const payload = await requestJson(
        `/api/family-import/runs/${encodeURIComponent(runPayload.run.id)}/rows/${encodeURIComponent(activeRow.id)}/apply`,
        { method: "POST" },
      );
      await loadRun(runPayload.run.id);
      setPageNotice(`Family row ${payload.row?.rowNumber || ""} was applied to NXT. Its audit trail is preserved in this separate workflow.`);
    } catch (error) {
      await loadRun(runPayload.run.id).catch(() => null);
      setPageError(error.message);
    } finally {
      setApplying(false);
    }
  }

  async function toggleSkip() {
    if (!activeRow || !runPayload?.run?.id) return;
    try {
      const restoring = activeRow.status === "Skipped";
      await requestJson(
        `/api/family-import/runs/${encodeURIComponent(runPayload.run.id)}/rows/${encodeURIComponent(activeRow.id)}/skip`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ restore: restoring }),
        },
      );
      await loadRun(runPayload.run.id);
      setPageNotice(restoring ? "The skipped family was restored for review." : "The family was skipped for later. It remains in this run and can be restored at any time.");
    } catch (error) {
      setPageError(error.message);
    }
  }

  function moveRow(direction) {
    if (!rows.length) return;
    const currentIndex = rows.findIndex((row) => String(row.id) === String(activeRowId));
    const nextIndex = Math.max(0, Math.min(rows.length - 1, currentIndex + direction));
    setActiveRowId(String(rows[nextIndex]?.id || ""));
  }

  if (loadingUser) {
    return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: COLORS.muted }}>Loading Family Import...</main>;
  }

  if (!canUseFamilyImport) {
    return (
      <main style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", padding: "28px 18px" }}>
        <div style={{ ...CARD_STYLE, maxWidth: "720px", margin: "0 auto" }}>
          <h1 style={{ margin: 0, color: COLORS.ink }}>Family Import</h1>
          <p style={{ color: COLORS.muted, lineHeight: 1.5 }}>
            Family Import is limited to Advancement Services and Admin users because it can create constituents and relationships in NXT.
          </p>
          <a href="/" style={{ color: COLORS.violet, fontWeight: 900 }}>Return to home</a>
        </div>
      </main>
    );
  }

  const summary = runPayload?.run?.summary || {
    total: 0,
    ready: 0,
    needsReview: 0,
    skipped: 0,
    applied: 0,
    failed: 0,
  };
  const parent1 = activeInput?.parents?.find((person) => person.key === "parent1") || null;
  const parent2 = activeInput?.parents?.find((person) => person.key === "parent2") || null;

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", padding: "28px 18px 56px" }}>
      <div style={{ maxWidth: "1260px", margin: "0 auto" }}>
        <header style={{ display: "flex", gap: "16px", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", marginBottom: "18px" }}>
          <div style={{ display: "flex", gap: "14px", alignItems: "flex-start" }}>
            <a
              href="/"
              aria-label="Return to home"
              style={{
                width: "44px",
                height: "44px",
                border: `1px solid ${COLORS.line}`,
                borderRadius: "12px",
                display: "grid",
                placeItems: "center",
                color: "#334155",
                backgroundColor: "white",
              }}
            >
              <ArrowLeft size={20} />
            </a>
            <div>
              <h1 style={{ margin: 0, color: COLORS.ink, fontSize: "31px" }}>Family Import</h1>
              <p style={{ margin: "6px 0 0", color: COLORS.muted, lineHeight: 1.5, maxWidth: "780px" }}>
                A separate staged workflow for linking existing students with one or two parents. Uploading a CSV only saves a review to this app; NXT is contacted only when you choose to search, verify, or apply one family.
              </p>
            </div>
          </div>
          <Pill status="Ready">Isolated from Constituency Import</Pill>
        </header>

        {pageError ? (
          <section role="alert" style={{ ...CARD_STYLE, borderColor: "#FCA5A5", backgroundColor: COLORS.redTint, color: COLORS.red, marginBottom: "18px", lineHeight: 1.5 }}>
            <strong>Family Import needs attention</strong>
            <div style={{ marginTop: "4px" }}>{pageError}</div>
          </section>
        ) : null}
        {pageNotice ? (
          <section role="status" style={{ ...CARD_STYLE, borderColor: "#86EFAC", backgroundColor: COLORS.greenTint, color: COLORS.green, marginBottom: "18px", lineHeight: 1.5 }}>
            {pageNotice}
          </section>
        ) : null}

        <section style={{ ...CARD_STYLE, marginBottom: "18px", display: "grid", gap: "15px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, color: COLORS.ink, fontSize: "22px" }}>1. Create an isolated family review</h2>
              <p style={{ margin: "5px 0 0", color: COLORS.muted, lineHeight: 1.5 }}>
                Upload up to {FAMILY_IMPORT_MAX_ROWS} family rows. The upload is database-only and will not use Blackbaud quota or alter the existing constituency importer.
              </p>
            </div>
            <Button tone="secondary" onClick={downloadTemplate}>
              <Download size={16} /> Download CSV template
            </Button>
          </div>
          <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={handleFileSelected} />
            {sourceFilename ? <Pill status="Ready">{sourceFilename}</Pill> : null}
            {parseMessage ? <span style={{ color: COLORS.muted, lineHeight: 1.45 }}>{parseMessage}</span> : null}
          </div>
          <div>
            <Button onClick={createRun} disabled={uploading || !parsedRows.length || parsedRows.length > FAMILY_IMPORT_MAX_ROWS}>
              <Upload size={16} />
              {uploading ? "Saving review..." : "Create Family Import review"}
            </Button>
          </div>
        </section>

        <section style={{ ...CARD_STYLE, marginBottom: "18px", display: "grid", gap: "13px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
            <div>
              <h2 style={{ margin: 0, color: COLORS.ink, fontSize: "22px" }}>Saved family reviews</h2>
              <p style={{ margin: "5px 0 0", color: COLORS.muted }}>Skipped families remain available here for later review.</p>
            </div>
            {runPayload?.run?.createdAt ? <span style={{ color: COLORS.muted, fontSize: "13px" }}>Opened {formatDate(runPayload.run.createdAt)}</span> : null}
          </div>
          {runs.length ? (
            <div style={{ display: "flex", gap: "8px", overflowX: "auto", paddingBottom: "3px" }}>
              {runs.map((run) => {
                const selected = String(run.id) === String(runPayload?.run?.id);
                return (
                  <button
                    key={run.id}
                    type="button"
                    onClick={() => loadRun(run.id).catch((error) => setPageError(error.message))}
                    style={{
                      flex: "0 0 auto",
                      minWidth: "210px",
                      border: `1px solid ${selected ? COLORS.violet : COLORS.line}`,
                      borderRadius: "12px",
                      backgroundColor: selected ? COLORS.violetTint : "white",
                      color: COLORS.ink,
                      cursor: "pointer",
                      padding: "11px",
                      textAlign: "left",
                    }}
                  >
                    <strong>{run.sourceFilename || `Family Import #${run.id}`}</strong>
                    <span style={{ display: "block", marginTop: "4px", color: COLORS.muted, fontSize: "13px" }}>
                      {run.rowCount} rows | {run.readyCount} ready | {run.appliedCount} applied
                    </span>
                  </button>
                );
              })}
            </div>
          ) : (
            <p style={{ margin: 0, color: COLORS.muted }}>No Family Import reviews have been created yet.</p>
          )}
        </section>

        {runPayload ? (
          <>
            <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "11px", marginBottom: "18px" }}>
              <StatusMetric label="Ready" value={summary.ready} status="Ready" />
              <StatusMetric label="Needs Review" value={summary.needsReview} status="Needs Review" />
              <StatusMetric label="Applied" value={summary.applied} status="Applied" />
              <StatusMetric label="Skipped" value={summary.skipped} status="Skipped" />
              <StatusMetric label="Failed" value={summary.failed} status="Failed" />
              <StatusMetric label="Total" value={summary.total} status="Needs Review" />
            </section>

            <section style={{ display: "grid", gridTemplateColumns: "minmax(210px, 280px) minmax(0, 1fr)", alignItems: "start", gap: "18px" }}>
              <aside style={{ ...CARD_STYLE, display: "grid", gap: "8px", position: "sticky", top: "16px" }}>
                <div style={{ color: COLORS.ink, fontWeight: 900 }}>Family rows</div>
                <div style={{ color: COLORS.muted, fontSize: "13px", lineHeight: 1.4 }}>
                  Select any row, including skipped or failed rows, to continue where you left off.
                </div>
                <div style={{ display: "grid", gap: "6px", maxHeight: "610px", overflowY: "auto", paddingRight: "2px" }}>
                  {rows.map((row) => {
                    const selected = String(row.id) === String(activeRowId);
                    const name = displayPersonName(row.input?.student, `Family row ${row.rowNumber}`);
                    return (
                      <button
                        key={row.id}
                        type="button"
                        onClick={() => setActiveRowId(String(row.id))}
                        style={{
                          border: `1px solid ${selected ? COLORS.violet : COLORS.line}`,
                          borderRadius: "10px",
                          backgroundColor: selected ? COLORS.violetTint : "white",
                          color: COLORS.ink,
                          padding: "10px",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span style={{ display: "flex", justifyContent: "space-between", gap: "5px", alignItems: "center" }}>
                          <strong>Row {row.rowNumber}</strong>
                          <Pill status={row.status}>{row.status}</Pill>
                        </span>
                        <span style={{ display: "block", marginTop: "4px", fontSize: "13px", color: COLORS.muted }}>{name}</span>
                      </button>
                    );
                  })}
                </div>
              </aside>

              {activeRow && activeInput && draftReview ? (
                <section style={{ ...CARD_STYLE, display: "grid", gap: "18px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", alignItems: "flex-start", flexWrap: "wrap" }}>
                    <div>
                      <div style={{ color: COLORS.muted, fontWeight: 900, fontSize: "12px", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                        Family row {activeRow.rowNumber}{activeRow.familyKey ? ` | ${activeRow.familyKey}` : ""}
                      </div>
                      <h2 style={{ margin: "5px 0 0", color: COLORS.ink, fontSize: "26px" }}>
                        {displayPersonName(activeInput.student, "Student needs matching")}
                      </h2>
                    </div>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                      <Pill status={activeRow.status}>{activeRow.status}</Pill>
                      <Button tone="secondary" onClick={() => moveRow(-1)} disabled={rows.findIndex((row) => String(row.id) === String(activeRow.id)) <= 0}>Previous</Button>
                      <Button tone="secondary" onClick={() => moveRow(1)} disabled={rows.findIndex((row) => String(row.id) === String(activeRow.id)) >= rows.length - 1}>Next</Button>
                    </div>
                  </div>

                  {activeRow.blackbaudError ? (
                    <div style={{ border: "1px solid #FCA5A5", borderRadius: "12px", padding: "13px", backgroundColor: COLORS.redTint, color: COLORS.red, lineHeight: 1.45 }}>
                      <strong>Prior NXT attempt needs review</strong>
                      <div style={{ marginTop: "4px" }}>{activeRow.blackbaudError}</div>
                    </div>
                  ) : null}

                  <div style={{ border: "1px solid #BFDBFE", borderRadius: "13px", padding: "14px", backgroundColor: COLORS.blueTint, color: "#1E3A8A", lineHeight: 1.5 }}>
                    <strong>Safe behavior:</strong> selecting an existing parent only creates relationships. It will never replace that parent's name, contact information, or other profile data. New parent contact data is used only after you explicitly approve creation.
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(285px, 1fr))", gap: "13px" }}>
                    <FamilyPersonPanel
                      activeRow={activeRow}
                      targetKey="student"
                      person={activeInput.student}
                      selection={draftReview.selections?.student}
                      candidates={lookupResults.student}
                      query={lookupQueries.student || ""}
                      lookupBusy={busyLookupKey === "student"}
                      onQueryChange={(value) => setLookupQueries((current) => ({ ...current, student: value }))}
                      onLookup={lookupPerson}
                      onSelectCandidate={(targetKey, candidate) => updateSelection(targetKey, { mode: "existing", candidate })}
                      onChooseCreate={() => {}}
                    />
                    {parent1 ? (
                      <FamilyPersonPanel
                        activeRow={activeRow}
                        targetKey="parent1"
                        person={parent1}
                        selection={draftReview.selections?.parent1}
                        candidates={lookupResults.parent1}
                        query={lookupQueries.parent1 || ""}
                        lookupBusy={busyLookupKey === "parent1"}
                        onQueryChange={(value) => setLookupQueries((current) => ({ ...current, parent1: value }))}
                        onLookup={lookupPerson}
                        onSelectCandidate={(targetKey, candidate) => updateSelection(targetKey, { mode: "existing", candidate })}
                        onChooseCreate={(targetKey, confirmed) => updateSelection(targetKey, confirmed ? { mode: "create", confirmed: true } : null)}
                      />
                    ) : null}
                    {parent2 ? (
                      <FamilyPersonPanel
                        activeRow={activeRow}
                        targetKey="parent2"
                        person={parent2}
                        selection={draftReview.selections?.parent2}
                        candidates={lookupResults.parent2}
                        query={lookupQueries.parent2 || ""}
                        lookupBusy={busyLookupKey === "parent2"}
                        onQueryChange={(value) => setLookupQueries((current) => ({ ...current, parent2: value }))}
                        onLookup={lookupPerson}
                        onSelectCandidate={(targetKey, candidate) => updateSelection(targetKey, { mode: "existing", candidate })}
                        onChooseCreate={(targetKey, confirmed) => updateSelection(targetKey, confirmed ? { mode: "create", confirmed: true } : null)}
                      />
                    ) : null}
                  </div>

                  <section style={{ display: "grid", gap: "12px" }}>
                    <div>
                      <h3 style={{ margin: 0, color: COLORS.ink, fontSize: "20px" }}>Relationship codes</h3>
                      <p style={{ margin: "4px 0 0", color: COLORS.muted, lineHeight: 1.45 }}>
                        Confirm the exact NXT relation and reciprocal relation codes. These values are editable before saving this separate family review.
                      </p>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "12px" }}>
                      {parent1 ? (
                        <RelationshipFields
                          label="Parent 1 to Student"
                          relationship={draftReview.relationships?.parent1}
                          disabled={activeRow.status === "Applied"}
                          onChange={(field, value) => updateRelationship("parent1", field, value)}
                        />
                      ) : null}
                      {parent2 ? (
                        <RelationshipFields
                          label="Parent 2 to Student"
                          relationship={draftReview.relationships?.parent2}
                          disabled={activeRow.status === "Applied"}
                          onChange={(field, value) => updateRelationship("parent2", field, value)}
                        />
                      ) : null}
                      {parent1 && parent2 ? (
                        <RelationshipFields
                          label="Parent 1 and Parent 2"
                          relationship={draftReview.relationships?.spouse}
                          spouse
                          disabled={activeRow.status === "Applied"}
                          onChange={(field, value) => updateRelationship("spouse", field, value)}
                        />
                      ) : null}
                    </div>
                  </section>

                  {draftReadiness ? (
                    <section style={{ border: `1px solid ${draftReadiness.ready ? "#86EFAC" : "#FCD34D"}`, borderRadius: "14px", padding: "14px", backgroundColor: draftReadiness.ready ? COLORS.greenTint : COLORS.amberTint, display: "grid", gap: "8px" }}>
                      <div style={{ color: draftReadiness.ready ? COLORS.green : COLORS.amber, fontWeight: 900 }}>
                        {draftReadiness.ready ? "This family is ready for an explicit NXT write." : "Complete the following before sending this family to NXT."}
                      </div>
                      {draftReadiness.errors?.map((message) => <div key={message} style={{ color: COLORS.red, lineHeight: 1.4 }}>- {message}</div>)}
                      {draftReadiness.missing?.map((message) => <div key={message} style={{ color: COLORS.amber, lineHeight: 1.4 }}>- {message}</div>)}
                      {draftReadiness.warnings?.map((message) => <div key={message} style={{ color: "#475569", lineHeight: 1.4 }}>- {message}</div>)}
                    </section>
                  ) : null}

                  {Array.isArray(activeRow.application?.steps) && activeRow.application.steps.length ? (
                    <details style={{ border: `1px solid ${COLORS.line}`, borderRadius: "12px", padding: "11px", color: "#334155" }}>
                      <summary style={{ cursor: "pointer", fontWeight: 900 }}>Family apply audit trail</summary>
                      <div style={{ display: "grid", gap: "5px", marginTop: "10px", fontSize: "13px", lineHeight: 1.4 }}>
                        {activeRow.application.steps.slice(-20).reverse().map((step, index) => (
                          <div key={`${step.at || ""}-${index}`}>
                            <strong>{step.kind || "step"}</strong>: {step.status || "recorded"}{step.message ? ` | ${step.message}` : ""}
                          </div>
                        ))}
                      </div>
                    </details>
                  ) : null}

                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center", borderTop: `1px solid ${COLORS.line}`, paddingTop: "16px" }}>
                    <Button tone="secondary" onClick={saveReview} disabled={saving || applying || activeRow.status === "Applied"}>
                      <FileText size={16} />
                      {saving ? "Saving review..." : "Save family review"}
                    </Button>
                    <Button tone="success" onClick={applyFamily} disabled={saving || applying || activeRow.status === "Applied" || !draftReadiness?.ready}>
                      <Check size={16} />
                      {applying ? "Sending to NXT..." : "Save and send family to NXT"}
                    </Button>
                    <Button tone="secondary" onClick={toggleSkip} disabled={saving || applying || activeRow.status === "Applied"}>
                      {activeRow.status === "Skipped" ? "Restore for review" : "Skip for later"}
                    </Button>
                    {activeRow.status === "Failed" ? <Pill status="Failed">Retry is safe: completed steps are retained</Pill> : null}
                  </div>
                </section>
              ) : (
                <section style={{ ...CARD_STYLE, color: COLORS.muted }}>Choose a family row to start reviewing it.</section>
              )}
            </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
