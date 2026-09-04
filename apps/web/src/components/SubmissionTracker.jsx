"use client";

import { useEffect, useMemo, useState } from "react";
import useUser from "@/utils/useUser";
import { ArrowLeft, ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import useWorkspaceView from "@/utils/useWorkspaceView";

const REVIEW_STATUSES = [
  "Pending",
  "Approved",
  "Needs Clarification",
  "Ready for CRM",
];

const DATA_UPDATES_TAB = "dataUpdates";
const RESEARCH_TAB = "research";
const LIST_REQUESTS_TAB = "listRequests";
const IMPORTS_TAB = "imports";
const NXT_EXCEPTIONS_TAB = "nxtExceptions";
const ACTIVITY_LOG_TAB = "activityLog";
const TRIAGE_TAB = "triage";
const TRIAGE_AGING_DAYS = 5;

const DATA_REQUEST_STATUSES = ["Open", "In Progress", "Completed", "Declined"];

const TYPE_LABELS = {
  donor_update: "Donor Update",
  opportunity_update: "Opportunity Update",
  constituent_suggestion: "Constituent Suggestion",
};

const LIST_REQUEST_STATUSES = [
  "Pending",
  "Needs Clarification",
  "Complete",
];

const QUEUE_PRIORITY_LABELS = {
  1: "Urgent",
  2: "Normal",
  3: "Backlog",
};

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

function getStatusColors(status) {
  const map = {
    Pending: { bg: "#FEF3C7", fg: "#92400E" },
    Approved: { bg: "#DCFCE7", fg: "#166534" },
    "Needs Clarification": { bg: "#FEE2E2", fg: "#991B1B" },
    "Ready for CRM": { bg: "#DBEAFE", fg: "#1D4ED8" },
    Open: { bg: "#FEF3C7", fg: "#92400E" },
    "In Progress": { bg: "#DBEAFE", fg: "#1D4ED8" },
    Complete: { bg: "#DCFCE7", fg: "#166534" },
    Completed: { bg: "#DCFCE7", fg: "#166534" },
    Declined: { bg: "#FEE2E2", fg: "#991B1B" },
  };
  return map[status] || { bg: "#E5E7EB", fg: "#374151" };
}

function getEmailStatusMeta(status) {
  const map = {
    sent: { label: "Email sent", bg: "#DCFCE7", fg: "#166534" },
    failed: { label: "Email failed", bg: "#FEE2E2", fg: "#991B1B" },
    skipped: { label: "Email skipped", bg: "#FEF3C7", fg: "#92400E" },
    processing: { label: "Sending email", bg: "#DBEAFE", fg: "#1D4ED8" },
    not_requested: { label: "Email not requested", bg: "#E5E7EB", fg: "#374151" },
  };

  return map[status] || map.not_requested;
}

function getListRequestTitle(request) {
  return (
    request.purpose_other ||
    request.purpose ||
    request.output_type ||
    "List request"
  );
}

function formatList(value) {
  if (!value) return "";
  if (Array.isArray(value)) return value.filter(Boolean).join(", ");
  return String(value);
}

function parseMatchedConstituentRequest(submission, blackbaudSummary) {
  const interaction = String(submission?.interaction_type || "").trim();
  const isMatchedRequest =
    submission?.submission_type === "donor_update" &&
    /Data update|Assignment request|Add to top prospects/i.test(interaction) &&
    submission?.blackbaud_constituent_id;

  if (!isMatchedRequest) return null;

  const requestTypes = interaction
    .split("+")
    .map((value) => value.trim())
    .filter(Boolean);

  const noteBlocks = String(submission?.notes || "")
    .split(/\n\s*\n/)
    .map((value) => value.trim())
    .filter(Boolean);

  const parsed = {
    requestTypes,
    blackbaudId: submission.blackbaud_constituent_id || null,
    lookupId: blackbaudSummary?.mapped?.constituent?.lookupId || null,
    emailUpdate: null,
    phoneUpdate: null,
    organizationUpdate: null,
    dataUpdateDetails: null,
    assignmentRequest: null,
    additionalNotes: [],
  };

  for (const block of noteBlocks) {
    if (block.startsWith("Email on request:")) {
      parsed.emailUpdate = block.replace("Email on request:", "").trim() || null;
      continue;
    }
    if (block.startsWith("Phone on request:")) {
      parsed.phoneUpdate = block.replace("Phone on request:", "").trim() || null;
      continue;
    }
    if (block.startsWith("Organization on request:")) {
      parsed.organizationUpdate =
        block.replace("Organization on request:", "").trim() || null;
      continue;
    }
    if (block.startsWith("Assignment request:")) {
      parsed.assignmentRequest =
        block.replace("Assignment request:", "").trim() || null;
      continue;
    }
    if (
      !parsed.dataUpdateDetails &&
      requestTypes.some((value) => value.toLowerCase() === "data update")
    ) {
      parsed.dataUpdateDetails = block;
      continue;
    }
    parsed.additionalNotes.push(block);
  }

  return parsed;
}

function getDiscussionDefaultSubject(submission) {
  const label = TYPE_LABELS[submission?.submission_type] || "Submission";
  const donor = submission?.donor_name || submission?.constituent_name || "this record";
  return `${label}: ${donor}`;
}

function isNxtExceptionSubmission(submission) {
  const syncStatus = String(submission?.blackbaud_sync_status || "").trim().toLowerCase();
  const syncError = String(submission?.blackbaud_sync_error || "").trim();
  return syncStatus === "failed" || Boolean(syncError);
}

function formatDataRequestSource(source) {
  if (!source) return "general request";
  return String(source).replaceAll("_", " ");
}

function formatDataRequestDetails(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    if (typeof value.details === "string") return value.details;
    return JSON.stringify(value, null, 2);
  }
  return String(value);
}

function getListRequestStatus(status) {
  const normalized = String(status || "").trim();
  if (normalized === "Needs Clarification") return "Needs Clarification";
  if (["Complete", "Completed", "Approved"].includes(normalized)) return "Complete";
  return "Pending";
}

function isListRequestComplete(request) {
  return getListRequestStatus(request?.status) === "Complete";
}

function getAgeInDays(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Math.max(0, Math.floor((Date.now() - date.getTime()) / 86_400_000));
}

function isAgingDataRequest(request) {
  const status = String(request?.status || "Open").trim();
  if (!["Open", "In Progress"].includes(status)) return false;
  const ageInDays = getAgeInDays(request?.updated_at || request?.created_at);
  return ageInDays !== null && ageInDays >= TRIAGE_AGING_DAYS;
}

function getListRequestAttentionReason(request) {
  if (isListRequestComplete(request)) return null;
  if (getListRequestStatus(request?.status) === "Needs Clarification") {
    return "Waiting on requester clarification";
  }
  if (Number(request?.queue_priority || 2) === 1) return "Urgent priority";

  const dateNeeded = request?.date_needed ? new Date(request.date_needed) : null;
  if (dateNeeded && !Number.isNaN(dateNeeded.getTime()) && dateNeeded.getTime() < Date.now()) {
    return "Past requested date";
  }
  return null;
}

function isListRequestNeedingAttention(request) {
  return Boolean(getListRequestAttentionReason(request));
}

function isResearchDataRequest(request) {
  return String(request?.request_type || "")
    .trim()
    .toLowerCase()
    .includes("research");
}

function countRequestsByStatus(requests) {
  return requests.reduce((counts, request) => {
    const key = request.status || "Open";
    counts[key] = (counts[key] || 0) + 1;
    counts.All = (counts.All || 0) + 1;
    return counts;
  }, {});
}

function getImportRunState(run) {
  if (Number(run?.failedCount || 0) > 0 || Number(run?.conflictCount || 0) > 0) {
    return "Needs attention";
  }
  if (Number(run?.needsReviewCount || 0) > 0) return "Needs review";
  if (Number(run?.readyCount || 0) > 0) return "Ready to import";
  if (
    Number(run?.rowCount || 0) > 0 &&
    Number(run?.appliedCount || 0) >= Number(run?.rowCount || 0)
  ) {
    return "Complete";
  }
  return "In progress";
}

function getImportRunStateColors(state) {
  const map = {
    "Needs attention": { bg: "#FEF2F2", fg: "#991B1B", border: "#FECACA" },
    "Needs review": { bg: "#FEF3C7", fg: "#92400E", border: "#FDE68A" },
    "Ready to import": { bg: "#DBEAFE", fg: "#1D4ED8", border: "#BFDBFE" },
    Complete: { bg: "#DCFCE7", fg: "#166534", border: "#BBF7D0" },
    "In progress": { bg: "#F3F4F6", fg: "#374151", border: "#E5E7EB" },
  };
  return map[state] || map["In progress"];
}

function formatImportRunSummary(summary) {
  if (!summary) return "";
  if (typeof summary === "string") return summary.trim();
  if (typeof summary !== "object") return "";

  const details = [
    ["Ready", summary.ready],
    ["Needs review", summary.needsReview],
    ["Conflicts", summary.conflict],
    ["Applied", summary.applied],
    ["Failed", summary.failed],
    ["Skipped", summary.skipped],
  ]
    .filter(([, count]) => Number(count || 0) > 0)
    .map(([label, count]) => `${label}: ${Number(count)}`);

  return details.join(" · ");
}

