"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import useUser from "@/utils/useUser";
import useWorkspaceView from "@/utils/useWorkspaceView";

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatBlackbaudCurrency(amount) {
  if (amount == null) return "Unavailable";
  return "$" + Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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

function getQuickRequestLabel(entry) {
  if (entry.needs_contact_info) return "Contact info requested";
  if (entry.solicitor_requested) return "Solicitor assignment requested";
  return "No open requests";
}

export default function ProspectPoolPage() {
  const { data: sessionUser, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [profileStatus, setProfileStatus] = useState(null);
  const [entries, setEntries] = useState([]);
  const [mgos, setMgos] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [createPanelOpen, setCreatePanelOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    prospectName: "",
    assignedUserId: "",
    note: "",
    email: "",
    phone: "",
  });
  const [blackbaudMatches, setBlackbaudMatches] = useState([]);
  const [selectedBlackbaudMatch, setSelectedBlackbaudMatch] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [blackbaudSummaries, setBlackbaudSummaries] = useState({});
  const [reviewerFilters, setReviewerFilters] = useState({
    assignedUserId: "all",
    requestState: "all",
    assignedDateRange: "all",
    sortBy: "requests-first-newest",
  });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!toast) return undefined;
    const timeoutId = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  useEffect(() => {
    if (!loading && !sessionUser) {
      window.location.href = "/account/signin";
    }
  }, [loading, sessionUser]);

  const { isReviewerView } = useWorkspaceView(profile?.role);
  const isReviewer = isReviewerView;
  const stopViewingMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/workspace-user", {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to return to your MGO workspace");
      }
      return data;
    },
    onSuccess: () => {
      window.location.href = "/my-top-prospects";
    },
  });

  useEffect(() => {
    if (!sessionUser) return;

    let active = true;

    async function loadProfile() {
      setLoadingData(true);
      setError("");
      try {
        const profileResponse = await fetch("/api/users/profile");
        if (!profileResponse.ok) {
          throw new Error("Failed to load profile");
        }
        const profileData = await profileResponse.json();

        if (active) {
          setProfileStatus(profileData || null);
          setProfile(profileData.workspaceUser || profileData.user || null);
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

    loadProfile();
    return () => {
      active = false;
    };
  }, [sessionUser]);

  useEffect(() => {
    if (!profile) return;

    let active = true;

    async function loadPool() {
      setLoadingData(true);
      setError("");
      try {
        const requests = [fetch(`/api/prospect-pool?view=${isReviewer ? "reviewer" : "mgo"}`)];
        if (isReviewer) {
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
        if (isReviewer && responses[1]) {
          if (!responses[1].ok) {
            const payload = await responses[1].json().catch(() => null);
            throw new Error(payload?.error || "Failed to load MGO accounts");
          }
          mgoData = await responses[1].json();
        }

        if (active) {
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

    loadPool();
    return () => {
      active = false;
    };
  }, [isReviewer, profile]);

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

  const taskSummary = useMemo(() => {
    if (isReviewer) {
      return [
        {
          label: "Needs review",
          value: entries.filter((entry) => entry.needs_contact_info || entry.solicitor_requested)
            .length,
          detail: "Entries with active requests",
        },
        {
          label: "Ready to route",
          value: entries.filter(
            (entry) => !entry.needs_contact_info && !entry.solicitor_requested,
          ).length,
          detail: "No follow-up blocking outreach",
        },
        {
          label: "Pool total",
          value: entries.length,
          detail: "Shared names in the queue",
        },
      ];
    }

    return [
      {
        label: "Need your action",
        value: entries.filter((entry) => entry.needs_contact_info || entry.solicitor_requested)
          .length,
        detail: "Requests waiting on you",
      },
      {
        label: "Ready for outreach",
        value: entries.filter(
          (entry) => !entry.needs_contact_info && !entry.solicitor_requested,
        ).length,
        detail: "Can move into donor work now",
      },
      {
        label: "Assigned total",
        value: entries.length,
        detail: "Names currently in your pool",
      },
    ];
  }, [entries, isReviewer]);

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

      if (reviewerFilters.assignedDateRange !== "all") {
        const assignedAt = new Date(entry.created_at || 0).getTime();
        const now = Date.now();
        const day = 24 * 60 * 60 * 1000;

        if (reviewerFilters.assignedDateRange === "today" && assignedAt < now - day) {
          return false;
        }

        if (reviewerFilters.assignedDateRange === "last-7" && assignedAt < now - 7 * day) {
          return false;
        }

        if (reviewerFilters.assignedDateRange === "last-30" && assignedAt < now - 30 * day) {
          return false;
        }
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

  useEffect(() => {
    const query = createForm.prospectName.trim();
    if (!isReviewer || query.length < 2) {
      setBlackbaudMatches([]);
      setSelectedBlackbaudMatch(null);
      return;
    }

    let active = true;
    const timeoutId = setTimeout(async () => {
      try {
        const response = await fetch(
          `/api/blackbaud/constituents/search?q=${encodeURIComponent(query)}`,
        );
        if (!response.ok) {
          if (active) setBlackbaudMatches([]);
          return;
        }

        const data = await response.json();
        if (!active) return;

        const results = Array.isArray(data?.results) ? data.results.slice(0, 3) : [];
        setBlackbaudMatches(results);
        setSelectedBlackbaudMatch((current) =>
          results.find(
            (match) =>
              match.blackbaudConstituentId === current?.blackbaudConstituentId,
          ) || null,
        );
      } catch (searchError) {
        console.error("Blackbaud prospect pool search error:", searchError);
        if (active) {
          setBlackbaudMatches([]);
        }
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [createForm.prospectName, isReviewer]);

  useEffect(() => {
    const entriesToLoad = visibleEntries.filter(
      (entry) =>
        entry.linked_blackbaud_constituent_id &&
        !blackbaudSummaries[entry.linked_blackbaud_constituent_id],
    );

    if (entriesToLoad.length === 0) {
      return;
    }

    let active = true;

    async function loadBlackbaudSummaries() {
      const results = await Promise.allSettled(
        entriesToLoad.map(async (entry) => {
          const constituentId = entry.linked_blackbaud_constituent_id;
          const response = await fetch(
            `/api/blackbaud/constituents/${constituentId}/summary`,
          );
          const payload = await response.json().catch(() => null);
          if (!response.ok) {
            throw new Error(payload?.error || "Failed to load Blackbaud summary");
          }
          return [constituentId, payload];
        }),
      );

      if (!active) return;

      setBlackbaudSummaries((current) => {
        const next = { ...current };
        for (const [index, result] of results.entries()) {
          const constituentId =
            entriesToLoad[index]?.linked_blackbaud_constituent_id || null;
          if (!constituentId) continue;

          if (result.status === "fulfilled") {
            const [, payload] = result.value;
            next[constituentId] = { status: "ready", payload };
          } else if (!next[constituentId]) {
            next[constituentId] = { status: "error" };
          }
        }
        return next;
      });
    }

    loadBlackbaudSummaries();

    return () => {
      active = false;
    };
  }, [blackbaudSummaries, visibleEntries]);

  function setDraft(id, updates) {
    setDrafts((current) => ({
      ...current,
      [id]: {
        assignedUserId:
          current[id]?.assignedUserId ??
          String(entries.find((entry) => entry.id === id)?.assigned_user_id || ""),
        note:
          current[id]?.note ??
          entries.find((entry) => entry.id === id)?.note ??
          "",
        email:
          current[id]?.email ??
          entries.find((entry) => entry.id === id)?.email ??
          "",
        phone:
          current[id]?.phone ??
          entries.find((entry) => entry.id === id)?.phone ??
          "",
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

  async function saveReviewerEntry(id) {
    setSavingId(id);
    setError("");
    setActionMessage("");

    try {
      const draft = drafts[id] || {};
      const response = await fetch(`/api/prospect-pool/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedUserId: draft.assignedUserId ? Number(draft.assignedUserId) : undefined,
          note: draft.note,
          email: draft.email,
          phone: draft.phone,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to update prospect pool entry");
      }

      const updated = await response.json();
      const assignedUser =
        mgos.find((item) => String(item.id) === String(updated.assigned_user_id)) || null;

      setEntries((current) =>
        current.map((entry) =>
          entry.id === id
            ? {
                ...entry,
                ...updated,
                assigned_user_name: assignedUser?.name || entry.assigned_user_name,
                assigned_user_email: assignedUser?.email || entry.assigned_user_email,
              }
            : entry,
        ),
      );
      setDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setActionMessage(`Updated ${updated.prospect_name}.`);
      setToast({ tone: "success", message: `Updated ${updated.prospect_name}.` });
    } catch (err) {
      console.error(err);
      const message = err.message || "Could not update this pool entry.";
      setError(message);
      setToast({ tone: "error", message });
    } finally {
      setSavingId(null);
    }
  }

  async function deleteReviewerEntry(entry) {
    const confirmed = window.confirm(
      `Remove ${entry.prospect_name} from the prospect pool?`,
    );
    if (!confirmed) return;

    setSavingId(entry.id);
    setError("");
    setActionMessage("");

    try {
      const response = await fetch(`/api/prospect-pool/${entry.id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to delete prospect pool entry");
      }

      setEntries((current) => current.filter((item) => item.id !== entry.id));
      setDrafts((current) => {
        const next = { ...current };
        delete next[entry.id];
        return next;
      });
      setActionMessage(`Removed ${entry.prospect_name} from the pool.`);
      setToast({ tone: "success", message: `${entry.prospect_name} removed.` });
    } catch (err) {
      console.error(err);
      const message = err.message || "Could not delete this pool entry.";
      setError(message);
      setToast({ tone: "error", message });
    } finally {
      setSavingId(null);
    }
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
        body: JSON.stringify({
          ...createForm,
          blackbaudConstituentId:
            selectedBlackbaudMatch?.blackbaudConstituentId || null,
        }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to add prospect to pool");
      }

      const created = await response.json();
      const assignedName =
        mgos.find((item) => String(item.id) === String(created.assigned_user_id))?.name ||
        "selected MGO";

      const refreshedResponse = await fetch(
        `/api/prospect-pool?view=${isReviewer ? "reviewer" : "mgo"}`,
      );
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
      setBlackbaudMatches([]);
      setSelectedBlackbaudMatch(null);
      setActionMessage(`${created.prospect_name} added to ${assignedName}'s prospect pool.`);
      setToast({ tone: "success", message: "Prospect added to the pool." });
    } catch (err) {
      console.error(err);
      const message = err.message || "Could not create prospect pool entry.";
      setError(message);
      setToast({ tone: "error", message });
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
      setToast({ tone: "success", message: `Saved updates for ${updated.prospect_name}.` });
    } catch (err) {
      console.error(err);
      const message = err.message || "Could not save your request.";
      setError(message);
      setToast({ tone: "error", message });
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
        {toast ? (
          <div
            style={{
              position: "fixed",
              right: "24px",
              bottom: "24px",
              zIndex: 30,
              maxWidth: "320px",
              padding: "14px 16px",
              borderRadius: "14px",
              border:
                toast.tone === "success" ? "1px solid #86EFAC" : "1px solid #FCA5A5",
              backgroundColor:
                toast.tone === "success" ? "rgba(236,253,245,0.98)" : "rgba(254,242,242,0.98)",
              color: toast.tone === "success" ? "#166534" : "#991B1B",
              boxShadow: "0 14px 36px rgba(15, 23, 42, 0.14)",
              fontSize: "14px",
              fontWeight: 700,
            }}
          >
            {toast.message}
          </div>
        ) : null}

        <a
          href="/my-top-prospects"
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
          Back to My Prospects
        </a>

        {!isReviewer ? (
          <div
            style={{
              display: "inline-flex",
              gap: "6px",
              padding: "4px",
              borderRadius: "999px",
              backgroundColor: "white",
              border: "1px solid #E5E7EB",
              marginBottom: "18px",
              flexWrap: "wrap",
            }}
          >
            {[
              { href: "/my-top-prospects", label: "Top Prospects" },
              { href: "/my-top-prospects?tab=portfolio", label: "My Portfolio" },
              { href: "/prospect-pool", label: "Prospect Pool", selected: true },
            ].map((item) => (
              <a
                key={item.label}
                href={item.href}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  borderRadius: "999px",
                  padding: "10px 16px",
                  backgroundColor: item.selected ? "#111827" : "transparent",
                  color: item.selected ? "white" : "#4B5563",
                  fontSize: "14px",
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                {item.label}
              </a>
            ))}
          </div>
        ) : null}

        {profileStatus?.actingAsUser && !isReviewer ? (
          <div
            style={{
              marginBottom: "18px",
              backgroundColor: "#ECFEFF",
              border: "1px solid #A5F3FC",
              borderRadius: "14px",
              padding: "12px 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ fontSize: "14px", color: "#155E75", lineHeight: 1.5 }}>
              You are editing <strong>{profileStatus.actingAsUser.name}'s</strong> MGO workspace.
            </div>
            <button
              type="button"
              onClick={() => stopViewingMutation.mutate()}
              disabled={stopViewingMutation.isPending}
              style={{
                padding: "8px 14px",
                borderRadius: "10px",
                border: "1px solid #67E8F9",
                backgroundColor: "white",
                color: "#0F766E",
                fontWeight: "700",
                cursor: stopViewingMutation.isPending ? "not-allowed" : "pointer",
              }}
            >
              {stopViewingMutation.isPending ? "Returning..." : "Return to my MGO view"}
            </button>
          </div>
        ) : null}

        <div
          style={{
            backgroundColor: "white",
            borderRadius: "18px",
            padding: "20px 22px",
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
                ? "Route new names, review open requests, and keep the shared pool moving."
                : "Review assigned names, request what you need, and move on."}
            </p>
          </div>

          <div
            style={{
              minWidth: "220px",
              padding: "4px 0",
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
            <div>Ready now: {summary.ready}</div>
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
            <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>Saved</div>
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
            <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "4px" }}>Action needed</div>
            {error}
          </div>
        ) : null}

        {isReviewer ? (
          <form
            onSubmit={createEntry}
            style={{
              backgroundColor: "white",
              borderRadius: "18px",
              padding: "22px",
              marginBottom: "18px",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: "12px",
                marginBottom: "18px",
              }}
            >
              {taskSummary.map((item) => (
                <div
                  key={item.label}
                  style={{
                    borderRadius: "14px",
                    backgroundColor: "#F9FAFB",
                    padding: "14px 16px",
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
                    {item.label}
                  </div>
                  <div style={{ fontSize: "24px", fontWeight: 800, color: "#111827" }}>
                    {item.value}
                  </div>
                  <div style={{ marginTop: "4px", fontSize: "13px", color: "#6B7280" }}>
                    {item.detail}
                  </div>
                </div>
              ))}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
                alignItems: "flex-start",
                marginBottom: createPanelOpen ? "18px" : 0,
              }}
            >
              <div>
                <h2 style={{ margin: 0, fontSize: "22px", color: "#111827" }}>
                  Add a prospect to the pool
                </h2>
                <p style={{ margin: "8px 0 0", fontSize: "14px", color: "#6B7280" }}>
                  Keep the queue primary. Open this only when you are routing a new name.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreatePanelOpen((open) => !open)}
                style={{
                  borderRadius: "999px",
                  border: "1px solid #D1D5DB",
                  backgroundColor: createPanelOpen ? "#EDE9FE" : "white",
                  color: createPanelOpen ? "#5B21B6" : "#374151",
                  padding: "10px 14px",
                  fontSize: "13px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {createPanelOpen ? "Hide composer" : "Open composer"}
              </button>
            </div>

            {createPanelOpen ? (
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
                  onChange={(event) => {
                    setCreateForm((current) => ({
                      ...current,
                      prospectName: event.target.value,
                    }));
                    setSelectedBlackbaudMatch(null);
                  }}
                  placeholder="Sam Hill"
                  style={{
                    padding: "12px 14px",
                    borderRadius: "12px",
                    border: "1px solid #D1D5DB",
                    fontSize: "14px",
                  }}
                />
                {blackbaudMatches.length > 0 ? (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "12px",
                      borderRadius: "10px",
                      border: "1px solid #BFDBFE",
                      backgroundColor: "#EFF6FF",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "13px",
                        fontWeight: 700,
                        color: "#1D4ED8",
                        marginBottom: "8px",
                      }}
                    >
                      Blackbaud matches
                    </div>
                    <div style={{ display: "grid", gap: "8px" }}>
                      {blackbaudMatches.map((match) => {
                        const selected =
                          selectedBlackbaudMatch?.blackbaudConstituentId ===
                          match.blackbaudConstituentId;
                        return (
                          <div
                            key={match.blackbaudConstituentId || match.name}
                            style={{
                              padding: "10px 12px",
                              borderRadius: "8px",
                              border: selected
                                ? "2px solid #2563EB"
                                : "1px solid #DBEAFE",
                              backgroundColor: selected ? "#DBEAFE" : "white",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "13px",
                                fontWeight: "700",
                                color: "#111827",
                              }}
                            >
                              {match.name || "Unnamed constituent"}
                            </div>
                            {match.lookupId ? (
                              <div
                                style={{
                                  marginTop: "2px",
                                  fontSize: "12px",
                                  color: "#4B5563",
                                }}
                              >
                                Lookup ID: {match.lookupId}
                              </div>
                            ) : null}
                            {match.email ? (
                              <div
                                style={{
                                  marginTop: "2px",
                                  fontSize: "12px",
                                  color: "#4B5563",
                                }}
                              >
                                Email: {match.email}
                              </div>
                            ) : null}
                            {match.address ? (
                              <div
                                style={{
                                  marginTop: "2px",
                                  fontSize: "12px",
                                  color: "#4B5563",
                                  whiteSpace: "pre-wrap",
                                }}
                              >
                                Address: {match.address}
                              </div>
                            ) : null}
                            <div style={{ marginTop: "10px" }}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedBlackbaudMatch(match);
                                  setCreateForm((current) => ({
                                    ...current,
                                    prospectName: match.name || current.prospectName,
                                    email: match.email || current.email,
                                  }));
                                }}
                                style={{
                                  padding: "7px 12px",
                                  borderRadius: "999px",
                                  border: selected
                                    ? "1px solid #1D4ED8"
                                    : "1px solid #93C5FD",
                                  backgroundColor: selected ? "#1D4ED8" : "white",
                                  color: selected ? "white" : "#1D4ED8",
                                  fontSize: "12px",
                                  fontWeight: "700",
                                  cursor: "pointer",
                                }}
                              >
                                {selected
                                  ? "Blackbaud match selected"
                                  : "Use this Blackbaud match"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {selectedBlackbaudMatch ? (
                  <div
                    style={{
                      marginTop: "12px",
                      padding: "12px",
                      borderRadius: "10px",
                      border: "1px solid #93C5FD",
                      backgroundColor: "#EFF6FF",
                      fontSize: "13px",
                      color: "#1F2937",
                    }}
                  >
                    {selectedBlackbaudMatch.name} will be linked
                    {selectedBlackbaudMatch.lookupId ? (
                      <>
                        {" "}with Lookup ID <strong>{selectedBlackbaudMatch.lookupId}</strong>.
                      </>
                    ) : (
                      "."
                    )}
                  </div>
                ) : null}
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
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gridColumn: "1 / -1",
                  }}
                >
                  <div style={{ fontSize: "13px", color: "#6B7280" }}>
                    Open the composer only when you have a new name ready to route.
                  </div>
                  <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                    <button
                      type="button"
                      onClick={() => setCreatePanelOpen(false)}
                      style={{
                        padding: "12px 16px",
                        borderRadius: "12px",
                        border: "1px solid #D1D5DB",
                        backgroundColor: "white",
                        color: "#374151",
                        fontSize: "14px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      Close
                    </button>
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
                </div>
              </div>
            ) : (
              <div
                style={{
                  marginTop: "14px",
                  padding: "14px 16px",
                  borderRadius: "14px",
                  backgroundColor: "#F9FAFB",
                  fontSize: "14px",
                  color: "#4B5563",
                  lineHeight: 1.6,
                }}
              >
                The queue stays first. Open the composer when you need to add and assign a new
                prospect.
              </div>
            )}
          </form>
        ) : null}

        {isReviewer ? (
          <div
            style={{
              backgroundColor: "white",
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
                Filter by date assigned
                <select
                  value={reviewerFilters.assignedDateRange}
                  onChange={(event) =>
                    setReviewerFilters((current) => ({
                      ...current,
                      assignedDateRange: event.target.value,
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
                  <option value="all">All assigned dates</option>
                  <option value="today">Assigned today</option>
                  <option value="last-7">Assigned in last 7 days</option>
                  <option value="last-30">Assigned in last 30 days</option>
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
            const blackbaudSummaryState = entry.linked_blackbaud_constituent_id
              ? blackbaudSummaries[entry.linked_blackbaud_constituent_id]
              : null;
            const blackbaudConstituent =
              blackbaudSummaryState?.payload?.mapped?.constituent || null;
            const blackbaudLifetimeGiving =
              blackbaudSummaryState?.payload?.mapped?.lifetimeGiving || null;
            const blackbaudAssignments =
              blackbaudSummaryState?.payload?.mapped?.fundraiserAssignments || [];

            return (
              <article
                key={entry.id}
                style={{
                  backgroundColor: "white",
                  borderRadius: "18px",
                  padding: "20px",
                  boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
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
                      {entry.assigned_user_name || entry.assigned_user_email || "Unassigned"}
                      {" · "}Added {formatDate(entry.created_at)}
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
                        gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
                        gap: "10px",
                        fontSize: "14px",
                        color: "#111827",
                      }}
                    >
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
                      <div>
                        <div style={{ fontSize: "12px", color: "#6B7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
                          What needs to happen
                        </div>
                        <div>{getQuickRequestLabel(entry)}</div>
                      </div>
                    </div>

                    {entry.linked_blackbaud_constituent_id ? (
                      <div
                        style={{
                          marginTop: "16px",
                          padding: "14px",
                          borderRadius: "12px",
                          backgroundColor: "#EFF6FF",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            gap: "12px",
                            flexWrap: "wrap",
                            alignItems: "flex-start",
                            marginBottom: "10px",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: "13px",
                                fontWeight: 700,
                                color: "#1D4ED8",
                              }}
                            >
                              Blackbaud Summary
                            </div>
                            {blackbaudConstituent?.lookupId ? (
                              <div
                                style={{
                                  marginTop: "4px",
                                  fontSize: "12px",
                                  color: "#4B5563",
                                }}
                              >
                                Lookup ID: {blackbaudConstituent.lookupId}
                              </div>
                            ) : null}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              fontWeight: 700,
                              color: "#2563EB",
                              backgroundColor: "rgba(255,255,255,0.72)",
                              borderRadius: "999px",
                              padding: "4px 10px",
                            }}
                          >
                            Synced NXT record
                          </div>
                        </div>

                        {!blackbaudSummaryState ? (
                          <div style={{ fontSize: "13px", color: "#4B5563" }}>
                            Loading Blackbaud summary...
                          </div>
                        ) : blackbaudSummaryState.status === "error" ? (
                          <div
                            style={{
                              fontSize: "13px",
                              color: "#991B1B",
                              backgroundColor: "#FEF2F2",
                              border: "1px solid #FECACA",
                              borderRadius: "8px",
                              padding: "10px 12px",
                            }}
                          >
                            Linked Blackbaud data could not be loaded right now.
                          </div>
                        ) : (
                          <>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(auto-fit, minmax(180px, 1fr))",
                                gap: "12px",
                              }}
                            >
                              <div>
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                  Constituent
                                </div>
                                <div style={{ fontSize: "14px", color: "#111827" }}>
                                  {blackbaudConstituent?.name || "Unavailable"}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                  Email
                                </div>
                                <div style={{ fontSize: "14px", color: "#111827" }}>
                                  {blackbaudConstituent?.email || "Unavailable"}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                  Phone
                                </div>
                                <div style={{ fontSize: "14px", color: "#111827" }}>
                                  {blackbaudConstituent?.phone || "Unavailable"}
                                </div>
                              </div>
                              <div>
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                  Lifetime Giving
                                </div>
                                <div style={{ fontSize: "14px", color: "#111827" }}>
                                  {formatBlackbaudCurrency(blackbaudLifetimeGiving?.totalGiving)}
                                </div>
                              </div>
                            </div>
                            {blackbaudAssignments.length > 0 ? (
                              <div style={{ marginTop: "12px", fontSize: "13px", color: "#374151" }}>
                                Current assignment:{" "}
                                <strong>{blackbaudAssignments[0]?.type || "Unavailable"}</strong>
                                {" · "}
                                Fundraiser ID{" "}
                                <strong>
                                  {blackbaudAssignments[0]?.fundraiserId || "Unavailable"}
                                </strong>
                              </div>
                            ) : null}
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {isReviewer ? (
                    <div
                      style={{
                        minWidth: "260px",
                        flex: "0 1 320px",
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
                          Manage entry
                        </div>
                      <label
                        style={{
                          display: "grid",
                          gap: "8px",
                          fontSize: "14px",
                          color: "#111827",
                          marginBottom: "12px",
                        }}
                      >
                        Assigned MGO
                        <select
                          value={draft?.assignedUserId ?? String(entry.assigned_user_id || "")}
                          onChange={(event) =>
                            setDraft(entry.id, { assignedUserId: event.target.value })
                          }
                          style={{
                            padding: "12px 14px",
                            borderRadius: "12px",
                            border: "1px solid #D1D5DB",
                            backgroundColor: "white",
                            fontSize: "14px",
                          }}
                        >
                          <option value="">Select MGO</option>
                          {mgos.map((mgo) => (
                            <option key={mgo.id} value={mgo.id}>
                              {mgo.name}
                            </option>
                          ))}
                        </select>
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
                        Internal note
                        <textarea
                          rows={3}
                          value={draft?.note ?? entry.note ?? ""}
                          onChange={(event) => setDraft(entry.id, { note: event.target.value })}
                          style={{
                            padding: "12px 14px",
                            borderRadius: "12px",
                            border: "1px solid #D1D5DB",
                            fontSize: "14px",
                            resize: "vertical",
                            backgroundColor: "white",
                          }}
                        />
                      </label>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: "10px",
                          marginBottom: "12px",
                        }}
                      >
                        <label style={{ display: "grid", gap: "8px", fontSize: "14px", color: "#111827" }}>
                          Email
                          <input
                            type="email"
                            value={draft?.email ?? entry.email ?? ""}
                            onChange={(event) => setDraft(entry.id, { email: event.target.value })}
                            style={{
                              padding: "12px 14px",
                              borderRadius: "12px",
                              border: "1px solid #D1D5DB",
                              fontSize: "14px",
                              backgroundColor: "white",
                            }}
                          />
                        </label>
                        <label style={{ display: "grid", gap: "8px", fontSize: "14px", color: "#111827" }}>
                          Phone
                          <input
                            type="text"
                            value={draft?.phone ?? entry.phone ?? ""}
                            onChange={(event) => setDraft(entry.id, { phone: event.target.value })}
                            style={{
                              padding: "12px 14px",
                              borderRadius: "12px",
                              border: "1px solid #D1D5DB",
                              fontSize: "14px",
                              backgroundColor: "white",
                            }}
                          />
                        </label>
                      </div>
                      <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.6, marginBottom: "14px" }}>
                        MGO requests: contact info {entry.needs_contact_info ? "needed" : "not needed"}
                        {" · "}
                        solicitor {entry.solicitor_requested ? "requested" : "not requested"}
                      </div>
                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          disabled={savingId === entry.id}
                          onClick={() => saveReviewerEntry(entry.id)}
                          style={{
                            flex: "1 1 150px",
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
                          {savingId === entry.id ? "Saving..." : "Save changes"}
                        </button>
                        <button
                          type="button"
                          disabled={savingId === entry.id}
                          onClick={() => deleteReviewerEntry(entry)}
                          style={{
                            flex: "1 1 130px",
                            padding: "12px 16px",
                            borderRadius: "12px",
                            border: "1px solid #FECACA",
                            backgroundColor: "#FEF2F2",
                            color: "#B91C1C",
                            fontSize: "14px",
                            fontWeight: 700,
                            cursor: savingId === entry.id ? "not-allowed" : "pointer",
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{
                        minWidth: "280px",
                        flex: "0 1 340px",
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
                        Request help
                      </div>

                      <div
                        style={{
                          fontSize: "13px",
                          color: "#6B7280",
                          lineHeight: 1.6,
                          marginBottom: "14px",
                        }}
                      >
                        Ask only for what is blocking outreach right now.
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
                        Note for Advancement Services
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
                        Request solicitor assignment
                      </label>

                      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          disabled={savingId === entry.id}
                          onClick={() => saveMgoEntry(entry.id)}
                          style={{
                            flex: "1 1 180px",
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
                        <a
                          href={`/action-opportunity-update?donor=${encodeURIComponent(
                            entry.prospect_name || "",
                          )}`}
                          style={{
                            flex: "1 1 180px",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "12px 16px",
                            borderRadius: "12px",
                            border: "1px solid #D1D5DB",
                            backgroundColor: "white",
                            color: "#374151",
                            fontSize: "14px",
                            fontWeight: 700,
                            textDecoration: "none",
                          }}
                        >
                          Log action
                        </a>
                      </div>
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
