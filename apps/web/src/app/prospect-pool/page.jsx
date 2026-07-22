"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import useUser from "@/utils/useUser";
import useWorkspaceView from "@/utils/useWorkspaceView";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";

const DISPLAY_LOCALE = "en-US";
const DISPLAY_TIME_ZONE = "America/New_York";
const MGOGPT_OUTCOME_OPTIONS = [
  "Not interested at this time",
  "Not interested/Does not want to be solicited",
  "Qualified - Annual Fund",
  "Qualified - Major Gifts",
  "Unable to Connect",
];
const SOLICITOR_ASSIGNMENT_SYNC_SUCCESS = "success";
const NXT_SUMMARY_FETCH_TIMEOUT_MS = 45000;
const NXT_SUMMARY_STALE_TIMEOUT_MS = NXT_SUMMARY_FETCH_TIMEOUT_MS + 15000;
const NXT_SUMMARY_AUTO_ATTEMPTS = 3;
const NXT_SUMMARY_RETRY_DELAY_MS = 1500;
const CLEARED_MGO_REQUEST_DRAFT = {
  needsContactInfo: false,
  contactInfoRequestNote: "",
  solicitorRequested: false,
  mgogptDispositionValue: "",
  mgogptDispositionComment: "",
};
const nxtProfileLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #93C5FD",
  borderRadius: "999px",
  backgroundColor: "white",
  color: "#1D4ED8",
  fontSize: "12px",
  fontWeight: 700,
  padding: "6px 10px",
  textDecoration: "none",
};
const postAssignmentActionLinkStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "1px solid #A7F3D0",
  borderRadius: "999px",
  backgroundColor: "#ECFDF5",
  color: "#047857",
  fontSize: "12px",
  fontWeight: 700,
  padding: "6px 10px",
  textDecoration: "none",
};