export default function SubmissionTracker({ detailedReview = false }) {
  const { data: sessionUser, loading } = useUser();
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(detailedReview ? ACTIVITY_LOG_TAB : DATA_UPDATES_TAB);
  const [submissions, setSubmissions] = useState([]);
  const [submissionsLoading, setSubmissionsLoading] = useState(true);
  const [dataRequests, setDataRequests] = useState([]);
  const [dataRequestsLoading, setDataRequestsLoading] = useState(true);
  const [listRequests, setListRequests] = useState([]);
  const [listRequestsLoading, setListRequestsLoading] = useState(true);
  const [importRuns, setImportRuns] = useState([]);
  const [importRunsLoading, setImportRunsLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [updatingId, setUpdatingId] = useState(null);
  const [updatingDataRequestId, setUpdatingDataRequestId] = useState(null);
  const [updatingListRequestId, setUpdatingListRequestId] = useState(null);
  const [reviewFilter, setReviewFilter] = useState("Pending");
  const [dataRequestFilter, setDataRequestFilter] = useState("Open");
  const [listRequestFilter, setListRequestFilter] = useState("Pending");
  const [reviewDrafts, setReviewDrafts] = useState({});
  const [dataRequestDrafts, setDataRequestDrafts] = useState({});
  const [clarificationDrafts, setClarificationDrafts] = useState({});
  const [listRequestDrafts, setListRequestDrafts] = useState({});
  const [listRequestResponseDrafts, setListRequestResponseDrafts] = useState({});
  const [discussionDrafts, setDiscussionDrafts] = useState({});
  const [expandedSubmissionGroups, setExpandedSubmissionGroups] = useState({});
  const [blackbaudSummaries, setBlackbaudSummaries] = useState({});
  const [mgoOptions, setMgoOptions] = useState([]);
  const [discussionSavingId, setDiscussionSavingId] = useState(null);
  const [respondingListRequestId, setRespondingListRequestId] = useState(null);
  const { effectiveRole, isReviewerView } = useWorkspaceView(profile?.role);
  const isReviewer = isReviewerView;

  function getSubmissionDisplayName(submission) {
    return submission.donor_name || submission.constituent_name || "Untitled submission";
  }

  function updateDiscussionDraft(submission, updates) {
    setDiscussionDrafts((current) => {
      const existing = current[submission.id] || {
        open: false,
        subject: getDiscussionDefaultSubject(submission),
        body: "",
        dueDate: "",
        assignedUserId: "",
      };

      return {
        ...current,
        [submission.id]: {
          ...existing,
          ...updates,
        },
      };
    });
  }

  useEffect(() => {
    if (!loading && !sessionUser) {
      window.location.href = "/account/signin";
    }
  }, [loading, sessionUser]);

  useEffect(() => {
    if (!sessionUser) return;

    let active = true;

    async function loadProfile() {
      setProfileLoading(true);
      try {
        const response = await fetch("/api/users/profile");
        if (!response.ok) {
          throw new Error("Failed to load profile");
        }
        const data = await response.json();
        if (active) {
          setProfile(data.user || null);
        }
      } catch (err) {
        if (active) {
          console.error(err);
          setError("Could not load your profile.");
        }
      } finally {
        if (active) {
          setProfileLoading(false);
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

    async function loadSubmissions() {
      setSubmissionsLoading(true);
      setError("");
      try {
        const endpoint = isReviewer
          ? "/api/submissions/all"
          : "/api/submissions/my-submissions";
        const response = await fetch(endpoint);
        if (!response.ok) {
          throw new Error("Failed to load submissions");
        }
        const data = await response.json();
        if (active) {
          setSubmissions(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (active) {
          console.error(err);
          setError("Could not load submissions.");
        }
      } finally {
        if (active) {
          setSubmissionsLoading(false);
        }
      }
    }

    loadSubmissions();
    return () => {
      active = false;
    };
  }, [isReviewer, profile]);

  useEffect(() => {
    let active = true;

    async function loadMgoOptions() {
      try {
        const response = await fetch("/api/users/mgos");
        if (!response.ok) return;
        const data = await response.json();
        if (active) {
          setMgoOptions(Array.isArray(data) ? data : []);
        }
      } catch (loadError) {
        console.error("Could not load MGO options for team discussion:", loadError);
      }
    }

    loadMgoOptions();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!profile) return;

    if (isReviewer && activeTab === "submissions") {
      setActiveTab(DATA_UPDATES_TAB);
      return;
    }

    if (
      !isReviewer &&
      [
        TRIAGE_TAB,
        DATA_UPDATES_TAB,
        RESEARCH_TAB,
        IMPORTS_TAB,
        NXT_EXCEPTIONS_TAB,
      ].includes(activeTab)
    ) {
      setActiveTab(ACTIVITY_LOG_TAB);
    }
  }, [activeTab, isReviewer, profile]);

  useEffect(() => {
    if (!profile) return;

    let active = true;

    async function loadDataRequests() {
      setDataRequestsLoading(true);
      setError("");
      try {
        const response = await fetch("/api/data-requests");
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "Failed to load data requests");
        }
        const data = await response.json();
        if (active) {
          setDataRequests(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (active) {
          console.error(err);
          setError("Could not load data requests.");
        }
      } finally {
        if (active) {
          setDataRequestsLoading(false);
        }
      }
    }

    loadDataRequests();
    return () => {
      active = false;
    };
  }, [isReviewer, profile]);

  useEffect(() => {
    if (!profile) return;

    let active = true;

    async function loadListRequests() {
      setListRequestsLoading(true);
      setError("");
      try {
        const endpoint = isReviewer
          ? "/api/list-requests/all"
          : "/api/list-requests/my-requests";
        const response = await fetch(endpoint);
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          throw new Error(payload?.error || "Failed to load list requests");
        }
        const data = await response.json();
        if (active) {
          setListRequests(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (active) {
          console.error(err);
          setError("Could not load list requests.");
        }
      } finally {
        if (active) {
          setListRequestsLoading(false);
        }
      }
    }

    loadListRequests();
    return () => {
      active = false;
    };
  }, [isReviewer, profile]);

  useEffect(() => {
    if (!profile) return;

    if (!isReviewer) {
      setImportRuns([]);
      setImportRunsLoading(false);
      return;
    }

    let active = true;

    async function loadImportRuns() {
      setImportRunsLoading(true);
      try {
        const response = await fetch("/api/constituency-import/runs?limit=12");
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to load import runs");
        }
        if (active) {
          setImportRuns(Array.isArray(payload?.runs) ? payload.runs : []);
        }
      } catch (loadError) {
        if (active) {
          console.error("Could not load import runs:", loadError);
          setError(loadError.message || "Could not load import runs.");
        }
      } finally {
        if (active) {
          setImportRunsLoading(false);
        }
      }
    }

    loadImportRuns();
    return () => {
      active = false;
    };
  }, [isReviewer, profile]);

  const heading = useMemo(() => {
    if (isReviewer) {
      return {
        title: "Advancement Services Work Queue",
        subtitle: "Work only the requests that need Advancement Services. Automated NXT activity stays in history unless it needs attention.",
      };
    }

    return {
      title: "My Submission Tracker",
      subtitle: "See what you submitted, when it was reviewed, and what needs follow-up.",
    };
  }, [isReviewer]);

  const dataUpdateRequests = useMemo(
    () => dataRequests.filter((request) => !isResearchDataRequest(request)),
    [dataRequests],
  );

  const researchRequests = useMemo(
    () => dataRequests.filter(isResearchDataRequest),
    [dataRequests],
  );

  const dataUpdateCounts = useMemo(() => {
    if (!isReviewer) return {};
    return countRequestsByStatus(dataUpdateRequests);
  }, [dataUpdateRequests, isReviewer]);

  const researchRequestCounts = useMemo(() => {
    if (!isReviewer) return {};
    return countRequestsByStatus(researchRequests);
  }, [isReviewer, researchRequests]);

  const activeDataRequests = useMemo(() => {
    if (activeTab === RESEARCH_TAB) return researchRequests;
    return dataUpdateRequests;
  }, [activeTab, dataUpdateRequests, researchRequests]);

  const activeDataRequestCounts = useMemo(() => {
    if (activeTab === RESEARCH_TAB) return researchRequestCounts;
    return dataUpdateCounts;
  }, [activeTab, dataUpdateCounts, researchRequestCounts]);

  const reviewerCounts = useMemo(() => {
    if (!isReviewer) return {};

    return submissions.reduce((counts, submission) => {
      const key = submission.status || "Pending";
      counts[key] = (counts[key] || 0) + 1;
      counts.All = (counts.All || 0) + 1;
      return counts;
    }, {});
  }, [profile, submissions]);

  const reviewerListRequestCounts = useMemo(() => {
    if (!isReviewer) return {};

    return listRequests.reduce((counts, request) => {
      const key = getListRequestStatus(request.status);
      counts[key] = (counts[key] || 0) + 1;
      counts.All = (counts.All || 0) + 1;
    return counts;
  }, {});
  }, [profile, listRequests]);

  const nxtExceptionSubmissions = useMemo(
    () => submissions.filter((submission) => isNxtExceptionSubmission(submission)),
    [submissions],
  );

  const reviewerExceptionCounts = useMemo(() => {
    if (!isReviewer) return {};

    return nxtExceptionSubmissions.reduce((counts, submission) => {
      const key = submission.status || "Pending";
      counts[key] = (counts[key] || 0) + 1;
      counts.All = (counts.All || 0) + 1;
      return counts;
    }, {});
  }, [isReviewer, nxtExceptionSubmissions]);

  const agingDataUpdateRequests = useMemo(
    () => dataUpdateRequests.filter(isAgingDataRequest),
    [dataUpdateRequests],
  );

  const agingResearchRequests = useMemo(
    () => researchRequests.filter(isAgingDataRequest),
    [researchRequests],
  );

  const attentionListRequests = useMemo(
    () => listRequests.filter(isListRequestNeedingAttention),
    [listRequests],
  );

  const attentionImportRuns = useMemo(
    () =>
      importRuns.filter((run) =>
        ["Needs attention", "Needs review"].includes(getImportRunState(run)),
      ),
    [importRuns],
  );

  const triageItemCount = useMemo(
    () =>
      agingDataUpdateRequests.length +
      agingResearchRequests.length +
      attentionListRequests.length +
      attentionImportRuns.length +
      nxtExceptionSubmissions.length,
    [
      agingDataUpdateRequests.length,
      agingResearchRequests.length,
      attentionImportRuns.length,
      attentionListRequests.length,
      nxtExceptionSubmissions.length,
    ],
  );

  const triageQueues = useMemo(
    () => [
      {
        id: "data-updates",
        title: "Aging data updates",
        description: `Open or in-progress for ${TRIAGE_AGING_DAYS}+ days without a queue update.`,
        actionLabel: "Open data updates",
        tab: DATA_UPDATES_TAB,
        filter: "Aging 5+ days",
        filterType: "data",
        items: agingDataUpdateRequests.map((request) => ({
          id: `data:${request.id}`,
          title: request.constituent_name || "Unknown constituent",
          detail: `${request.status || "Open"} · ${getAgeInDays(request.updated_at || request.created_at)} days since last queue update`,
        })),
      },
      {
        id: "research",
        title: "Aging research",
        description: `Open or in-progress for ${TRIAGE_AGING_DAYS}+ days without a queue update.`,
        actionLabel: "Open research",
        tab: RESEARCH_TAB,
        filter: "Aging 5+ days",
        filterType: "data",
        items: agingResearchRequests.map((request) => ({
          id: `research:${request.id}`,
          title: request.constituent_name || "Unknown constituent",
          detail: `${request.status || "Open"} · ${getAgeInDays(request.updated_at || request.created_at)} days since last queue update`,
        })),
      },
      {
        id: "list-requests",
        title: "List requests",
        description: "Urgent, past-due, or waiting on requester clarification.",
        actionLabel: "Open list requests",
        tab: LIST_REQUESTS_TAB,
        filter: "Needs attention",
        filterType: "list",
        items: attentionListRequests.map((request) => ({
          id: `list:${request.id}`,
          title: getListRequestTitle(request),
          detail: getListRequestAttentionReason(request) || "Needs attention",
        })),
      },
      {
        id: "imports",
        title: "Import review",
        description: "Saved import runs with unresolved review, conflict, or failure work.",
        actionLabel: "Open imports",
        tab: IMPORTS_TAB,
        items: attentionImportRuns.map((run) => ({
          id: `import:${run.id}`,
          title: run.sourceFilename || `Import run #${run.id}`,
          detail: `${getImportRunState(run)}${formatImportRunSummary(run.summary) ? ` · ${formatImportRunSummary(run.summary)}` : ""}`,
        })),
      },
      {
        id: "nxt-exceptions",
        title: "NXT exceptions",
        description: "Automated NXT activity that failed and needs follow-up.",
        actionLabel: "Open NXT exceptions",
        tab: NXT_EXCEPTIONS_TAB,
        items: nxtExceptionSubmissions.map((submission) => ({
          id: `exception:${submission.id}`,
          title: getSubmissionDisplayName(submission),
          detail: submission.blackbaud_sync_error || "NXT sync requires follow-up",
        })),
      },
    ],
    [
      agingDataUpdateRequests,
      agingResearchRequests,
      attentionImportRuns,
      attentionListRequests,
      nxtExceptionSubmissions,
    ],
  );

  const visibleDataRequests = useMemo(() => {
    let next = [...activeDataRequests];

    if (isReviewer && dataRequestFilter === "Aging 5+ days") {
      next = next.filter(isAgingDataRequest);
    } else if (isReviewer && dataRequestFilter !== "All") {
      next = next.filter((request) => (request.status || "Open") === dataRequestFilter);
    }

    return next.sort((a, b) => {
      const aDate = new Date(a.updated_at || a.created_at || 0).getTime();
      const bDate = new Date(b.updated_at || b.created_at || 0).getTime();
      if (dataRequestFilter === "Aging 5+ days") return aDate - bDate;
      return bDate - aDate;
    });
  }, [activeDataRequests, dataRequestFilter, isReviewer]);

  const importQueueCounts = useMemo(() => {
    if (!isReviewer) return {};

    return importRuns.reduce(
      (counts, run) => {
        const state = getImportRunState(run);
        counts[state] = (counts[state] || 0) + 1;
        counts.readyRows = (counts.readyRows || 0) + Number(run.readyCount || 0);
        counts.reviewRows =
          (counts.reviewRows || 0) +
          Number(run.needsReviewCount || 0) +
          Number(run.conflictCount || 0) +
          Number(run.failedCount || 0);
        counts.All = (counts.All || 0) + 1;
        return counts;
      },
      {},
    );
  }, [importRuns, isReviewer]);

  const visibleSubmissionGroups = useMemo(() => {
    let next =
      activeTab === NXT_EXCEPTIONS_TAB
        ? [...nxtExceptionSubmissions]
        : [...submissions];

    if (isReviewer && reviewFilter !== "All") {
      next = next.filter((submission) => (submission.status || "Pending") === reviewFilter);
    }

    const grouped = new Map();

    for (const submission of next) {
      const groupKey = submission.constituent_id
        ? `constituent:${submission.constituent_id}`
        : `submission:${submission.id}`;

      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          id: groupKey,
          constituentId: submission.constituent_id || null,
          linkedBlackbaudConstituentId: submission.blackbaud_constituent_id || null,
          title: getSubmissionDisplayName(submission),
          submissions: [],
          latestAt: 0,
        });
      }

      const entry = grouped.get(groupKey);
      entry.submissions.push(submission);
      const submittedAt = new Date(
        submission.date_submitted || submission.created_at || 0,
      ).getTime();
      if (submittedAt >= entry.latestAt) {
        entry.latestAt = submittedAt;
        entry.title = getSubmissionDisplayName(submission);
      }
      if (!entry.linkedBlackbaudConstituentId && submission.blackbaud_constituent_id) {
        entry.linkedBlackbaudConstituentId = submission.blackbaud_constituent_id;
      }
    }

    const groups = Array.from(grouped.values())
      .map((group) => ({
        ...group,
        submissions: [...group.submissions].sort((a, b) => {
          const aDate = new Date(a.date_submitted || a.created_at || 0).getTime();
          const bDate = new Date(b.date_submitted || b.created_at || 0).getTime();
          return bDate - aDate;
        }),
      }))
      .sort((a, b) => b.latestAt - a.latestAt);

    return groups;
  }, [activeTab, isReviewer, nxtExceptionSubmissions, reviewFilter, submissions]);

  useEffect(() => {
    const groupsToLoad = visibleSubmissionGroups.filter(
      (group) =>
        group.linkedBlackbaudConstituentId &&
        !blackbaudSummaries[group.linkedBlackbaudConstituentId],
    );

    if (groupsToLoad.length === 0) {
      return;
    }

    let active = true;

    async function loadBlackbaudSummaries() {
      const results = await Promise.allSettled(
        groupsToLoad.map(async (group) => {
          const constituentId = group.linkedBlackbaudConstituentId;
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
            groupsToLoad[index]?.linkedBlackbaudConstituentId || null;
          if (!constituentId) continue;

          if (result.status === "fulfilled") {
            const [, payload] = result.value;
            next[constituentId] = { status: "ready", payload };
          } else {
            if (!next[constituentId]) {
              next[constituentId] = { status: "error" };
            }
          }
        }
        return next;
      });
    }

    loadBlackbaudSummaries();

    return () => {
      active = false;
    };
  }, [blackbaudSummaries, visibleSubmissionGroups]);

  const visibleListRequests = useMemo(() => {
    let next = [...listRequests];

    if (isReviewer && listRequestFilter === "Needs attention") {
      next = next.filter(isListRequestNeedingAttention);
    } else if (isReviewer && listRequestFilter !== "All") {
      next = next.filter((request) => getListRequestStatus(request.status) === listRequestFilter);
    }

    return next.sort((a, b) => {
      if (isReviewer && a.queue_priority !== b.queue_priority) {
        return a.queue_priority - b.queue_priority;
      }
      const aDate = new Date(a.updated_at || a.created_at || 0).getTime();
      const bDate = new Date(b.updated_at || b.created_at || 0).getTime();
      return bDate - aDate;
    });
  }, [isReviewer, listRequests, listRequestFilter]);

  const taskCards = useMemo(() => {
    if (activeTab === TRIAGE_TAB && isReviewer) {
      return [
        {
          label: "Aging data work",
          value: agingDataUpdateRequests.length + agingResearchRequests.length,
          detail: `Open or in-progress for ${TRIAGE_AGING_DAYS}+ days without a queue update`,
        },
        {
          label: "List work",
          value: attentionListRequests.length,
          detail: "Urgent, past-due, or waiting on clarification",
        },
        {
          label: "NXT follow-up",
          value: nxtExceptionSubmissions.length,
          detail: "Automated NXT writes that need attention",
        },
      ];
    }

    if ([DATA_UPDATES_TAB, RESEARCH_TAB].includes(activeTab) && isReviewer) {
      const isResearchQueue = activeTab === RESEARCH_TAB;
      return [
        {
          label: isResearchQueue ? "Research requests" : "Data updates",
          value:
            (activeDataRequestCounts.Open || 0) +
            (activeDataRequestCounts["In Progress"] || 0),
          detail: isResearchQueue
            ? "Research requests that need Advancement Services"
            : "Contact, bio-demo, and record updates",
        },
        {
          label: "In progress",
          value: activeDataRequestCounts["In Progress"] || 0,
          detail: "Already being worked by Advancement Services",
        },
        {
          label: "Visible now",
          value: visibleDataRequests.length,
          detail: "Requests in the current queue view",
        },
      ];
    }

    if (activeTab === IMPORTS_TAB && isReviewer) {
      return [
        {
          label: "Ready to import",
          value: importQueueCounts.readyRows || 0,
          detail: "Reviewed rows ready for controlled NXT writes",
        },
        {
          label: "Need review",
          value: importQueueCounts.reviewRows || 0,
          detail: "Rows with unresolved review, conflict, or failure work",
        },
        {
          label: "Recent runs",
          value: importQueueCounts.All || 0,
          detail: "Saved import runs available in this workspace",
        },
      ];
    }

    if (activeTab === LIST_REQUESTS_TAB) {
      if (isReviewer) {
        return [
          {
            label: "Needs attention",
            value:
              (reviewerListRequestCounts.Pending || 0) +
              (reviewerListRequestCounts["Needs Clarification"] || 0),
            detail: "Requests still blocking completion",
          },
          {
            label: "Needs clarification",
            value: reviewerListRequestCounts["Needs Clarification"] || 0,
            detail: "Questions waiting on an MGO",
          },
          {
            label: "Visible now",
            value: visibleListRequests.length,
            detail: "Requests in the current view",
          },
        ];
      }

      return [
        {
          label: "My open requests",
          value: visibleListRequests.filter((request) => !isListRequestComplete(request)).length,
          detail: "Still in progress",
        },
        {
          label: "Need response",
          value: visibleListRequests.filter(
            (request) => getListRequestStatus(request.status) === "Needs Clarification",
          ).length,
          detail: "Waiting on your clarification",
        },
        {
          label: "Complete",
          value: visibleListRequests.filter((request) => isListRequestComplete(request)).length,
          detail: "Completed requests",
        },
      ];
    }

    if (activeTab === NXT_EXCEPTIONS_TAB && isReviewer) {
      return [
        {
          label: "NXT exceptions",
          value: reviewerExceptionCounts.All || 0,
          detail: "Automated writes that need follow-up",
        },
        {
          label: "Needs review",
          value:
            (reviewerExceptionCounts.Pending || 0) +
            (reviewerExceptionCounts["Needs Clarification"] || 0),
          detail: "Exceptions not yet cleared",
        },
        {
          label: "Visible now",
          value: visibleSubmissionGroups.length,
          detail: "Exception threads in this view",
        },
      ];
    }

    if (isReviewer) {
      return [
        {
          label: "Activity log",
          value: reviewerCounts.All || 0,
          detail: "Automated and legacy submission history",
        },
        {
          label: "NXT exceptions",
          value: reviewerExceptionCounts.All || 0,
          detail: "Synced activity that failed or needs attention",
        },
        {
          label: "Visible now",
          value: visibleSubmissionGroups.length,
          detail: "Threads in the current activity view",
        },
      ];
    }

    return [
      {
        label: "Need your follow-up",
        value: visibleSubmissionGroups.filter((group) =>
          group.submissions.some((submission) => submission.status === "Needs Clarification"),
        ).length,
        detail: "Threads waiting on your reply",
      },
      {
        label: "Recently approved",
        value: visibleSubmissionGroups.filter((group) =>
          group.submissions.some((submission) => submission.status === "Approved"),
        ).length,
        detail: "Approved threads in your tracker",
      },
      {
        label: "Visible now",
        value: visibleSubmissionGroups.length,
        detail: "Threads in your current view",
      },
    ];
  }, [
    activeTab,
    activeDataRequestCounts,
    agingDataUpdateRequests.length,
    agingResearchRequests.length,
    attentionListRequests.length,
    isReviewer,
    importQueueCounts,
    nxtExceptionSubmissions.length,
    reviewerCounts,
    reviewerExceptionCounts,
    reviewerListRequestCounts,
    visibleDataRequests,
    visibleListRequests,
    visibleSubmissionGroups,
  ]);

  function setReviewDraft(id, updates) {
    setReviewDrafts((current) => ({
      ...current,
      [id]: {
        status: current[id]?.status || "",
        reviewerNotes: current[id]?.reviewerNotes || "",
        ...updates,
      },
    }));
  }

  function setDataRequestDraft(id, updates) {
    const currentRequest = dataRequests.find((item) => item.id === id);
    setDataRequestDrafts((current) => ({
      ...current,
      [id]: {
        status: current[id]?.status ?? currentRequest?.status ?? "Open",
        reviewerNotes:
          current[id]?.reviewerNotes ?? currentRequest?.reviewer_notes ?? "",
        ...updates,
      },
    }));
  }

  function setClarificationDraft(id, value) {
    setClarificationDrafts((current) => ({
      ...current,
      [id]: value,
    }));
  }

  function setListRequestDraft(id, updates) {
    setListRequestDrafts((current) => ({
      ...current,
      [id]: {
        status: current[id]?.status || "",
        queuePriority: current[id]?.queuePriority || "",
        reviewerNotes: current[id]?.reviewerNotes || "",
        ...updates,
      },
    }));
  }

  function setListRequestResponseDraft(id, value) {
    setListRequestResponseDrafts((current) => ({
      ...current,
      [id]: value,
    }));
  }

  function toggleSubmissionGroup(groupId) {
    setExpandedSubmissionGroups((current) => ({
      ...current,
      [groupId]: !current[groupId],
    }));
  }

  async function saveDataRequest(item, overrides = {}) {
    if (!isReviewer) return;

    setUpdatingDataRequestId(item.id);
    setActionMessage("");
    setError("");

    try {
      const draft = dataRequestDrafts[item.id] || {};
      const response = await fetch(`/api/data-requests/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: overrides.status || draft.status || item.status || "Open",
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

      setDataRequests((current) =>
        current.map((request) =>
          request.id === item.id ? { ...request, ...payload } : request,
        ),
      );
      setDataRequestDrafts((current) => {
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      setActionMessage(
        `Data request for ${payload.constituent_name || item.constituent_name || "this constituent"} saved.`,
      );
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not update data request.");
    } finally {
      setUpdatingDataRequestId(null);
    }
  }

  async function saveReview(id) {
    setUpdatingId(id);
    setActionMessage("");
    setError("");

    try {
      const currentSubmission = submissions.find((item) => item.id === id);
      const draft = reviewDrafts[id] || {};
      const response = await fetch("/api/submissions/update-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: draft.status || currentSubmission?.status || "Pending",
          reviewerNotes:
            draft.reviewerNotes ?? currentSubmission?.reviewer_notes ?? "",
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to update submission review");
      }

      const updated = await response.json();
      setSubmissions((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      setReviewDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setActionMessage(`Submission #${updated.id} review saved.`);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not update submission review.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function resubmitForReview(id) {
    setUpdatingId(id);
    setActionMessage("");
    setError("");

    try {
      const clarificationResponse = String(clarificationDrafts[id] || "").trim();
      const response = await fetch("/api/submissions/resubmit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          clarificationResponse,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to resubmit submission");
      }

      const updated = await response.json();
      setSubmissions((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      setClarificationDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setActionMessage(`Submission #${updated.id} was resubmitted for review.`);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not resubmit submission.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function saveDiscussionItem(submission) {
    const draft = discussionDrafts[submission.id] || {
      subject: getDiscussionDefaultSubject(submission),
      body: "",
      dueDate: "",
      assignedUserId: "",
    };

    if (!draft.subject?.trim()) {
      setError("Please add a discussion subject before saving.");
      return;
    }

    setDiscussionSavingId(submission.id);
    setActionMessage("");
    setError("");

    try {
      const response = await fetch("/api/discussion-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: draft.subject.trim(),
          body: draft.body?.trim() || null,
          dueDate: draft.dueDate || null,
          assignedUserId: draft.assignedUserId || null,
          prospectId: submission.prospect_id || null,
          constituentId: submission.constituent_id || null,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to add team discussion item");
      }

      setDiscussionDrafts((current) => ({
        ...current,
        [submission.id]: {
          open: false,
          subject: getDiscussionDefaultSubject(submission),
          body: "",
          dueDate: "",
          assignedUserId: "",
        },
      }));
      setActionMessage(
        `${getSubmissionDisplayName(submission)} was added to Team Discussion.`,
      );
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not create team discussion item.");
    } finally {
      setDiscussionSavingId(null);
    }
  }

  async function saveListRequestReview(id) {
    setUpdatingListRequestId(id);
    setActionMessage("");
    setError("");

    try {
      const currentRequest = listRequests.find((item) => item.id === id);
      const draft = listRequestDrafts[id] || {};
      const nextStatus =
        draft.status || getListRequestStatus(currentRequest?.status) || "Pending";
      const nextReviewerNotes =
        draft.reviewerNotes ?? currentRequest?.reviewer_notes ?? "";

      if (nextStatus === "Needs Clarification" && !String(nextReviewerNotes).trim()) {
        setError("Add reviewer notes with the clarification question before sending this back to the MGO.");
        setUpdatingListRequestId(null);
        return;
      }

      const response = await fetch("/api/list-requests/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status: nextStatus,
          queuePriority:
            Number(draft.queuePriority) ||
            currentRequest?.queue_priority ||
            2,
          reviewerNotes: nextReviewerNotes,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "Failed to update list request");
      }

      const updated = await response.json();
      setListRequests((current) =>
        current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
      );
      setListRequestDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setActionMessage(`List request #${updated.id} review saved.`);
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not update list request.");
    } finally {
      setUpdatingListRequestId(null);
    }
  }

  async function submitListRequestClarification(id) {
    setRespondingListRequestId(id);
    setActionMessage("");
    setError("");

    try {
      const responseText = String(listRequestResponseDrafts[id] || "").trim();
      if (!responseText) {
        setError("Add a response before sending this back to Advancement Services.");
        setRespondingListRequestId(null);
        return;
      }

      const response = await fetch("/api/list-requests/respond", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          clarificationResponse: responseText,
        }),
      });

      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to send clarification response");
      }

      setListRequests((current) =>
        current.map((item) => (item.id === payload.id ? { ...item, ...payload } : item)),
      );
      setListRequestResponseDrafts((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setActionMessage("Your response was sent to Advancement Services.");
    } catch (err) {
      console.error(err);
      setError(err.message || "Could not send clarification response.");
    } finally {
      setRespondingListRequestId(null);
    }
  }

  if (loading || !sessionUser || profileLoading) {
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
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", flexWrap: "wrap" }}>
            <div>
              <h1 style={{ margin: 0, fontSize: "28px", color: "#111827", fontWeight: 800 }}>
                {heading.title}
              </h1>
              <p style={{ margin: "10px 0 0", color: "#6B7280", fontSize: "14px", lineHeight: 1.6 }}>
                {heading.subtitle}
              </p>
            </div>
            <div
              style={{
                minWidth: "220px",
                backgroundColor: "#F9FAFB",
                border: "1px solid #E5E7EB",
                borderRadius: "14px",
                padding: "14px 16px",
              }}
            >
              <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                Signed in as
              </div>
              <div style={{ marginTop: "8px", fontSize: "15px", fontWeight: 700, color: "#111827" }}>
                {profile?.name || sessionUser?.name || "User"}
              </div>
              <div style={{ marginTop: "4px", fontSize: "13px", color: "#6B7280" }}>
                {profile?.email || sessionUser?.email}
              </div>
              <div style={{ marginTop: "10px", fontSize: "13px", fontWeight: 600, color: "#6A5BFF", textTransform: "capitalize" }}>
                Role: {effectiveRole || profile?.role || "mgo"}
              </div>
            </div>
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

        <div
          style={{
            backgroundColor: "white",
            borderRadius: "18px",
            border: "1px solid #E5E7EB",
            padding: "18px",
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
            {taskCards.map((card) => (
              <div
                key={card.label}
                style={{
                  borderRadius: "14px",
                  border: "1px solid #E5E7EB",
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
                  {card.label}
                </div>
                <div style={{ fontSize: "24px", fontWeight: 800, color: "#111827" }}>
                  {card.value}
                </div>
                <div style={{ marginTop: "4px", fontSize: "13px", color: "#6B7280" }}>
                  {card.detail}
                </div>
              </div>
            ))}
          </div>

          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              padding: "4px 4px 16px",
              borderBottom: "1px solid #E5E7EB",
              marginBottom: "18px",
            }}
          >
            {(
              isReviewer
                ? [
                    {
                      id: TRIAGE_TAB,
                      label: "Needs Attention",
                      count: triageItemCount,
                    },
                    {
                      id: DATA_UPDATES_TAB,
                      label: "Data Updates",
                      count:
                        (dataUpdateCounts.Open || 0) +
                        (dataUpdateCounts["In Progress"] || 0),
                    },
                    {
                      id: RESEARCH_TAB,
                      label: "Research",
                      count:
                        (researchRequestCounts.Open || 0) +
                        (researchRequestCounts["In Progress"] || 0),
                    },
                    {
                      id: LIST_REQUESTS_TAB,
                      label: "List Requests",
                      count: listRequests.filter((request) => !isListRequestComplete(request)).length,
                    },
                    {
                      id: IMPORTS_TAB,
                      label: "Imports",
                      count: importQueueCounts.All || 0,
                    },
                    {
                      id: NXT_EXCEPTIONS_TAB,
                      label: "NXT Exceptions",
                      count: reviewerExceptionCounts.All || 0,
                    },
                    {
                      id: ACTIVITY_LOG_TAB,
                      label: "Activity Log",
                      count: submissions.length,
                    },
                  ]
                : [
                    { id: ACTIVITY_LOG_TAB, label: "Submissions", count: submissions.length },
                    { id: LIST_REQUESTS_TAB, label: "List Requests", count: listRequests.length },
                  ]
            ).map((tab) => {
              const selected = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  style={{
                    borderRadius: "999px",
                    border: selected ? "2px solid #6A5BFF" : "1px solid #D1D5DB",
                    backgroundColor: selected ? "#EDE9FE" : "white",
                    color: selected ? "#5B21B6" : "#374151",
                    padding: "10px 14px",
                    fontSize: "13px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {tab.label} ({tab.count})
                </button>
              );
            })}
          </div>

          {isReviewer && [DATA_UPDATES_TAB, RESEARCH_TAB].includes(activeTab) ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                flexWrap: "wrap",
                padding: "4px 4px 16px",
                borderBottom: "1px solid #E5E7EB",
                marginBottom: "18px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#6B7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: "10px",
                  }}
                >
                  Filter {activeTab === RESEARCH_TAB ? "research" : "data update"} queue
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {["Open", "In Progress", "Aging 5+ days", "Completed", "Declined", "All"].map(
                    (status) => {
                      const selected = dataRequestFilter === status;
                      const count =
                        status === "Aging 5+ days"
                          ? activeTab === RESEARCH_TAB
                            ? agingResearchRequests.length
                            : agingDataUpdateRequests.length
                          : activeDataRequestCounts[status] || 0;
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setDataRequestFilter(status)}
                          style={{
                            borderRadius: "999px",
                            border: selected ? "2px solid #6A5BFF" : "1px solid #D1D5DB",
                            backgroundColor: selected ? "#EDE9FE" : "white",
                            color: selected ? "#5B21B6" : "#374151",
                            padding: "8px 12px",
                            fontSize: "13px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {status} ({count})
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              <div
                style={{
                  minWidth: "220px",
                  padding: "12px 14px",
                  borderRadius: "14px",
                  backgroundColor: "#F9FAFB",
                  border: "1px solid #E5E7EB",
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
                  Queue snapshot
                </div>
                <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.7 }}>
                  <div>Open: {activeDataRequestCounts.Open || 0}</div>
                  <div>In Progress: {activeDataRequestCounts["In Progress"] || 0}</div>
                  <div>
                    Aging {TRIAGE_AGING_DAYS}+ days:{" "}
                    {activeTab === RESEARCH_TAB
                      ? agingResearchRequests.length
                      : agingDataUpdateRequests.length}
                  </div>
                  <div>Completed: {activeDataRequestCounts.Completed || 0}</div>
                  <div>Total: {activeDataRequestCounts.All || 0}</div>
                </div>
              </div>
            </div>
          ) : null}

          {isReviewer && [ACTIVITY_LOG_TAB, NXT_EXCEPTIONS_TAB].includes(activeTab) ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                flexWrap: "wrap",
                padding: "4px 4px 16px",
                borderBottom: "1px solid #E5E7EB",
                marginBottom: "18px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#6B7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: "10px",
                  }}
                >
                  Filter queue
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {["Pending", "Needs Clarification", "Ready for CRM", "Approved", "All"].map(
                    (status) => {
                      const selected = reviewFilter === status;
                      const counts =
                        activeTab === NXT_EXCEPTIONS_TAB
                          ? reviewerExceptionCounts
                          : reviewerCounts;
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setReviewFilter(status)}
                          style={{
                            borderRadius: "999px",
                            border: selected ? "2px solid #6A5BFF" : "1px solid #D1D5DB",
                            backgroundColor: selected ? "#EDE9FE" : "white",
                            color: selected ? "#5B21B6" : "#374151",
                            padding: "8px 12px",
                            fontSize: "13px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {status} ({counts[status] || 0})
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              <div
                style={{
                  minWidth: "220px",
                  padding: "12px 14px",
                  borderRadius: "14px",
                  backgroundColor: "#F9FAFB",
                  border: "1px solid #E5E7EB",
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
                  Queue snapshot
                </div>
                <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.7 }}>
                  <div>
                    Pending:{" "}
                    {(activeTab === NXT_EXCEPTIONS_TAB
                      ? reviewerExceptionCounts.Pending
                      : reviewerCounts.Pending) || 0}
                  </div>
                  <div>
                    Needs Clarification:{" "}
                    {(activeTab === NXT_EXCEPTIONS_TAB
                      ? reviewerExceptionCounts["Needs Clarification"]
                      : reviewerCounts["Needs Clarification"]) || 0}
                  </div>
                  <div>
                    Ready for CRM:{" "}
                    {(activeTab === NXT_EXCEPTIONS_TAB
                      ? reviewerExceptionCounts["Ready for CRM"]
                      : reviewerCounts["Ready for CRM"]) || 0}
                  </div>
                  <div>
                    Total:{" "}
                    {(activeTab === NXT_EXCEPTIONS_TAB
                      ? reviewerExceptionCounts.All
                      : reviewerCounts.All) || 0}
                  </div>
                </div>
              </div>
            </div>
          ) : null}

          {isReviewer && activeTab === LIST_REQUESTS_TAB ? (
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "16px",
                flexWrap: "wrap",
                padding: "4px 4px 16px",
                borderBottom: "1px solid #E5E7EB",
                marginBottom: "18px",
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 700,
                    color: "#6B7280",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                    marginBottom: "10px",
                  }}
                >
                  Filter list queue
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  {["Needs attention", "Pending", "Needs Clarification", "Complete", "All"].map(
                    (status) => {
                      const selected = listRequestFilter === status;
                      const count =
                        status === "Needs attention"
                          ? attentionListRequests.length
                          : reviewerListRequestCounts[status] || 0;
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setListRequestFilter(status)}
                          style={{
                            borderRadius: "999px",
                            border: selected ? "2px solid #6A5BFF" : "1px solid #D1D5DB",
                            backgroundColor: selected ? "#EDE9FE" : "white",
                            color: selected ? "#5B21B6" : "#374151",
                            padding: "8px 12px",
                            fontSize: "13px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {status} ({count})
                        </button>
                      );
                    },
                  )}
                </div>
              </div>

              <div
                style={{
                  minWidth: "220px",
                  padding: "12px 14px",
                  borderRadius: "14px",
                  backgroundColor: "#F9FAFB",
                  border: "1px solid #E5E7EB",
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
                  Queue snapshot
                </div>
                <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.7 }}>
                  <div>Pending: {reviewerListRequestCounts.Pending || 0}</div>
                  <div>Needs Clarification: {reviewerListRequestCounts["Needs Clarification"] || 0}</div>
                  <div>Needs attention: {attentionListRequests.length}</div>
                  <div>Complete: {reviewerListRequestCounts.Complete || 0}</div>
                  <div>Total: {reviewerListRequestCounts.All || 0}</div>
                </div>
              </div>
            </div>
          ) : null}

          {activeTab === TRIAGE_TAB && isReviewer ? (
            <div style={{ display: "grid", gap: "16px" }}>
              <div
                style={{
                  padding: "14px 16px",
                  borderRadius: "14px",
                  border: "1px solid #FDE68A",
                  backgroundColor: "#FFFBEB",
                  color: "#78350F",
                  fontSize: "14px",
                  lineHeight: 1.6,
                }}
              >
                This is a triage view only. It surfaces existing work that may need attention;
                it does not change queue status, request ownership, or NXT data.
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "12px",
                }}
              >
                {triageQueues.map((queue) => (
                  <section
                    key={queue.id}
                    style={{
                      border: "1px solid #E5E7EB",
                      borderRadius: "16px",
                      padding: "16px",
                      backgroundColor: "#FFFFFF",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "12px",
                      }}
                    >
                      <div>
                        <h2 style={{ margin: 0, fontSize: "18px", color: "#111827" }}>
                          {queue.title}
                        </h2>
                        <p
                          style={{
                            margin: "6px 0 0",
                            color: "#6B7280",
                            fontSize: "13px",
                            lineHeight: 1.5,
                          }}
                        >
                          {queue.description}
                        </p>
                      </div>
                      <span
                        style={{
                          flexShrink: 0,
                          padding: "5px 10px",
                          borderRadius: "999px",
                          backgroundColor: queue.items.length ? "#FEF3C7" : "#ECFDF5",
                          color: queue.items.length ? "#92400E" : "#166534",
                          fontSize: "12px",
                          fontWeight: 700,
                        }}
                      >
                        {queue.items.length}
                      </span>
                    </div>

                    {queue.items.length ? (
                      <div style={{ display: "grid", gap: "8px", marginTop: "14px" }}>
                        {queue.items.slice(0, 3).map((item) => (
                          <div
                            key={item.id}
                            style={{
                              padding: "10px 12px",
                              borderRadius: "10px",
                              backgroundColor: "#F9FAFB",
                              border: "1px solid #E5E7EB",
                            }}
                          >
                            <div style={{ color: "#111827", fontSize: "14px", fontWeight: 700 }}>
                              {item.title}
                            </div>
                            <div
                              style={{
                                marginTop: "3px",
                                color: "#6B7280",
                                fontSize: "12px",
                                lineHeight: 1.5,
                              }}
                            >
                              {item.detail}
                            </div>
                          </div>
                        ))}
                        {queue.items.length > 3 ? (
                          <div style={{ color: "#6B7280", fontSize: "12px", fontWeight: 600 }}>
                            {queue.items.length - 3} more in this queue
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <div
                        style={{
                          marginTop: "14px",
                          color: "#6B7280",
                          fontSize: "13px",
                          lineHeight: 1.5,
                        }}
                      >
                        Nothing currently needs attention in this queue.
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab(queue.tab);
                        if (queue.filterType === "data") {
                          setDataRequestFilter(queue.filter);
                        }
                        if (queue.filterType === "list") {
                          setListRequestFilter(queue.filter);
                        }
                        if (queue.tab === NXT_EXCEPTIONS_TAB) {
                          setReviewFilter("All");
                        }
                      }}
                      style={{
                        width: "100%",
                        marginTop: "14px",
                        padding: "10px 12px",
                        borderRadius: "10px",
                        border: "1px solid #C7D2FE",
                        backgroundColor: "#EEF2FF",
                        color: "#4338CA",
                        fontSize: "14px",
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {queue.actionLabel}
                    </button>
                  </section>
                ))}
              </div>
            </div>
          ) : [DATA_UPDATES_TAB, RESEARCH_TAB].includes(activeTab) ? (
            dataRequestsLoading ? (
              <div style={{ padding: "18px 8px", color: "#6B7280", fontSize: "14px" }}>
                Loading {activeTab === RESEARCH_TAB ? "research requests" : "data updates"}...
              </div>
            ) : visibleDataRequests.length === 0 ? (
              <div style={{ padding: "18px 8px", color: "#6B7280", fontSize: "14px" }}>
                No {activeTab === RESEARCH_TAB ? "research requests" : "data updates"} match the current filter.
              </div>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {visibleDataRequests.map((request) => {
                  const colors = getStatusColors(request.status);
                  const draft = dataRequestDrafts[request.id] || {};
                  const selectedStatus = draft.status ?? request.status ?? "Open";
                  const reviewerNotes =
                    draft.reviewerNotes ?? request.reviewer_notes ?? "";
                  const providedDetails = formatDataRequestDetails(request.provided_data);

                  return (
                    <article
                      key={request.id}
                      style={{
                        border: "1px solid #E5E7EB",
                        borderRadius: "16px",
                        padding: "16px",
                        backgroundColor: "#FFFFFF",
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                        gap: "16px",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <span
                            style={{
                              backgroundColor: colors.bg,
                              color: colors.fg,
                              padding: "4px 10px",
                              borderRadius: "999px",
                              fontSize: "12px",
                              fontWeight: 700,
                            }}
                          >
                            {request.status || "Open"}
                          </span>
                          <span
                            style={{
                              backgroundColor: "#EEF2FF",
                              color: "#3730A3",
                              padding: "4px 10px",
                              borderRadius: "999px",
                              fontSize: "12px",
                              fontWeight: 700,
                            }}
                          >
                            {request.request_type || "Record update"}
                          </span>
                          {request.source_context ? (
                            <span
                              style={{
                                backgroundColor: "#F3F4F6",
                                color: "#4B5563",
                                padding: "4px 10px",
                                borderRadius: "999px",
                                fontSize: "12px",
                                fontWeight: 700,
                              }}
                            >
                              {formatDataRequestSource(request.source_context)}
                            </span>
                          ) : null}
                        </div>

                        <h2 style={{ margin: "12px 0 0", fontSize: "19px", color: "#111827" }}>
                          {request.constituent_name || "Unknown constituent"}
                        </h2>
                        <div style={{ marginTop: "6px", fontSize: "13px", color: "#6B7280", lineHeight: 1.5 }}>
                          Requested by {request.requester_name || request.requester_email || "Unknown"} · {formatDate(request.created_at)}
                          {request.owner_name ? ` · Portfolio: ${request.owner_name}` : ""}
                          {request.blackbaud_constituent_id ? ` · NXT ID ${request.blackbaud_constituent_id}` : ""}
                        </div>

                        <div
                          style={{
                            marginTop: "14px",
                            padding: "12px 14px",
                            borderRadius: "12px",
                            backgroundColor: "#F9FAFB",
                            border: "1px solid #E5E7EB",
                          }}
                        >
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                            Request details
                          </div>
                          <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                            {request.request_note || "No note provided."}
                          </div>
                        </div>

                        {providedDetails ? (
                          <div
                            style={{
                              marginTop: "12px",
                              padding: "12px 14px",
                              borderRadius: "12px",
                              backgroundColor: "#EFF6FF",
                              border: "1px solid #BFDBFE",
                            }}
                          >
                            <div style={{ fontSize: "12px", fontWeight: 700, color: "#1D4ED8", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                              Provided information
                            </div>
                            <div style={{ fontSize: "14px", color: "#1E3A8A", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                              {providedDetails}
                            </div>
                          </div>
                        ) : null}

                        {request.reviewer_notes ? (
                          <div
                            style={{
                              marginTop: "12px",
                              padding: "12px 14px",
                              borderRadius: "12px",
                              backgroundColor: "#ECFDF5",
                              border: "1px solid #A7F3D0",
                              color: "#065F46",
                              fontSize: "14px",
                              lineHeight: 1.6,
                            }}
                          >
                            <strong>Advancement Services note:</strong> {request.reviewer_notes}
                          </div>
                        ) : null}
                      </div>

                      <div>
                        <label
                          style={{
                            display: "block",
                            fontSize: "12px",
                            fontWeight: 700,
                            color: "#6B7280",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            marginBottom: "8px",
                          }}
                        >
                          Queue status
                        </label>
                        <select
                          value={selectedStatus}
                          disabled={updatingDataRequestId === request.id}
                          onChange={(event) =>
                            setDataRequestDraft(request.id, { status: event.target.value })
                          }
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: "10px",
                            border: "1px solid #D1D5DB",
                            backgroundColor: "white",
                            fontSize: "14px",
                            boxSizing: "border-box",
                          }}
                        >
                          {DATA_REQUEST_STATUSES.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>

                        <label
                          style={{
                            display: "block",
                            fontSize: "12px",
                            fontWeight: 700,
                            color: "#6B7280",
                            textTransform: "uppercase",
                            letterSpacing: "0.04em",
                            margin: "12px 0 8px",
                          }}
                        >
                          Reviewer notes
                        </label>
                        <textarea
                          value={reviewerNotes}
                          disabled={updatingDataRequestId === request.id}
                          onChange={(event) =>
                            setDataRequestDraft(request.id, {
                              reviewerNotes: event.target.value,
                            })
                          }
                          placeholder="Add how this was resolved or what is still needed."
                          rows={4}
                          style={{
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: "10px",
                            border: "1px solid #D1D5DB",
                            backgroundColor: "white",
                            fontSize: "14px",
                            resize: "vertical",
                            boxSizing: "border-box",
                          }}
                        />
                        <button
                          type="button"
                          disabled={updatingDataRequestId === request.id}
                          onClick={() => saveDataRequest(request)}
                          style={{
                            marginTop: "10px",
                            width: "100%",
                            padding: "10px 12px",
                            borderRadius: "10px",
                            border: "none",
                            backgroundColor: "#6A5BFF",
                            color: "white",
                            fontSize: "14px",
                            fontWeight: 700,
                            cursor: updatingDataRequestId === request.id ? "wait" : "pointer",
                            opacity: updatingDataRequestId === request.id ? 0.7 : 1,
                          }}
                        >
                          {updatingDataRequestId === request.id ? "Saving..." : "Save request"}
                        </button>
                        {request.status !== "Completed" ? (
                          <button
                            type="button"
                            disabled={updatingDataRequestId === request.id}
                            onClick={() => saveDataRequest(request, { status: "Completed" })}
                            style={{
                              marginTop: "8px",
                              width: "100%",
                              padding: "10px 12px",
                              borderRadius: "10px",
                              border: "1px solid #BBF7D0",
                              backgroundColor: "white",
                              color: "#166534",
                              fontSize: "14px",
                              fontWeight: 700,
                              cursor: updatingDataRequestId === request.id ? "wait" : "pointer",
                            }}
                          >
                            Mark complete
                          </button>
                        ) : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            )
          ) : activeTab === IMPORTS_TAB ? (
            importRunsLoading ? (
              <div style={{ padding: "18px 8px", color: "#6B7280", fontSize: "14px" }}>
                Loading import runs...
              </div>
            ) : importRuns.length === 0 ? (
              <div
                style={{
                  padding: "20px",
                  borderRadius: "14px",
                  border: "1px solid #E5E7EB",
                  backgroundColor: "#F9FAFB",
                  color: "#4B5563",
                  fontSize: "14px",
                  lineHeight: 1.6,
                }}
              >
                No saved import runs yet. Start a controlled import in the import workspace to
                create a reviewable NXT work item.
              </div>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                <div
                  style={{
                    padding: "14px 16px",
                    borderRadius: "14px",
                    border: "1px solid #DBEAFE",
                    backgroundColor: "#EFF6FF",
                    color: "#1E3A8A",
                    fontSize: "14px",
                    lineHeight: 1.6,
                  }}
                >
                  Import runs are controlled NXT work. Open the import workspace to review a run,
                  send an individual record, or apply a selected batch. This queue does not change
                  any import behavior.
                </div>
                {importRuns.map((run) => {
                  const state = getImportRunState(run);
                  const stateColors = getImportRunStateColors(state);
                  const summary = formatImportRunSummary(run.summary);
                  const reviewRows =
                    Number(run.needsReviewCount || 0) +
                    Number(run.conflictCount || 0) +
                    Number(run.failedCount || 0);

                  return (
                    <article
                      key={run.id}
                      style={{
                        border: "1px solid #E5E7EB",
                        borderRadius: "16px",
                        padding: "16px",
                        backgroundColor: "#FFFFFF",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "flex-start",
                          gap: "12px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontSize: "12px",
                              fontWeight: 700,
                              color: "#6B7280",
                              textTransform: "uppercase",
                              letterSpacing: "0.04em",
                            }}
                          >
                            Import run #{run.id}
                          </div>
                          <h2 style={{ margin: "6px 0 0", fontSize: "19px", color: "#111827" }}>
                            {run.sourceFilename || "Untitled CSV"}
                          </h2>
                          <div style={{ marginTop: "6px", fontSize: "13px", color: "#6B7280" }}>
                            Last updated {formatDate(run.updatedAt || run.createdAt)}
                            {run.createdByName || run.createdByEmail
                              ? ` · Created by ${run.createdByName || run.createdByEmail}`
                              : ""}
                          </div>
                        </div>
                        <span
                          style={{
                            backgroundColor: stateColors.bg,
                            color: stateColors.fg,
                            border: `1px solid ${stateColors.border}`,
                            borderRadius: "999px",
                            padding: "5px 10px",
                            fontSize: "12px",
                            fontWeight: 700,
                          }}
                        >
                          {state}
                        </span>
                      </div>

                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                          gap: "10px",
                          marginTop: "16px",
                        }}
                      >
                        {[
                          ["Rows", Number(run.rowCount || 0)],
                          ["Ready", Number(run.readyCount || 0)],
                          ["Needs review", reviewRows],
                          ["Applied", Number(run.appliedCount || 0)],
                        ].map(([label, value]) => (
                          <div
                            key={label}
                            style={{
                              padding: "10px 12px",
                              border: "1px solid #E5E7EB",
                              borderRadius: "12px",
                              backgroundColor: "#F9FAFB",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                color: "#6B7280",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                              }}
                            >
                              {label}
                            </div>
                            <div style={{ marginTop: "4px", fontSize: "20px", fontWeight: 800, color: "#111827" }}>
                              {value}
                            </div>
                          </div>
                        ))}
                      </div>

                      {summary ? (
                        <div
                          style={{
                            marginTop: "14px",
                            color: "#4B5563",
                            fontSize: "14px",
                            lineHeight: 1.6,
                            whiteSpace: "pre-wrap",
                          }}
                        >
                          {summary}
                        </div>
                      ) : null}

                      <a
                        href="/constituency-import"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          marginTop: "16px",
                          padding: "9px 12px",
                          borderRadius: "10px",
                          border: "1px solid #C7D2FE",
                          backgroundColor: "#EEF2FF",
                          color: "#4338CA",
                          fontSize: "14px",
                          fontWeight: 700,
                          textDecoration: "none",
                        }}
                      >
                        Open import workspace
                      </a>
                    </article>
                  );
                })}
              </div>
            )
          ) : [ACTIVITY_LOG_TAB, NXT_EXCEPTIONS_TAB].includes(activeTab) ? (
          submissionsLoading ? (
            <div style={{ padding: "18px 8px", color: "#6B7280", fontSize: "14px" }}>
              Loading submissions...
            </div>
          ) : visibleSubmissionGroups.length === 0 ? (
            <div style={{ padding: "18px 8px", color: "#6B7280", fontSize: "14px" }}>
              {isReviewer
                ? "No submissions match the current filter."
                : "No submissions yet."}
            </div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {visibleSubmissionGroups.map((group) => {
                const blackbaudSummaryState = group.linkedBlackbaudConstituentId
                  ? blackbaudSummaries[group.linkedBlackbaudConstituentId]
                  : null;
                const blackbaudSummary = blackbaudSummaryState?.payload || null;
                const blackbaudConstituent =
                  blackbaudSummaryState?.payload?.mapped?.constituent || null;
                const blackbaudLifetimeGiving =
                  blackbaudSummaryState?.payload?.mapped?.lifetimeGiving || null;
                const blackbaudAssignments =
                  blackbaudSummaryState?.payload?.mapped?.fundraiserAssignments || [];
                const isCollapsible = true;
                const isExpanded = isCollapsible
                  ? Boolean(expandedSubmissionGroups[group.id])
                  : true;

                return (
                  <article
                    key={group.id}
                    id={`thread-${group.id}`}
                    style={{
                      border: "1px solid #E5E7EB",
                      borderRadius: "16px",
                      padding: "16px",
                      backgroundColor: "#FFFFFF",
                    }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                        gap: "14px",
                        flexWrap: "wrap",
                        alignItems: "flex-start",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <h2 style={{ margin: 0, fontSize: "17px", color: "#111827" }}>
                            {group.title}
                          </h2>
                          {group.constituentId ? (
                            <span
                              style={{
                                backgroundColor: "#F3F4F6",
                                color: "#4B5563",
                                padding: "4px 10px",
                                borderRadius: "999px",
                                fontSize: "12px",
                                fontWeight: 700,
                              }}
                            >
                              Linked thread
                            </span>
                          ) : null}
                        </div>
                        <div style={{ marginTop: "6px", fontSize: "14px", color: "#6B7280" }}>
                          {group.submissions.length} submission{group.submissions.length === 1 ? "" : "s"} in this thread
                        </div>
                        <div style={{ marginTop: "6px", fontSize: "13px", color: "#6B7280" }}>
                          Latest activity {formatDate(group.latestAt)}
                        </div>
                      </div>
                      {isCollapsible ? (
                        <button
                          type="button"
                          onClick={() => toggleSubmissionGroup(group.id)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "8px",
                            padding: "8px 12px",
                            borderRadius: "999px",
                            border: "1px solid #D1D5DB",
                            backgroundColor: "white",
                            color: "#374151",
                            fontSize: "13px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {isExpanded ? (
                            <>
                              <ChevronUp size={16} />
                              Hide related submissions
                            </>
                          ) : (
                            <>
                              <ChevronDown size={16} />
                              View all related submissions
                            </>
                          )}
                        </button>
                      ) : null}
                    </div>

                    {group.linkedBlackbaudConstituentId ? (
                      <div
                        style={{
                          marginTop: "16px",
                          padding: "14px",
                          borderRadius: "12px",
                          border: "1px solid #DBEAFE",
                          backgroundColor: "#FAFCFF",
                        }}
                      >
                        <details>
                          <summary
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: "12px",
                              cursor: "pointer",
                              listStyle: "none",
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
                                Synced NXT record
                              </div>
                              {blackbaudConstituent?.lookupId ? (
                                <div style={{ marginTop: "4px", fontSize: "12px", color: "#4B5563" }}>
                                  Lookup ID: {blackbaudConstituent.lookupId}
                                </div>
                              ) : null}
                            </div>
                            <div
                              style={{
                                fontSize: "12px",
                                fontWeight: 700,
                                color: "#1D4ED8",
                                backgroundColor: "#EFF6FF",
                                border: "1px solid #BFDBFE",
                                borderRadius: "999px",
                                padding: "4px 10px",
                              }}
                            >
                              View NXT summary
                            </div>
                          </summary>

                          <div style={{ marginTop: "12px" }}>
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
                                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", marginBottom: "6px" }}>
                                      Constituent
                                    </div>
                                    <div style={{ fontSize: "14px", color: "#111827" }}>
                                      {blackbaudConstituent?.name || "Unavailable"}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", marginBottom: "6px" }}>
                                      Email
                                    </div>
                                    <div style={{ fontSize: "14px", color: "#111827" }}>
                                      {blackbaudConstituent?.email || "Unavailable"}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", marginBottom: "6px" }}>
                                      Phone
                                    </div>
                                    <div style={{ fontSize: "14px", color: "#111827" }}>
                                      {blackbaudConstituent?.phone || "Unavailable"}
                                    </div>
                                  </div>
                                  <div>
                                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", marginBottom: "6px" }}>
                                      Lifetime Giving
                                    </div>
                                    <div style={{ fontSize: "14px", color: "#111827" }}>
                                      {formatBlackbaudCurrency(blackbaudLifetimeGiving?.totalGiving)}
                                    </div>
                                  </div>
                                </div>
                                {blackbaudAssignments.length > 0 ? (
                                  <div style={{ marginTop: "12px", fontSize: "13px", color: "#374151" }}>
                                    Active assignment:{" "}
                                    <strong>{blackbaudAssignments[0]?.type || "Unavailable"}</strong>
                                  </div>
                                ) : null}
                              </>
                            )}
                          </div>
                        </details>
                      </div>
                    ) : null}

                    <div
                      style={{
                        display: isExpanded ? "grid" : "none",
                        gap: "12px",
                        marginTop: "16px",
                      }}
                    >
                      {group.submissions.map((submission) => {
                        const colors = getStatusColors(submission.status);
                        const emailMeta = getEmailStatusMeta(submission.notification_email_status);
                        const draft = reviewDrafts[submission.id];
                        const selectedStatus = draft?.status || submission.status || "Pending";
                        const reviewerNotes =
                          draft?.reviewerNotes ?? submission.reviewer_notes ?? "";
                        const clarificationResponse =
                          clarificationDrafts[submission.id] ?? "";
                        const discussionDraft = discussionDrafts[submission.id] || {
                          open: false,
                          subject: getDiscussionDefaultSubject(submission),
                          body: "",
                          dueDate: "",
                          assignedUserId: "",
                        };
                        const matchedConstituentRequest = parseMatchedConstituentRequest(
                          submission,
                          blackbaudSummary,
                        );
                        const displayNotes = matchedConstituentRequest?.additionalNotes?.length
                          ? matchedConstituentRequest.additionalNotes.join("\n\n")
                          : submission.notes;

                        return (
                          <div
                            key={submission.id}
                            id={`submission-${submission.id}`}
                            style={{
                              border: "1px solid #E5E7EB",
                              borderRadius: "14px",
                              padding: "16px",
                              backgroundColor: "#FFFFFF",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                gap: "14px",
                                flexWrap: "wrap",
                                alignItems: "flex-start",
                              }}
                            >
                              <div>
                                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                                  <h3 style={{ margin: 0, fontSize: "16px", color: "#111827" }}>
                                    {TYPE_LABELS[submission.submission_type] || "Submission"}
                                  </h3>
                                  <span
                                    style={{
                                      backgroundColor: colors.bg,
                                      color: colors.fg,
                                      padding: "4px 10px",
                                      borderRadius: "999px",
                                      fontSize: "12px",
                                      fontWeight: 700,
                                    }}
                                  >
                                    {submission.status}
                                  </span>
                                </div>
                                <div style={{ marginTop: "6px", fontSize: "13px", color: "#6B7280" }}>
                                  Submitted {formatDate(submission.date_submitted || submission.created_at)}
                                </div>
                              </div>

                              {isReviewer ? (
                                <div style={{ minWidth: "220px" }}>
                                  <label
                                    style={{
                                      display: "block",
                                      fontSize: "12px",
                                      fontWeight: 700,
                                      color: "#6B7280",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.04em",
                                      marginBottom: "8px",
                                    }}
                                  >
                                    Review status
                                  </label>
                                  <select
                                    value={selectedStatus}
                                    disabled={updatingId === submission.id}
                                    onChange={(event) =>
                                      setReviewDraft(submission.id, { status: event.target.value })
                                    }
                                    style={{
                                      width: "100%",
                                      padding: "10px 12px",
                                      borderRadius: "10px",
                                      border: "1px solid #D1D5DB",
                                      backgroundColor: "white",
                                      fontSize: "14px",
                                    }}
                                  >
                                    {REVIEW_STATUSES.map((status) => (
                                      <option key={status} value={status}>
                                        {status}
                                      </option>
                                    ))}
                                  </select>
                                  <label
                                    style={{
                                      display: "block",
                                      fontSize: "12px",
                                      fontWeight: 700,
                                      color: "#6B7280",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.04em",
                                      margin: "12px 0 8px",
                                    }}
                                  >
                                    Reviewer notes
                                  </label>
                                  <textarea
                                    value={reviewerNotes}
                                    disabled={updatingId === submission.id}
                                    onChange={(event) =>
                                      setReviewDraft(submission.id, {
                                        reviewerNotes: event.target.value,
                                      })
                                    }
                                    placeholder="Add context, follow-up questions, or CRM instructions."
                                    rows={4}
                                    style={{
                                      width: "100%",
                                      padding: "10px 12px",
                                      borderRadius: "10px",
                                      border: "1px solid #D1D5DB",
                                      backgroundColor: "white",
                                      fontSize: "14px",
                                      resize: "vertical",
                                      boxSizing: "border-box",
                                    }}
                                  />
                                  <button
                                    type="button"
                                    disabled={updatingId === submission.id}
                                    onClick={() => saveReview(submission.id)}
                                    style={{
                                      marginTop: "10px",
                                      width: "100%",
                                      padding: "10px 12px",
                                      borderRadius: "10px",
                                      border: "none",
                                      backgroundColor: "#6A5BFF",
                                      color: "white",
                                      fontSize: "14px",
                                      fontWeight: 700,
                                      cursor: updatingId === submission.id ? "wait" : "pointer",
                                      opacity: updatingId === submission.id ? 0.7 : 1,
                                    }}
                                  >
                                    {updatingId === submission.id ? "Saving..." : "Save review"}
                                  </button>
                                </div>
                              ) : submission.status === "Needs Clarification" ? (
                                <div style={{ minWidth: "260px" }}>
                                  <label
                                    style={{
                                      display: "block",
                                      fontSize: "12px",
                                      fontWeight: 700,
                                      color: "#6B7280",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.04em",
                                      marginBottom: "8px",
                                    }}
                                  >
                                    Clarification response
                                  </label>
                                  <textarea
                                    value={clarificationResponse}
                                    disabled={updatingId === submission.id}
                                    onChange={(event) =>
                                      setClarificationDraft(
                                        submission.id,
                                        event.target.value,
                                      )
                                    }
                                    placeholder="Respond to Advancement Services and send this back for review."
                                    rows={4}
                                    style={{
                                      width: "100%",
                                      padding: "10px 12px",
                                      borderRadius: "10px",
                                      border: "1px solid #D1D5DB",
                                      backgroundColor: "white",
                                      fontSize: "14px",
                                      resize: "vertical",
                                      boxSizing: "border-box",
                                    }}
                                  />
                                  <button
                                    type="button"
                                    disabled={
                                      updatingId === submission.id ||
                                      !clarificationResponse.trim()
                                    }
                                    onClick={() => resubmitForReview(submission.id)}
                                    style={{
                                      marginTop: "10px",
                                      width: "100%",
                                      padding: "10px 12px",
                                      borderRadius: "10px",
                                      border: "none",
                                      backgroundColor: "#6A5BFF",
                                      color: "white",
                                      fontSize: "14px",
                                      fontWeight: 700,
                                      cursor:
                                        updatingId === submission.id ||
                                        !clarificationResponse.trim()
                                          ? "not-allowed"
                                          : "pointer",
                                      opacity:
                                        updatingId === submission.id ||
                                        !clarificationResponse.trim()
                                          ? 0.7
                                          : 1,
                                    }}
                                  >
                                    {updatingId === submission.id
                                      ? "Resubmitting..."
                                      : "Resubmit for review"}
                                  </button>
                                </div>
                              ) : null}
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                                gap: "12px",
                                marginTop: "16px",
                              }}
                            >
                              <div>
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                  Submitted by
                                </div>
                                <div style={{ fontSize: "14px", color: "#111827" }}>
                                  {submission.officer_name || "Unknown"}
                                </div>
                              </div>

                              {submission.reviewer_name ? (
                                <div>
                                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                    Reviewed by
                                  </div>
                                  <div style={{ fontSize: "14px", color: "#111827" }}>
                                    {submission.reviewer_name}
                                  </div>
                                </div>
                              ) : null}

                              <div>
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                  Email delivery
                                </div>
                                <div
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "8px",
                                    padding: "4px 10px",
                                    borderRadius: "999px",
                                    backgroundColor: emailMeta.bg,
                                    color: emailMeta.fg,
                                    fontSize: "12px",
                                    fontWeight: 700,
                                  }}
                                >
                                  {emailMeta.label}
                                </div>
                                {submission.notification_email_recipient ? (
                                  <div style={{ marginTop: "6px", fontSize: "13px", color: "#6B7280" }}>
                                    To: {submission.notification_email_recipient}
                                  </div>
                                ) : null}
                                {submission.notification_email_sent_at ? (
                                  <div style={{ marginTop: "4px", fontSize: "13px", color: "#6B7280" }}>
                                    Sent {formatDate(submission.notification_email_sent_at)}
                                  </div>
                                ) : null}
                              </div>

                              {submission.next_step ? (
                                <div>
                                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                    Next step
                                  </div>
                                  <div style={{ fontSize: "14px", color: "#111827" }}>
                                    {submission.next_step}
                                  </div>
                                </div>
                              ) : null}

                              {submission.interaction_type ? (
                                <div>
                                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                    Interaction
                                  </div>
                                  <div style={{ fontSize: "14px", color: "#111827", textTransform: "capitalize" }}>
                                    {submission.interaction_type}
                                  </div>
                                </div>
                              ) : null}

                              {submission.reviewer_notes ? (
                                <div style={{ gridColumn: "1 / -1" }}>
                                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                    Reviewer notes
                                  </div>
                                  <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                                    {submission.reviewer_notes}
                                  </div>
                                </div>
                              ) : null}
                            </div>

                            {matchedConstituentRequest ? (
                              <div
                                style={{
                                  marginTop: "16px",
                                  padding: "12px 14px",
                                  borderRadius: "12px",
                                  backgroundColor: "#F8FAFC",
                                  border: "1px solid #CBD5E1",
                                }}
                              >
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "10px" }}>
                                  Constituent update summary
                                </div>
                                <div
                                  style={{
                                    display: "grid",
                                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                                    gap: "12px",
                                  }}
                                >
                                  <div>
                                    <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                      Request type
                                    </div>
                                    <div style={{ fontSize: "14px", color: "#111827" }}>
                                      {matchedConstituentRequest.requestTypes.join(" + ")}
                                    </div>
                                  </div>
                                  {matchedConstituentRequest.lookupId ? (
                                    <div>
                                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                        Lookup ID
                                      </div>
                                      <div style={{ fontSize: "14px", color: "#111827" }}>
                                        {matchedConstituentRequest.lookupId}
                                      </div>
                                    </div>
                                  ) : null}
                                  {matchedConstituentRequest.emailUpdate ? (
                                    <div>
                                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                        Email update
                                      </div>
                                      <div style={{ fontSize: "14px", color: "#111827" }}>
                                        {matchedConstituentRequest.emailUpdate}
                                      </div>
                                    </div>
                                  ) : null}
                                  {matchedConstituentRequest.phoneUpdate ? (
                                    <div>
                                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                        Phone update
                                      </div>
                                      <div style={{ fontSize: "14px", color: "#111827" }}>
                                        {matchedConstituentRequest.phoneUpdate}
                                      </div>
                                    </div>
                                  ) : null}
                                  {matchedConstituentRequest.organizationUpdate ? (
                                    <div>
                                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                        Organization update
                                      </div>
                                      <div style={{ fontSize: "14px", color: "#111827" }}>
                                        {matchedConstituentRequest.organizationUpdate}
                                      </div>
                                    </div>
                                  ) : null}
                                  {matchedConstituentRequest.assignmentRequest ? (
                                    <div style={{ gridColumn: "1 / -1" }}>
                                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                        Assignment request
                                      </div>
                                      <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6 }}>
                                        {matchedConstituentRequest.assignmentRequest}
                                      </div>
                                    </div>
                                  ) : null}
                                  {matchedConstituentRequest.dataUpdateDetails ? (
                                    <div style={{ gridColumn: "1 / -1" }}>
                                      <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                                        Data update details
                                      </div>
                                      <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                                        {matchedConstituentRequest.dataUpdateDetails}
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            ) : null}

                            {submission.notes ? (
                              <div
                                style={{
                                  marginTop: "16px",
                                  padding: "12px 14px",
                                  borderRadius: "12px",
                                  backgroundColor: "#F9FAFB",
                                  border: "1px solid #E5E7EB",
                                }}
                              >
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                                  {matchedConstituentRequest ? "Additional notes" : "Notes"}
                                </div>
                                <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                                  {displayNotes}
                                </div>
                              </div>
                            ) : null}

                            {submission.notification_email_error ? (
                              <div
                                style={{
                                  marginTop: "16px",
                                  padding: "12px 14px",
                                  borderRadius: "12px",
                                  backgroundColor: "#FEF2F2",
                                  border: "1px solid #FECACA",
                                }}
                              >
                                <div style={{ fontSize: "12px", fontWeight: 700, color: "#991B1B", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                                  Email error
                                </div>
                                <div style={{ fontSize: "13px", color: "#991B1B", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                                  {submission.notification_email_error}
                                </div>
                              </div>
                            ) : null}

                            <div
                              style={{
                                marginTop: "16px",
                                padding: "14px",
                                borderRadius: "12px",
                                border: "1px solid #DDD6FE",
                                backgroundColor: "#F5F3FF",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  gap: "12px",
                                  flexWrap: "wrap",
                                  alignItems: "center",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                  <MessageSquare size={16} color="#5B21B6" />
                                  <div>
                                    <div
                                      style={{
                                        fontSize: "13px",
                                        fontWeight: 700,
                                        color: "#5B21B6",
                                      }}
                                    >
                                      Team discussion
                                    </div>
                                    <div style={{ marginTop: "4px", fontSize: "12px", color: "#6B7280" }}>
                                      Internal-only follow-up tied to this submission.
                                    </div>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    updateDiscussionDraft(submission, {
                                      open: !discussionDraft.open,
                                    })
                                  }
                                  style={{
                                    padding: "9px 12px",
                                    borderRadius: "10px",
                                    border: "1px solid #C4B5FD",
                                    backgroundColor: "white",
                                    color: "#5B21B6",
                                    fontSize: "13px",
                                    fontWeight: 700,
                                    cursor: "pointer",
                                  }}
                                >
                                  {discussionDraft.open ? "Close" : "Add to Team Discussion"}
                                </button>
                              </div>

                              {discussionDraft.open ? (
                                <div style={{ marginTop: "14px", display: "grid", gap: "12px" }}>
                                  <div>
                                    <label
                                      style={{
                                        display: "block",
                                        fontSize: "12px",
                                        fontWeight: 700,
                                        color: "#6B7280",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.04em",
                                        marginBottom: "6px",
                                      }}
                                    >
                                      Discussion subject
                                    </label>
                                    <input
                                      type="text"
                                      value={discussionDraft.subject}
                                      onChange={(event) =>
                                        updateDiscussionDraft(submission, {
                                          subject: event.target.value,
                                        })
                                      }
                                      style={{
                                        width: "100%",
                                        padding: "10px 12px",
                                        borderRadius: "10px",
                                        border: "1px solid #D1D5DB",
                                        backgroundColor: "white",
                                        fontSize: "14px",
                                        boxSizing: "border-box",
                                      }}
                                    />
                                  </div>
                                  <div>
                                    <label
                                      style={{
                                        display: "block",
                                        fontSize: "12px",
                                        fontWeight: 700,
                                        color: "#6B7280",
                                        textTransform: "uppercase",
                                        letterSpacing: "0.04em",
                                        marginBottom: "6px",
                                      }}
                                    >
                                      Discussion notes
                                    </label>
                                    <textarea
                                      value={discussionDraft.body}
                                      onChange={(event) =>
                                        updateDiscussionDraft(submission, {
                                          body: event.target.value,
                                        })
                                      }
                                      placeholder="What should the team discuss or follow up on?"
                                      rows={3}
                                      style={{
                                        width: "100%",
                                        padding: "10px 12px",
                                        borderRadius: "10px",
                                        border: "1px solid #D1D5DB",
                                        backgroundColor: "white",
                                        fontSize: "14px",
                                        resize: "vertical",
                                        boxSizing: "border-box",
                                      }}
                                    />
                                  </div>
                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns:
                                        "minmax(160px, 220px) minmax(220px, 1fr)",
                                      gap: "12px",
                                    }}
                                  >
                                    <div>
                                      <label
                                        style={{
                                          display: "block",
                                          fontSize: "12px",
                                          fontWeight: 700,
                                          color: "#6B7280",
                                          textTransform: "uppercase",
                                          letterSpacing: "0.04em",
                                          marginBottom: "6px",
                                        }}
                                      >
                                        Discuss by
                                      </label>
                                      <input
                                        type="date"
                                        value={discussionDraft.dueDate}
                                        onChange={(event) =>
                                          updateDiscussionDraft(submission, {
                                            dueDate: event.target.value,
                                          })
                                        }
                                        style={{
                                          width: "100%",
                                          padding: "10px 12px",
                                          borderRadius: "10px",
                                          border: "1px solid #D1D5DB",
                                          backgroundColor: "white",
                                          fontSize: "14px",
                                          boxSizing: "border-box",
                                        }}
                                      />
                                    </div>
                                    <div>
                                      <label
                                        style={{
                                          display: "block",
                                          fontSize: "12px",
                                          fontWeight: 700,
                                          color: "#6B7280",
                                          textTransform: "uppercase",
                                          letterSpacing: "0.04em",
                                          marginBottom: "6px",
                                        }}
                                      >
                                        Share with teammate
                                      </label>
                                      <select
                                        value={discussionDraft.assignedUserId}
                                        onChange={(event) =>
                                          updateDiscussionDraft(submission, {
                                            assignedUserId: event.target.value,
                                          })
                                        }
                                        style={{
                                          width: "100%",
                                          padding: "10px 12px",
                                          borderRadius: "10px",
                                          border: "1px solid #D1D5DB",
                                          backgroundColor: "white",
                                          fontSize: "14px",
                                          boxSizing: "border-box",
                                        }}
                                      >
                                        <option value="">Keep on my list</option>
                                        {mgoOptions.map((option) => (
                                          <option key={option.id} value={option.id}>
                                            {option.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                  <div
                                    style={{
                                      display: "flex",
                                      gap: "10px",
                                      flexWrap: "wrap",
                                      alignItems: "center",
                                    }}
                                  >
                                    <button
                                      type="button"
                                      onClick={() => saveDiscussionItem(submission)}
                                      disabled={discussionSavingId === submission.id}
                                      style={{
                                        padding: "10px 14px",
                                        borderRadius: "10px",
                                        border: "none",
                                        backgroundColor:
                                          discussionSavingId === submission.id
                                            ? "#C4B5FD"
                                            : "#6D28D9",
                                        color: "white",
                                        fontSize: "14px",
                                        fontWeight: 700,
                                        cursor:
                                          discussionSavingId === submission.id
                                            ? "wait"
                                            : "pointer",
                                      }}
                                    >
                                      {discussionSavingId === submission.id
                                        ? "Adding..."
                                        : "Add discussion item"}
                                    </button>
                                    <a
                                      href="/team-discussion"
                                      style={{
                                        color: "#5B21B6",
                                        fontSize: "13px",
                                        fontWeight: 700,
                                        textDecoration: "underline",
                                      }}
                                    >
                                      Open Team Discussion
                                    </a>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </article>
                );
              })}
            </div>
          )) : listRequestsLoading ? (
            <div style={{ padding: "18px 8px", color: "#6B7280", fontSize: "14px" }}>
              Loading list requests...
            </div>
          ) : visibleListRequests.length === 0 ? (
            <div style={{ padding: "18px 8px", color: "#6B7280", fontSize: "14px" }}>
              {isReviewer
                ? "No list requests match the current filter."
                : "No list requests yet."}
            </div>
          ) : (
            <div style={{ display: "grid", gap: "12px" }}>
              {visibleListRequests.map((request) => {
                const displayStatus = getListRequestStatus(request.status);
                const colors = getStatusColors(displayStatus);
                const draft = listRequestDrafts[request.id];
                const selectedStatus = draft?.status || displayStatus;
                const reviewerNotes =
                  draft?.reviewerNotes ?? request.reviewer_notes ?? "";
                const responseDraft = listRequestResponseDrafts[request.id] || "";
                const queuePriority =
                  draft?.queuePriority || request.queue_priority || 2;
                const needsClarification = displayStatus === "Needs Clarification";
                const requestComplete = displayStatus === "Complete";
                const isResponding = respondingListRequestId === request.id;

                return (
                  <article
                    key={request.id}
                    style={{
                      border: "1px solid #E5E7EB",
                      borderRadius: "16px",
                      padding: "16px",
                      backgroundColor: "#FFFFFF",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "14px",
                        flexWrap: "wrap",
                        alignItems: "flex-start",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                          <h2 style={{ margin: 0, fontSize: "17px", color: "#111827" }}>
                            {getListRequestTitle(request)}
                          </h2>
                          <span
                            style={{
                              backgroundColor: colors.bg,
                              color: colors.fg,
                              padding: "4px 10px",
                              borderRadius: "999px",
                              fontSize: "12px",
                              fontWeight: 700,
                            }}
                          >
                            {displayStatus}
                          </span>
                          {isReviewer ? (
                            <span
                              style={{
                                backgroundColor: "#F3F4F6",
                                color: "#374151",
                                padding: "4px 10px",
                                borderRadius: "999px",
                                fontSize: "12px",
                                fontWeight: 700,
                              }}
                            >
                              {QUEUE_PRIORITY_LABELS[request.queue_priority] || "Normal"}
                            </span>
                          ) : null}
                        </div>
                        <div style={{ marginTop: "6px", fontSize: "13px", color: "#6B7280" }}>
                          Requested {formatDate(request.created_at)}
                        </div>
                        {!isReviewer && needsClarification ? (
                          <div
                            style={{
                              marginTop: "12px",
                              padding: "12px 14px",
                              borderRadius: "12px",
                              backgroundColor: "#FFFBEB",
                              border: "1px solid #FCD34D",
                              color: "#92400E",
                              fontSize: "14px",
                              lineHeight: 1.5,
                            }}
                          >
                            <strong>! Advancement Services has a question.</strong>
                            <div style={{ marginTop: "6px", whiteSpace: "pre-wrap" }}>
                              {request.reviewer_notes ||
                                "Open this request and respond with the missing details."}
                            </div>
                            <label
                              style={{
                                display: "block",
                                marginTop: "12px",
                                fontSize: "12px",
                                fontWeight: 800,
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                              }}
                            >
                              Your response
                            </label>
                            <textarea
                              value={responseDraft}
                              disabled={isResponding}
                              onChange={(event) =>
                                setListRequestResponseDraft(request.id, event.target.value)
                              }
                              rows={3}
                              placeholder="Answer the question or add the missing detail."
                              style={{
                                width: "100%",
                                marginTop: "8px",
                                padding: "10px 12px",
                                borderRadius: "10px",
                                border: "1px solid #F59E0B",
                                backgroundColor: "white",
                                color: "#111827",
                                fontSize: "14px",
                                resize: "vertical",
                                boxSizing: "border-box",
                              }}
                            />
                            <button
                              type="button"
                              disabled={isResponding || !responseDraft.trim()}
                              onClick={() => submitListRequestClarification(request.id)}
                              style={{
                                marginTop: "10px",
                                padding: "9px 12px",
                                borderRadius: "10px",
                                border: "none",
                                backgroundColor:
                                  isResponding || !responseDraft.trim()
                                    ? "#FCD34D"
                                    : "#92400E",
                                color:
                                  isResponding || !responseDraft.trim()
                                    ? "#92400E"
                                    : "white",
                                fontSize: "13px",
                                fontWeight: 800,
                                cursor:
                                  isResponding || !responseDraft.trim()
                                    ? "not-allowed"
                                    : "pointer",
                              }}
                            >
                              {isResponding ? "Sending..." : "Send response"}
                            </button>
                          </div>
                        ) : null}
                        {!isReviewer && requestComplete ? (
                          <div
                            style={{
                              marginTop: "12px",
                              padding: "12px 14px",
                              borderRadius: "12px",
                              backgroundColor: "#ECFDF5",
                              border: "1px solid #A7F3D0",
                              color: "#065F46",
                              fontSize: "14px",
                              lineHeight: 1.5,
                            }}
                          >
                            <strong>Complete.</strong>
                            <div style={{ marginTop: "6px", whiteSpace: "pre-wrap" }}>
                              {request.reviewer_notes ||
                                "Advancement Services marked this list request complete."}
                            </div>
                          </div>
                        ) : null}
                      </div>

                      {isReviewer ? (
                        <div style={{ minWidth: "240px" }}>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                            Review status
                          </label>
                          <select
                            value={selectedStatus}
                            disabled={updatingListRequestId === request.id}
                            onChange={(event) =>
                              setListRequestDraft(request.id, { status: event.target.value })
                            }
                            style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", backgroundColor: "white", fontSize: "14px" }}
                          >
                            {LIST_REQUEST_STATUSES.map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", margin: "12px 0 8px" }}>
                            Queue priority
                          </label>
                          <select
                            value={queuePriority}
                            disabled={updatingListRequestId === request.id}
                            onChange={(event) =>
                              setListRequestDraft(request.id, { queuePriority: Number(event.target.value) })
                            }
                            style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", backgroundColor: "white", fontSize: "14px" }}
                          >
                            {Object.entries(QUEUE_PRIORITY_LABELS).map(([value, label]) => (
                              <option key={value} value={value}>
                                {label}
                              </option>
                            ))}
                          </select>
                          <label style={{ display: "block", fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", margin: "12px 0 8px" }}>
                            Reviewer notes
                          </label>
                          <textarea
                            value={reviewerNotes}
                            disabled={updatingListRequestId === request.id}
                            onChange={(event) =>
                              setListRequestDraft(request.id, { reviewerNotes: event.target.value })
                            }
                            rows={4}
                            placeholder="If you need clarification, write the question for the MGO here."
                            style={{ width: "100%", padding: "10px 12px", borderRadius: "10px", border: "1px solid #D1D5DB", backgroundColor: "white", fontSize: "14px", resize: "vertical", boxSizing: "border-box" }}
                          />
                          <button
                            type="button"
                            disabled={updatingListRequestId === request.id}
                            onClick={() => saveListRequestReview(request.id)}
                            style={{ marginTop: "10px", width: "100%", padding: "10px 12px", borderRadius: "10px", border: "none", backgroundColor: "#6A5BFF", color: "white", fontSize: "14px", fontWeight: 700, cursor: updatingListRequestId === request.id ? "wait" : "pointer", opacity: updatingListRequestId === request.id ? 0.7 : 1 }}
                          >
                            {updatingListRequestId === request.id ? "Saving..." : "Save review"}
                          </button>
                        </div>
                      ) : null}
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                        gap: "12px",
                        marginTop: "16px",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                          Requested by
                        </div>
                        <div style={{ fontSize: "14px", color: "#111827" }}>
                          {request.requester_name || request.requester_user_name || "Unknown"}
                        </div>
                      </div>
                      {request.date_needed ? (
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                            Date needed
                          </div>
                          <div style={{ fontSize: "14px", color: "#111827" }}>
                            {formatDate(request.date_needed)}
                          </div>
                        </div>
                      ) : null}
                      {request.output_type ? (
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                            Output type
                          </div>
                          <div style={{ fontSize: "14px", color: "#111827" }}>
                            {request.output_type}
                          </div>
                        </div>
                      ) : null}
                      {request.excel_fields?.length ? (
                        <div style={{ gridColumn: "1 / -1" }}>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                            Selected fields
                          </div>
                          <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6 }}>
                            {formatList(request.excel_fields)}
                            {request.excel_fields_other
                              ? `, Other: ${request.excel_fields_other}`
                              : ""}
                          </div>
                        </div>
                      ) : null}
                      {request.who_included?.length ? (
                        <div style={{ gridColumn: "1 / -1" }}>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                            Include
                          </div>
                          <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6 }}>
                            {formatList(request.who_included)}
                            {request.who_included_other
                              ? `, Other: ${request.who_included_other}`
                              : ""}
                          </div>
                        </div>
                      ) : null}
                      {request.exclusions?.length ? (
                        <div style={{ gridColumn: "1 / -1" }}>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                            Exclusions
                          </div>
                          <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6 }}>
                            {formatList(request.exclusions)}
                            {request.exclusions_other
                              ? `, Other: ${request.exclusions_other}`
                              : ""}
                          </div>
                        </div>
                      ) : null}
                      {request.giving_level || request.giving_level_custom ? (
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                            Giving filter
                          </div>
                          <div style={{ fontSize: "14px", color: "#111827" }}>
                            {request.giving_level || "Custom"}
                            {request.giving_level_custom
                              ? ` (${formatCurrency(request.giving_level_custom)})`
                              : ""}
                          </div>
                        </div>
                      ) : null}
                      {request.gift_timeframe ||
                      request.gift_timeframe_custom_start ||
                      request.gift_timeframe_custom_end ? (
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                            Gift timeframe
                          </div>
                          <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6 }}>
                            {request.gift_timeframe || "Custom"}
                            {request.gift_timeframe_custom_start || request.gift_timeframe_custom_end
                              ? ` (${request.gift_timeframe_custom_start || "?"} to ${request.gift_timeframe_custom_end || "?"})`
                              : ""}
                          </div>
                        </div>
                      ) : null}
                      {request.location_filter && request.location_filter !== "none" ? (
                        <div style={{ gridColumn: "1 / -1" }}>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                            Location filter
                          </div>
                          <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6 }}>
                            {[
                              request.location_filter,
                              request.location_state,
                              request.location_city,
                              request.location_zip,
                              request.location_radius_address,
                              request.location_radius_miles
                                ? `${request.location_radius_miles} mile radius`
                                : "",
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </div>
                        </div>
                      ) : null}
                      {request.assigned_mgo ? (
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                            Assigned MGO
                          </div>
                          <div style={{ fontSize: "14px", color: "#111827" }}>
                            {request.assigned_mgo}
                          </div>
                        </div>
                      ) : null}
                      {request.reviewer_name ? (
                        <div>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                            Reviewed by
                          </div>
                          <div style={{ fontSize: "14px", color: "#111827" }}>
                            {request.reviewer_name}
                          </div>
                        </div>
                      ) : null}
                      {request.reviewer_notes ? (
                        <div style={{ gridColumn: "1 / -1" }}>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                            Reviewer notes
                          </div>
                          <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                            {request.reviewer_notes}
                          </div>
                        </div>
                      ) : null}
                      {request.requester_response ? (
                        <div style={{ gridColumn: "1 / -1" }}>
                          <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "6px" }}>
                            MGO response
                          </div>
                          <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                            {request.requester_response}
                          </div>
                        </div>
                      ) : null}
                    </div>

                    {request.special_instructions ? (
                      <div
                        style={{
                          marginTop: "16px",
                          padding: "12px 14px",
                          borderRadius: "12px",
                          backgroundColor: "#F9FAFB",
                          border: "1px solid #E5E7EB",
                        }}
                      >
                        <div style={{ fontSize: "12px", fontWeight: 700, color: "#6B7280", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "8px" }}>
                          Special instructions
                        </div>
                        <div style={{ fontSize: "14px", color: "#111827", lineHeight: 1.6, whiteSpace: "pre-wrap" }}>
                          {request.special_instructions}
                        </div>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
