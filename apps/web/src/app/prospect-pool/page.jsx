"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import useUser from "@/utils/useUser";

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function getRequestState(entry) {
  if (entry.needs_contact_info) return "Needs contact info";
  if (entry.solicitor_requested) return "Solicitor requested";
  return "Ready for outreach";
}

function getStateColors(label) {
  const map = {
    "Needs contact info": { bg: "#FEF3C7", fg: "#92400E" },
    "Solicitor requested": { bg: "#DBEAFE", fg: "#1D4ED8" },
    "Ready for outreach": { bg: "#DCFCE7", fg: "#166534" },
  };
  return map[label] || { bg: "#E5E7EB", fg: "#374151" };
}

export default function ProspectPoolPage() {
  const { data: sessionUser, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [entries, setEntries] = useState([]);
  const [mgos, setMgos] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    prospectName: "",
    assignedUserId: "",
    note: "",
    email: "",
    phone: "",
  });
  const [drafts, setDrafts] = useState({});
  const [reviewerFilters, setReviewerFilters] = useState({
    assignedUserId: "all",
    requestState: "all",
    sortBy: "requests-first-newest",
  });

  useEffect(() => {
    if (!loading && !sessionUser) {
      window.location.href = "/account/signin";
    }
  }, [loading, sessionUser]);

  useEffect(() => {
    if (!sessionUser) return;

    let active = true;

    async function load() {
      setLoadingData(true);
      setError("");
      try {
        const profileResponse = await fetch("/api/users/profile");
        if (!profileResponse.ok) {
          throw new Error("Failed to load profile");
        }
        const profileData = await profileResponse.json();
        const user = profileData.user;

        const requests = [fetch("/api/prospect-pool")];
        if (user?.role === "reviewer") {
          requests.push(fetch("/api/users/mgos"));
        }

        const responses = await Promise.all(requests);
        const poolResponse = responses[0];
        if (!poolResponse.ok) {
          const payload = await poolResponse.json().catch(() => null);
          throw new Error(payload?.error || "Failed to load prospect pool");
        }
        const poolData = await poolResponse.json();

        let mgoData = [];
        if (user?.role === "reviewer" && responses[1]) {
          if (!responses[1].ok) {
            const payload = await responses[1].json().catch(() => null);
            throw new Error(payload?.error || "Failed to load MGO accounts");
          }
          mgoData = await responses[1].json();
        }

        if (active) {
          setProfile(user);
          setEntries(Array.isArray(poolData) ? poolData : []);
          setMgos(Array.isArray(mgoData) ? mgoData : []);
          if (Array.isArray(mgoData) && mgoData.length > 0) {
            setCreateForm((current) =>
              current.assignedUserId
                ? current
                : { ...current, assignedUserId: String(mgoData[0].id) },
            );
          }
        }
      } catch (err) {
        if (active) {
          console.error(err);
          setError(err.message || "Could not load prospect pool.");
        }
      } finally {
        if (active) {
          setLoadingData(false);
        }
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [sessionUser]);

  const isReviewer = profile?.role === "reviewer";

  const summary = useMemo(() => {
    return entries.reduce(
      (acc, entry) => {
        acc.total += 1;
        if (entry.needs_contact_info) acc.needsContactInfo += 1;
        if (entry.solicitor_requested) acc.solicitorRequested += 1;
        if (!entry.needs_contact_info && !entry.solicitor_requested) acc.ready += 1;
        return acc;
      },
      {
        total: 0,
        needsContactInfo: 0,
        solicitorRequested: 0,
        ready: 0,
      },
    );
  }, [entries]);

  const visibleEntries = useMemo(() => {
    if (!isReviewer) {
      return entries;
    }

    const filtered = entries.filter((entry) => {
      if (
        reviewerFilters.assignedUserId !== "all" &&
        String(entry.assigned_user_id || "") !== reviewerFilters.assignedUserId
      ) {
        return false;
      }

      if (reviewerFilters.requestState === "contact-info" && !entry.needs_contact_info) {
        return false;
      }

      if (reviewerFilters.requestState === "solicitor" && !entry.solicitor_requested) {
        return false;
      }

      if (
        reviewerFilters.requestState === "no-requests" &&
        (entry.needs_contact_info || entry.solicitor_requested)
      ) {
        return false;
      }

      return true;
    });

    const sorted = [...filtered].sort((a, b) => {
      const aHasRequest = a.needs_contact_info || a.solicitor_requested ? 1 : 0;
      const bHasRequest = b.needs_contact_info || b.solicitor_requested ? 1 : 0;
      const aTime = new Date(a.created_at || 0).getTime();
      const bTime = new Date(b.created_at || 0).getTime();

      switch (reviewerFilters.sortBy) {
        case "newest":
          return bTime - aTime;
        case "oldest":
          return aTime - bTime;
        case "requests-first-oldest":
          if (aHasRequest !== bHasRequest) return bHasRequest - aHasRequest;
          return aTime - bTime;
        case "mgo":
          return (a.assigned_user_name || a.assigned_user_email || "").localeCompare(
            b.assigned_user_name || b.assigned_user_email || "",
          );
        case "requests-first-newest":
        default:
          if (aHasRequest !== bHasRequest) return bHasRequest - aHasRequest;
          return bTime - aTime;
      }
    });

    return sorted;
  }, [entries, isReviewer, reviewerFilters]);

  function setDraft(id, updates) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        needsContactInfo:
          current[id]?.needsContactInfo ??
          entries.find((entry) => entry.id === id)?.needs_contact_info ??
          false,
        contactInfoRequestNote:
          current[id]?.contactInfoRequestNote ??
          entries.find((entry) => entry.id === id)?.contact_info_request_note ??
          "",
        solicitorRequested:
          current[id]?.solicitorRequested ??
          entries.find((entry) => entry.id === id)?.solicitor_requested ??
          false,
        ...updates,
      },
    }));
  }

  async function createEntry(event) {
    event.preventDefault();
    setCreating(true);
    setError("");
    setActionMessage("");

    try {
      const response = await fetch("/api/prospect-pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(createForm),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to add prospect to pool");
      }

      const created = await response.json();
      const assignedName =
        mgos.find((item) => String(item.id) === String(created.assigned_user_id))?.name ||
        "selected MGO";

      const refreshedResponse = await fetch("/api/prospect-pool");
      if (refreshedResponse.ok) {
        const refreshed = await refreshedResponse.json();
        setEntries(Array.isArray(refreshed) ? refreshed : []);
      } else {
        setEntries((current) => [created, ...current]);
      }
      setCreateForm((current) => ({
        prospectName: "",
        assignedUserId: current.assignedUserId,
        note: "",
        email: "",
        phone: "",
      }));
      setActionMessage(`${created.prospect_name} added to ${assignedName}'s prospect pool.`);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not create prospect pool entry.");
    } finally {
      setCreating(false);
    }
  }

  async function saveMgoEntry(id) {
    setSavingId(id);
    setError("");
    setActionMessage("");

    try {
      const draft = drafts[id] || {};
      const response = await fetch(`/api/prospect-pool/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          needsContactInfo: draft.needsContactInfo,
          contactInfoRequestNote: draft.contactInfoRequestNote,
          solicitorRequested: draft.solicitorRequested,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to update prospect pool entry");
      }

      const updated = await response.json();
      setEntries((current) =>
        current.map((entry) => (entry.id === id ? { ...entry, ...updated } : entry)),
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setActionMessage(`Saved updates for ${updated.prospect_name}.`);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not save your request.");
    } finally {
      setSavingId(null);
    }
  }

  if (loading || loadingData || !profile) {
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
      <main style={{ maxWidth: "1080px", margin: "0 auto", padding: "24px 18px 48px" }}>
        <a
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            color: "#6A5BFF",
            textDecoration: "none",
            fontSize: "14px",
            fontWeight: 600,
            marginBottom: "18px",
          }}
        >
          <ArrowLeft size={16} />
          Back to dashboard
        </a>

        <div
          style={{
            backgroundColor: "white",
            borderRadius: "18px",
            border: "1px solid #E5E7EB",
            padding: "24px",
            marginBottom: "18px",
            display: "flex",
            justifyContent: "space-between",
            gap: "18px",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: "28px", color: "#111827", fontWeight: 800 }}>
              {isReviewer ? "Prospect Pool" : "My Prospect Pool"}
            </h1>
            <p
              style={{
                margin: "10px 0 0",
                color: "#6B7280",
                fontSize: "14px",
                lineHeight: 1.6,
                maxWidth: "640px",
              }}
            >
              {isReviewer
                ? "Add new prospects, assign them to MGOs, and monitor contact-info or solicitor requests in one shared queue."
                : "Review new names assigned to you, request missing contact information, and flag when you want to be added as solicitor."}
            </p>
          </div>

          <div
            style={{
              minWidth: "240px",
              backgroundColor: "#F9FAFB",
              border: "1px solid #E5E7EB",
              borderRadius: "14px",
              padding: "14px 16px",
              fontSize: "14px",
              color: "#111827",
              lineHeight: 1.8,
            }}
          >
            <div
              style={{
                fontSize: "12px",
                fontWeight: 700,
                color: "#6B7280",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
                marginBottom: "8px",
              }}
            >
              Pool snapshot
            </div>
            <div>Total entries: {summary.total}</div>
            <div>Needs contact info: {summary.needsContactInfo}</div>
            <div>Solicitor requests: {summary.solicitorRequested}</div>
            <div>Ready for outreach: {summary.ready}</div>
          </div>
        </div>

        {actionMessage ? (
          <div
            style={{
              marginBottom: "14px",
              padding: "12px 14px",
              borderRadius: "12px",
              backgroundColor: "#ECFDF5",
              border: "1px solid #A7F3D0",
              color: "#065F46",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {actionMessage}
          </div>
        ) : null}

        {error ? (
          <div
            style={{
              marginBottom: "14px",
              padding: "12px 14px",
              borderRadius: "12px",
              backgroundColor: "#FEF2F2",
              border: "1px solid #FECACA",
              color: "#991B1B",
              fontSize: "14px",
              fontWeight: 600,
            }}
          >
            {error}
          </div>
        ) : null}

        {isReviewer ? (
          <form
            onSubmit={createEntry}
            style={{
              backgroundColor: "white",
              border: "1px solid #E5E7EB",
              borderRadius: "18px",
              padding: "22px",
              marginBottom: "18px",
            }}
          >
            <div style={{ marginBottom: "18px" }}>
              <h2 style={{ margin: 0, fontSize: "22px", color: "#111827" }}>
                Add a prospect to the pool
              </h2>
              <p style={{ margin: "8px 0 0", fontSize: "14px", color: "#6B7280" }}>
                Assign the prospect to an MGO so it appears immediately in their pool.
              </p>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                gap: "14px",
              }}
            >
              <label style={{ display: "grid", gap: "8px", fontSize: "14px", color: "#111827" }}>
                Prospect name
                <input
                  type="text"
                  value={createForm.prospectName}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, prospectName: event.target.value }))
                  }
                  placeholder="Sam Hill"
                  style={{
                    padding: "12px 14px",
                    borderRadius: "12px",
                    border: "1px solid #D1D5DB",
                    fontSize: "14px",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: "8px", fontSize: "14px", color: "#111827" }}>
                Assign to MGO
                <select
                  value={createForm.assignedUserId}
                  onChange={(event) =>
                    setCreateForm((current) => ({
                      ...current,
                      assignedUserId: event.target.value,
                    }))
                  }
                  style={{
                    padding: "12px 14px",
                    borderRadius: "12px",
                    border: "1px solid #D1D5DB",
                    fontSize: "14px",
                    backgroundColor: "white",
                  }}
                >
                  {mgos.map((mgo) => (
                    <option key={mgo.id} value={mgo.id}>
                      {mgo.name} ({mgo.email})
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: "8px", fontSize: "14px", color: "#111827" }}>
                Email
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, email: event.target.value }))
                  }
                  placeholder="sam@example.com"
                  style={{
                    padding: "12px 14px",
                    borderRadius: "12px",
                    border: "1px solid #D1D5DB",
                    fontSize: "14px",
                  }}
                />
              </label>

              <label style={{ display: "grid", gap: "8px", fontSize: "14px", color: "#111827" }}>
                Phone
                <input
                  type="text"
                  value={createForm.phone}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, phone: event.target.value }))
                  }
                  placeholder="(555) 555-5555"
                  style={{
                    padding: "12px 14px",
                    borderRadius: "12px",
                    border: "1px solid #D1D5DB",
                    fontSize: "14px",
                  }}
                />
              </label>

              <label
                style={{
                  display: "grid",
                  gap: "8px",
                  fontSize: "14px",
                  color: "#111827",
                  gridColumn: "1 / -1",
                }}
              >
                Note
                <textarea
                  value={createForm.note}
                  onChange={(event) =>
                    setCreateForm((current) => ({ ...current, note: event.target.value }))
                  }
                  placeholder="Why this prospect belongs in the pool, recent context, or screening guidance."
                  rows={4}
                  style={{
                    padding: "12px 14px",
                    borderRadius: "12px",
                    border: "1px solid #D1D5DB",
                    fontSize: "14px",
                    resize: "vertical",
                  }}
                />
              </label>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginTop: "18px",
              }}
            >
              <button
                type="submit"
                disabled={creating}
                style={{
                  padding: "12px 18px",
                  borderRadius: "12px",
                  border: "none",
                  backgroundColor: creating ? "#A5B4FC" : "#6A5BFF",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: creating ? "wait" : "pointer",
                }}
              >
                {creating ? "Adding..." : "Add to prospect pool"}
              </button>
            </div>
          </form>
        ) : null}

        {isReviewer ? (
          <div
            style={{
              backgroundColor: "white",
              border: "1px solid #E5E7EB",
              borderRadius: "18px",
              padding: "18px",
              marginBottom: "16px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "14px",
              }}
            >
              <label style={{ display: "grid", gap: "8px", fontSize: "14px", color: "#111827" }}>
                Filter by MGO
                <select
                  value={reviewerFilters.assignedUserId}
                  onChange={(event) =>
                    setReviewerFilters((current) => ({
                      ...current,
                      assignedUserId: event.target.value,
                    }))
                  }
                  style={{
                    padding: "12px 14px",
                    borderRadius: "12px",
                    border: "1px solid #D1D5DB",
                    backgroundColor: "white",
                    fontSize: "14px",
                  }}
                >
                  <option value="all">All MGOs</option>
                  {mgos.map((mgo) => (
                    <option key={mgo.id} value={mgo.id}>
                      {mgo.name}
                    </option>
                  ))}
                </select>
              </label>

              <label style={{ display: "grid", gap: "8px", fontSize: "14px", color: "#111827" }}>
                Filter by request
                <select
                  value={reviewerFilters.requestState}
                  onChange={(event) =>
                    setReviewerFilters((current) => ({
                      ...current,
                      requestState: event.target.value,
                    }))
                  }
                  style={{
                    padding: "12px 14px",
                    borderRadius: "12px",
                    border: "1px solid #D1D5DB",
                    backgroundColor: "white",
                    fontSize: "14px",
                  }}
                >
                  <option value="all">All entries</option>
                  <option value="contact-info">Needs contact info</option>
                  <option value="solicitor">Solicitor requested</option>
                  <option value="no-requests">No requests</option>
                </select>
              </label>

              <label style={{ display: "grid", gap: "8px", fontSize: "14px", color: "#111827" }}>
                Sort queue
                <select
                  value={reviewerFilters.sortBy}
                  onChange={(event) =>
                    setReviewerFilters((current) => ({
                      ...current,
                      sortBy: event.target.value,
                    }))
                  }
                  style={{
                    padding: "12px 14px",
                    borderRadius: "12px",
                    border: "1px solid #D1D5DB",
                    backgroundColor: "white",
                    fontSize: "14px",
                  }}
                >
                  <option value="requests-first-newest">Requests first · Newest assigned</option>
                  <option value="requests-first-oldest">Requests first · Oldest assigned</option>
                  <option value="newest">Newest assigned</option>
                  <option value="oldest">Oldest assigned</option>
                  <option value="mgo">MGO name</option>
                </select>
              </label>
            </div>
          </div>
        ) : null}

        <div style={{ display: "grid", gap: "12px" }}>
          {visibleEntries.length === 0 ? (
            <div
              style={{
                backgroundColor: "white",
                border: "1px dashed #D1D5DB",
                borderRadius: "18px",
                padding: "28px",
                color: "#6B7280",
                textAlign: "center",
                fontSize: "14px",
              }}
            >
              {isReviewer
                ? "No prospect pool entries yet. Add the first one above."
                : "Nothing is in your prospect pool yet."}
            </div>
          ) : null}

          {visibleEntries.map((entry) => {
            const stateLabel = getRequestState(entry);
            const stateColors = getStateColors(stateLabel);
            const draft = drafts[entry.id];
            const needsContactInfo = draft?.needsContactInfo ?? entry.needs_contact_info;
            const solicitorRequested = draft?.solicitorRequested ?? entry.solicitor_requested;
            const contactInfoRequestNote =
              draft?.contactInfoRequestNote ?? entry.contact_info_request_note ?? "";

            return (
              <article
                key={entry.id}
                style={{
                  backgroundColor: "white",
                  border: "1px solid #E5E7EB",
                  borderRadius: "18px",
                  padding: "20px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "16px",
                    flexWrap: "wrap",
                    alignItems: "flex-start",
                  }}
                >
                  <div style={{ minWidth: "260px", flex: "1 1 340px" }}>
                    <div
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        padding: "6px 10px",
                        borderRadius: "999px",
                        backgroundColor: stateColors.bg,
                        color: stateColors.fg,
                        fontSize: "12px",
                        fontWeight: 700,
                        marginBottom: "12px",
                      }}
                    >
                      {stateLabel}
                    </div>
                    <h2 style={{ margin: 0, fontSize: "22px", color: "#111827" }}>
                      {entry.prospect_name}
                    </h2>
                    <div style={{ marginTop: "8px", fontSize: "14px", color: "#6B7280" }}>
                      Added {formatDate(entry.created_at)}
                      {entry.created_by_name ? ` by ${entry.created_by_name}` : ""}
                    </div>
                    {entry.note ? (
                      <p
                        style={{
                          margin: "14px 0 0",
                          fontSize: "14px",
                          color: "#374151",
                          lineHeight: 1.7,
                        }}
                      >
                        {entry.note}
                      </p>
                    ) : null}
                    <div
                      style={{
                        marginTop: "16px",
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                        gap: "10px",
                        fontSize: "14px",
                        color: "#111827",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "12px", color: "#6B7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
                          Assigned MGO
                        </div>
                        <div>{entry.assigned_user_name || entry.assigned_user_email || "Unassigned"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "12px", color: "#6B7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
                          Email
                        </div>
                        <div>{entry.email || "Not provided"}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: "12px", color: "#6B7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
                          Phone
                        </div>
                        <div>{entry.phone || "Not provided"}</div>
                      </div>
                    </div>
                  </div>

                  {isReviewer ? (
                    <div
                      style={{
                        minWidth: "260px",
                        flex: "0 1 320px",
                        border: "1px solid #E5E7EB",
                        borderRadius: "14px",
                        backgroundColor: "#F9FAFB",
                        padding: "16px",
                        fontSize: "14px",
                        color: "#111827",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#6B7280",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          marginBottom: "10px",
                        }}
                      >
                        MGO requests
                      </div>
                      <div>Needs contact info: {entry.needs_contact_info ? "Yes" : "No"}</div>
                      <div style={{ marginTop: "6px" }}>
                        Add me as solicitor: {entry.solicitor_requested ? "Yes" : "No"}
                      </div>
                      <div style={{ marginTop: "10px", color: "#6B7280", lineHeight: 1.6 }}>
                        {entry.contact_info_request_note || "No contact info request note yet."}
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        minWidth: "280px",
                        flex: "0 1 340px",
                        border: "1px solid #E5E7EB",
                        borderRadius: "14px",
                        backgroundColor: "#F9FAFB",
                        padding: "16px",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "12px",
                          color: "#6B7280",
                          fontWeight: 700,
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          marginBottom: "10px",
                        }}
                      >
                        Ask Advancement Services
                      </div>

                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          fontSize: "14px",
                          color: "#111827",
                          marginBottom: "12px",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(needsContactInfo)}
                          onChange={(event) =>
                            setDraft(entry.id, { needsContactInfo: event.target.checked })
                          }
                        />
                        Request new or updated contact info
                      </label>

                      <label
                        style={{
                          display: "grid",
                          gap: "8px",
                          fontSize: "14px",
                          color: "#111827",
                          marginBottom: "12px",
                        }}
                      >
                        Contact info request note
                        <textarea
                          value={contactInfoRequestNote}
                          onChange={(event) =>
                            setDraft(entry.id, {
                              contactInfoRequestNote: event.target.value,
                            })
                          }
                          rows={3}
                          placeholder="Example: Need a current assistant line and preferred email before outreach."
                          style={{
                            padding: "12px 14px",
                            borderRadius: "12px",
                            border: "1px solid #D1D5DB",
                            fontSize: "14px",
                            resize: "vertical",
                          }}
                        />
                      </label>

                      <label
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          fontSize: "14px",
                          color: "#111827",
                          marginBottom: "14px",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(solicitorRequested)}
                          onChange={(event) =>
                            setDraft(entry.id, { solicitorRequested: event.target.checked })
                          }
                        />
                        Add me as solicitor
                      </label>

                      <button
                        type="button"
                        disabled={savingId === entry.id}
                        onClick={() => saveMgoEntry(entry.id)}
                        style={{
                          width: "100%",
                          padding: "12px 16px",
                          borderRadius: "12px",
                          border: "none",
                          backgroundColor: savingId === entry.id ? "#A5B4FC" : "#6A5BFF",
                          color: "white",
                          fontSize: "14px",
                          fontWeight: 700,
                          cursor: savingId === entry.id ? "wait" : "pointer",
                        }}
                      >
                        {savingId === entry.id ? "Saving..." : "Save requests"}
                      </button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </main>
    </div>
  );
}