function formatDate(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(DISPLAY_LOCALE, {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatBlackbaudCurrency(amount) {
  if (amount == null) return "Unavailable";
  return "$" + Number(amount).toLocaleString(DISPLAY_LOCALE, {
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

function formatEducationLine(education) {
  const degreeText = Array.isArray(education?.degrees) ? education.degrees.join(", ") : "";
  const majorText = Array.isArray(education?.majors) ? education.majors.join(", ") : "";
  const classOf = education?.classOf ? String(education.classOf) : "";

  const parts = [degreeText, majorText ? `Major: ${majorText}` : "", classOf ? `Class of ${classOf}` : ""]
    .filter(Boolean);

  return parts.join(" · ");
}

function formatShortDate(value) {
  if (!value) return "No action logged";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(DISPLAY_LOCALE, {
    timeZone: DISPLAY_TIME_ZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getActionTypeFromNotes(value) {
  const firstLine = String(value || "")
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);

  if (!firstLine || !firstLine.includes(":")) return null;
  const [candidate] = firstLine.split(":");
  const normalized = candidate.trim();
  return normalized || null;
}

function getPostAssignmentActionType(entry) {
  return (
    getDisplayText(entry?.post_assignment_action_type, "") ||
    getDisplayText(entry?.post_assignment_action_category, "") ||
    getActionTypeFromNotes(entry?.post_assignment_action_notes) ||
    "Logged action"
  );
}

function buildPostAssignmentActionUrl(entry) {
  if (!entry?.matched_prospect_id || !entry?.post_assignment_action_id) {
    return "";
  }

  const params = new URLSearchParams();
  params.set("prospectId", String(entry.matched_prospect_id));
  params.set("actionId", String(entry.post_assignment_action_id));
  return `/my-top-prospects?${params.toString()}`;
}

function getDisplayText(value, fallback = "Unavailable") {
  if (value == null) return fallback;
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed || fallback;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) {
    const parts = value
      .map((item) => getDisplayText(item, ""))
      .filter(Boolean);
    return parts.length ? parts.join(", ") : fallback;
  }
  return fallback;
}

function getEntryBlackbaudConstituentId(entry) {
  return String(
    entry?.linked_blackbaud_constituent_id ||
      entry?.blackbaud_constituent_id ||
      "",
  ).trim();
}

function buildBlackbaudSummaryUrl(entry) {
  const constituentId = getEntryBlackbaudConstituentId(entry);
  if (!constituentId) return "";

  const params = new URLSearchParams();
  params.set("lookupId", constituentId);
  if (entry?.prospect_name) {
    params.set("name", entry.prospect_name);
  }

  return `/api/blackbaud/constituents/${encodeURIComponent(
    constituentId,
  )}/summary?${params.toString()}`;
}

function getBlackbaudSummaryErrorMessage(error) {
  if (error?.name === "AbortError") {
    return "Blackbaud summary timed out. This usually means NXT is slow or the connection needs to be refreshed. Try again in a moment.";
  }

  return error instanceof Error
    ? error.message
    : "Linked Blackbaud data could not be loaded right now.";
}

async function fetchBlackbaudSummaryPayload(entry, { forceRefresh = false } = {}) {
  let url = buildBlackbaudSummaryUrl(entry);
  if (!url) {
    throw new Error("This pool entry is not linked to a Blackbaud constituent ID.");
  }

  if (forceRefresh) {
    url += `${url.includes("?") ? "&" : "?"}refresh=${Date.now()}`;
  }

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), NXT_SUMMARY_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: forceRefresh ? "no-store" : "default",
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      const detail = payload?.error || payload?.message || `HTTP ${response.status}`;
      throw new Error(`Blackbaud summary request failed (${response.status}): ${detail}`);
    }

    return payload;
  } catch (error) {
    throw new Error(getBlackbaudSummaryErrorMessage(error));
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function isSolicitorAssignmentSynced(entry) {
  return (
    String(entry?.solicitor_assignment_sync_state || "").trim().toLowerCase() ===
    SOLICITOR_ASSIGNMENT_SYNC_SUCCESS
  );
}

function getNxtSyncPresentation(syncState) {
  const normalized = String(syncState || "manual_required").toLowerCase();
  const map = {
    success: {
      label: "Assigned in app, MGOGPT custom field updated successfully",
      shortLabel: "MGOGPT updated",
      bg: "#DCFCE7",
      fg: "#166534",
    },
    failed: {
      label: "Assigned in app, MGOGPT custom field update failed",
      shortLabel: "MGOGPT failed",
      bg: "#FEE2E2",
      fg: "#991B1B",
    },
    pending: {
      label: "Assigned in app, MGOGPT custom field update pending",
      shortLabel: "MGOGPT pending",
      bg: "#DBEAFE",
      fg: "#1D4ED8",
    },
    manual_required: {
      label: "Manual MGOGPT update required",
      shortLabel: "Manual MGOGPT update",
      bg: "#FEF3C7",
      fg: "#92400E",
      detail:
        "This assignment was saved in the app. The MGOGPT constituent custom field must be updated manually in Raiser's Edge NXT or through export/import.",
    },
  };
  return map[normalized] || map.manual_required;
}

function getSolicitorAssignmentPresentation(syncState) {
  const normalized = String(syncState || "").trim().toLowerCase();
  const map = {
    success: {
      tone: "success",
      label: "Added you as Lead Solicitor in Raiser's Edge NXT.",
    },
    failed: {
      tone: "error",
      label: "Saved in the app, but could not add you as Lead Solicitor in Raiser's Edge NXT.",
    },
    manual_required: {
      tone: "error",
      label:
        "Saved in the app, but Raiser's Edge NXT solicitor assignment still requires manual follow-up.",
    },
  };
  return map[normalized] || null;
}

function formatSolicitorAssignmentDebug(debug) {
  if (!debug || typeof debug !== "object") return "";
  const parts = [];
  if (debug.operation) {
    parts.push(`op=${debug.operation}`);
  }
  if (debug.fundraiserId) {
    parts.push(`fundraiser_id=${debug.fundraiserId}`);
  }
  if (debug.assignmentValue) {
    parts.push(`value=${debug.assignmentValue}`);
  }
  if (debug.resolutionPath) {
    parts.push(`resolution=${debug.resolutionPath}`);
  }
  if (debug.endpointPath) {
    parts.push(`path=${debug.endpointPath}`);
  }
  if (debug.detail) {
    parts.push(`detail=${debug.detail}`);
  }
  return parts.length ? ` [${parts.join(" | ")}]` : "";
}

function getMgogptDispositionPresentation(syncState) {
  const normalized = String(syncState || "").trim().toLowerCase();
  const map = {
    success: {
      tone: "success",
      label: "Added the selected MGOGPT outcome in Raiser's Edge NXT.",
    },
    failed: {
      tone: "error",
      label: "Saved in the app, but could not add the selected MGOGPT outcome in Raiser's Edge NXT.",
    },
    manual_required: {
      tone: "error",
      label: "Saved in the app, but the selected MGOGPT outcome still requires manual NXT follow-up.",
    },
  };
  return map[normalized] || null;
}

export default function ProspectPoolPage() {
  const { data: sessionUser, loading } = useUser();
  const [hasMounted, setHasMounted] = useState(false);
  const [mountedNow, setMountedNow] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileStatus, setProfileStatus] = useState(null);
  const [entries, setEntries] = useState([]);
  const [mgos, setMgos] = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [retryingSyncId, setRetryingSyncId] = useState(null);
  const [clearedMgoRequestIds, setClearedMgoRequestIds] = useState(() => new Set());
  const [exportingQueue, setExportingQueue] = useState(false);
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
  const blackbaudSummariesRef = useRef({});
  const summaryQueueRunningRef = useRef(false);
  const mountedRef = useRef(false);
  const [summaryQueueTick, setSummaryQueueTick] = useState(0);
  const [expandedNarrativeSummaries, setExpandedNarrativeSummaries] = useState({});
  const [reviewerFilters, setReviewerFilters] = useState({
    assignedUserId: "all",
    requestState: "all",
    assignedDateRange: "all",
    sortBy: "requests-first-newest",
  });
  const [toast, setToast] = useState(null);

  useEffect(() => {
    mountedRef.current = true;
    setHasMounted(true);
    setMountedNow(Date.now());
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    blackbaudSummariesRef.current = blackbaudSummaries;
  }, [blackbaudSummaries]);

  useEffect(() => {
    if (!toast) return undefined;
    const timeoutId = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

  const toggleNarrativeSummary = (entryId) => {
    setExpandedNarrativeSummaries((current) => ({
      ...current,
      [entryId]: !current[entryId],
    }));
  };

  function updateBlackbaudSummaryState(constituentId, summaryState) {
    if (!constituentId) return;
    setBlackbaudSummaries((current) => {
      const next = {
        ...current,
        [constituentId]: summaryState,
      };
      blackbaudSummariesRef.current = next;
      return next;
    });
  }

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
    if (!hasMounted) {
      return {
        total: 0,
        needsContactInfo: 0,
        solicitorRequested: 0,
        ready: 0,
      };
    }
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
    if (!hasMounted) {
      return [];
    }
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
    if (!hasMounted) {
      return [];
    }
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
        const now = mountedNow || Date.now();
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
  }, [entries, hasMounted, isReviewer, mountedNow, reviewerFilters]);

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
    const intervalId = window.setInterval(() => {
      const now = Date.now();
      setBlackbaudSummaries((current) => {
        let changed = false;
        const next = { ...current };

        for (const [constituentId, summaryState] of Object.entries(current)) {
          if (summaryState?.status !== "loading") continue;

          const startedAt = Number(summaryState.startedAt || 0);
          if (!startedAt) {
            next[constituentId] = { ...summaryState, startedAt: now };
            changed = true;
            continue;
          }

          if (now - startedAt >= NXT_SUMMARY_STALE_TIMEOUT_MS) {
            next[constituentId] = {
              status: "error",
              error:
                "Blackbaud summary is taking longer than usual. Retry this record to load it by itself.",
            };
            changed = true;
          }
        }

        if (changed) {
          blackbaudSummariesRef.current = next;
        }

        return changed ? next : current;
      });
    }, 5000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!hasMounted || summaryQueueRunningRef.current) {
      return;
    }

    const entryToLoad = visibleEntries.find((entry) => {
      const constituentId = getEntryBlackbaudConstituentId(entry);
      return constituentId && !blackbaudSummariesRef.current[constituentId];
    });

    if (!entryToLoad) {
      return;
    }

    const constituentId = getEntryBlackbaudConstituentId(entryToLoad);
    summaryQueueRunningRef.current = true;

    async function loadQueuedSummary() {
      let lastError = null;

      try {
        for (let attempt = 1; attempt <= NXT_SUMMARY_AUTO_ATTEMPTS; attempt += 1) {
          if (!mountedRef.current) return;

          updateBlackbaudSummaryState(constituentId, {
            status: "loading",
            startedAt: Date.now(),
            attempt,
            automaticRetry: attempt > 1,
          });

          try {
            const payload = await fetchBlackbaudSummaryPayload(entryToLoad, {
              forceRefresh: attempt > 1,
            });
            if (!mountedRef.current) return;

            updateBlackbaudSummaryState(constituentId, { status: "ready", payload });
            return;
          } catch (error) {
            lastError = error;

            if (attempt < NXT_SUMMARY_AUTO_ATTEMPTS) {
              await new Promise((resolve) =>
                window.setTimeout(resolve, NXT_SUMMARY_RETRY_DELAY_MS * attempt),
              );
              continue;
            }

            if (!mountedRef.current) return;
            updateBlackbaudSummaryState(constituentId, {
              status: "error",
              error:
                lastError instanceof Error
                  ? `${lastError.message} It retried automatically ${NXT_SUMMARY_AUTO_ATTEMPTS - 1} times.`
                  : "Failed to load Blackbaud summary after automatic retries.",
              attempts: NXT_SUMMARY_AUTO_ATTEMPTS,
            });
          }
        }
      } finally {
        summaryQueueRunningRef.current = false;
        if (mountedRef.current) {
          setSummaryQueueTick((current) => current + 1);
        }
      }
    }

    loadQueuedSummary();
  }, [hasMounted, summaryQueueTick, visibleEntries]);

  async function retryBlackbaudSummary(entry) {
    const constituentId = getEntryBlackbaudConstituentId(entry);
    if (!constituentId) return;

    updateBlackbaudSummaryState(constituentId, {
      status: "loading",
      manualRetry: true,
      startedAt: Date.now(),
    });

    try {
      const payload = await fetchBlackbaudSummaryPayload(entry, { forceRefresh: true });
      updateBlackbaudSummaryState(constituentId, { status: "ready", payload });
      setToast({ tone: "success", message: "Blackbaud summary loaded." });
    } catch (error) {
      const message = getBlackbaudSummaryErrorMessage(error);
      updateBlackbaudSummaryState(constituentId, { status: "error", error: message });
      setToast({ tone: "error", message });
    }
  }

  function setDraft(id, updates) {
    setClearedMgoRequestIds((current) => {
      if (!current.has(id)) return current;
      const next = new Set(current);
      next.delete(id);
      return next;
    });
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
        ...(Object.prototype.hasOwnProperty.call(current[id] || {}, "needsContactInfo")
          ? { needsContactInfo: current[id].needsContactInfo }
          : {}),
        ...(Object.prototype.hasOwnProperty.call(current[id] || {}, "contactInfoRequestNote")
          ? { contactInfoRequestNote: current[id].contactInfoRequestNote }
          : {}),
        solicitorRequested:
          current[id]?.solicitorRequested ??
          entries.find((entry) => entry.id === id)?.solicitor_requested ??
          false,
        mgogptDispositionValue:
          current[id]?.mgogptDispositionValue ??
          entries.find((entry) => entry.id === id)?.mgogpt_disposition_value ??
          "",
        mgogptDispositionComment:
          current[id]?.mgogptDispositionComment ??
          entries.find((entry) => entry.id === id)?.mgogpt_disposition_comment ??
          "",
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
      const existingEntry = entries.find((entry) => entry.id === id);
      const wasReassigned =
        draft.assignedUserId &&
        String(draft.assignedUserId) !== String(existingEntry?.assigned_user_id || "");
      const response = await fetch(`/api/prospect-pool/${id}?view=mgo`, {
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
      const syncPresentation = getNxtSyncPresentation(updated.nxt_status_sync_state);
      const message = wasReassigned
        ? `Reassigned ${updated.prospect_name}. ${syncPresentation.label}.`
        : `Updated ${updated.prospect_name}.`;
      setActionMessage(message);
      setToast({ tone: "success", message });
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
      const syncPresentation = getNxtSyncPresentation(created.nxt_status_sync_state);
      const message = `${created.prospect_name} assigned to ${assignedName}. ${syncPresentation.label}.`;
      setActionMessage(message);
      setToast({ tone: "success", message });
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
      const existingEntry = entries.find((entry) => entry.id === id);
      const solicitorRequested =
        draft.solicitorRequested ?? existingEntry?.solicitor_requested ?? false;
      const mgogptDispositionValue =
        draft.mgogptDispositionValue ?? existingEntry?.mgogpt_disposition_value ?? "";
      const response = await fetch(`/api/prospect-pool/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          needsContactInfo: draft.needsContactInfo,
          contactInfoRequestNote: draft.contactInfoRequestNote,
          solicitorRequested: draft.solicitorRequested,
          mgogptDispositionValue: draft.mgogptDispositionValue,
          mgogptDispositionComment: draft.mgogptDispositionComment,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to update prospect pool entry");
      }

      const updated = await response.json();
      const movedToPortfolio = solicitorRequested && isSolicitorAssignmentSynced(updated);
      setEntries((current) =>
        movedToPortfolio
          ? current.filter((entry) => entry.id !== id)
          : current.map((entry) => (entry.id === id ? { ...entry, ...updated } : entry)),
      );
      setDrafts((current) =>
        movedToPortfolio
          ? Object.fromEntries(Object.entries(current).filter(([entryId]) => entryId !== String(id)))
          : Object.fromEntries(Object.entries(current).filter(([entryId]) => entryId !== String(id))),
      );
      setClearedMgoRequestIds((current) => {
        const next = new Set(current);
        if (movedToPortfolio) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
      const solicitorMessage = solicitorRequested
        ? getSolicitorAssignmentPresentation(updated.solicitor_assignment_sync_state)
        : null;
      const solicitorDebug = solicitorRequested
        ? formatSolicitorAssignmentDebug(updated.solicitor_assignment_sync_debug)
        : "";
      const mgogptDispositionMessage = mgogptDispositionValue
        ? getMgogptDispositionPresentation(updated.mgogpt_disposition_sync_state)
        : null;
      const messageParts = [`Saved updates for ${updated.prospect_name}.`];
      if (solicitorMessage) {
        messageParts.push(`${solicitorMessage.label}${solicitorDebug}`);
      }
      if (mgogptDispositionMessage) {
        messageParts.push(mgogptDispositionMessage.label);
      }
      if (updated.data_request_id) {
        messageParts.push("Sent to the Advancement Services data request queue.");
      }
      if (movedToPortfolio) {
        messageParts.push("This prospect was removed from your pool and should now appear in your portfolio.");
      }
      const message = messageParts.join(" ");
      setActionMessage(message);
      setToast({
        tone: solicitorMessage?.tone || mgogptDispositionMessage?.tone || "success",
        message,
      });
    } catch (err) {
      console.error(err);
      const message = err.message || "Could not save your request.";
      setError(message);
      setToast({ tone: "error", message });
    } finally {
      setSavingId(null);
    }
  }

  async function retryNxtSync(entryId) {
    setRetryingSyncId(entryId);
    setError("");
    setActionMessage("");

    try {
      const response = await fetch(`/api/prospect-pool/${entryId}/nxt-status-sync`, {
        method: "POST",
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to retry MGOGPT custom field update");
      }

      const updated = await response.json();
      const syncPresentation = getNxtSyncPresentation(updated.nxt_status_sync_state);
      setEntries((current) =>
        current.map((entry) => (entry.id === entryId ? { ...entry, ...updated } : entry)),
      );
      const message =
        updated.nxt_status_sync_state === "manual_required"
          ? `Recorded another MGOGPT update attempt for ${updated.prospect_name}. ${syncPresentation.label}.`
          : `Retried MGOGPT update for ${updated.prospect_name}. ${syncPresentation.label}.`;
      setActionMessage(message);
      setToast({ tone: "success", message });
    } catch (err) {
      console.error(err);
      const message = err.message || "Could not retry the MGOGPT update.";
      setError(message);
      setToast({ tone: "error", message });
    } finally {
      setRetryingSyncId(null);
    }
  }

  async function downloadManualQueue() {
    setExportingQueue(true);
    setError("");

    try {
      const response = await fetch("/api/prospect-pool/nxt-status-export");
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to export the MGOGPT update queue");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const disposition = response.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename=\"?([^"]+)\"?/i);
      anchor.href = url;
      anchor.download = match?.[1] || "prospect-pool-nxt-status.csv";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.URL.revokeObjectURL(url);
      setToast({ tone: "success", message: "Downloaded the MGOGPT update queue." });
    } catch (err) {
      console.error(err);
      const message = err.message || "Could not export the MGOGPT update queue.";
      setError(message);
      setToast({ tone: "error", message });
    } finally {
      setExportingQueue(false);
    }
  }

  if (!hasMounted || loading || loadingData || !profile) {
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
      suppressHydrationWarning
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
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={downloadManualQueue}
                  disabled={exportingQueue}
                  style={{
                    borderRadius: "999px",
                    border: "1px solid #FCD34D",
                    backgroundColor: "#FFFBEB",
                    color: "#92400E",
                    padding: "10px 14px",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: exportingQueue ? "wait" : "pointer",
                  }}
                >
                  {exportingQueue ? "Preparing export..." : "Download MGOGPT update queue"}
                </button>
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
                  id="prospect-pool-create-prospect-name"
                  name="prospectName"
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
              </label>

              <label style={{ display: "grid", gap: "8px", fontSize: "14px", color: "#111827" }}>
                Assign to MGO
                <select
                  id="prospect-pool-create-assigned-user"
                  name="assignedUserId"
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

              {(blackbaudMatches.length > 0 || selectedBlackbaudMatch) ? (
                <div
                  style={{
                    gridColumn: "1 / -1",
                    padding: "12px",
                    borderRadius: "12px",
                    border: "1px solid #BFDBFE",
                    backgroundColor: "#EFF6FF",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px",
                      alignItems: "center",
                      flexWrap: "wrap",
                      marginBottom: blackbaudMatches.length > 0 ? "10px" : 0,
                    }}
                  >
                    <div style={{ fontSize: "13px", fontWeight: 700, color: "#1D4ED8" }}>
                      NXT constituent match
                    </div>
                    {selectedBlackbaudMatch ? (
                      <div style={{ fontSize: "12px", color: "#1F2937" }}>
                        {selectedBlackbaudMatch.name}
                        {selectedBlackbaudMatch.lookupId ? (
                          <> · Lookup ID <strong>{selectedBlackbaudMatch.lookupId}</strong></>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  {blackbaudMatches.length > 0 ? (
                    <div
                      style={{
                        display: "grid",
                        gap: "8px",
                        maxHeight: "240px",
                        overflowY: "auto",
                        paddingRight: "4px",
                      }}
                    >
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
                                display: "flex",
                                justifyContent: "space-between",
                                gap: "10px",
                                alignItems: "flex-start",
                                flexWrap: "wrap",
                              }}
                            >
                              <div style={{ minWidth: 0, flex: "1 1 220px" }}>
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
                                  <div style={{ marginTop: "2px", fontSize: "12px", color: "#4B5563" }}>
                                    Lookup ID: {match.lookupId}
                                  </div>
                                ) : null}
                                {match.email ? (
                                  <div style={{ marginTop: "2px", fontSize: "12px", color: "#4B5563" }}>
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
                              </div>
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
                                  flex: "0 0 auto",
                                }}
                              >
                                {selected ? "Selected" : "Use match"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              ) : null}

              <label style={{ display: "grid", gap: "8px", fontSize: "14px", color: "#111827" }}>
                Email
                <input
                  id="prospect-pool-create-email"
                  name="email"
                  type="email"
                  autoComplete="email"
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
                  id="prospect-pool-create-phone"
                  name="phone"
                  type="text"
                  autoComplete="tel"
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
                  id="prospect-pool-create-note"
                  name="note"
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
                  id="prospect-pool-filter-assigned-user"
                  name="reviewerAssignedUserId"
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
                  id="prospect-pool-filter-request-state"
                  name="reviewerRequestState"
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
                  id="prospect-pool-filter-assigned-date"
                  name="reviewerAssignedDateRange"
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
                  id="prospect-pool-filter-sort-by"
                  name="reviewerSortBy"
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
            const syncPresentation = getNxtSyncPresentation(entry.nxt_status_sync_state);
            const draft = drafts[entry.id];
            const useClearedMgoRequestDraft = !isReviewer && !draft && clearedMgoRequestIds.has(entry.id);
            const needsContactInfo = useClearedMgoRequestDraft
              ? CLEARED_MGO_REQUEST_DRAFT.needsContactInfo
              : draft?.needsContactInfo ?? false;
            const solicitorRequested = useClearedMgoRequestDraft
              ? CLEARED_MGO_REQUEST_DRAFT.solicitorRequested
              : draft?.solicitorRequested ?? entry.solicitor_requested;
            const contactInfoRequestNote =
              useClearedMgoRequestDraft
                ? CLEARED_MGO_REQUEST_DRAFT.contactInfoRequestNote
                : draft?.contactInfoRequestNote ?? "";
            const mgogptDispositionValue =
              useClearedMgoRequestDraft
                ? CLEARED_MGO_REQUEST_DRAFT.mgogptDispositionValue
                : draft?.mgogptDispositionValue ?? entry.mgogpt_disposition_value ?? "";
            const mgogptDispositionComment =
              useClearedMgoRequestDraft
                ? CLEARED_MGO_REQUEST_DRAFT.mgogptDispositionComment
                : draft?.mgogptDispositionComment ?? entry.mgogpt_disposition_comment ?? "";
            const blackbaudConstituentId = getEntryBlackbaudConstituentId(entry);
            const nxtProfileUrl = buildBlackbaudConstituentProfileUrl(blackbaudConstituentId);
            const blackbaudSummaryState = blackbaudConstituentId
              ? blackbaudSummaries[blackbaudConstituentId]
              : null;
            const blackbaudConstituent =
              blackbaudSummaryState?.payload?.mapped?.constituent || null;
            const blackbaudLifetimeGiving =
              blackbaudSummaryState?.payload?.mapped?.lifetimeGiving || null;
            const blackbaudAssignments =
              blackbaudSummaryState?.payload?.mapped?.fundraiserAssignments || [];
            const blackbaudNarrativeSummary =
              blackbaudSummaryState?.payload?.mapped?.prospectSummaryNarrative || "";
            const primaryBusinessRelationship =
              blackbaudSummaryState?.payload?.mapped?.primaryBusinessRelationship || null;
            const juEducation =
              blackbaudSummaryState?.payload?.mapped?.jacksonvilleUniversityEducation || [];
            const postAssignmentActionType = getPostAssignmentActionType(entry);
            const postAssignmentActionUrl = buildPostAssignmentActionUrl(entry);
            const hasPostAssignmentAction = Boolean(entry.post_assignment_action_date);
            const lastActionType = hasPostAssignmentAction
              ? postAssignmentActionType
              : getActionTypeFromNotes(entry.last_action_notes);
            const canRetryNxtSync =
              entry.nxt_status_sync_state === "failed" ||
              entry.nxt_status_sync_state === "pending";

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
                        display: "flex",
                        gap: "8px",
                        flexWrap: "wrap",
                        marginBottom: "12px",
                      }}
                    >
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
                        }}
                      >
                        {stateLabel}
                      </div>
                      {isReviewer ? (
                        <div
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            padding: "6px 10px",
                            borderRadius: "999px",
                            backgroundColor: syncPresentation.bg,
                            color: syncPresentation.fg,
                            fontSize: "12px",
                            fontWeight: 700,
                          }}
                        >
                          {syncPresentation.shortLabel}
                        </div>
                      ) : null}
                    </div>
                    <h2 style={{ margin: 0, fontSize: "22px", color: "#111827" }}>
                      {entry.prospect_name}
                    </h2>
                    <div style={{ marginTop: "8px", fontSize: "14px", color: "#6B7280" }}>
                      {entry.assigned_user_name || entry.assigned_user_email || "Unassigned"}
                      {" · "}Assigned {formatDate(entry.assigned_at || entry.created_at)}
                      {(entry.assignment_updated_by_name || entry.created_by_name)
                        ? ` by ${entry.assignment_updated_by_name || entry.created_by_name}`
                        : ""}
                    </div>
                    {!isReviewer ? (
                      <div style={{ marginTop: "8px", fontSize: "13px", color: "#6B7280" }}>
                        Assigned by Advancement Services
                      </div>
                    ) : null}
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
                          What needs to happen
                        </div>
                        <div>{getQuickRequestLabel(entry)}</div>
                      </div>
                      {hasPostAssignmentAction || isSolicitorAssignmentSynced(entry) ? (
                        <div>
                          <div style={{ fontSize: "12px", color: "#6B7280", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "4px" }}>
                            Solicitor follow-up
                          </div>
                          {hasPostAssignmentAction ? (
                            <div style={{ display: "grid", gap: "6px", justifyItems: "start" }}>
                              {postAssignmentActionUrl ? (
                                <a
                                  href={postAssignmentActionUrl}
                                  style={postAssignmentActionLinkStyle}
                                >
                                  Outreach logged - see action
                                </a>
                              ) : (
                                <span style={postAssignmentActionLinkStyle}>
                                  Outreach logged
                                </span>
                              )}
                              <div style={{ fontSize: "12px", color: "#4B5563", lineHeight: 1.5 }}>
                                {postAssignmentActionType}
                                {" · "}
                                {formatShortDate(entry.post_assignment_action_date)}
                                {entry.post_assignment_blackbaud_action_id
                                  ? " · Synced to NXT"
                                  : ""}
                              </div>
                            </div>
                          ) : (
                            <div style={{ fontSize: "14px", color: "#6B7280" }}>
                              Awaiting an action from the assigned solicitor
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>

                    {blackbaudConstituentId ? (
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
                          <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
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
                            {nxtProfileUrl ? (
                              <a
                                href={nxtProfileUrl}
                                target="_blank"
                                rel="noreferrer"
                                style={nxtProfileLinkStyle}
                              >
                                Open NXT profile
                              </a>
                            ) : null}
                          </div>
                        </div>

                        {!blackbaudSummaryState || blackbaudSummaryState.status === "loading" ? (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "10px",
                              flexWrap: "wrap",
                              fontSize: "13px",
                              color: "#4B5563",
                            }}
                          >
                            <span>
                              {!blackbaudSummaryState
                                ? "Waiting to load Blackbaud summary..."
                                : blackbaudSummaryState.automaticRetry
                                  ? `NXT is slow; retrying automatically (${blackbaudSummaryState.attempt} of ${NXT_SUMMARY_AUTO_ATTEMPTS})...`
                                  : "Loading Blackbaud summary..."}
                            </span>
                            <button
                              type="button"
                              onClick={() => retryBlackbaudSummary(entry)}
                              style={{
                                border: "1px solid #93C5FD",
                                borderRadius: "999px",
                                backgroundColor: "white",
                                color: "#1D4ED8",
                                cursor: "pointer",
                                fontSize: "12px",
                                fontWeight: 700,
                                padding: "6px 10px",
                              }}
                            >
                              {!blackbaudSummaryState ? "Load now" : "Retry NXT summary"}
                            </button>
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
                            <div style={{ fontWeight: 700, marginBottom: "4px" }}>
                              NXT summary could not load.
                            </div>
                            <div style={{ lineHeight: 1.5 }}>
                              {blackbaudSummaryState.error ||
                                "Linked Blackbaud data could not be loaded right now."}
                            </div>
                            <div
                              style={{
                                marginTop: "8px",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "10px",
                                flexWrap: "wrap",
                              }}
                            >
                              <span style={{ color: "#7F1D1D" }}>
                                NXT ID: {blackbaudConstituentId}
                              </span>
                              <button
                                type="button"
                                onClick={() => retryBlackbaudSummary(entry)}
                                style={{
                                  border: "1px solid #FCA5A5",
                                  borderRadius: "999px",
                                  backgroundColor: "white",
                                  color: "#991B1B",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  fontWeight: 700,
                                  padding: "6px 10px",
                                }}
                              >
                                Retry NXT summary
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div
                              style={{
                                padding: "10px 12px",
                                borderRadius: "12px",
                                backgroundColor: "rgba(255,255,255,0.7)",
                                border: "1px solid rgba(147, 197, 253, 0.55)",
                                marginBottom: "12px",
                              }}
                            >
                              <button
                                type="button"
                                onClick={() => toggleNarrativeSummary(entry.id)}
                                style={{
                                  width: "100%",
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "center",
                                  gap: "12px",
                                  border: "none",
                                  backgroundColor: "transparent",
                                  padding: 0,
                                  cursor: "pointer",
                                  color: "#1D4ED8",
                                  fontSize: "13px",
                                  fontWeight: "700",
                                }}
                              >
                                <span>NXT Summary</span>
                                {expandedNarrativeSummaries[entry.id] ? (
                                  <ChevronUp size={16} />
                                ) : (
                                  <ChevronDown size={16} />
                                )}
                              </button>
                              {expandedNarrativeSummaries[entry.id] ? (
                                <div style={{ marginTop: "10px" }}>
                                  {blackbaudNarrativeSummary ? (
                                    <div
                                      style={{
                                        padding: "12px 14px",
                                        borderRadius: "12px",
                                        backgroundColor: "white",
                                        border: "1px solid rgba(147, 197, 253, 0.55)",
                                        fontSize: "14px",
                                        lineHeight: 1.7,
                                        color: "#1F2937",
                                      }}
                                    >
                                      {getDisplayText(blackbaudNarrativeSummary, "No concise NXT summary is available for this constituent yet.")}
                                    </div>
                                  ) : (
                                    <div
                                      style={{
                                        padding: "10px 12px",
                                        borderRadius: "10px",
                                        backgroundColor: "white",
                                        border: "1px solid rgba(147, 197, 253, 0.4)",
                                        fontSize: "13px",
                                        color: "#4B5563",
                                      }}
                                    >
                                      No concise NXT summary is available for this constituent yet.
                                    </div>
                                  )}
                                </div>
                              ) : null}
                            </div>
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns:
                                  "repeat(auto-fit, minmax(220px, 1fr))",
                                gap: "12px",
                              }}
                            >
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                  Constituent
                                </div>
                                <div style={{ fontSize: "14px", color: "#111827", overflowWrap: "anywhere", lineHeight: 1.4 }}>
                                  {getDisplayText(blackbaudConstituent?.name)}
                                </div>
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                  Email
                                </div>
                                <div style={{ fontSize: "14px", color: "#111827", overflowWrap: "anywhere", lineHeight: 1.4 }}>
                                  {getDisplayText(blackbaudConstituent?.email)}
                                </div>
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                  Phone
                                </div>
                                <div style={{ fontSize: "14px", color: "#111827", overflowWrap: "anywhere", lineHeight: 1.4 }}>
                                  {getDisplayText(blackbaudConstituent?.phone)}
                                </div>
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                  Lifetime Giving
                                </div>
                                <div style={{ fontSize: "14px", color: "#111827", overflowWrap: "anywhere", lineHeight: 1.4 }}>
                                  {formatBlackbaudCurrency(blackbaudLifetimeGiving?.totalGiving)}
                                </div>
                              </div>
                            </div>
                            {primaryBusinessRelationship ? (
                              <div
                                style={{
                                  marginTop: "12px",
                                  paddingTop: "12px",
                                  borderTop: "1px solid rgba(147, 197, 253, 0.45)",
                                }}
                              >
                                <div
                                  style={{
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    color: "#6B7280",
                                    textTransform: "uppercase",
                                    letterSpacing: "0.04em",
                                    marginBottom: "6px",
                                  }}
                                >
                                  Primary business
                                </div>
                                <div style={{ fontSize: "14px", color: "#111827", fontWeight: 600 }}>
                                  {getDisplayText(primaryBusinessRelationship.organizationName)}
                                </div>
                                <div style={{ marginTop: "4px", fontSize: "13px", color: "#4B5563" }}>
                                  Role: {getDisplayText(primaryBusinessRelationship.position || primaryBusinessRelationship.type)}
                                </div>
                              </div>
                            ) : null}
                            {juEducation.length > 0 ? (
                              <div
                                style={{
                                  marginTop: "12px",
                                  paddingTop: "12px",
                                  borderTop: "1px solid rgba(147, 197, 253, 0.45)",
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
                                  Jacksonville University education
                                </div>
                                <div style={{ display: "grid", gap: "6px" }}>
                                  {juEducation.map((education, index) => (
                                    <div
                                      key={education.educationId || `${entry.id}-ju-education-${index}`}
                                      style={{
                                        fontSize: "13px",
                                        color: "#374151",
                                        lineHeight: 1.6,
                                      }}
                                    >
                                      {formatEducationLine(education)}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : null}
                            {entry.last_action_date || entry.last_action_solicitor_name ? (
                              <div
                                style={{
                                  marginTop: "12px",
                                  paddingTop: "12px",
                                  borderTop: "1px solid rgba(147, 197, 253, 0.45)",
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
                                  Post-assignment action
                                </div>
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                                    gap: "10px",
                                  }}
                                >
                                  <div>
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        color: "#6B7280",
                                        fontWeight: 700,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.04em",
                                        marginBottom: "4px",
                                      }}
                                    >
                                      Date
                                    </div>
                                    <div style={{ fontSize: "14px", color: "#111827" }}>
                                      {formatShortDate(entry.last_action_date)}
                                    </div>
                                  </div>
                                  <div>
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        color: "#6B7280",
                                        fontWeight: 700,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.04em",
                                        marginBottom: "4px",
                                      }}
                                    >
                                      Type
                                    </div>
                                    <div style={{ fontSize: "14px", color: "#111827" }}>
                                      {lastActionType || "Logged update"}
                                    </div>
                                  </div>
                                  <div>
                                    <div
                                      style={{
                                        fontSize: "12px",
                                        color: "#6B7280",
                                        fontWeight: 700,
                                        textTransform: "uppercase",
                                        letterSpacing: "0.04em",
                                        marginBottom: "4px",
                                      }}
                                    >
                                      Solicitor
                                    </div>
                                    <div style={{ fontSize: "14px", color: "#111827" }}>
                                      {entry.last_action_solicitor_name ||
                                        entry.assigned_user_name ||
                                        entry.assigned_user_email ||
                                        "Unavailable"}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ) : null}
                            {blackbaudAssignments.length > 0 ? (
                              <div style={{ marginTop: "12px", fontSize: "13px", color: "#374151" }}>
                                Current assignment:{" "}
                                <strong>{getDisplayText(blackbaudAssignments[0]?.type)}</strong>
                                {" · "}
                                Fundraiser ID{" "}
                                <strong>
                                  {getDisplayText(blackbaudAssignments[0]?.fundraiserId)}
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
                          id={`prospect-pool-entry-assigned-user-${entry.id}`}
                          name={`assignedUserId-${entry.id}`}
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
                          id={`prospect-pool-entry-note-${entry.id}`}
                          name={`note-${entry.id}`}
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
                            id={`prospect-pool-entry-email-${entry.id}`}
                            name={`email-${entry.id}`}
                            type="email"
                            autoComplete="email"
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
                            id={`prospect-pool-entry-phone-${entry.id}`}
                            name={`phone-${entry.id}`}
                            type="text"
                            autoComplete="tel"
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
                        {canRetryNxtSync ? (
                          <button
                            type="button"
                            disabled={retryingSyncId === entry.id}
                            onClick={() => retryNxtSync(entry.id)}
                            style={{
                              flex: "1 1 150px",
                              padding: "12px 16px",
                              borderRadius: "12px",
                              border: "1px solid #D1D5DB",
                              backgroundColor: "white",
                              color: "#374151",
                              fontSize: "14px",
                              fontWeight: 700,
                              cursor: retryingSyncId === entry.id ? "wait" : "pointer",
                            }}
                          >
                            {retryingSyncId === entry.id ? "Retrying..." : "Retry MGOGPT sync"}
                          </button>
                        ) : null}
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
                          id={`prospect-pool-entry-needs-contact-info-${entry.id}`}
                          name={`needsContactInfo-${entry.id}`}
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
                          id={`prospect-pool-entry-contact-note-${entry.id}`}
                          name={`contactInfoRequestNote-${entry.id}`}
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
                          id={`prospect-pool-entry-solicitor-requested-${entry.id}`}
                          name={`solicitorRequested-${entry.id}`}
                          type="checkbox"
                          checked={Boolean(solicitorRequested)}
                          onChange={(event) =>
                            setDraft(entry.id, {
                              solicitorRequested: event.target.checked,
                            })
                          }
                        />
                        Assign me as solicitor
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
                        MGOGPT outcome
                        <select
                          id={`prospect-pool-entry-mgogpt-outcome-${entry.id}`}
                          name={`mgogptDispositionValue-${entry.id}`}
                          value={mgogptDispositionValue}
                          onChange={(event) =>
                            setDraft(entry.id, {
                              mgogptDispositionValue: event.target.value,
                            })
                          }
                          style={{
                            padding: "12px 14px",
                            borderRadius: "12px",
                            border: "1px solid #D1D5DB",
                            backgroundColor: "white",
                            fontSize: "14px",
                          }}
                        >
                          <option value="">Select outcome</option>
                          {MGOGPT_OUTCOME_OPTIONS.map((option) => (
                            <option key={option} value={option}>
                              {option}
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
                          marginBottom: "14px",
                        }}
                      >
                        MGOGPT comment
                        <textarea
                          id={`prospect-pool-entry-mgogpt-comment-${entry.id}`}
                          name={`mgogptDispositionComment-${entry.id}`}
                          value={mgogptDispositionComment}
                          onChange={(event) =>
                            setDraft(entry.id, {
                              mgogptDispositionComment: event.target.value,
                            })
                          }
                          rows={3}
                          placeholder="Add context for this MGOGPT outcome."
                          style={{
                            padding: "12px 14px",
                            borderRadius: "12px",
                            border: "1px solid #D1D5DB",
                            fontSize: "14px",
                            resize: "vertical",
                          }}
                        />
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
