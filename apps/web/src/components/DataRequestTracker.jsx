"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import useUser from "@/utils/useUser";
import useWorkspaceView from "@/utils/useWorkspaceView";
import { isMgoRole, isReviewerRole } from "@/utils/workspaceRoles";

const STATUS_OPTIONS = ["Open", "In Progress", "Completed", "Declined"];

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function statusStyle(status) {
  const map = {
    Open: { bg: "#FEF3C7", fg: "#92400E", border: "#FDE68A" },
    "In Progress": { bg: "#DBEAFE", fg: "#1D4ED8", border: "#BFDBFE" },
    Completed: { bg: "#DCFCE7", fg: "#166534", border: "#BBF7D0" },
    Declined: { bg: "#FEE2E2", fg: "#991B1B", border: "#FECACA" },
  };
  return map[status] || map.Open;
}

export default function DataRequestTracker() {
  const { data: user, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [requests, setRequests] = useState([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loadingQueue, setLoadingQueue] = useState(true);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [blackbaudMatches, setBlackbaudMatches] = useState([]);
  const [selectedBlackbaudMatch, setSelectedBlackbaudMatch] = useState(null);
  const [blackbaudSearchLoading, setBlackbaudSearchLoading] = useState(false);
  const [blackbaudSearchError, setBlackbaudSearchError] = useState("");
  const [blackbaudSearchWarning, setBlackbaudSearchWarning] = useState("");
  const [drafts, setDrafts] = useState({});
  const [newRequest, setNewRequest] = useState({
    constituentName: "",
    blackbaudConstituentId: "",
    requestType: "Contact info update",
    requestNote: "",
    providedData: "",
  });
  const profileRole = profile?.user?.role || profile?.workspaceUser?.role || user?.role || "";
  const { effectiveRole } = useWorkspaceView(profileRole);
  const isReviewer = isReviewerRole(effectiveRole);
  const canCreateRequests = isMgoRole(effectiveRole);

  async function loadProfile() {
    setLoadingProfile(true);
    try {
      const response = await fetch("/api/users/profile");
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load profile");
      }
      setProfile(payload);
    } catch (profileError) {
      setError(profileError instanceof Error ? profileError.message : "Failed to load profile");
    } finally {
      setLoadingProfile(false);
    }
  }

  async function loadQueue() {
    setLoadingQueue(true);
    setError("");
    try {
      const query = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : "";
      const response = await fetch(`/api/data-requests${query}`);
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load data requests");
      }
      setRequests(Array.isArray(payload) ? payload : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load data requests");
    } finally {
      setLoadingQueue(false);
    }
  }

  useEffect(() => {
    if (!loading) {
      loadProfile();
    }
  }, [loading]);

  useEffect(() => {
    if (!loading && !loadingProfile) {
      loadQueue();
    }
  }, [loading, loadingProfile, statusFilter]);

  useEffect(() => {
    const query = newRequest.constituentName.trim();
    if (query.length < 2) {
      setBlackbaudMatches([]);
      setBlackbaudSearchError("");
      setBlackbaudSearchWarning("");
      setBlackbaudSearchLoading(false);
      return;
    }

    let active = true;
    setBlackbaudSearchLoading(true);
    setBlackbaudSearchError("");
    setBlackbaudSearchWarning("");

    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/blackbaud/constituents/search?q=${encodeURIComponent(query)}`,
        );
        const payload = await response.json().catch(() => null);

        if (!active) return;

        if (!response.ok) {
          setBlackbaudMatches([]);
          setBlackbaudSearchError(
            payload?.error || "Could not search Raiser's Edge NXT right now.",
          );
          return;
        }

        const results = Array.isArray(payload?.results) ? payload.results.slice(0, 5) : [];
        setBlackbaudMatches(results);
        setBlackbaudSearchWarning(payload?.warning || "");
        setSelectedBlackbaudMatch((current) =>
          results.find(
            (match) =>
              match.blackbaudConstituentId === current?.blackbaudConstituentId ||
              match.lookupId === current?.lookupId,
          ) || current,
        );
      } catch (searchError) {
        console.error("Data request constituent lookup error:", searchError);
        if (active) {
          setBlackbaudMatches([]);
          setBlackbaudSearchError("Could not search Raiser's Edge NXT right now.");
          setBlackbaudSearchWarning("");
        }
      } finally {
        if (active) {
          setBlackbaudSearchLoading(false);
        }
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [newRequest.constituentName]);

  const summary = useMemo(
    () =>
      requests.reduce(
        (acc, item) => {
          acc.total += 1;
          if (item.status === "Open") acc.open += 1;
          if (item.status === "In Progress") acc.inProgress += 1;
          return acc;
        },
        { total: 0, open: 0, inProgress: 0 },
      ),
    [requests],
  );

  function setDraft(id, updates) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        status: current[id]?.status ?? requests.find((item) => item.id === id)?.status ?? "Open",
        reviewerNotes:
          current[id]?.reviewerNotes ??
          requests.find((item) => item.id === id)?.reviewer_notes ??
          "",
        ...updates,
      },
    }));
  }

  async function saveRequest(item, overrides = {}) {
    if (!isReviewer) return;
    const draft = drafts[item.id] || {};
    setSavingId(item.id);
    setError("");
    try {
      const response = await fetch(`/api/data-requests/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: overrides.status || draft.status || item.status,
          reviewerNotes:
            overrides.reviewerNotes ??
            draft.reviewerNotes ??
            item.reviewer_notes ??
            "",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update data request");
      }
      setRequests((current) => {
        const next = current.map((request) =>
          request.id === item.id ? { ...request, ...payload } : request,
        );
        if (statusFilter && payload?.status !== statusFilter) {
          return next.filter((request) => request.id !== item.id);
        }
        return next;
      });
      setDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to update data request");
    } finally {
      setSavingId(null);
    }
  }

  async function createRequest(event) {
    event.preventDefault();
    setError("");
    setSuccessMessage("");
    setCreating(true);
    try {
      const providedDetails = newRequest.providedData.trim();
      const response = await fetch("/api/data-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          constituentName: newRequest.constituentName.trim(),
          blackbaudConstituentId:
            selectedBlackbaudMatch?.lookupId ||
            selectedBlackbaudMatch?.blackbaudLookupId ||
            selectedBlackbaudMatch?.blackbaudConstituentId ||
            newRequest.blackbaudConstituentId.trim() ||
            null,
          requestType: newRequest.requestType,
          requestNote: newRequest.requestNote.trim(),
          providedData: providedDetails ? { details: providedDetails } : null,
          sourceContext: "data_requests_page",
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to send data request");
      }
      setNewRequest({
        constituentName: "",
        blackbaudConstituentId: "",
        requestType: "Contact info update",
        requestNote: "",
        providedData: "",
      });
      setSelectedBlackbaudMatch(null);
      setBlackbaudMatches([]);
      setBlackbaudSearchError("");
      setBlackbaudSearchWarning("");
      setSuccessMessage("Sent to the Advancement Services data request queue.");
      await loadQueue();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Failed to send data request");
    } finally {
      setCreating(false);
    }
  }

  if (loading || loadingProfile || loadingQueue) {
    return (
      <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#6B7280" }}>
        Loading data request queue...
      </main>
    );
  }

  return (
    <main style={{ minHeight: "100vh", backgroundColor: "#F8FAFC", padding: "28px 18px 48px" }}>
      <div style={{ maxWidth: "1480px", margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "14px", marginBottom: "18px" }}>
          <a
            href="/"
            style={{
              width: "42px",
              height: "42px",
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
            <h1 style={{ margin: 0, fontSize: "28px", color: "#111827" }}>
              Data Request & Update Queue
            </h1>
            <p style={{ margin: "6px 0 0", color: "#6B7280" }}>
              {isReviewer
                ? "Review contact updates, corrected information, and record-change requests from MGOs."
                : canCreateRequests
                  ? "Send and track data updates for Advancement Services."
                  : "Track data requests and updates."}
            </p>
          </div>
        </div>

        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
            marginBottom: "18px",
          }}
        >
          {[
            ["Open", summary.open],
            ["In progress", summary.inProgress],
            ["Total shown", summary.total],
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                backgroundColor: "white",
                border: "1px solid #E5E7EB",
                borderRadius: "16px",
                padding: "16px",
              }}
            >
              <div style={{ color: "#6B7280", fontSize: "12px", fontWeight: 800, textTransform: "uppercase" }}>
                {label}
              </div>
              <div style={{ marginTop: "8px", fontSize: "28px", fontWeight: 800, color: "#111827" }}>
                {value}
              </div>
            </div>
          ))}
        </section>

        {canCreateRequests ? (
          <form
            onSubmit={createRequest}
            style={{
              backgroundColor: "white",
              border: "1px solid #BBF7D0",
              borderRadius: "18px",
              padding: "18px",
              marginBottom: "18px",
              display: "grid",
              gap: "12px",
            }}
          >
            <div>
              <h2 style={{ margin: 0, fontSize: "20px", color: "#064E3B" }}>
                Send a data request
              </h2>
              <p style={{ margin: "6px 0 0", color: "#047857", lineHeight: 1.5 }}>
                Ask Advancement Services to verify contact information or update a constituent
                record. This creates a queue item; it does not write directly to NXT.
              </p>
            </div>
            <div style={{ display: "grid", gap: "12px" }}>
              <label style={{ display: "grid", gap: "6px", fontSize: "13px", fontWeight: 700, color: "#111827" }}>
                Constituent name / NXT lookup
                <input
                  name="constituentName"
                  value={newRequest.constituentName}
                  onChange={(event) =>
                    setNewRequest((current) => ({
                      ...current,
                      constituentName: event.target.value,
                      blackbaudConstituentId: "",
                    }))
                  }
                  onInput={() => setSelectedBlackbaudMatch(null)}
                  placeholder="Search by name, email, or Lookup ID"
                  required
                  style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #D1D5DB" }}
                />
              </label>

              {blackbaudSearchLoading ? (
                <div style={{ color: "#64748B", fontSize: "13px" }}>
                  Searching Raiser's Edge NXT...
                </div>
              ) : null}
              {blackbaudSearchError ? (
                <div style={{ color: "#991B1B", fontSize: "13px", fontWeight: 700 }}>
                  {blackbaudSearchError}
                </div>
              ) : null}
              {blackbaudSearchWarning ? (
                <div style={{ color: "#92400E", fontSize: "13px", fontWeight: 700 }}>
                  {blackbaudSearchWarning}
                </div>
              ) : null}

              {blackbaudMatches.length > 0 ? (
                <div
                  style={{
                    padding: "12px",
                    borderRadius: "12px",
                    border: "1px solid #BFDBFE",
                    backgroundColor: "#EFF6FF",
                  }}
                >
                  <div style={{ fontSize: "13px", fontWeight: 800, color: "#1D4ED8", marginBottom: "8px" }}>
                    NXT matches
                  </div>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {blackbaudMatches.map((match) => {
                      const selected =
                        selectedBlackbaudMatch?.blackbaudConstituentId ===
                          match.blackbaudConstituentId ||
                        selectedBlackbaudMatch?.lookupId === match.lookupId;
                      return (
                        <div
                          key={match.blackbaudConstituentId || match.lookupId || match.name}
                          style={{
                            padding: "10px 12px",
                            borderRadius: "10px",
                            border: selected ? "2px solid #2563EB" : "1px solid #DBEAFE",
                            backgroundColor: selected ? "#DBEAFE" : "white",
                          }}
                        >
                          <div style={{ fontSize: "14px", fontWeight: 800, color: "#111827" }}>
                            {match.name || "Unnamed constituent"}
                          </div>
                          {match.lookupId ? (
                            <div style={{ marginTop: "2px", fontSize: "12px", color: "#4B5563" }}>
                              Lookup ID: {match.lookupId}
                            </div>
                          ) : null}
                          {match.email ? (
                            <div style={{ marginTop: "2px", fontSize: "12px", color: "#4B5563" }}>
                              Email: {match.email}
                            </div>
                          ) : null}
                          {match.phone ? (
                            <div style={{ marginTop: "2px", fontSize: "12px", color: "#4B5563" }}>
                              Phone: {match.phone}
                            </div>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => {
                              const lookupId =
                                match.lookupId ||
                                match.blackbaudLookupId ||
                                match.blackbaudConstituentId ||
                                "";
                              setSelectedBlackbaudMatch(match);
                              setNewRequest((current) => ({
                                ...current,
                                constituentName: match.name || current.constituentName,
                                blackbaudConstituentId: lookupId,
                              }));
                            }}
                            style={{
                              marginTop: "10px",
                              padding: "8px 12px",
                              borderRadius: "999px",
                              border: selected ? "1px solid #1D4ED8" : "1px solid #93C5FD",
                              backgroundColor: selected ? "#1D4ED8" : "white",
                              color: selected ? "white" : "#1D4ED8",
                              fontSize: "12px",
                              fontWeight: 800,
                              cursor: "pointer",
                            }}
                          >
                            {selected ? "NXT match selected" : "Select NXT match"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {selectedBlackbaudMatch ? (
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: "12px",
                    border: "1px solid #BFDBFE",
                    backgroundColor: "#EFF6FF",
                    color: "#1E3A8A",
                    fontSize: "13px",
                    fontWeight: 700,
                  }}
                >
                  Selected NXT constituent: {selectedBlackbaudMatch.name || newRequest.constituentName}
                  {selectedBlackbaudMatch.lookupId ? ` · Lookup ID ${selectedBlackbaudMatch.lookupId}` : ""}
                </div>
              ) : (
                <div style={{ color: "#64748B", fontSize: "13px" }}>
                  Select the matching NXT constituent before sending the request.
                </div>
              )}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "12px",
              }}
            >
              <label style={{ display: "grid", gap: "6px", fontSize: "13px", fontWeight: 700, color: "#111827" }}>
                Request type
                <select
                  name="requestType"
                  value={newRequest.requestType}
                  onChange={(event) =>
                    setNewRequest((current) => ({
                      ...current,
                      requestType: event.target.value,
                    }))
                  }
                  style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", backgroundColor: "white" }}
                >
                  <option value="Contact info update">Contact info update</option>
                  <option value="Record update">Record update</option>
                  <option value="Research request">Research request</option>
                </select>
              </label>
            </div>
            <label style={{ display: "grid", gap: "6px", fontSize: "13px", fontWeight: 700, color: "#111827" }}>
              What should Advancement Services update or verify?
              <textarea
                name="requestNote"
                rows={4}
                value={newRequest.requestNote}
                onChange={(event) =>
                  setNewRequest((current) => ({
                    ...current,
                    requestNote: event.target.value,
                  }))
                }
                placeholder="Example: Please verify the preferred phone number, or update the employer/title."
                style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", resize: "vertical" }}
              />
            </label>
            <label style={{ display: "grid", gap: "6px", fontSize: "13px", fontWeight: 700, color: "#111827" }}>
              Updated information, if you already have it
              <textarea
                name="providedData"
                rows={3}
                value={newRequest.providedData}
                onChange={(event) =>
                  setNewRequest((current) => ({
                    ...current,
                    providedData: event.target.value,
                  }))
                }
                placeholder="Paste the new phone, email, address, employer, title, or other corrected data."
                style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", resize: "vertical" }}
              />
            </label>
            <button
              type="submit"
              disabled={
                creating ||
                !newRequest.constituentName.trim() ||
                !selectedBlackbaudMatch ||
                (!newRequest.requestNote.trim() && !newRequest.providedData.trim())
              }
              style={{
                justifySelf: "start",
                padding: "11px 16px",
                border: "none",
                borderRadius: "12px",
                backgroundColor:
                  creating ||
                  !newRequest.constituentName.trim() ||
                  !selectedBlackbaudMatch ||
                  (!newRequest.requestNote.trim() && !newRequest.providedData.trim())
                    ? "#94A3B8"
                    : "#0F766E",
                color: "white",
                fontWeight: 800,
                cursor:
                  creating ||
                  !newRequest.constituentName.trim() ||
                  !selectedBlackbaudMatch ||
                  (!newRequest.requestNote.trim() && !newRequest.providedData.trim())
                    ? "not-allowed"
                    : "pointer",
              }}
            >
              {creating ? "Sending..." : "Send to Advancement Services"}
            </button>
          </form>
        ) : null}

        <div style={{ marginBottom: "14px", display: "flex", justifyContent: "space-between", gap: "12px" }}>
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            style={{
              padding: "10px 12px",
              borderRadius: "12px",
              border: "1px solid #D1D5DB",
              backgroundColor: "white",
              fontSize: "14px",
            }}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>

        {error ? (
          <div style={{ marginBottom: "14px", padding: "12px 14px", borderRadius: "12px", backgroundColor: "#FEF2F2", color: "#991B1B", border: "1px solid #FECACA" }}>
            {error}
          </div>
        ) : null}
        {successMessage ? (
          <div style={{ marginBottom: "14px", padding: "12px 14px", borderRadius: "12px", backgroundColor: "#ECFDF5", color: "#047857", border: "1px solid #A7F3D0", fontWeight: 700 }}>
            {successMessage}
          </div>
        ) : null}

        <section style={{ display: "grid", gap: "12px" }}>
          {requests.length === 0 ? (
            <div style={{ backgroundColor: "white", border: "1px dashed #CBD5E1", borderRadius: "16px", padding: "28px", textAlign: "center", color: "#64748B" }}>
              No data requests match this view.
            </div>
          ) : null}

          {requests.map((item) => {
            const badge = statusStyle(item.status);
            const draft = drafts[item.id] || {};
            return (
              <article
                key={item.id}
                style={{
                  backgroundColor: "white",
                  border: "1px solid #E5E7EB",
                  borderRadius: "18px",
                  padding: "18px",
                  display: "grid",
                  gridTemplateColumns: isReviewer ? "minmax(0, 1fr) minmax(260px, 340px)" : "1fr",
                  gap: "16px",
                }}
              >
                <div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                    <span style={{ padding: "5px 10px", borderRadius: "999px", backgroundColor: badge.bg, color: badge.fg, border: `1px solid ${badge.border}`, fontSize: "12px", fontWeight: 800 }}>
                      {item.status}
                    </span>
                    <span style={{ padding: "5px 10px", borderRadius: "999px", backgroundColor: "#EEF2FF", color: "#3730A3", fontSize: "12px", fontWeight: 800 }}>
                      {item.request_type}
                    </span>
                    {item.source_context ? (
                      <span style={{ padding: "5px 10px", borderRadius: "999px", backgroundColor: "#F8FAFC", color: "#475569", fontSize: "12px", fontWeight: 700 }}>
                        {item.source_context.replaceAll("_", " ")}
                      </span>
                    ) : null}
                  </div>
                  <h2 style={{ margin: 0, fontSize: "20px", color: "#111827" }}>
                    {item.constituent_name || "Unknown constituent"}
                  </h2>
                  <div style={{ marginTop: "6px", color: "#64748B", fontSize: "13px" }}>
                    Requested by {item.requester_name || item.requester_email || "Unknown"} · {formatDate(item.created_at)}
                    {item.blackbaud_constituent_id ? ` · NXT ID ${item.blackbaud_constituent_id}` : ""}
                  </div>
                  <p style={{ margin: "14px 0 0", color: "#111827", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                    {item.request_note || "No note provided."}
                  </p>
                  {item.provided_data ? (
                    <pre style={{ margin: "12px 0 0", padding: "12px", borderRadius: "12px", backgroundColor: "#F8FAFC", color: "#334155", overflowX: "auto", fontSize: "12px" }}>
                      {JSON.stringify(item.provided_data, null, 2)}
                    </pre>
                  ) : null}
                  {item.reviewer_notes ? (
                    <div style={{ marginTop: "12px", padding: "10px 12px", borderRadius: "12px", backgroundColor: "#F0FDF4", color: "#166534", border: "1px solid #BBF7D0" }}>
                      <strong>Advancement Services note:</strong> {item.reviewer_notes}
                    </div>
                  ) : null}
                </div>

                {isReviewer ? (
                  <div style={{ backgroundColor: "#F8FAFC", borderRadius: "14px", padding: "14px" }}>
                    <label style={{ display: "grid", gap: "6px", fontSize: "13px", color: "#111827", fontWeight: 700 }}>
                      Status
                      <select
                        value={draft.status ?? item.status}
                        onChange={(event) => setDraft(item.id, { status: event.target.value })}
                        style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", backgroundColor: "white" }}
                      >
                        {STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>{status}</option>
                        ))}
                      </select>
                    </label>
                    <label style={{ display: "grid", gap: "6px", fontSize: "13px", color: "#111827", fontWeight: 700, marginTop: "12px" }}>
                      Reviewer note
                      <textarea
                        rows={4}
                        value={draft.reviewerNotes ?? item.reviewer_notes ?? ""}
                        onChange={(event) => setDraft(item.id, { reviewerNotes: event.target.value })}
                        placeholder="Add how this was resolved or what is still needed."
                        style={{ padding: "10px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", resize: "vertical" }}
                      />
                    </label>
                    <button
                      type="button"
                      disabled={savingId === item.id}
                      onClick={() => saveRequest(item)}
                      style={{
                        marginTop: "12px",
                        width: "100%",
                        padding: "11px 14px",
                        border: "none",
                        borderRadius: "12px",
                        backgroundColor: savingId === item.id ? "#94A3B8" : "#0F766E",
                        color: "white",
                        fontWeight: 800,
                        cursor: savingId === item.id ? "wait" : "pointer",
                      }}
                    >
                      {savingId === item.id ? "Saving..." : "Save queue update"}
                    </button>
                    {item.status !== "Completed" ? (
                      <button
                        type="button"
                        disabled={savingId === item.id}
                        onClick={() => saveRequest(item, { status: "Completed" })}
                        style={{
                          marginTop: "8px",
                          width: "100%",
                          padding: "11px 14px",
                          border: "1px solid #BBF7D0",
                          borderRadius: "12px",
                          backgroundColor: "white",
                          color: "#166534",
                          fontWeight: 800,
                          cursor: savingId === item.id ? "wait" : "pointer",
                        }}
                      >
                        Mark complete
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      </div>
    </main>
  );
}
