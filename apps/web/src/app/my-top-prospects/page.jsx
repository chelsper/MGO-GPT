"use client";
import ProspectDetailSummary from "./ProspectDetailSummary";
import ProspectDetailActivity from "./ProspectDetailActivity";
import ProspectOpportunityCard from "./ProspectOpportunityCard";
import {
  ActiveOpportunitySection,
  ClosedOpportunityHistory,
} from "./ProspectOpportunitySections";
import {
  formatCurrency,
  getOpportunityDisplayStatus,
  isFundedOpportunity,
  formatLongDate,
  workspaceCardStyle,
  sectionEyebrowStyle,
  detailLabelStyle,
  buildProspectTimeline,
} from "./prospectDetailPresentation";

import PortfolioTier from "./PortfolioTier";
import PortfolioRefreshProgress from "./PortfolioRefreshProgress";
import PortfolioCategoryManagerModal from "./PortfolioCategoryManagerModal";
import PortfolioFollowUpModal from "./PortfolioFollowUpModal";
import { AnnualGivingSocietyBadge } from "./ProspectGiving";
import { nxtProfileLinkStyle } from "./prospectPresentation";

import ProspectExportButton from "@/components/ProspectExport";
import ProspectRanking from "@/components/ProspectRanking";
import PortfolioWorklist from "@/components/PortfolioWorklist";
import { PortfolioContactRefreshProvider } from "@/components/PortfolioContactDetails";

import NextStepFields from "@/components/NextStepFields";
import WorkflowNotice from "@/components/WorkflowNotice";
import useUnsavedChangesWarning from "@/utils/useUnsavedChangesWarning";
import useProspectPledgeStatus from "@/utils/useProspectPledgeStatus";
import { buildPortfolioSignals, portfolioViewKey } from "@/utils/portfolioWorklist";

import { useEffect, useMemo, useRef, useState } from "react";
import useUser from "@/utils/useUser";
import usePortfolioRefreshRunner from "@/utils/usePortfolioRefreshRunner";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  Target,
  DollarSign,
  Star,
  X,
  MessageSquare,
  Mic,
} from "lucide-react";
import { getSyncBadge } from "@/app/api/utils/nxtTerminologyMap";
import {
  canEditWorkspaceAsRole,
  canUseExecutiveViewRole,
  canViewWorkspaceAsRole,
  getWorkspaceRoleLabel,
  isAdminRole,
} from "@/utils/workspaceRoles";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import OpportunityGiftLinkModal from "@/app/components/OpportunityGiftLinkModal";
import { getProspectFiscalYearLabel, matchesProspectFiscalYear } from "@/utils/prospectDisplay";
import ProspectRaisedCard from "./ProspectRaisedCard";
import OpportunityRollover from "./OpportunityRollover";
import ProspectActivityHighlights from "./ProspectActivityHighlights";
import { formatCalendarDate, partitionOpportunities } from "@/utils/prospectActivity";

const ASK_TYPES = [
  "Major Gift",
  "Endowed Scholarship",
  "Capital Project",
  "Program Support",
  "Annual Leadership Gift",
  "Planned Gift",
  "Other",
];

const FY_OPTIONS = ["FY25", "FY26", "FY27", "FY28", "FY29", "FY30"];
const ACTION_CATEGORIES = ["Meeting", "Phone Call", "Email", "Task"];
const ACTION_TYPES = [
  "Cultivation",
  "Identification / Discovery",
  "Other",
  "Qualification / Re-engagement",
  "Solicitation",
  "Stewardship",
];
const STEWARDSHIP_CATEGORY = "Stewardship";
const OPPORTUNITY_STAGE_OPTIONS = [
  "Identification",
  "Qualification",
  "Cultivation",
  "Solicitation",
  "Solicitation - Verbal",
  "Stewardship",
  "Funded",
  "Declined",
];

// The current-FY endpoint intentionally caps each request at 50 NXT records.
// Keep the portfolio request within that boundary so later assignments are not
// silently omitted when an MGO has a large portfolio.
const CURRENT_FY_GIVING_REQUEST_SIZE = 50;
const ANNUAL_GIVING_REQUEST_SIZE = 50;

const STATUS_COLORS = {
  Active: { bg: "#D1FAE5", text: "#065F46", border: "#A7F3D0" },
  "Closed – Gift Secured": {
    bg: "#DBEAFE",
    text: "#1E40AF",
    border: "#BFDBFE",
  },
  "Closed – Declined": { bg: "#FEE2E2", text: "#991B1B", border: "#FECACA" },
  Archived: { bg: "#F3F4F6", text: "#4B5563", border: "#D1D5DB" },
};

function StatusBadge({ status }) {
  const colors = STATUS_COLORS[status] || {
    bg: "#F3F4F6",
    text: "#374151",
    border: "#E5E7EB",
  };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "999px",
        fontSize: "11px",
        fontWeight: "600",
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        whiteSpace: "nowrap",
      }}
    >
      {status}
    </span>
  );
}

const ACTION_DICTATION_TARGET_LABELS = {
  notes: "Action notes",
  nextStep: "Next step",
};

function getActionDictationTargetLabel(target) {
  return ACTION_DICTATION_TARGET_LABELS[target] || "this field";
}

function appendActionDictationTranscript(existingValue, transcript) {
  const existingText = String(existingValue || "").trim();
  const transcriptText = String(transcript || "").trim();

  if (!existingText) return transcriptText;
  if (!transcriptText) return existingText;
  return `${existingText}\n\n${transcriptText}`;
}

function getActionDictationErrorMessage(errorCode) {
  switch (errorCode) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow microphone access for jumgogpt.app, then try again.";
    case "audio-capture":
      return "No microphone was found. Check that a microphone is connected and selected in your browser.";
    case "no-speech":
      return "No speech was detected. Check the selected microphone in Chrome, speak close to it, and try again.";
    case "network":
      return "Dictation could not reach the browser speech service. Check your connection and try again.";
    case "aborted":
      return "Dictation was stopped before any transcript was captured.";
    case "language-not-supported":
      return "This browser does not support English dictation for this microphone session.";
    default:
      return "Live dictation failed. Try again, or type the note manually if the browser keeps blocking the microphone.";
  }
}

function ActionDictationButton({
  target,
  label,
  dictationTarget,
  isRecording,
  onStart,
  onStop,
  disabled = false,
}) {
  const active = isRecording && dictationTarget === target;
  const isDisabled = disabled && !active;

  return (
    <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "8px" }}>
      <button
        type="button"
        disabled={isDisabled}
        onClick={() => (active ? onStop() : onStart(target))}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "8px",
          padding: "8px 12px",
          borderRadius: "999px",
          border: active ? "1px solid #FCA5A5" : "1px solid #D1D5DB",
          backgroundColor: active ? "#FEF2F2" : "white",
          color: active ? "#B91C1C" : "#374151",
          cursor: isDisabled ? "not-allowed" : "pointer",
          opacity: isDisabled ? 0.55 : 1,
          fontSize: "13px",
          fontWeight: 700,
        }}
      >
        <Mic size={14} />
        {active ? "Stop dictation" : `Dictate ${label}`}
      </button>
    </div>
  );
}

function chunkValues(values, size) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function formatShortDate(value) {
  return formatCalendarDate(value, {
    month: "short",
    day: "numeric",
  });
}

function normalizeDateInputValue(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      return trimmed.slice(0, 10);
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function getDateOnlyTimestamp(value) {
  const normalized = normalizeDateInputValue(value);
  if (!normalized) return null;
  const [year, month, day] = normalized.split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day).getTime();
}

function getTodayDateOnlyTimestamp() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.getTime();
}

function getProspectBlackbaudConstituentId(prospect) {
  return String(
    prospect?.linked_blackbaud_constituent_id ||
      prospect?.blackbaud_constituent_id ||
      "",
  ).trim();
}

function isRemovedTopProspectMatch(prospect, removalResult, fallbackProspectId) {
  const archivedIds = new Set(
    [
      ...(Array.isArray(removalResult?.archivedProspectIds)
        ? removalResult.archivedProspectIds
        : []),
      removalResult?.prospect?.id,
      fallbackProspectId,
    ]
      .filter((id) => id !== undefined && id !== null && id !== "")
      .map((id) => String(id)),
  );

  if (archivedIds.has(String(prospect?.id || ""))) {
    return true;
  }

  const archivedConstituentId = String(
    removalResult?.archivedConstituentId ||
      removalResult?.prospect?.constituent_id ||
      "",
  ).trim();
  if (
    archivedConstituentId &&
    String(prospect?.constituent_id || "").trim() === archivedConstituentId
  ) {
    return true;
  }

  const archivedBlackbaudConstituentId = String(
    removalResult?.linkedBlackbaudConstituentId || "",
  ).trim();
  return (
    Boolean(archivedBlackbaudConstituentId) &&
    getProspectBlackbaudConstituentId(prospect) === archivedBlackbaudConstituentId
  );
}

function matchesPortfolioSearch(person, normalizedSearch) {
  if (!normalizedSearch) return true;

  const searchableValues = [
    person?.name,
    person?.lookupId,
    person?.constituentId,
    person?.email,
    person?.phone,
    person?.address,
    person?.lifetimeGiving?.totalGiving,
    ...(Array.isArray(person?.assignmentTypes) ? person.assignmentTypes : []),
  ];

  return searchableValues.some((value) =>
    String(value || "").toLowerCase().includes(normalizedSearch),
  );
}

function isNeedsFollowUpProspect(prospect) {
  if (prospect.next_action_text && !prospect.next_action_completed_at) {
    return false;
  }

  if (!prospect.latest_activity_at) {
    return true;
  }

  const latestActivityAt = new Date(prospect.latest_activity_at);
  if (Number.isNaN(latestActivityAt.getTime())) {
    return true;
  }

  const staleDays = (Date.now() - latestActivityAt.getTime()) / (1000 * 60 * 60 * 24);
  return staleDays >= 21;
}

function getProspectNextAction(prospect) {
  if (prospect.next_action_text && !prospect.next_action_completed_at) {
    return {
      label: prospect.next_action_text,
      meta: prospect.next_action_due_date
        ? `Due ${formatShortDate(prospect.next_action_due_date)}`
        : "No due date",
      tone: { bg: "#E0F2FE", fg: "#075985", border: "#BAE6FD", soft: "#F0F9FF" },
    };
  }

  if (prospect.latest_submission_status === "Needs Clarification") {
    return {
      label: "Respond to clarification",
      meta: "Reviewer requested follow-up",
      tone: { bg: "#FEF3C7", fg: "#92400E", border: "#FCD34D", soft: "#FFFBEB" },
    };
  }

  if (isNeedsFollowUpProspect(prospect)) {
    if (!prospect.latest_activity_at) {
      return {
        label: "Needs follow-up",
        meta: "No recent activity yet",
        tone: { bg: "#FEE2E2", fg: "#991B1B", border: "#FECACA", soft: "#FEF2F2" },
      };
    }

    const latestActivityAt = new Date(prospect.latest_activity_at);
    const staleDays = (Date.now() - latestActivityAt.getTime()) / (1000 * 60 * 60 * 24);
    return {
      label: "Needs follow-up",
      meta:
        staleDays >= 1
          ? "Recent activity is stale"
          : "Follow-up recommended",
      tone: { bg: "#FEE2E2", fg: "#991B1B", border: "#FECACA", soft: "#FEF2F2" },
    };
  }

  if ((prospect.active_opportunity_count || 0) === 0) {
    return {
      label: "Add first opportunity",
      meta: "No active opportunities yet",
      tone: { bg: "#EDE9FE", fg: "#5B21B6", border: "#DDD6FE", soft: "#F5F3FF" },
    };
  }

  return {
    label: "Keep momentum",
    meta: "Recently active",
    tone: { bg: "#DCFCE7", fg: "#166534", border: "#BBF7D0", soft: "#F0FDF4" },
  };
}

function getNextStepBadge(prospect) {
  if (prospect.next_action_text && !prospect.next_action_completed_at) {
    if (prospect.next_action_due_date) {
      const dueDate = new Date(prospect.next_action_due_date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      dueDate.setHours(0, 0, 0, 0);
      if (dueDate < today) {
        return {
          label: "Next step overdue",
          bg: "#FEF2F2",
          border: "#FECACA",
          text: "#991B1B",
        };
      }
      const diffDays = Math.round((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 7) {
        return {
          label: "Next step due soon",
          bg: "#FFF7ED",
          border: "#FED7AA",
          text: "#C2410C",
        };
      }
    }

    return {
      label: "Next step set",
      bg: "#F0FDF4",
      border: "#BBF7D0",
      text: "#166534",
    };
  }

  return {
    label: "No next step",
    bg: "#F9FAFB",
    border: "#E5E7EB",
    text: "#4B5563",
  };
}

function getDiscussionBadge(prospect) {
  const openCount = Number(prospect.open_discussion_count || 0);
  const overdueCount = Number(prospect.overdue_discussion_count || 0);

  if (overdueCount > 0) {
    return {
      label: `${overdueCount} discussion${overdueCount === 1 ? "" : "s"} due`,
      bg: "#FEF2F2",
      border: "#FECACA",
      text: "#991B1B",
    };
  }

  if (openCount > 0) {
    return {
      label: `${openCount} open discussion${openCount === 1 ? "" : "s"}`,
      bg: "#F5F3FF",
      border: "#DDD6FE",
      text: "#5B21B6",
    };
  }

  return {
    label: "No open discussion",
    bg: "#F9FAFB",
    border: "#E5E7EB",
    text: "#4B5563",
  };
}

function getProspectFundedDisplayAmount(prospect = {}) {
  const linkedGiftAmount = Number(prospect.secured_linked_gift_amount);
  if (
    Number.isFinite(linkedGiftAmount) &&
    linkedGiftAmount > 0 &&
    Number(prospect.secured_linked_gift_count || 0) > 0
  ) {
    return linkedGiftAmount;
  }

  return prospect.closed_amount ?? prospect.ask_amount ?? 0;
}

function getProspectAskedDisplayAmount(prospect = {}) {
  const askedAmount = Number(prospect.ask_amount);
  if (!Number.isFinite(askedAmount) || askedAmount <= 0) {
    return null;
  }
  return askedAmount;
}

function shouldShowProspectAskedAmount(prospect = {}) {
  const askedAmount = getProspectAskedDisplayAmount(prospect);
  if (askedAmount == null) return false;
  const fundedAmount = getProspectFundedDisplayAmount(prospect);
  return Number(askedAmount) !== Number(fundedAmount);
}

function AddProspectModal({ onClose, onSubmit, isPending, errorMessage = "", initialData = null }) {
  const [name, setName] = useState(initialData?.prospectName || "");
  const [blackbaudMatches, setBlackbaudMatches] = useState([]);
  const [selectedBlackbaudMatch, setSelectedBlackbaudMatch] = useState(
    initialData?.selectedBlackbaudMatch || null,
  );

  useEffect(() => {
    if (!initialData) return;
    setName(initialData.prospectName || "");
    setSelectedBlackbaudMatch(initialData.selectedBlackbaudMatch || null);
    setBlackbaudMatches(
      initialData.selectedBlackbaudMatch ? [initialData.selectedBlackbaudMatch] : [],
    );
  }, [initialData]);

  useEffect(() => {
    const query = name.trim();
    if (query.length < 2) {
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
        console.error("Blackbaud prospect search error:", searchError);
        if (active) {
          setBlackbaudMatches([]);
        }
      }
    }, 180);

    return () => {
      active = false;
      clearTimeout(timeoutId);
    };
  }, [name]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      prospectName: name.trim(),
      blackbaudConstituentId:
        selectedBlackbaudMatch?.blackbaudConstituentId || null,
    });
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "480px",
          maxHeight: "90vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid #E5E7EB",
          }}
        >
          <h2
            style={{
              fontSize: "18px",
              fontWeight: "700",
              color: "#111827",
              margin: 0,
            }}
          >
            Add Prospect
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
            }}
          >
            <X size={20} color="#6B7280" />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "24px" }}>
          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "600",
                color: "#374151",
                marginBottom: "6px",
              }}
            >
              Prospect Name <span style={{ color: "#DC2626" }}>*</span>
            </label>
            <input
              name="prospectName"
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSelectedBlackbaudMatch(null);
              }}
              placeholder="Enter prospect name"
              required
              style={{
                width: "100%",
                padding: "10px 14px",
                border: "1px solid #D1D5DB",
                borderRadius: "8px",
                fontSize: "14px",
                boxSizing: "border-box",
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
                    fontWeight: "700",
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
                        <div style={{ marginTop: "10px" }}>
                          <button
                            type="button"
                            onClick={() => setSelectedBlackbaudMatch(match)}
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
          </div>

          <button
            type="submit"
            disabled={isPending || !name.trim()}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: isPending ? "#9CA3AF" : "#6A5BFF",
              color: "white",
              border: "none",
              borderRadius: "10px",
              fontSize: "15px",
              fontWeight: "600",
              cursor: isPending ? "not-allowed" : "pointer",
            }}
          >
            {isPending ? "Adding..." : "Add Prospect"}
          </button>
          {errorMessage ? (
            <div
              style={{
                marginTop: "12px",
                padding: "10px 12px",
                borderRadius: "10px",
                border: "1px solid #FECACA",
                backgroundColor: "#FEF2F2",
                color: "#991B1B",
                fontSize: "13px",
                fontWeight: 700,
                lineHeight: 1.5,
              }}
            >
              {errorMessage}
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}

function CloseModal({ prospect, onClose, onSubmit, isPending }) {
  const [outcome, setOutcome] = useState("secured");
  const [closedAmount, setClosedAmount] = useState(
    prospect?.ask_amount?.toString() || "",
  );
  const [closeDate, setCloseDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [declineReason, setDeclineReason] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (outcome === "secured") {
      onSubmit({
        status: "Closed – Gift Secured",
        closedAmount: closedAmount ? parseFloat(closedAmount) : null,
        closeDate,
      });
    } else {
      onSubmit({
        status: "Closed – Declined",
        declineReason: declineReason || null,
      });
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "480px",
          maxHeight: "90vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid #E5E7EB",
          }}
        >
          <h2
            style={{
              fontSize: "18px",
              fontWeight: "700",
              color: "#111827",
              margin: 0,
            }}
          >
            Close Prospect
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
            }}
          >
            <X size={20} color="#6B7280" />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "24px" }}>
          <p
            style={{ fontSize: "14px", color: "#6B7280", margin: "0 0 20px 0" }}
          >
            Closing:{" "}
            <strong style={{ color: "#111827" }}>
              {prospect?.prospect_name}
            </strong>
          </p>

          <div style={{ marginBottom: "20px" }}>
            <label
              style={{
                display: "block",
                fontSize: "14px",
                fontWeight: "600",
                color: "#374151",
                marginBottom: "10px",
              }}
            >
              Outcome
            </label>
            <div style={{ display: "flex", gap: "8px" }}>
              <button
                type="button"
                onClick={() => setOutcome("secured")}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                  border:
                    outcome === "secured"
                      ? "2px solid #059669"
                      : "1px solid #E5E7EB",
                  backgroundColor: outcome === "secured" ? "#D1FAE5" : "white",
                  color: outcome === "secured" ? "#059669" : "#6B7280",
                  cursor: "pointer",
                }}
              >
                Gift Secured
              </button>
              <button
                type="button"
                onClick={() => setOutcome("declined")}
                style={{
                  flex: 1,
                  padding: "10px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                  border:
                    outcome === "declined"
                      ? "2px solid #DC2626"
                      : "1px solid #E5E7EB",
                  backgroundColor: outcome === "declined" ? "#FEE2E2" : "white",
                  color: outcome === "declined" ? "#DC2626" : "#6B7280",
                  cursor: "pointer",
                }}
              >
                Declined
              </button>
            </div>
          </div>

          {outcome === "secured" && (
            <>
              <div style={{ marginBottom: "20px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#374151",
                    marginBottom: "6px",
                  }}
                >
                  Closed Amount
                </label>
                <div
                  style={{ display: "flex", alignItems: "center", gap: "8px" }}
                >
                  <span
                    style={{
                      fontSize: "16px",
                      fontWeight: "600",
                      color: "#374151",
                    }}
                  >
                    $
                  </span>
                  <input
                    type="number"
                    value={closedAmount}
                    onChange={(e) => setClosedAmount(e.target.value)}
                    placeholder="0.00"
                    step="0.01"
                    style={{
                      flex: 1,
                      padding: "10px 14px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
              <div style={{ marginBottom: "24px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#374151",
                    marginBottom: "6px",
                  }}
                >
                  Close Date
                </label>
                <input
                  type="date"
                  value={closeDate}
                  onChange={(e) => setCloseDate(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "10px 14px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </>
          )}

          {outcome === "declined" && (
            <div style={{ marginBottom: "24px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#374151",
                  marginBottom: "6px",
                }}
              >
                Decline Reason (optional)
              </label>
              <textarea
                value={declineReason}
                onChange={(e) => setDeclineReason(e.target.value)}
                placeholder="Why was this declined?"
                rows={3}
                style={{
                  width: "100%",
                  padding: "10px 14px",
                  border: "1px solid #D1D5DB",
                  borderRadius: "8px",
                  fontSize: "14px",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            style={{
              width: "100%",
              padding: "12px",
              backgroundColor: isPending
                ? "#9CA3AF"
                : outcome === "secured"
                  ? "#059669"
                  : "#DC2626",
              color: "white",
              border: "none",
              borderRadius: "10px",
              fontSize: "15px",
              fontWeight: "600",
              cursor: isPending ? "not-allowed" : "pointer",
            }}
          >
            {isPending
              ? "Saving..."
              : outcome === "secured"
                ? "Mark as Gift Secured"
                : "Mark as Declined"}
          </button>
        </form>
      </div>
    </div>
  );
}

export function ProspectDetailModal({ prospectId, initialPanel, onClose: onRequestClose, readOnly = false, pledgeData, ownerName }) {
  const queryClient = useQueryClient();
  const [expandedTimelineId, setExpandedTimelineId] = useState(null);
  const [editingUpdateId, setEditingUpdateId] = useState(null);
  const [editingUpdateNotes, setEditingUpdateNotes] = useState("");
  const [editingUpdateDate, setEditingUpdateDate] = useState("");
  const [pendingDeleteEvent, setPendingDeleteEvent] = useState(null);
  const [showActionForm, setShowActionForm] = useState(false);
  const [showNextStepForm, setShowNextStepForm] = useState(false);
  const [actionDate, setActionDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [actionCategory, setActionCategory] = useState(ACTION_CATEGORIES[0]);
  const [actionType, setActionType] = useState(ACTION_TYPES[0]);
  const [actionSummary, setActionSummary] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [actionNextStep, setActionNextStep] = useState("");
  const [actionNextStepDueDate, setActionNextStepDueDate] = useState("");
  const [actionLinkedOpportunityId, setActionLinkedOpportunityId] = useState("");
  const [actionAdditionalFundraiserUserId, setActionAdditionalFundraiserUserId] =
    useState("");
  const [isActionDictating, setIsActionDictating] = useState(false);
  const [actionDictationTarget, setActionDictationTarget] = useState("");
  const [actionDictationStatus, setActionDictationStatus] = useState("");
  const [actionDictationError, setActionDictationError] = useState("");
  const [supportsActionDictation, setSupportsActionDictation] = useState(false);
  const actionSpeechRecognitionRef = useRef(null);
  const actionRecognitionTranscriptRef = useRef("");
  const actionRecognitionDisplayRef = useRef("");
  const actionRecognitionFinalizedRef = useRef(false);
  const actionRecognitionBaseValueRef = useRef("");
  const [showOpportunityForm, setShowOpportunityForm] = useState(false);
  const [showDiscussionForm, setShowDiscussionForm] = useState(false);
  const [showDataRequestForm, setShowDataRequestForm] = useState(false);
  const [dataRequestType, setDataRequestType] = useState("Contact info update");
  const [dataRequestNote, setDataRequestNote] = useState("");
  const [dataRequestProvidedInfo, setDataRequestProvidedInfo] = useState("");
  const [dataRequestFeedback, setDataRequestFeedback] = useState("");
  const [dataRequestError, setDataRequestError] = useState("");
  const [discussionSubject, setDiscussionSubject] = useState("");
  const [discussionBody, setDiscussionBody] = useState("");
  const [discussionDueDate, setDiscussionDueDate] = useState("");
  const [discussionAssignedUserId, setDiscussionAssignedUserId] = useState("");
  const [discussionError, setDiscussionError] = useState("");
  const [nextStepTextDraft, setNextStepTextDraft] = useState("");
  const [nextStepDetailsDraft, setNextStepDetailsDraft] = useState("");
  const [nextStepDueDateDraft, setNextStepDueDateDraft] = useState("");
  const [nextStepCompletedDraft, setNextStepCompletedDraft] = useState(false);
  const [nextStepNeedsDiscussionDraft, setNextStepNeedsDiscussionDraft] = useState(false);
  const [nextStepDiscussionNoteDraft, setNextStepDiscussionNoteDraft] = useState("");
  const nextStepDraftDirty = useRef(false);
  const nextStepSource = useRef(null);
  const [nextStepFeedback, setNextStepFeedback] = useState("");
  useUnsavedChangesWarning(nextStepDraftDirty.current);
  function onClose() {
    if (savePendingActionMutation.isPending) return;
    if (nextStepDraftDirty.current && !window.confirm("Discard your unsaved next-step changes?")) return;
    onRequestClose();
  }
  const [newOpportunityData, setNewOpportunityData] = useState({
    title: "",
    currentStage: "Identification",
    estimatedAmount: "",
    askDate: "",
    expectedDate: "",
    latestNotes: "",
  });
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [editingOpportunityId, setEditingOpportunityId] = useState(null);
  const [opportunityEditData, setOpportunityEditData] = useState({});
  const [opportunityEditError, setOpportunityEditError] = useState("");
  const [opportunityEditFeedback, setOpportunityEditFeedback] = useState("");
  const [giftLinkPrompt, setGiftLinkPrompt] = useState(null);
  const [unlinkingGiftLinkId, setUnlinkingGiftLinkId] = useState("");
  const [stewardshipDrafts, setStewardshipDrafts] = useState({});
  const [stewardshipErrors, setStewardshipErrors] = useState({});
  const [stewardshipFeedback, setStewardshipFeedback] = useState({});
  const [actionError, setActionError] = useState("");
  const [showBlackbaudNarrativeSummary, setShowBlackbaudNarrativeSummary] =
    useState(true);

  useEffect(() => {
    if (readOnly) return;
    if (!prospectId) return;
    if (initialPanel === "action") {
      setShowActionForm(true);
      setShowNextStepForm(false);
      setShowOpportunityForm(false);
      setShowDiscussionForm(false);
      setShowDataRequestForm(false);
      return;
    }
    if (initialPanel === "next-step") {
      setShowNextStepForm(true);
      setShowActionForm(false);
      setShowOpportunityForm(false);
      setShowDiscussionForm(false);
      setShowDataRequestForm(false);
      return;
    }
    if (initialPanel === "discussion") {
      setShowDiscussionForm(true);
      setShowActionForm(false);
      setShowNextStepForm(false);
      setShowOpportunityForm(false);
      setShowDataRequestForm(false);
      return;
    }
    if (initialPanel === "opportunity") {
      setShowOpportunityForm(true);
      setShowActionForm(false);
      setShowNextStepForm(false);
      setShowDiscussionForm(false);
      setShowDataRequestForm(false);
      return;
    }
  }, [initialPanel, prospectId, readOnly]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setSupportsActionDictation(
      typeof window.SpeechRecognition !== "undefined" ||
        typeof window.webkitSpeechRecognition !== "undefined",
    );
  }, []);

  useEffect(() => {
    return () => {
      const recognition = actionSpeechRecognitionRef.current;
      if (!recognition) return;
      actionRecognitionFinalizedRef.current = true;
      recognition.abort();
      actionSpeechRecognitionRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (showActionForm || !actionSpeechRecognitionRef.current) return;
    actionRecognitionFinalizedRef.current = true;
    actionSpeechRecognitionRef.current.stop();
    actionSpeechRecognitionRef.current = null;
    setIsActionDictating(false);
    setActionDictationTarget("");
    setActionDictationStatus("");
  }, [showActionForm]);

  useEffect(() => {
    if (!prospectId || typeof window === "undefined") return;
    const requestedActionId = new URLSearchParams(window.location.search).get("actionId");
    if (requestedActionId) {
      setExpandedTimelineId(`progress-${requestedActionId}`);
    }
  }, [prospectId]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["prospect", prospectId],
    queryFn: async () => {
      const res = await fetch(`/api/prospects/${prospectId}`);
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to fetch prospect details");
      }
      return payload;
    },
    enabled: !!prospectId,
  });

  const linkedBlackbaudConstituentId =
    data?.prospect?.linked_blackbaud_constituent_id ||
    data?.prospect?.blackbaud_constituent_id ||
    null;
  const linkedBlackbaudConstituentProfileUrl =
    buildBlackbaudConstituentProfileUrl(linkedBlackbaudConstituentId);

  const {
    data: blackbaudSummary,
    isLoading: blackbaudSummaryLoading,
    isError: blackbaudSummaryError,
  } = useQuery({
    queryKey: ["blackbaud-summary", linkedBlackbaudConstituentId],
    queryFn: async () => {
      const res = await fetch(
        `/api/blackbaud/constituents/${linkedBlackbaudConstituentId}/summary`,
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to load Blackbaud summary");
      }
      return payload;
    },
    enabled: Boolean(linkedBlackbaudConstituentId),
  });

  const { data: mgoUsers = [] } = useQuery({
    queryKey: ["mgo-users-for-discussion"],
    queryFn: async () => {
      const response = await fetch("/api/users/mgos");
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load MGO users");
      }
      return payload;
    },
  });

  const addActionMutation = useMutation({
    mutationFn: async (body) => {
      const res = await fetch(`/api/prospects/${prospectId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to log action");
      }
      return payload;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-base"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-closed"] });
      setActionDate(new Date().toISOString().split("T")[0]);
      setActionCategory(ACTION_CATEGORIES[0]);
      setActionType(ACTION_TYPES[0]);
      setActionSummary("");
      setActionNotes("");
      setActionNextStep("");
      setActionNextStepDueDate("");
      setActionLinkedOpportunityId("");
      setActionAdditionalFundraiserUserId("");
      setShowActionForm(false);
      setActionError(
        result?.blackbaudAction?.error
          ? `Saved in the app, but Blackbaud sync failed: ${result.blackbaudAction.error}`
          : result?.blackbaudAction?.syncWarning
            ? `Saved in NXT, but the follow-up action update was incomplete: ${result.blackbaudAction.syncWarning}`
            : "",
      );
    },
    onError: (mutationError) => {
      setActionError(
        mutationError instanceof Error ? mutationError.message : "Failed to log action",
      );
    },
  });

  const discussionMutation = useMutation({
    mutationFn: async (body) => {
      const response = await fetch("/api/discussion-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to save discussion item");
      }
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
      setDiscussionSubject("");
      setDiscussionBody("");
      setDiscussionDueDate("");
      setDiscussionAssignedUserId("");
      setDiscussionError("");
      setShowDiscussionForm(false);
    },
    onError: (mutationError) => {
      setDiscussionError(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to save discussion item",
      );
    },
  });

  const updateDiscussionMutation = useMutation({
    mutationFn: async ({ id, body }) => {
      const response = await fetch(`/api/discussion-items/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to update discussion item");
      }
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
    },
  });

  const dataRequestMutation = useMutation({
    mutationFn: async (body) => {
      const response = await fetch("/api/data-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to send data request");
      }
      return payload;
    },
    onSuccess: () => {
      setDataRequestFeedback("Sent to the Advancement Services data request queue.");
      setDataRequestError("");
      setDataRequestNote("");
      setDataRequestProvidedInfo("");
      setShowDataRequestForm(false);
    },
    onError: (mutationError) => {
      setDataRequestFeedback("");
      setDataRequestError(
        mutationError instanceof Error ? mutationError.message : "Failed to send data request",
      );
    },
  });

  const addOpportunityMutation = useMutation({
    mutationFn: async (body) => {
      const res = await fetch(`/api/prospects/${prospectId}/opportunities`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to add opportunity");
      }
      return payload;
    },
    onSuccess: (payload) => {
      queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-base"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-closed"] });
      promptGiftLinkIfFunded(payload);
      setNewOpportunityData({
        title: "",
        currentStage: "Identification",
        estimatedAmount: "",
        askDate: "",
        expectedDate: "",
        latestNotes: "",
      });
      setShowOpportunityForm(false);
      setActionError("");
    },
    onError: (mutationError) => {
      setActionError(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to add opportunity",
      );
    },
  });

  const closeMutation = useMutation({
    mutationFn: async (body) => {
      const res = await fetch(`/api/prospects/${prospectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to close");
      return res.json();
    },
    onSuccess: (result, variables) => {
      const updatedProspect = result?.prospect || result || {};
      queryClient.setQueriesData({ queryKey: ["prospects"] }, (current) => {
        if (!Array.isArray(current)) return current;
        return current.map((item) =>
          String(item.id) === String(prospectId)
            ? { ...item, ...updatedProspect, ...variables }
            : item,
        );
      });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-base"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-closed"] });
      setShowCloseModal(false);
    },
  });

  const editMutation = useMutation({
    mutationFn: async (body) => {
      const res = await fetch(`/api/prospects/${prospectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-base"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-closed"] });
      setEditMode(false);
      setShowNextStepForm(false);
      setActionError("");
    },
    onError: (mutationError) => {
      setActionError(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to update prospect",
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/prospects/${prospectId}`, {
        method: "DELETE",
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to remove prospect");
      }
      return payload;
    },
    onSuccess: (result) => {
      const removedProspect = result?.prospect || { status: "Archived" };
      queryClient.setQueriesData({ queryKey: ["prospects"] }, (current) => {
        if (!Array.isArray(current)) return current;
        return current.map((item) =>
          isRemovedTopProspectMatch(item, result, prospectId)
            ? { ...item, ...removedProspect, status: removedProspect.status || "Archived" }
            : item,
        );
      });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-base"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-closed"] });
      onClose();
    },
    onError: (mutationError) => {
      setActionError(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to remove prospect",
      );
    },
  });

  const updateOpportunityMutation = useMutation({
    mutationFn: async ({ opportunityId, body }) => {
      const res = await fetch(`/api/prospects/opportunities/${opportunityId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to update linked opportunity");
      }
      return payload;
    },
    onSuccess: (payload, variables) => {
      queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-base"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-closed"] });
      queryClient.invalidateQueries({ queryKey: ["stewardship-actions"] });
      setEditingOpportunityId(null);
      setOpportunityEditData({});
      setOpportunityEditError("");
      setOpportunityEditFeedback(
        payload?.blackbaudSync?.status === "synced"
          ? "Saved and updated in NXT."
          : "Saved locally.",
      );
      promptGiftLinkIfFunded(payload, variables?.previousStatus);
    },
    onError: (error) => {
      setOpportunityEditError(
        error instanceof Error ? error.message : "Failed to update linked opportunity",
      );
    },
  });

  const unlinkOpportunityGiftMutation = useMutation({
    mutationFn: async ({ opportunityId, giftLinkId, blackbaudGiftId }) => {
      const response = await fetch(
        `/api/prospects/opportunities/${encodeURIComponent(opportunityId)}/gift-links`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ giftLinkId, blackbaudGiftId }),
        },
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to unlink gift");
      }
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-base"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-closed"] });
      setOpportunityEditFeedback(
        "Gift unlinked in JUMGOGPT. NXT gift linking still requires manual review.",
      );
      setActionError("");
    },
    onError: (mutationError) => {
      setActionError(
        mutationError instanceof Error ? mutationError.message : "Failed to unlink gift",
      );
    },
    onSettled: () => {
      setUnlinkingGiftLinkId("");
    },
  });

  const updateTimelineEntryMutation = useMutation({
    mutationFn: async ({ updateId, body }) => {
      const res = await fetch(
        `/api/prospects/${prospectId}/updates/${updateId}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to update activity");
      }
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-base"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-closed"] });
      setEditingUpdateId(null);
      setEditingUpdateNotes("");
      setEditingUpdateDate("");
      setActionError("");
    },
    onError: (mutationError) => {
      setActionError(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to update activity",
      );
    },
  });

  const deleteTimelineEntryMutation = useMutation({
    mutationFn: async ({ entryId, entryKind, localOnly = false }) => {
      const query = localOnly ? "?localOnly=1" : "";
      const segment = entryKind === "submission" ? "submissions" : "updates";
      const res = await fetch(
        `/api/prospects/${prospectId}/${segment}/${entryId}${query}`,
        {
          method: "DELETE",
        },
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to delete activity");
      }
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-base"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-closed"] });
      setEditingUpdateId(null);
      setEditingUpdateNotes("");
      setEditingUpdateDate("");
      setExpandedTimelineId(null);
      setPendingDeleteEvent(null);
      setActionError("");
    },
    onError: (mutationError) => {
      setActionError(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to delete activity",
      );
    },
  });

  const savePendingActionMutation = useMutation({
    mutationFn: async ({ id, body }) => {
      const response = await fetch(id ? `/api/pending-actions/${id}` : "/api/pending-actions", {
        method: id ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to save pending action");
      }
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-base"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-closed"] });
      queryClient.invalidateQueries({ queryKey: ["stewardship-actions"] });
      nextStepDraftDirty.current = false;
      setShowNextStepForm(false);
      setNextStepFeedback("Next step saved. No NXT action was created.");
      setActionError("");
    },
    onError: (mutationError) => {
      setActionError(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to save pending action",
      );
    },
  });

  const prospect = data?.prospect;
  const updates = data?.updates || [];
  const opportunities = data?.opportunities || [];
  const opportunityGroups = partitionOpportunities(opportunities);
  const linkedSubmissions = data?.linkedSubmissions || [];
  const discussionItems = data?.discussionItems || [];
  const pendingActions = data?.pendingActions || [];
  const stewardshipActionByOpportunityId = new Map(
    pendingActions
      .filter(
        (item) =>
          item.category === STEWARDSHIP_CATEGORY &&
          item.status === "Open" &&
          item.prospect_opportunity_id,
      )
      .map((item) => [String(item.prospect_opportunity_id), item]),
  );
  const blackbaudConstituent = blackbaudSummary?.mapped?.constituent || null;

  const blackbaudAssignments =
    blackbaudSummary?.mapped?.fundraiserAssignments || [];

  const actionPrimaryFundraiserName =
    mgoUsers.find((option) => String(option.id) === String(prospect?.user_id || ""))?.name ||
    blackbaudAssignments[0]?.fundraiserName ||
    "Current dashboard owner";

  function getProspectBlackbaudConstituentId() {
    return (
      prospect?.linked_blackbaud_constituent_id ||
      prospect?.blackbaud_constituent_id ||
      blackbaudConstituent?.id ||
      null
    );
  }

  function promptGiftLinkIfFunded(opportunity, previousStatus = null) {
    if (!opportunity?.id) return false;
    const nextStatus = getOpportunityDisplayStatus(opportunity);
    if (nextStatus !== "Funded" || previousStatus === "Funded") {
      return false;
    }

    const blackbaudConstituentId = getProspectBlackbaudConstituentId();
    if (!blackbaudConstituentId) {
      return false;
    }

    setGiftLinkPrompt({
      opportunityId: opportunity.id,
      constituentId: blackbaudConstituentId,
      opportunityTitle: opportunity.title || "this funded opportunity",
    });
    return true;
  }

  const primaryPendingAction =
    pendingActions.find((item) => item.status === "Open" && item.is_primary) ||
    pendingActions.find((item) => item.status === "Open") ||
    pendingActions.find((item) => item.is_primary) ||
    null;

  useEffect(() => {
    // A saved-data refresh must not replace an in-progress draft or its target.
    // A hidden editor is still a draft. Switching panels must not replace it
    // with a background refresh; explicit Cancel is the discard boundary.
    if (nextStepDraftDirty.current) return;
    if (showNextStepForm) setNextStepFeedback("");
    const source = primaryPendingAction;
    nextStepSource.current = source;
    setNextStepTextDraft(source?.title || prospect?.next_action_text || "");
    setNextStepDetailsDraft(source?.details || "");
    setNextStepDueDateDraft(source?.due_date || prospect?.next_action_due_date || "");
    setNextStepCompletedDraft(
      source ? source.status === "Done" : Boolean(prospect?.next_action_completed_at),
    );
    setNextStepNeedsDiscussionDraft(Boolean(source?.needs_discussion));
    setNextStepDiscussionNoteDraft(source?.discussion_note || "");
  }, [
    showNextStepForm,
    primaryPendingAction,
    prospect?.next_action_completed_at,
    prospect?.next_action_due_date,
    prospect?.next_action_text,
  ]);

  useEffect(() => {
    setShowBlackbaudNarrativeSummary(true);
  }, [linkedBlackbaudConstituentId]);

  if (isLoading) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          padding: "20px",
        }}
        onClick={onClose}
      >
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "16px",
            padding: "40px",
            textAlign: "center",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p style={{ color: "#6B7280" }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (isError || !prospect) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 100,
          padding: "20px",
        }}
        onClick={onClose}
      >
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "16px",
            padding: "28px",
            maxWidth: "420px",
            width: "100%",
            border: "1px solid #E5E7EB",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2
            style={{
              margin: "0 0 10px 0",
              fontSize: "18px",
              fontWeight: "700",
              color: "#111827",
            }}
          >
            Could not load prospect
          </h2>
          <p
            style={{
              margin: "0 0 16px 0",
              fontSize: "14px",
              lineHeight: 1.6,
              color: "#6B7280",
            }}
          >
            {error instanceof Error
              ? error.message
              : "The prospect details could not be loaded."}
          </p>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: "10px 16px",
              borderRadius: "8px",
              border: "1px solid #D1D5DB",
              backgroundColor: "white",
              color: "#374151",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  if (showCloseModal) {
    return (
      <CloseModal
        prospect={prospect}
        onClose={() => setShowCloseModal(false)}
        onSubmit={(body) => closeMutation.mutate(body)}
        isPending={closeMutation.isPending}
      />
    );
  }

  const handleEditSave = () => {
    editMutation.mutate(editData);
  };

  const startEditingOpportunity = (opportunity) => {
    setEditingOpportunityId(opportunity.id);
    setOpportunityEditError("");
    setOpportunityEditFeedback("");
    setOpportunityEditData({
      title: opportunity.title || "",
      currentStage: getOpportunityDisplayStatus(opportunity),
      estimatedAmount:
        opportunity.estimated_amount != null
          ? String(opportunity.estimated_amount)
          : "",
      askDate: normalizeDateInputValue(opportunity.ask_date),
      expectedDate: normalizeDateInputValue(opportunity.expected_date),
      latestNotes: opportunity.latest_notes || "",
      closedAmount:
        opportunity.closed_amount != null ? String(opportunity.closed_amount) : "",
      closeDate: normalizeDateInputValue(opportunity.close_date),
      declineReason: opportunity.decline_reason || "",
    });
  };

  const getActionDictationFieldValue = (target) => {
    switch (target) {
      case "notes":
        return actionNotes;
      case "nextStep":
        return actionNextStep;
      default:
        return "";
    }
  };

  const setActionDictationFieldValue = (target, value) => {
    switch (target) {
      case "notes":
        setActionNotes(value);
        break;
      case "nextStep":
        setActionNextStep(value);
        break;
      default:
        break;
    }
  };

  const stopActionDictation = () => {
    const recognition = actionSpeechRecognitionRef.current;
    if (!recognition || !isActionDictating) return;

    actionRecognitionFinalizedRef.current = true;
    recognition.stop();
    actionSpeechRecognitionRef.current = null;
    setIsActionDictating(false);
    setActionDictationStatus(
      actionRecognitionDisplayRef.current || actionRecognitionTranscriptRef.current
        ? `Dictation added to ${getActionDictationTargetLabel(actionDictationTarget)}.`
        : "",
    );
    setActionDictationTarget("");
  };

  const startActionDictation = (target) => {
    setActionDictationError("");
    setActionDictationStatus("");

    if (isActionDictating) {
      setActionDictationError("Stop the current dictation before starting another field.");
      return;
    }

    const SpeechRecognition =
      typeof window === "undefined"
        ? null
        : window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setActionDictationError(
        "This browser does not support live microphone dictation. Use Chrome or Edge, or type the note manually.",
      );
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.maxAlternatives = 1;

      actionRecognitionTranscriptRef.current = "";
      actionRecognitionDisplayRef.current = "";
      actionRecognitionFinalizedRef.current = false;
      actionRecognitionBaseValueRef.current = getActionDictationFieldValue(target);
      actionSpeechRecognitionRef.current = recognition;
      setActionDictationTarget(target);

      recognition.onstart = () => {
        setActionDictationStatus(
          `Ready for ${getActionDictationTargetLabel(target)}. Start speaking now.`,
        );
      };

      recognition.onaudiostart = () => {
        setActionDictationStatus(
          `Microphone is on for ${getActionDictationTargetLabel(target)}. Start speaking.`,
        );
      };

      recognition.onspeechstart = () => {
        setActionDictationStatus(
          `Hearing you. Dictating into ${getActionDictationTargetLabel(target)}.`,
        );
      };

      recognition.onspeechend = () => {
        setActionDictationStatus(
          `Still listening for ${getActionDictationTargetLabel(target)}. Continue speaking or stop dictation.`,
        );
      };

      recognition.onresult = (event) => {
        let finalTranscript = "";
        let interimTranscript = "";

        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const text = result[0]?.transcript || "";
          if (result.isFinal) {
            finalTranscript += text;
          } else {
            interimTranscript += text;
          }
        }

        if (finalTranscript) {
          actionRecognitionTranscriptRef.current =
            `${actionRecognitionTranscriptRef.current} ${finalTranscript}`.trim();
        }

        const combinedTranscript =
          `${actionRecognitionTranscriptRef.current} ${interimTranscript}`.trim();
        actionRecognitionDisplayRef.current = combinedTranscript;
        setActionDictationFieldValue(
          target,
          appendActionDictationTranscript(
            actionRecognitionBaseValueRef.current,
            combinedTranscript,
          ),
        );
        if (combinedTranscript) {
          setActionDictationStatus(
            `Writing into ${getActionDictationTargetLabel(target)}.`,
          );
        }
      };

      recognition.onerror = (event) => {
        if (actionRecognitionFinalizedRef.current) return;
        actionRecognitionFinalizedRef.current = true;
        actionSpeechRecognitionRef.current = null;
        setIsActionDictating(false);
        setActionDictationTarget("");

        const capturedTranscript =
          actionRecognitionDisplayRef.current || actionRecognitionTranscriptRef.current;
        if (String(capturedTranscript || "").trim()) {
          setActionDictationStatus(
            `Dictation added to ${getActionDictationTargetLabel(target)}.`,
          );
          return;
        }

        setActionDictationStatus("");
        setActionDictationError(getActionDictationErrorMessage(event.error));
      };

      recognition.onend = () => {
        actionSpeechRecognitionRef.current = null;
        if (actionRecognitionFinalizedRef.current) return;
        actionRecognitionFinalizedRef.current = true;
        setIsActionDictating(false);
        setActionDictationTarget("");

        const capturedTranscript =
          actionRecognitionDisplayRef.current || actionRecognitionTranscriptRef.current;
        if (String(capturedTranscript || "").trim()) {
          setActionDictationStatus(
            `Dictation added to ${getActionDictationTargetLabel(target)}.`,
          );
          return;
        }

        setActionDictationStatus("");
        setActionDictationError(
          "No speech was detected. Check the selected microphone in Chrome, speak close to it, and try again.",
        );
      };

      setIsActionDictating(true);
      setActionDictationStatus(
        `Starting microphone for ${getActionDictationTargetLabel(target)}...`,
      );
      recognition.start();
    } catch (dictationStartError) {
      console.error("Top Prospect action dictation error:", dictationStartError);
      actionSpeechRecognitionRef.current = null;
      setIsActionDictating(false);
      setActionDictationTarget("");
      setActionDictationStatus("");
      setActionDictationError(
        "Live dictation could not start in this browser. Check microphone permissions and try again.",
      );
    }
  };

  const saveOpportunityEdit = () => {
    if (!editingOpportunityId) return;
    const existingOpportunity = opportunities.find(
      (opportunity) => String(opportunity.id) === String(editingOpportunityId),
    );
    setOpportunityEditError("");
    updateOpportunityMutation.mutate({
      opportunityId: editingOpportunityId,
      previousStatus: existingOpportunity
        ? getOpportunityDisplayStatus(existingOpportunity)
        : null,
      body: {
        title: opportunityEditData.title,
        currentStage: opportunityEditData.currentStage,
        estimatedAmount: opportunityEditData.estimatedAmount
          ? parseFloat(opportunityEditData.estimatedAmount)
          : null,
        askDate: opportunityEditData.askDate || null,
        expectedDate: opportunityEditData.expectedDate || null,
        latestNotes: opportunityEditData.latestNotes,
        closedAmount: opportunityEditData.closedAmount
          ? parseFloat(opportunityEditData.closedAmount)
          : null,
        closeDate: opportunityEditData.closeDate || null,
        declineReason: opportunityEditData.declineReason,
      },
    });
  };

  const saveActionLog = () => {
    setActionError("");
    addActionMutation.mutate({
      actionDate,
      actionCategory,
      interactionType: actionType,
      summary: actionSummary,
      notes: actionNotes,
      nextStep: actionNextStep,
      nextActionDueDate: actionNextStepDueDate || null,
      linkedOpportunityId: actionLinkedOpportunityId || null,
      additionalFundraiserUserId: actionAdditionalFundraiserUserId || null,
    });
  };

  const saveNewOpportunity = () => {
    setActionError("");
    addOpportunityMutation.mutate({
      title: newOpportunityData.title,
      currentStage: newOpportunityData.currentStage,
      estimatedAmount: newOpportunityData.estimatedAmount
        ? parseFloat(newOpportunityData.estimatedAmount)
        : null,
      askDate: newOpportunityData.askDate || null,
      expectedDate: newOpportunityData.expectedDate || null,
      latestNotes: newOpportunityData.latestNotes || null,
    });
  };

  const saveDiscussionItem = () => {
    setDiscussionError("");
    discussionMutation.mutate({
      prospectId,
      constituentId: prospect?.constituent_id || null,
      subject: discussionSubject,
      body: discussionBody,
      dueDate: discussionDueDate || null,
      assignedUserId: discussionAssignedUserId || null,
    });
  };

  const saveDataRequest = () => {
    setDataRequestError("");
    setDataRequestFeedback("");
    dataRequestMutation.mutate({
      prospectId,
      constituentId: prospect?.constituent_id || null,
      blackbaudConstituentId: linkedBlackbaudConstituentId || null,
      constituentName: prospect?.prospect_name || "",
      requestType: dataRequestType,
      requestNote: dataRequestNote,
      providedData: dataRequestProvidedInfo.trim()
        ? { details: dataRequestProvidedInfo.trim() }
        : null,
      sourceContext: "prospect_detail",
    });
  };

  const toggleDiscussionStatus = (discussionItem) => {
    updateDiscussionMutation.mutate({
      id: discussionItem.id,
      body: {
        status: discussionItem.status === "Open" ? "Resolved" : "Open",
      },
    });
  };

  const isActive = prospect.status === "Active";
  const isArchived = prospect.status === "Archived";
  const hasClosedRevenue = Number(prospect.closed_amount || 0) > 0;

  const archiveProspect = () => {
    setActionError("");
    editMutation.mutate({ status: "Archived" });
  };

  const reactivateProspect = () => {
    setActionError("");
    editMutation.mutate({ status: "Active" });
  };

  const deleteProspect = () => {
    setActionError("");
    if (
      !window.confirm(
        "Remove this prospect from your Top Prospects list? This will not delete the constituent record from NXT.",
      )
    ) {
      return;
    }
    deleteMutation.mutate();
  };
  const timelineEvents = buildProspectTimeline(updates, linkedSubmissions);

  const nextStepSummary = primaryPendingAction
    ? primaryPendingAction.status === "Done"
      ? `Completed ${formatLongDate(primaryPendingAction.completed_at)}`
      : primaryPendingAction.due_date
        ? `Due ${formatLongDate(primaryPendingAction.due_date)}`
        : "No due date set"
    : prospect.next_action_text
      ? prospect.next_action_completed_at
        ? `Completed ${formatLongDate(prospect.next_action_completed_at)}`
        : prospect.next_action_due_date
          ? `Due ${formatLongDate(prospect.next_action_due_date)}`
          : "No due date set"
      : "No pending action set.";

  const nextStepDisplayText =
    primaryPendingAction?.title ||
    prospect.next_action_text ||
    "Nothing queued yet";

  const startEditingTimelineUpdate = (event) => {
    const raw = event.raw || {};
    setEditingUpdateId(raw.id);
    setEditingUpdateNotes(raw.update_notes || "");
    setEditingUpdateDate(
      raw.update_date
        ? new Date(raw.update_date).toISOString().split("T")[0]
        : new Date().toISOString().split("T")[0],
    );
    setExpandedTimelineId(event.id);
  };

  const saveTimelineUpdate = () => {
    if (!editingUpdateId) return;
    setActionError("");
    updateTimelineEntryMutation.mutate({
      updateId: editingUpdateId,
      body: {
        updateDate: editingUpdateDate,
        updateNotes: editingUpdateNotes,
      },
    });
  };

  const deleteTimelineUpdate = (event) => {
    const raw = event?.raw || {};
    if (!raw?.id) return;

    setActionError("");
    setPendingDeleteEvent(event);
    setExpandedTimelineId(event.id);
  };

  const confirmDeleteTimelineUpdate = ({ localOnly = false } = {}) => {
    const raw = pendingDeleteEvent?.raw || {};
    if (!raw?.id) return;

    setActionError("");
    deleteTimelineEntryMutation.mutate({
      entryId: raw.id,
      entryKind: pendingDeleteEvent.kind,
      localOnly,
    });
  };

  const updateStewardshipDraft = (opportunityId, patch) => {
    setStewardshipDrafts((current) => ({
      ...current,
      [opportunityId]: {
        ...(current[opportunityId] || {}),
        ...patch,
      },
    }));
  };

  const saveStewardshipPlan = (opportunity) => {
    if (!opportunity?.id) return;

    const draft = stewardshipDrafts[opportunity.id] || {};
    const title = String(draft.title || "").trim();

    if (!title) {
      setStewardshipFeedback((current) => ({
        ...current,
        [opportunity.id]: "",
      }));
      setStewardshipErrors((current) => ({
        ...current,
        [opportunity.id]: "Add the first stewardship next action before saving.",
      }));
      return;
    }

    setStewardshipErrors((current) => ({
      ...current,
      [opportunity.id]: "",
    }));
    setStewardshipFeedback((current) => ({
      ...current,
      [opportunity.id]: "",
    }));

    const existingStewardshipAction = stewardshipActionByOpportunityId.get(
      String(opportunity.id),
    );

    savePendingActionMutation.mutate(
      {
        id: existingStewardshipAction?.id || null,
        body: {
          prospectId,
          constituentId: prospect?.constituent_id || null,
          prospectOpportunityId: opportunity.id,
          title,
          details: String(draft.details || "").trim() || null,
          dueDate: draft.dueDate || null,
          status: "Open",
          isPrimary: true,
          category: STEWARDSHIP_CATEGORY,
        },
      },
      {
        onSuccess: () => {
          setStewardshipDrafts((current) => {
            const next = { ...current };
            delete next[opportunity.id];
            return next;
          });
          setStewardshipFeedback((current) => ({
            ...current,
            [opportunity.id]: "Stewardship next step saved.",
          }));
        },
      },
    );
  };

  const saveNextStep = () => {
    if (readOnly || savePendingActionMutation.isPending) return;
    setActionError("");
    const trimmed = nextStepTextDraft.trim();
    if (!trimmed) { setActionError("Enter what should happen next."); return; }
    if ((nextStepSource.current?.id || null) !== (primaryPendingAction?.id || null)) {
      setActionError("The current next step changed while you were editing. Your draft is still here. Cancel and reopen the editor to review the current step before saving.");
      return;
    }
    savePendingActionMutation.mutate({
      id: nextStepSource.current?.id || null,
      body: {
        prospectId,
        constituentId: prospect?.constituent_id || null,
        title: trimmed || null,
        details: nextStepDetailsDraft.trim() || null,
        dueDate: trimmed ? nextStepDueDateDraft || null : null,
        status: nextStepCompletedDraft ? "Done" : "Open",
        isPrimary: true,
        category: nextStepSource.current?.category || "General",
        needsDiscussion: nextStepNeedsDiscussionDraft,
        discussionNote: nextStepNeedsDiscussionDraft
          ? nextStepDiscussionNoteDraft.trim() || null
          : null,
      },
    });
  };

  const renderStewardshipOpportunitySection = (opportunity) => {
    if (!isFundedOpportunity(opportunity)) return null;

    const existingAction = stewardshipActionByOpportunityId.get(
      String(opportunity.id),
    );
    const draft = stewardshipDrafts[opportunity.id] || {};
    const error = stewardshipErrors[opportunity.id] || "";
    const feedback = stewardshipFeedback[opportunity.id] || "";
    const dueTimestamp = getDateOnlyTimestamp(existingAction?.due_date);
    const isOverdue =
      dueTimestamp != null && dueTimestamp < getTodayDateOnlyTimestamp();

    if (existingAction) {
      return (
        <div
          style={{
            marginTop: "10px",
            padding: "12px",
            borderRadius: "12px",
            border: `1px solid ${isOverdue ? "#FCA5A5" : "#A7F3D0"}`,
            backgroundColor: isOverdue ? "#FEF2F2" : "#ECFDF5",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            <div>
              <p
                style={{
                  margin: "0 0 4px",
                  color: isOverdue ? "#991B1B" : "#047857",
                  fontSize: "11px",
                  fontWeight: "800",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Stewardship next step
              </p>
              <strong style={{ display: "block", color: "#111827", fontSize: "14px" }}>
                {existingAction.title}
              </strong>
              <p style={{ margin: "4px 0 0", color: "#4B5563", fontSize: "12px" }}>
                {existingAction.due_date
                  ? `${isOverdue ? "Overdue" : "Due"} ${formatShortDate(existingAction.due_date)}`
                  : "No due date set"}
                {existingAction.details ? ` · ${existingAction.details}` : ""}
              </p>
            </div>
            {!readOnly ? (
              <button
                type="button"
                onClick={() => {
                  setShowNextStepForm(true);
                  setShowActionForm(false);
                  setShowOpportunityForm(false);
                  setShowDiscussionForm(false);
                  setShowDataRequestForm(false);
                }}
                style={{
                  padding: "7px 12px",
                  borderRadius: "999px",
                  border: "1px solid #A7F3D0",
                  backgroundColor: "white",
                  color: "#047857",
                  fontSize: "12px",
                  fontWeight: "700",
                  cursor: "pointer",
                }}
              >
                Edit next step
              </button>
            ) : null}
          </div>
        </div>
      );
    }

    return (
      <div
        style={{
          marginTop: "10px",
          padding: "12px",
          borderRadius: "12px",
          border: "1px solid #BFDBFE",
          backgroundColor: "#F8FAFF",
        }}
      >
        <p
          style={{
            margin: "0 0 4px",
            color: "#1D4ED8",
            fontSize: "11px",
            fontWeight: "800",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          Stewardship plan
        </p>
        <p style={{ margin: "0 0 10px", color: "#4B5563", fontSize: "13px", lineHeight: 1.5 }}>
          This gift is closed. Add the first stewardship next action so the follow-up does not drift.
        </p>
        {readOnly ? (
          <p style={{ margin: 0, color: "#6B7280", fontSize: "13px" }}>
            No stewardship next step has been set yet.
          </p>
        ) : (
          <div style={{ display: "grid", gap: "8px" }}>
            <input
              type="text"
              value={draft.title || ""}
              onChange={(event) =>
                updateStewardshipDraft(opportunity.id, { title: event.target.value })
              }
              placeholder="First stewardship next action"
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #93C5FD",
                borderRadius: "8px",
                fontSize: "13px",
                boxSizing: "border-box",
              }}
            />
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(160px, 220px) 1fr",
                gap: "8px",
              }}
            >
              <input
                type="date"
                value={draft.dueDate || ""}
                onChange={(event) =>
                  updateStewardshipDraft(opportunity.id, { dueDate: event.target.value })
                }
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid #93C5FD",
                  borderRadius: "8px",
                  fontSize: "13px",
                  boxSizing: "border-box",
                }}
              />
              <input
                type="text"
                value={draft.details || ""}
                onChange={(event) =>
                  updateStewardshipDraft(opportunity.id, { details: event.target.value })
                }
                placeholder="Optional details"
                style={{
                  width: "100%",
                  padding: "8px 10px",
                  border: "1px solid #93C5FD",
                  borderRadius: "8px",
                  fontSize: "13px",
                  boxSizing: "border-box",
                }}
              />
            </div>
            {error ? (
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "1px solid #FECACA",
                  backgroundColor: "#FEF2F2",
                  color: "#991B1B",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                {error}
              </div>
            ) : null}
            {feedback ? (
              <div
                style={{
                  padding: "8px 10px",
                  borderRadius: "8px",
                  border: "1px solid #A7F3D0",
                  backgroundColor: "#ECFDF5",
                  color: "#047857",
                  fontSize: "12px",
                  fontWeight: 700,
                }}
              >
                {feedback}
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => saveStewardshipPlan(opportunity)}
              disabled={savePendingActionMutation.isPending}
              style={{
                justifySelf: "start",
                padding: "8px 12px",
                borderRadius: "999px",
                border: "none",
                backgroundColor: "#1D4ED8",
                color: "white",
                fontSize: "12px",
                fontWeight: "700",
                cursor: savePendingActionMutation.isPending ? "not-allowed" : "pointer",
              }}
            >
              {savePendingActionMutation.isPending
                ? "Saving..."
                : "Create stewardship next step"}
            </button>
          </div>
        )}
      </div>
    );
  };

  const unlinkOpportunityGift = (opportunity, giftLink) => {
    const giftLinkKey = giftLink.id || giftLink.blackbaud_gift_id;
    const confirmed = window.confirm(
      "Unlink this gift from the opportunity in JUMGOGPT? This will not delete the gift record in NXT.",
    );
    if (!confirmed) return;
    setUnlinkingGiftLinkId(String(giftLinkKey));
    unlinkOpportunityGiftMutation.mutate({
      opportunityId: opportunity.id,
      giftLinkId: giftLink.id,
      blackbaudGiftId: giftLink.blackbaud_gift_id,
    });
  };

  const openOpportunityGiftLink = (opportunity) =>
    setGiftLinkPrompt({
      opportunityId: opportunity.id,
      constituentId: getProspectBlackbaudConstituentId(),
      opportunityTitle: opportunity.title || "this funded opportunity",
    });

  const renderOpportunityCard = (opportunity) => (
    <ProspectOpportunityCard
      key={opportunity.id}
      opportunity={opportunity}
      readOnly={readOnly}
      canLinkGift={Boolean(getProspectBlackbaudConstituentId())}
      unlinkingGiftLinkId={unlinkingGiftLinkId}
      onEdit={startEditingOpportunity}
      onUnlinkGift={unlinkOpportunityGift}
      onLinkGift={openOpportunityGiftLink}
      renderRollover={(opportunity) => (
        <OpportunityRollover
          opportunity={opportunity}
          readOnly={readOnly}
          onUpdated={() => {
            queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
            queryClient.invalidateQueries({ queryKey: ["prospects"] });
            queryClient.invalidateQueries({
              queryKey: ["blackbaud-summary", linkedBlackbaudConstituentId],
            });
            setOpportunityEditFeedback(
              "Expected date updated and verified in JUMGOGPT and NXT.",
            );
          }}
        />
      )}
      renderStewardshipOpportunitySection={renderStewardshipOpportunitySection}
      editor={
        editingOpportunityId === opportunity.id ? (
          <div style={{ marginTop: "10px" }}>
            <div style={{ marginBottom: "10px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "#1D4ED8",
                  marginBottom: "4px",
                }}
              >
                Opportunity title
              </label>
              <input
                type="text"
                value={opportunityEditData.title || ""}
                onChange={(e) =>
                  setOpportunityEditData((prev) => ({
                    ...prev,
                    title: e.target.value,
                  }))
                }
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #93C5FD",
                  borderRadius: "8px",
                  fontSize: "14px",
                  boxSizing: "border-box",
                }}
              />
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                marginBottom: "10px",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#1D4ED8",
                    marginBottom: "4px",
                  }}
                >
                  Status
                </label>
                <select
                  value={opportunityEditData.currentStage || "Identification"}
                  onChange={(e) =>
                    setOpportunityEditData((prev) => ({
                      ...prev,
                      currentStage: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #93C5FD",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    backgroundColor: "white",
                  }}
                >
                  {OPPORTUNITY_STAGE_OPTIONS.map((stage) => (
                    <option key={stage} value={stage}>
                      {stage}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#1D4ED8",
                    marginBottom: "4px",
                  }}
                >
                  Amount
                </label>
                <input
                  type="number"
                  value={opportunityEditData.estimatedAmount || ""}
                  onChange={(e) =>
                    setOpportunityEditData((prev) => ({
                      ...prev,
                      estimatedAmount: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #93C5FD",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px",
                marginBottom: "10px",
              }}
            >
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#1D4ED8",
                    marginBottom: "4px",
                  }}
                >
                  Ask Date
                </label>
                <input
                  type="date"
                  value={opportunityEditData.askDate || ""}
                  onChange={(e) =>
                    setOpportunityEditData((prev) => ({
                      ...prev,
                      askDate: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #93C5FD",
                    borderRadius: "8px",
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
                    fontWeight: "600",
                    color: "#1D4ED8",
                    marginBottom: "4px",
                  }}
                >
                  Date Expected
                </label>
                <input
                  type="date"
                  value={opportunityEditData.expectedDate || ""}
                  onChange={(e) =>
                    setOpportunityEditData((prev) => ({
                      ...prev,
                      expectedDate: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #93C5FD",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
            {opportunityEditData.currentStage === "Funded" ? (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                  marginBottom: "10px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#1D4ED8",
                      marginBottom: "4px",
                    }}
                  >
                    Amount Funded
                  </label>
                  <input
                    type="number"
                    value={opportunityEditData.closedAmount || ""}
                    onChange={(e) =>
                      setOpportunityEditData((prev) => ({
                        ...prev,
                        closedAmount: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #93C5FD",
                      borderRadius: "8px",
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
                      fontWeight: "600",
                      color: "#1D4ED8",
                      marginBottom: "4px",
                    }}
                  >
                    Date Funded
                  </label>
                  <input
                    type="date"
                    value={opportunityEditData.closeDate || ""}
                    onChange={(e) =>
                      setOpportunityEditData((prev) => ({
                        ...prev,
                        closeDate: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #93C5FD",
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
            ) : null}
            {opportunityEditData.currentStage === "Declined" ? (
              <div style={{ marginBottom: "10px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#1D4ED8",
                    marginBottom: "4px",
                  }}
                >
                  Decline reason
                </label>
                <textarea
                  value={opportunityEditData.declineReason || ""}
                  onChange={(e) =>
                    setOpportunityEditData((prev) => ({
                      ...prev,
                      declineReason: e.target.value,
                    }))
                  }
                  rows={2}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #93C5FD",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
              </div>
            ) : null}
            <div style={{ marginBottom: "10px" }}>
              <label
                style={{
                  display: "block",
                  fontSize: "12px",
                  fontWeight: "600",
                  color: "#1D4ED8",
                  marginBottom: "4px",
                }}
              >
                Notes
              </label>
              <textarea
                value={opportunityEditData.latestNotes || ""}
                onChange={(e) =>
                  setOpportunityEditData((prev) => ({
                    ...prev,
                    latestNotes: e.target.value,
                  }))
                }
                rows={3}
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  border: "1px solid #93C5FD",
                  borderRadius: "8px",
                  fontSize: "14px",
                  boxSizing: "border-box",
                  fontFamily: "inherit",
                  resize: "vertical",
                }}
              />
            </div>
            {opportunityEditError ? (
              <div
                style={{
                  marginBottom: "10px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FECACA",
                  color: "#991B1B",
                  fontSize: "13px",
                  lineHeight: 1.5,
                }}
              >
                {opportunityEditError}
              </div>
            ) : null}
            {opportunityEditFeedback ? (
              <div
                style={{
                  marginBottom: "10px",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  backgroundColor: "#ECFDF5",
                  border: "1px solid #A7F3D0",
                  color: "#166534",
                  fontSize: "13px",
                  lineHeight: 1.5,
                }}
              >
                {opportunityEditFeedback}
              </div>
            ) : null}
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={saveOpportunityEdit}
                disabled={updateOpportunityMutation.isPending}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "none",
                  backgroundColor: "#1D4ED8",
                  color: "white",
                  fontWeight: "600",
                  cursor: updateOpportunityMutation.isPending
                    ? "not-allowed"
                    : "pointer",
                }}
              >
                {updateOpportunityMutation.isPending
                  ? "Saving..."
                  : "Save Opportunity"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingOpportunityId(null);
                  setOpportunityEditData({});
                  setOpportunityEditError("");
                  setOpportunityEditFeedback("");
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "1px solid #BFDBFE",
                  backgroundColor: "white",
                  color: "#1D4ED8",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null
      }
    />
  );

  return (
    <>
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100,
        padding: "20px",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "white",
          borderRadius: "16px",
          width: "100%",
          maxWidth: "980px",
          maxHeight: "90vh",
          overflow: "auto",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid #E5E7EB",
          }}
        >
          <h2
            style={{
              fontSize: "18px",
              fontWeight: "700",
              color: "#111827",
              margin: 0,
            }}
          >
            {prospect.prospect_name}
          </h2>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              padding: "4px",
            }}
          >
            <X size={20} color="#6B7280" />
          </button>
        </div>

        <div style={{ padding: "24px" }}>
          {!editMode ? (
            <>
              <div
                style={{
                  marginBottom: "20px",
                  padding: "18px",
                  borderRadius: "18px",
                  background: "#FCFCFF",
                  border: "1px solid #DDD6FE",
                }}
              >
                <p style={sectionEyebrowStyle}>Prospect workspace</p>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "16px",
                    flexWrap: "wrap",
                    marginBottom: "18px",
                  }}
                >
                  <div>
                    <h3
                      style={{
                        margin: "0 0 6px 0",
                        fontSize: "24px",
                        fontWeight: "800",
                        color: "#111827",
                      }}
                    >
                      {prospect.prospect_name}
                    </h3>
                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        alignItems: "center",
                        flexWrap: "wrap",
                        color: "#4B5563",
                        fontSize: "13px",
                      }}
                    >
                      <StatusBadge status={prospect.status} />
                      <span>Priority #{prospect.priority_order || "Unranked"}</span>
                      {linkedBlackbaudConstituentId ? (
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: "999px",
                            backgroundColor: "#DBEAFE",
                            color: "#1D4ED8",
                            fontWeight: "700",
                            border: "1px solid #93C5FD",
                          }}
                        >
                          Linked to Blackbaud
                        </span>
                      ) : (
                        <span
                          style={{
                            padding: "4px 10px",
                            borderRadius: "999px",
                            backgroundColor: "#F3F4F6",
                            color: "#4B5563",
                            fontWeight: "700",
                            border: "1px solid #D1D5DB",
                          }}
                        >
                          App-only prospect
                        </span>
                      )}
                    </div>
                  </div>
                  <div
                    style={{
                      minWidth: "220px",
                      padding: "12px 14px",
                      borderRadius: "14px",
                      backgroundColor: "white",
                      border: "1px solid #E5E7EB",
                    }}
                  >
                    <p style={sectionEyebrowStyle}>Next step</p>
                    <div
                      style={{
                        fontSize: "16px",
                        fontWeight: "700",
                        color: "#111827",
                        marginBottom: "4px",
                      }}
                    >
                      {nextStepDisplayText}
                    </div>
                    <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.5 }}>
                      {nextStepSummary}
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                    gap: "12px",
                  }}
                >
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "14px",
                      backgroundColor: "white",
                      border: "1px solid #E5E7EB",
                    }}
                  >
                    <p style={sectionEyebrowStyle}>{prospect.status === "Active" ? "Opportunity timing" : "Expected close FY"}</p>
                    <div style={{ fontSize: "20px", fontWeight: "800", color: "#111827" }}>
                      {getProspectFiscalYearLabel(prospect)}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "14px",
                      backgroundColor: "white",
                      border: "1px solid #E5E7EB",
                    }}
                  >
                    <p style={sectionEyebrowStyle}>Ask amount</p>
                    <div style={{ fontSize: "20px", fontWeight: "800", color: "#111827" }}>
                      {formatCurrency(prospect.ask_amount)}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "14px",
                      backgroundColor: "white",
                      border: "1px solid #E5E7EB",
                    }}
                  >
                    <p style={sectionEyebrowStyle}>Ask type</p>
                    <div style={{ fontSize: "16px", fontWeight: "700", color: "#111827" }}>
                      {prospect.ask_type}
                    </div>
                  </div>
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: "14px",
                      backgroundColor: "white",
                      border: "1px solid #E5E7EB",
                    }}
                  >
                    <p style={sectionEyebrowStyle}>Open opportunities</p>
                    <div style={{ fontSize: "20px", fontWeight: "800", color: "#111827" }}>
                      {
                        opportunities.filter(
                          (opportunity) =>
                            (opportunity.opportunity_status || "Active") === "Active",
                        ).length
                      }
                    </div>
                  </div>
                </div>
              </div>

              {!readOnly ? (
              <div
                style={{
                  ...workspaceCardStyle,
                  marginBottom: "20px",
                  backgroundColor: "white",
                  borderColor: "#E5E7EB",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "12px",
                    flexWrap: "wrap",
                    marginBottom: "12px",
                  }}
                >
                  <div>
                    <p style={sectionEyebrowStyle}>Work this prospect</p>
                    <p
                      style={{
                        margin: 0,
                        fontSize: "14px",
                        color: "#6B7280",
                        lineHeight: 1.5,
                      }}
                    >
                      Log movement, update the ask, or capture an internal handoff.
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  <button
                    onClick={() => setEditMode(true)}
                    style={{
                      padding: "10px 16px",
                      backgroundColor: "#F3F4F6",
                      color: "#374151",
                      border: "1px solid #E5E7EB",
                      borderRadius: "10px",
                      fontSize: "13px",
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                  >
                    Edit Prospect
                  </button>
                  <button
                    onClick={() => {
                      setShowActionForm(true);
                      setShowNextStepForm(false);
                      setShowOpportunityForm(false);
                      setShowDiscussionForm(false);
                      setShowDataRequestForm(false);
                    }}
                    style={{
                      padding: "10px 16px",
                      backgroundColor: "#EDE9FE",
                      color: "#6A5BFF",
                      border: "1px solid #C4B5FD",
                      borderRadius: "10px",
                      fontSize: "13px",
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                  >
                    Log Action
                  </button>
                  <button
                    onClick={() => {
                      setShowNextStepForm(true);
                      setShowActionForm(false);
                      setShowOpportunityForm(false);
                      setShowDiscussionForm(false);
                      setShowDataRequestForm(false);
                    }}
                    style={{
                      padding: "10px 16px",
                      backgroundColor: "#FFF7ED",
                      color: "#C2410C",
                      border: "1px solid #FED7AA",
                      borderRadius: "10px",
                      fontSize: "13px",
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                  >
                    Set Next Step
                  </button>
                  <button
                    onClick={() => {
                      setShowOpportunityForm(true);
                      setShowActionForm(false);
                      setShowNextStepForm(false);
                      setShowDiscussionForm(false);
                      setShowDataRequestForm(false);
                    }}
                    style={{
                      padding: "10px 16px",
                      backgroundColor: "#EFF6FF",
                      color: "#1D4ED8",
                      border: "1px solid #BFDBFE",
                      borderRadius: "10px",
                      fontSize: "13px",
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                  >
                    Add Opportunity
                  </button>
                  <button
                    onClick={() => {
                      setShowDiscussionForm(true);
                      setShowActionForm(false);
                      setShowNextStepForm(false);
                      setShowOpportunityForm(false);
                      setShowDataRequestForm(false);
                    }}
                    style={{
                      padding: "10px 16px",
                      backgroundColor: "#F3F4F6",
                      color: "#374151",
                      border: "1px solid #D1D5DB",
                      borderRadius: "10px",
                      fontSize: "13px",
                      fontWeight: "700",
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <MessageSquare size={14} />
                    Team Discussion
                  </button>
                  <button
                    onClick={() => {
                      setShowDataRequestForm(true);
                      setShowActionForm(false);
                      setShowNextStepForm(false);
                      setShowOpportunityForm(false);
                      setShowDiscussionForm(false);
                      setDataRequestFeedback("");
                      setDataRequestError("");
                    }}
                    style={{
                      padding: "10px 16px",
                      backgroundColor: "#ECFDF5",
                      color: "#047857",
                      border: "1px solid #A7F3D0",
                      borderRadius: "10px",
                      fontSize: "13px",
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                  >
                    Request Data Update
                  </button>
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "8px",
                    flexWrap: "wrap",
                    marginTop: "12px",
                    paddingTop: "12px",
                    borderTop: "1px solid #F3F4F6",
                  }}
                >
                  {isActive && (
                    <button
                      onClick={() => setShowCloseModal(true)}
                      style={{
                        padding: "8px 12px",
                        backgroundColor: "#FFF7ED",
                        color: "#C2410C",
                        border: "1px solid #FED7AA",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: "700",
                        cursor: "pointer",
                      }}
                    >
                      Mark Closed
                    </button>
                  )}
                  {!isArchived ? (
                    <button
                      onClick={archiveProspect}
                      disabled={editMutation.isPending || deleteMutation.isPending}
                      style={{
                        padding: "8px 12px",
                        backgroundColor: "white",
                        color: "#4B5563",
                        border: "1px solid #D1D5DB",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: "700",
                        cursor:
                          editMutation.isPending || deleteMutation.isPending
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          editMutation.isPending || deleteMutation.isPending ? 0.7 : 1,
                      }}
                    >
                      Archive
                    </button>
                  ) : (
                    <button
                      onClick={reactivateProspect}
                      disabled={editMutation.isPending}
                      style={{
                        padding: "8px 12px",
                        backgroundColor: "#ECFDF5",
                        color: "#065F46",
                        border: "1px solid #A7F3D0",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: "700",
                        cursor: editMutation.isPending ? "not-allowed" : "pointer",
                        opacity: editMutation.isPending ? 0.7 : 1,
                      }}
                    >
                      Reactivate
                    </button>
                  )}
                  {!hasClosedRevenue ? (
                    <button
                      onClick={deleteProspect}
                      disabled={deleteMutation.isPending || editMutation.isPending}
                      style={{
                        padding: "8px 12px",
                        backgroundColor: "white",
                        color: "#991B1B",
                        border: "1px solid #FECACA",
                        borderRadius: "999px",
                        fontSize: "12px",
                        fontWeight: "700",
                        cursor:
                          deleteMutation.isPending || editMutation.isPending
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          deleteMutation.isPending || editMutation.isPending ? 0.7 : 1,
                      }}
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              </div>
              ) : (
                <div
                  style={{
                    ...workspaceCardStyle,
                    marginBottom: "20px",
                    backgroundColor: "#F9FAFB",
                    borderColor: "#E5E7EB",
                  }}
                >
                  <p style={sectionEyebrowStyle}>Executive view</p>
                  <p
                    style={{
                      margin: 0,
                      fontSize: "14px",
                      color: "#6B7280",
                      lineHeight: 1.6,
                    }}
                  >
                    This prospect is open in read-only mode while you are viewing another MGO's dashboard.
                  </p>
                </div>
              )}
            </>
          ) : null}

          {showDataRequestForm && !readOnly ? (
            <div
              style={{
                ...workspaceCardStyle,
                marginBottom: "24px",
                backgroundColor: "#F0FDF4",
                borderColor: "#BBF7D0",
              }}
            >
              <p style={{ ...sectionEyebrowStyle, color: "#047857" }}>Data request / update</p>
              <p style={{ margin: "0 0 14px", color: "#065F46", lineHeight: 1.6 }}>
                Send corrected contact information or other constituent record updates to
                Advancement Services. This does not write directly to NXT.
              </p>
              <div style={{ display: "grid", gap: "12px" }}>
                <label style={{ display: "grid", gap: "6px", color: "#111827", fontSize: "13px", fontWeight: 700 }}>
                  Request type
                  <select
                    value={dataRequestType}
                    onChange={(event) => setDataRequestType(event.target.value)}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "10px",
                      border: "1px solid #A7F3D0",
                      backgroundColor: "white",
                    }}
                  >
                    <option value="Contact info update">Contact info update</option>
                    <option value="Record update">Record update</option>
                    <option value="Research request">Research request</option>
                  </select>
                </label>
                <label style={{ display: "grid", gap: "6px", color: "#111827", fontSize: "13px", fontWeight: 700 }}>
                  What should Advancement Services update or verify?
                  <textarea
                    rows={4}
                    value={dataRequestNote}
                    onChange={(event) => setDataRequestNote(event.target.value)}
                    placeholder="Example: Please update the preferred phone number, or verify the employer shown in NXT."
                    style={{
                      padding: "10px 12px",
                      borderRadius: "10px",
                      border: "1px solid #A7F3D0",
                      resize: "vertical",
                    }}
                  />
                </label>
                <label style={{ display: "grid", gap: "6px", color: "#111827", fontSize: "13px", fontWeight: 700 }}>
                  Updated information, if you already have it
                  <textarea
                    rows={3}
                    value={dataRequestProvidedInfo}
                    onChange={(event) => setDataRequestProvidedInfo(event.target.value)}
                    placeholder="Paste the new address, phone, email, employer, title, or other corrected data here."
                    style={{
                      padding: "10px 12px",
                      borderRadius: "10px",
                      border: "1px solid #A7F3D0",
                      resize: "vertical",
                    }}
                  />
                </label>
              </div>
              {dataRequestError ? (
                <div style={{ marginTop: "12px", color: "#991B1B", fontSize: "13px", fontWeight: 700 }}>
                  {dataRequestError}
                </div>
              ) : null}
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginTop: "14px" }}>
                <button
                  type="button"
                  disabled={
                    dataRequestMutation.isPending ||
                    (!dataRequestNote.trim() && !dataRequestProvidedInfo.trim())
                  }
                  onClick={saveDataRequest}
                  style={{
                    padding: "11px 16px",
                    border: "none",
                    borderRadius: "12px",
                    backgroundColor:
                      dataRequestMutation.isPending ||
                      (!dataRequestNote.trim() && !dataRequestProvidedInfo.trim())
                        ? "#94A3B8"
                        : "#047857",
                    color: "white",
                    fontWeight: 800,
                    cursor:
                      dataRequestMutation.isPending ||
                      (!dataRequestNote.trim() && !dataRequestProvidedInfo.trim())
                        ? "not-allowed"
                        : "pointer",
                  }}
                >
                  {dataRequestMutation.isPending ? "Sending..." : "Send to Advancement Services"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowDataRequestForm(false)}
                  style={{
                    padding: "11px 16px",
                    borderRadius: "12px",
                    border: "1px solid #A7F3D0",
                    backgroundColor: "white",
                    color: "#047857",
                    fontWeight: 800,
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {dataRequestFeedback ? (
            <div
              style={{
                marginBottom: "18px",
                padding: "12px 14px",
                borderRadius: "12px",
                backgroundColor: "#ECFDF5",
                border: "1px solid #A7F3D0",
                color: "#047857",
                fontWeight: 700,
              }}
            >
              {dataRequestFeedback}
            </div>
          ) : null}

          {editMode ? (
            <div style={{ ...workspaceCardStyle, marginBottom: "24px" }}>
              <p style={sectionEyebrowStyle}>Edit prospect</p>
              <div style={{ marginBottom: "14px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#6B7280",
                    marginBottom: "4px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Prospect Name
                </label>
                <input
                  type="text"
                  defaultValue={prospect.prospect_name}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      prospectName: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "14px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#6B7280",
                      marginBottom: "4px",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Prospect Planning FY (manual)
                  </label>
                  <select
                    defaultValue={prospect.expected_close_fy}
                    onChange={(e) =>
                      setEditData((prev) => ({
                        ...prev,
                        expectedCloseFY: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      backgroundColor: "white",
                    }}
                  >
                    {FY_OPTIONS.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#6B7280",
                      marginBottom: "4px",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Ask Amount
                  </label>
                  <input
                    type="number"
                    defaultValue={prospect.ask_amount || ""}
                    onChange={(e) =>
                      setEditData((prev) => ({
                        ...prev,
                        askAmount: e.target.value
                          ? parseFloat(e.target.value)
                          : null,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
              <div style={{ marginTop: "14px" }}>
                <div
                  style={{
                    fontSize: "12px",
                    color: "#6B7280",
                    marginBottom: "10px",
                    lineHeight: 1.5,
                  }}
                >
                  If this prospect has linked opportunities, the ask amount will auto-sync from that pipeline.
                </div>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#6B7280",
                    marginBottom: "4px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Ask Type
                </label>
                <select
                  defaultValue={prospect.ask_type}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      askType: e.target.value,
                    }))
                  }
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    backgroundColor: "white",
                  }}
                >
                  {ASK_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div style={{ marginTop: "14px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "12px",
                    fontWeight: "600",
                    color: "#6B7280",
                    marginBottom: "4px",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  }}
                >
                  Next Action
                </label>
                <textarea
                  defaultValue={prospect.next_action_text || ""}
                  onChange={(e) =>
                    setEditData((prev) => ({
                      ...prev,
                      nextActionText: e.target.value.trim() || null,
                    }))
                  }
                  rows={2}
                  placeholder="What should happen next for this prospect?"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "14px",
                  marginTop: "14px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: "#6B7280",
                      marginBottom: "4px",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Next Action Due
                  </label>
                  <input
                    type="date"
                    defaultValue={prospect.next_action_due_date || ""}
                    onChange={(e) =>
                      setEditData((prev) => ({
                        ...prev,
                        nextActionDueDate: e.target.value || null,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
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
                      fontWeight: "600",
                      color: "#6B7280",
                      marginBottom: "8px",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    Completion
                  </label>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "14px",
                      color: "#374151",
                      paddingTop: "8px",
                    }}
                  >
                    <input
                      type="checkbox"
                      defaultChecked={Boolean(prospect.next_action_completed_at)}
                      onChange={(e) =>
                        setEditData((prev) => ({
                          ...prev,
                          nextActionCompletedAt: e.target.checked
                            ? new Date().toISOString()
                            : null,
                        }))
                      }
                    />
                    Mark next action complete
                  </label>
                </div>
              </div>
              <div style={{ display: "flex", gap: "8px", marginTop: "16px" }}>
                <button
                  onClick={handleEditSave}
                  disabled={editMutation.isPending}
                  style={{
                    flex: 1,
                    padding: "10px",
                    backgroundColor: "#6A5BFF",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  {editMutation.isPending ? "Saving..." : "Save Changes"}
                </button>
                <button
                  onClick={() => {
                    setEditMode(false);
                    setEditData({});
                  }}
                  style={{
                    padding: "10px 16px",
                    backgroundColor: "#F3F4F6",
                    color: "#374151",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          {actionError ? (
            <div
              role="alert"
              style={{
                marginBottom: "16px",
                padding: "10px 12px",
                borderRadius: "10px",
                backgroundColor: "#FEF2F2",
                border: "1px solid #FECACA",
                color: "#991B1B",
                fontSize: "13px",
              }}
            >
              {actionError}
            </div>
          ) : null}

          {nextStepFeedback && <WorkflowNotice kind="app" className="mb-4"><p>{nextStepFeedback}</p></WorkflowNotice>}
          {nextStepDraftDirty.current && !showNextStepForm && <div role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Your unsaved next-step draft is kept while you use another panel. Return to Set Next Step to save or cancel it.
          </div>}
          {showNextStepForm ? (
            <div
              style={{
                ...workspaceCardStyle,
                marginBottom: "20px",
                backgroundColor: "#FFFDF7",
                borderColor: "#FDE68A",
              }}
            >
              <p style={sectionEyebrowStyle}>Set next step</p>
              <p style={{ margin: "0 0 14px", fontSize: "14px", color: "#4B5563", lineHeight: 1.6 }}>
                Keep one clear pending action on this prospect, set a due date, and flag it for discussion when it needs coordination.
              </p>
              {pendingActions.length ? (
                <div
                  style={{
                    marginBottom: "14px",
                    display: "grid",
                    gap: "8px",
                  }}
                >
                  {pendingActions.slice(0, 3).map((item) => (
                    <div
                      key={item.id}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "12px",
                        border: `1px solid ${item.status === "Done" ? "#D1D5DB" : "#FDE68A"}`,
                        backgroundColor: item.status === "Done" ? "#F9FAFB" : "#FFFBEB",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "12px",
                          alignItems: "center",
                          marginBottom: "4px",
                        }}
                      >
                        <strong style={{ color: "#111827", fontSize: "14px" }}>{item.title}</strong>
                        <span style={{ fontSize: "12px", color: "#6B7280", whiteSpace: "nowrap" }}>
                          {item.status === "Done"
                            ? `Done ${formatShortDate(item.completed_at)}`
                            : item.due_date
                              ? `Due ${formatShortDate(item.due_date)}`
                              : "No due date"}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                        {item.is_primary ? (
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "999px",
                              border: "1px solid #FCD34D",
                              backgroundColor: "#FEF3C7",
                              color: "#92400E",
                              fontSize: "11px",
                              fontWeight: "700",
                            }}
                          >
                            Primary
                          </span>
                        ) : null}
                        {item.category && item.category !== "General" ? (
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "999px",
                              border: "1px solid #A7F3D0",
                              backgroundColor: "#ECFDF5",
                              color: "#047857",
                              fontSize: "11px",
                              fontWeight: "700",
                            }}
                          >
                            {item.category}
                          </span>
                        ) : null}
                        {item.needs_discussion ? (
                          <span
                            style={{
                              padding: "2px 8px",
                              borderRadius: "999px",
                              border: "1px solid #BFDBFE",
                              backgroundColor: "#EFF6FF",
                              color: "#1D4ED8",
                              fontSize: "11px",
                              fontWeight: "700",
                            }}
                          >
                            Needs discussion
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
              <form aria-label="Edit next step" onSubmit={event => { event.preventDefault(); saveNextStep(); }}
                style={{ display: "grid", gap: "14px" }}>
                <NextStepFields
                  title={nextStepTextDraft} details={nextStepDetailsDraft} dueDate={nextStepDueDateDraft}
                  onTitleChange={value => { nextStepDraftDirty.current = true; setNextStepTextDraft(value); }}
                  onDetailsChange={value => { nextStepDraftDirty.current = true; setNextStepDetailsDraft(value); }}
                  onDueDateChange={value => { nextStepDraftDirty.current = true; setNextStepDueDateDraft(value); }}
                  ownerName={ownerName || mgoUsers.find(option => String(option.id) === String(prospect.user_id))?.name}
                  disabled={readOnly || savePendingActionMutation.isPending}
                />
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "14px",
                      color: "#374151",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={nextStepCompletedDraft}
                      onChange={(event) => { nextStepDraftDirty.current = true; setNextStepCompletedDraft(event.target.checked); }}
                    />
                    Mark this next step complete
                  </label>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                    gap: "14px",
                  }}
                >
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "14px",
                      color: "#374151",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={nextStepNeedsDiscussionDraft}
                      onChange={(event) => { nextStepDraftDirty.current = true; setNextStepNeedsDiscussionDraft(event.target.checked); }}
                    />
                    Needs discussion
                  </label>
                  {nextStepNeedsDiscussionDraft ? (
                    primaryPendingAction?.discussion_item_id ? (
                      <button
                        type="button"
                        onClick={() => {
                          const url = new URL(window.location.href);
                          url.pathname = "/team-discussion";
                          url.searchParams.set("discussionId", String(primaryPendingAction.discussion_item_id));
                          url.searchParams.set("edit", "1");
                          window.location.href = url.toString();
                        }}
                        style={{
                          justifySelf: "start",
                          padding: "10px 14px",
                          borderRadius: "999px",
                          border: "1px solid #BFDBFE",
                          backgroundColor: "#EFF6FF",
                          color: "#1D4ED8",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Open linked discussion
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setShowDiscussionForm(true);
                          setShowNextStepForm(false);
                        }}
                        style={{
                          justifySelf: "start",
                          padding: "10px 14px",
                          borderRadius: "999px",
                          border: "1px solid #BFDBFE",
                          backgroundColor: "#EFF6FF",
                          color: "#1D4ED8",
                          fontSize: "12px",
                          fontWeight: 700,
                          cursor: "pointer",
                        }}
                      >
                        Open Team Discussion
                      </button>
                    )
                  ) : null}
                </div>
                {nextStepNeedsDiscussionDraft ? (
                  <div>
                    <label style={detailLabelStyle}>Discussion note</label>
                    <textarea
                      rows={2}
                      value={nextStepDiscussionNoteDraft}
                      onChange={(event) => { nextStepDraftDirty.current = true; setNextStepDiscussionNoteDraft(event.target.value); }}
                      placeholder="What needs review, input, or handoff?"
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        border: "1px solid #D1D5DB",
                        borderRadius: "10px",
                        fontSize: "14px",
                        boxSizing: "border-box",
                        fontFamily: "inherit",
                        resize: "vertical",
                      }}
                    />
                  </div>
                ) : null}
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="submit"
                    disabled={readOnly || savePendingActionMutation.isPending || !nextStepTextDraft.trim()}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "999px",
                      border: "none",
                      backgroundColor: "#6A5BFF",
                      color: "white",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {savePendingActionMutation.isPending ? "Saving..." : "Save next step"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (nextStepDraftDirty.current && !window.confirm("Discard your unsaved next-step changes?")) return;
                      nextStepDraftDirty.current = false;
                      setShowNextStepForm(false);
                      setNextStepTextDraft(primaryPendingAction?.title || prospect.next_action_text || "");
                      setNextStepDetailsDraft(primaryPendingAction?.details || "");
                      setNextStepDueDateDraft(primaryPendingAction?.due_date || prospect.next_action_due_date || "");
                      setNextStepCompletedDraft(
                        primaryPendingAction
                          ? primaryPendingAction.status === "Done"
                          : Boolean(prospect.next_action_completed_at),
                      );
                      setNextStepNeedsDiscussionDraft(Boolean(primaryPendingAction?.needs_discussion));
                      setNextStepDiscussionNoteDraft(primaryPendingAction?.discussion_note || "");
                    }}
                    disabled={savePendingActionMutation.isPending}
                    style={{
                      padding: "10px 14px",
                      borderRadius: "999px",
                      border: "1px solid #D1D5DB",
                      backgroundColor: "white",
                      color: "#374151",
                      fontSize: "12px",
                      fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          ) : null}

          {/* Log Action Form */}
          {showActionForm && (
            <div
              style={{
                backgroundColor: "#F9FAFB",
                borderRadius: "14px",
                padding: "18px",
                marginBottom: "20px",
                border: "1px solid #DDD6FE",
              }}
            >
              <p style={sectionEyebrowStyle}>Log action</p>
              <h4
                style={{
                  fontSize: "18px",
                  fontWeight: "700",
                  color: "#111827",
                  margin: "0 0 12px 0",
                }}
              >
                Capture the latest movement
              </h4>
              {supportsActionDictation ? (
                <div
                  style={{
                    marginBottom: "12px",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1px solid #BFDBFE",
                    backgroundColor: "#EFF6FF",
                    color: "#1D4ED8",
                    fontSize: "12px",
                    lineHeight: 1.5,
                  }}
                >
                  Use Dictate on Action Notes or Next Step to speak directly into the field.
                  Check the text before saving the action.
                </div>
              ) : (
                <div
                  style={{
                    marginBottom: "12px",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1px solid #FCD34D",
                    backgroundColor: "#FFFBEB",
                    color: "#92400E",
                    fontSize: "12px",
                    lineHeight: 1.5,
                  }}
                >
                  Live dictation is unavailable in this browser. Use Chrome or Edge to dictate an
                  action, or type the notes manually.
                </div>
              )}
              {actionDictationError ? (
                <div
                  style={{
                    marginBottom: "12px",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1px solid #FECACA",
                    backgroundColor: "#FEF2F2",
                    color: "#B91C1C",
                    fontSize: "12px",
                    lineHeight: 1.5,
                  }}
                >
                  {actionDictationError}
                </div>
              ) : null}
              {actionDictationStatus ? (
                <div
                  style={{
                    marginBottom: "12px",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1px solid #DDD6FE",
                    backgroundColor: "#F5F3FF",
                    color: "#5B21B6",
                    fontSize: "12px",
                    lineHeight: 1.5,
                  }}
                >
                  {actionDictationStatus}
                </div>
              ) : null}
              <div style={{ marginBottom: "12px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: "500",
                    color: "#6B7280",
                    marginBottom: "4px",
                  }}
                  >
                    Action type
                  </label>
                <div style={{ marginBottom: "12px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: "500",
                      color: "#6B7280",
                      marginBottom: "4px",
                    }}
                  >
                    Action category
                  </label>
                  <select
                    value={actionCategory}
                    onChange={(e) => setActionCategory(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      backgroundColor: "white",
                      marginBottom: "12px",
                    }}
                  >
                    {ACTION_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {category}
                      </option>
                    ))}
                  </select>
                </div>
                <select
                  value={actionType}
                  onChange={(e) => setActionType(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    backgroundColor: "white",
                  }}
                >
                  {ACTION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "12px",
                  marginBottom: "12px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: "500",
                      color: "#6B7280",
                      marginBottom: "4px",
                    }}
                  >
                    Status in NXT
                  </label>
                  <div
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      backgroundColor: "#F9FAFB",
                      color: "#111827",
                    }}
                  >
                    Completed
                  </div>
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: "500",
                      color: "#6B7280",
                      marginBottom: "4px",
                    }}
                  >
                    Action date
                  </label>
                  <input
                    type="date"
                    value={actionDate}
                    onChange={(e) => setActionDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  />
                  <div style={{ marginTop: "6px", fontSize: "12px", color: "#6B7280" }}>
                    NXT completed date is set to today automatically.
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: "500",
                    color: "#6B7280",
                    marginBottom: "4px",
                  }}
                >
                  Action Summary
                </label>
                <input
                  type="text"
                  value={actionSummary}
                  onChange={(e) => setActionSummary(e.target.value)}
                  placeholder="What happened?"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: "500",
                    color: "#6B7280",
                    marginBottom: "4px",
                  }}
                >
                  Notes
                </label>
                {supportsActionDictation ? (
                  <ActionDictationButton
                    target="notes"
                    label="notes"
                    dictationTarget={actionDictationTarget}
                    isRecording={isActionDictating}
                    onStart={startActionDictation}
                    onStop={stopActionDictation}
                    disabled={addActionMutation.isPending}
                  />
                ) : null}
                <textarea
                  value={actionNotes}
                  onChange={(e) => setActionNotes(e.target.value)}
                  placeholder="Capture the discussion, outcome, and any context you would normally log in NXT."
                  rows={3}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "12px",
                  marginBottom: "12px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: "500",
                      color: "#6B7280",
                      marginBottom: "4px",
                    }}
                  >
                    Next Step
                  </label>
                  {supportsActionDictation ? (
                    <ActionDictationButton
                      target="nextStep"
                      label="next step"
                      dictationTarget={actionDictationTarget}
                      isRecording={isActionDictating}
                      onStart={startActionDictation}
                      onStop={stopActionDictation}
                      disabled={addActionMutation.isPending}
                    />
                  ) : null}
                  <input
                    type="text"
                    value={actionNextStep}
                    onChange={(e) => setActionNextStep(e.target.value)}
                    placeholder="What should happen next?"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: "500",
                      color: "#6B7280",
                      marginBottom: "4px",
                    }}
                  >
                    Next Step Due
                  </label>
                  <input
                    type="date"
                    value={actionNextStepDueDate}
                    onChange={(e) => setActionNextStepDueDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label
                  style={{
                    display: "block",
                    fontSize: "13px",
                    fontWeight: "500",
                    color: "#6B7280",
                    marginBottom: "4px",
                  }}
                >
                  Link to Opportunity
                </label>
                <select
                  value={actionLinkedOpportunityId}
                  onChange={(e) => setActionLinkedOpportunityId(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    backgroundColor: "white",
                  }}
                >
                  <option value="">No linked opportunity</option>
                  {opportunities.map((opportunity) => (
                    <option key={opportunity.id} value={opportunity.id}>
                      {opportunity.title}
                    </option>
                  ))}
                </select>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "12px",
                  marginBottom: "12px",
                }}
              >
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: "500",
                      color: "#6B7280",
                      marginBottom: "4px",
                    }}
                  >
                    Primary fundraiser
                  </label>
                  <div
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      backgroundColor: "#F9FAFB",
                      color: "#111827",
                    }}
                  >
                    {actionPrimaryFundraiserName}
                  </div>
                </div>
                <div>
                  <label
                    style={{
                      display: "block",
                      fontSize: "13px",
                      fontWeight: "500",
                      color: "#6B7280",
                      marginBottom: "4px",
                    }}
                  >
                    Additional fundraiser
                  </label>
                  <select
                    value={actionAdditionalFundraiserUserId}
                    onChange={(e) => setActionAdditionalFundraiserUserId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      backgroundColor: "white",
                    }}
                  >
                    <option value="">No additional fundraiser</option>
                    {mgoUsers
                      .filter((option) => String(option.id) !== String(prospect.user_id))
                      .map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div
                style={{
                  marginBottom: "12px",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  backgroundColor: linkedBlackbaudConstituentId ? "#EFF6FF" : "#F3F4F6",
                  border: linkedBlackbaudConstituentId
                    ? "1px solid #BFDBFE"
                    : "1px solid #E5E7EB",
                  fontSize: "12px",
                  color: linkedBlackbaudConstituentId ? "#1D4ED8" : "#6B7280",
                  lineHeight: 1.5,
                }}
              >
                {linkedBlackbaudConstituentId
                  ? "This action will be logged in the app, sent to NXT, marked completed, and assigned to the current dashboard owner. You can add one additional fundraiser if another MGO was involved."
                  : "This action will be saved in the app only because this prospect is not linked to Blackbaud."}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={saveActionLog}
                  disabled={
                    addActionMutation.isPending ||
                    isActionDictating ||
                    (!actionSummary.trim() && !actionNotes.trim())
                  }
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#6A5BFF",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  {addActionMutation.isPending ? "Saving..." : "Save Action"}
                </button>
                <button
                  onClick={() => {
                    stopActionDictation();
                    setShowActionForm(false);
                  }}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#F3F4F6",
                    color: "#374151",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Add Opportunity Form */}
          {showOpportunityForm && (
            <div
              style={{
                backgroundColor: "#F9FAFB",
                borderRadius: "14px",
                padding: "18px",
                marginBottom: "20px",
                border: "1px solid #BFDBFE",
              }}
            >
              <p style={sectionEyebrowStyle}>Add opportunity</p>
              <h4
                style={{
                  fontSize: "18px",
                  fontWeight: "700",
                  color: "#111827",
                  margin: "0 0 12px 0",
                }}
              >
                Start or update the current ask
              </h4>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#6B7280", marginBottom: "4px" }}>
                  Opportunity Name
                </label>
                <input
                  type="text"
                  value={newOpportunityData.title}
                  onChange={(e) =>
                    setNewOpportunityData((prev) => ({ ...prev, title: e.target.value }))
                  }
                  placeholder={`${prospect.prospect_name} opportunity`}
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "12px",
                  marginBottom: "12px",
                }}
              >
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#6B7280", marginBottom: "4px" }}>
                    Status
                  </label>
                  <select
                    value={newOpportunityData.currentStage}
                    onChange={(e) =>
                      setNewOpportunityData((prev) => ({
                        ...prev,
                        currentStage: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      backgroundColor: "white",
                    }}
                  >
                    {OPPORTUNITY_STAGE_OPTIONS.map((stage) => (
                      <option key={stage} value={stage}>
                        {stage}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#6B7280", marginBottom: "4px" }}>
                    Ask Amount
                  </label>
                  <input
                    type="number"
                    value={newOpportunityData.estimatedAmount}
                    onChange={(e) =>
                      setNewOpportunityData((prev) => ({
                        ...prev,
                        estimatedAmount: e.target.value,
                      }))
                    }
                    placeholder="0.00"
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#6B7280", marginBottom: "4px" }}>
                    Ask Date
                  </label>
                  <input
                    type="date"
                    value={newOpportunityData.askDate}
                    onChange={(e) =>
                      setNewOpportunityData((prev) => ({ ...prev, askDate: e.target.value }))
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#6B7280", marginBottom: "4px" }}>
                    Date Expected
                  </label>
                  <input
                    type="date"
                    value={newOpportunityData.expectedDate}
                    onChange={(e) =>
                      setNewOpportunityData((prev) => ({
                        ...prev,
                        expectedDate: e.target.value,
                      }))
                    }
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#6B7280", marginBottom: "4px" }}>
                  Opportunity Notes
                </label>
                <textarea
                  value={newOpportunityData.latestNotes}
                  onChange={(e) =>
                    setNewOpportunityData((prev) => ({
                      ...prev,
                      latestNotes: e.target.value,
                    }))
                  }
                  rows={3}
                  placeholder="Capture the current ask strategy, recent movement, or notes."
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={saveNewOpportunity}
                  disabled={addOpportunityMutation.isPending}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#1D4ED8",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  {addOpportunityMutation.isPending ? "Saving..." : "Save Opportunity"}
                </button>
                <button
                  onClick={() => setShowOpportunityForm(false)}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#F3F4F6",
                    color: "#374151",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {showDiscussionForm && (
            <div
              style={{
                backgroundColor: "#F9FAFB",
                borderRadius: "14px",
                padding: "18px",
                marginBottom: "20px",
                border: "1px solid #D1D5DB",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "12px",
                  flexWrap: "wrap",
                  marginBottom: "12px",
                }}
              >
                <div>
                  <p style={sectionEyebrowStyle}>Team discussion</p>
                  <h4
                    style={{
                      fontSize: "18px",
                      fontWeight: "700",
                      color: "#111827",
                      margin: "0 0 4px 0",
                    }}
                  >
                    Capture an internal talking point or follow-up
                  </h4>
                </div>
                {(() => {
                  const badge = getSyncBadge("internal");
                  return (
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "6px",
                        padding: "4px 10px",
                        borderRadius: "999px",
                        fontSize: "11px",
                        fontWeight: "700",
                        backgroundColor: badge.bg,
                        color: badge.text,
                        border: `1px solid ${badge.border}`,
                      }}
                    >
                      {badge.label}
                    </span>
                  );
                })()}
              </div>
              <p
                style={{
                  margin: "0 0 12px 0",
                  fontSize: "14px",
                  color: "#4B5563",
                  lineHeight: 1.6,
                }}
              >
                Use this for internal discussion, meeting prep, and items you want to hand off or review with a teammate. It stays in the companion app and does not write to NXT.
              </p>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#6B7280", marginBottom: "4px" }}>
                  Subject
                </label>
                <input
                  type="text"
                  value={discussionSubject}
                  onChange={(e) => setDiscussionSubject(e.target.value)}
                  placeholder="What should the team discuss or follow up on?"
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                  }}
                />
              </div>
              <div style={{ marginBottom: "12px" }}>
                <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#6B7280", marginBottom: "4px" }}>
                  Discussion notes
                </label>
                <textarea
                  value={discussionBody}
                  onChange={(e) => setDiscussionBody(e.target.value)}
                  rows={3}
                  placeholder="Add context, teammate questions, or talking points for the next meeting."
                  style={{
                    width: "100%",
                    padding: "8px 12px",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                    resize: "vertical",
                  }}
                />
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                  gap: "12px",
                  marginBottom: "12px",
                }}
              >
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#6B7280", marginBottom: "4px" }}>
                    Due date
                  </label>
                  <input
                    type="date"
                    value={discussionDueDate}
                    onChange={(e) => setDiscussionDueDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: "block", fontSize: "13px", fontWeight: "500", color: "#6B7280", marginBottom: "4px" }}>
                    Share with teammate
                  </label>
                  <select
                    value={discussionAssignedUserId}
                    onChange={(e) => setDiscussionAssignedUserId(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      backgroundColor: "white",
                    }}
                  >
                    <option value="">Keep with my workspace</option>
                    {mgoUsers
                      .filter((option) => String(option.id) !== String(prospect.user_id))
                      .map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              {discussionError ? (
                <div
                  style={{
                    marginBottom: "12px",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    backgroundColor: "#FEF2F2",
                    border: "1px solid #FECACA",
                    color: "#991B1B",
                    fontSize: "13px",
                  }}
                >
                  {discussionError}
                </div>
              ) : null}
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={saveDiscussionItem}
                  disabled={discussionMutation.isPending || !discussionSubject.trim()}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#111827",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  {discussionMutation.isPending ? "Saving..." : "Save Discussion Item"}
                </button>
                <button
                  onClick={() => setShowDiscussionForm(false)}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#F3F4F6",
                    color: "#374151",
                    border: "1px solid #E5E7EB",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: "18px",
              marginBottom: "24px",
            }}
          >
          <ProspectDetailSummary
            linkedBlackbaudConstituentId={linkedBlackbaudConstituentId}
            linkedBlackbaudConstituentProfileUrl={linkedBlackbaudConstituentProfileUrl}
            blackbaudSummary={blackbaudSummary}
            blackbaudSummaryLoading={blackbaudSummaryLoading}
            blackbaudSummaryError={blackbaudSummaryError}
            pledgeData={pledgeData}
            showBlackbaudNarrativeSummary={showBlackbaudNarrativeSummary}
            onToggleNarrative={() =>
              setShowBlackbaudNarrativeSummary((current) => !current)
            }
          />

          <div style={{ ...workspaceCardStyle, backgroundColor: "#FCFCFD" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                marginBottom: "12px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <p style={sectionEyebrowStyle}>Team discussion</p>
                <div style={{ fontSize: "16px", fontWeight: "700", color: "#111827" }}>
                  Internal talking points and follow-up
                </div>
              </div>
              {(() => {
                const badge = getSyncBadge("internal");
                return (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                      padding: "4px 10px",
                      borderRadius: "999px",
                      fontSize: "11px",
                      fontWeight: "700",
                      backgroundColor: badge.bg,
                      color: badge.text,
                      border: `1px solid ${badge.border}`,
                    }}
                  >
                    {badge.label}
                  </span>
                );
              })()}
            </div>
            {discussionItems.length === 0 ? (
              <p
                style={{
                  fontSize: "14px",
                  color: "#6B7280",
                  margin: 0,
                  lineHeight: 1.6,
                }}
              >
                No open discussion items yet. Use <strong>Team Discussion</strong> when you need to capture something to discuss with a teammate or bring to a strategy meeting.
              </p>
            ) : (
              <div style={{ display: "grid", gap: "10px" }}>
                {discussionItems.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    style={{
                      border: "1px solid #E5E7EB",
                      borderRadius: "12px",
                      padding: "12px 14px",
                      backgroundColor: item.status === "Open" ? "white" : "#F9FAFB",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "12px",
                        marginBottom: "6px",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>
                          {item.subject}
                        </div>
                        <div style={{ fontSize: "12px", color: "#6B7280", marginTop: "4px" }}>
                          {item.assigned_user_name
                            ? `Shared with ${item.assigned_user_name}`
                            : "Kept in this workspace"}
                          {item.due_date ? ` · Due ${formatShortDate(item.due_date)}` : ""}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => toggleDiscussionStatus(item)}
                        disabled={updateDiscussionMutation.isPending}
                        style={{
                          border: "1px solid #D1D5DB",
                          backgroundColor: "white",
                          color: "#374151",
                          borderRadius: "999px",
                          padding: "6px 10px",
                          fontSize: "11px",
                          fontWeight: "700",
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.status === "Open" ? "Mark resolved" : "Reopen"}
                      </button>
                    </div>
                    {item.body ? (
                      <div style={{ fontSize: "13px", color: "#374151", lineHeight: 1.6 }}>
                        {item.body}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          <ActiveOpportunitySection
            opportunityGroups={opportunityGroups}
            editingOpportunityId={editingOpportunityId}
            opportunityEditFeedback={opportunityEditFeedback}
            renderOpportunityCard={renderOpportunityCard}
          />
          </div>

          <ProspectDetailActivity
            timelineEvents={timelineEvents}
            highlights={
              <ProspectActivityHighlights
                prospectId={prospectId}
                linked={Boolean(linkedBlackbaudConstituentId)}
                updates={updates}
              />
            }
            expandedTimelineId={expandedTimelineId}
            editingUpdateId={editingUpdateId}
            readOnly={readOnly}
            isDeleting={deleteTimelineEntryMutation.isPending}
            onToggleEvent={(id) =>
              setExpandedTimelineId((current) => (current === id ? null : id))
            }
            onEdit={startEditingTimelineUpdate}
            onDelete={deleteTimelineUpdate}
            renderDeleteConfirmation={(event) =>
              pendingDeleteEvent?.id === event.id ? (
                <div
                  style={{
                    margin: "10px 0",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid #FCA5A5",
                    backgroundColor: "#FEF2F2",
                    color: "#7F1D1D",
                    fontSize: "12px",
                    lineHeight: 1.5,
                  }}
                >
                  <p style={{ margin: "0 0 10px 0", fontWeight: "700" }}>
                    {event.raw?.blackbaud_action_id
                      ? "Caution: this will delete this activity from Raiser's Edge NXT and may break any associated opportunity links."
                      : "Delete this activity from the app?"}
                  </p>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={confirmDeleteTimelineUpdate}
                      disabled={deleteTimelineEntryMutation.isPending}
                      style={{
                        padding: "7px 11px",
                        borderRadius: "8px",
                        border: "1px solid #B91C1C",
                        backgroundColor: "#B91C1C",
                        color: "white",
                        fontSize: "12px",
                        fontWeight: "700",
                        cursor: deleteTimelineEntryMutation.isPending
                          ? "not-allowed"
                          : "pointer",
                        opacity: deleteTimelineEntryMutation.isPending ? 0.7 : 1,
                      }}
                    >
                      {deleteTimelineEntryMutation.isPending
                        ? "Deleting..."
                        : event.raw?.blackbaud_action_id
                          ? "Delete from NXT and app"
                          : "Delete activity"}
                    </button>
                    {event.raw?.blackbaud_action_id ? (
                      <button
                        type="button"
                        onClick={() => confirmDeleteTimelineUpdate({ localOnly: true })}
                        disabled={deleteTimelineEntryMutation.isPending}
                        style={{
                          padding: "7px 11px",
                          borderRadius: "8px",
                          border: "1px solid #FCA5A5",
                          backgroundColor: "white",
                          color: "#991B1B",
                          fontSize: "12px",
                          fontWeight: "700",
                          cursor: deleteTimelineEntryMutation.isPending
                            ? "not-allowed"
                            : "pointer",
                        }}
                      >
                        Remove from app only
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => setPendingDeleteEvent(null)}
                      disabled={deleteTimelineEntryMutation.isPending}
                      style={{
                        padding: "7px 11px",
                        borderRadius: "8px",
                        border: "1px solid #FCA5A5",
                        backgroundColor: "white",
                        color: "#991B1B",
                        fontSize: "12px",
                        fontWeight: "700",
                        cursor: deleteTimelineEntryMutation.isPending
                          ? "not-allowed"
                          : "pointer",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null
            }
            renderEditor={(event) => (
              <div>
                <div style={{ marginBottom: "10px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: event.accent,
                      marginBottom: "4px",
                    }}
                  >
                    Update date
                  </label>
                  <input
                    type="date"
                    value={editingUpdateDate}
                    onChange={(e) => setEditingUpdateDate(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: `1px solid ${event.border}`,
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      backgroundColor: "white",
                    }}
                  />
                </div>
                <div style={{ marginBottom: "10px" }}>
                  <label
                    style={{
                      display: "block",
                      fontSize: "12px",
                      fontWeight: "600",
                      color: event.accent,
                      marginBottom: "4px",
                    }}
                  >
                    Update notes
                  </label>
                  <textarea
                    value={editingUpdateNotes}
                    onChange={(e) => setEditingUpdateNotes(e.target.value)}
                    rows={4}
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      border: `1px solid ${event.border}`,
                      borderRadius: "8px",
                      fontSize: "14px",
                      boxSizing: "border-box",
                      fontFamily: "inherit",
                      resize: "vertical",
                      backgroundColor: "white",
                    }}
                  />
                </div>
                <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={saveTimelineUpdate}
                    disabled={updateTimelineEntryMutation.isPending}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "8px",
                      border: "none",
                      backgroundColor: "#6A5BFF",
                      color: "white",
                      fontWeight: "700",
                      cursor: updateTimelineEntryMutation.isPending
                        ? "not-allowed"
                        : "pointer",
                    }}
                  >
                    {updateTimelineEntryMutation.isPending ? "Saving..." : "Save update"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingUpdateId(null);
                      setEditingUpdateNotes("");
                      setEditingUpdateDate("");
                    }}
                    style={{
                      padding: "8px 14px",
                      borderRadius: "8px",
                      border: `1px solid ${event.border}`,
                      backgroundColor: "white",
                      color: event.accent,
                      fontWeight: "700",
                      cursor: "pointer",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          />
          <ClosedOpportunityHistory
            opportunityGroups={opportunityGroups}
            renderOpportunityCard={renderOpportunityCard}
          />
        </div>
      </div>
    </div>
    {giftLinkPrompt ? (
      <OpportunityGiftLinkModal
        opportunityId={giftLinkPrompt.opportunityId}
        constituentId={giftLinkPrompt.constituentId}
        opportunityTitle={giftLinkPrompt.opportunityTitle}
        onClose={() => setGiftLinkPrompt(null)}
        onSaved={() => {
          setGiftLinkPrompt(null);
          setOpportunityEditFeedback(
            "Gift link saved in JUMGOGPT. NXT linking still requires manual review.",
          );
          queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
        }}
      />
    ) : null}
    </>
  );
}

export default function MyTopProspectsPage() {
  const { data: user, loading } = useUser();
  const queryClient = useQueryClient();
  const [workspaceSwitchMessage, setWorkspaceSwitchMessage] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProspectId, setSelectedProspectId] = useState(null);
  const [selectedProspectPanel, setSelectedProspectPanel] = useState("");
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState("top-prospects");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fyFilter, setFyFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [addProspectInitialData, setAddProspectInitialData] = useState(null);
  const [addProspectMessage, setAddProspectMessage] = useState("");
  const [addProspectError, setAddProspectError] = useState("");
  const [portfolioSyncMessage, setPortfolioSyncMessage] = useState("");
  const [portfolioSyncError, setPortfolioSyncError] = useState("");
  const [shouldLoadPortfolioCurrentFyGiving, setShouldLoadPortfolioCurrentFyGiving] =
    useState(false);
  const [removingSolicitorConstituentId, setRemovingSolicitorConstituentId] =
    useState("");
  const [portfolioFollowUp, setPortfolioFollowUp] = useState(null);
  const [showPortfolioCategoryManager, setShowPortfolioCategoryManager] =
    useState(false);
  const [portfolioCategoryFeedback, setPortfolioCategoryFeedback] = useState("");
  const [portfolioCategoryError, setPortfolioCategoryError] = useState("");
  const [movingPortfolioCategoryConstituentId, setMovingPortfolioCategoryConstituentId] =
    useState("");
  const autoBootstrapAttemptRef = useRef("");

  const { data: profileStatus } = useQuery({
    queryKey: ["profile-sync-status"],
    queryFn: async () => {
      const res = await fetch("/api/users/profile");
      if (!res.ok) throw new Error("Failed to fetch profile");
      const data = await res.json();
      return data;
    },
    enabled: !!user,
    staleTime: 30 * 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });
  const currentRole = profileStatus?.user?.role || null;
  const isAdmin = isAdminRole(currentRole);
  const canUseExecutiveView = canUseExecutiveViewRole(currentRole);
  const { data: actingWorkspaceStatus } = useQuery({
    queryKey: ["acting-workspace-status", profileStatus?.user?.id || null],
    queryFn: async () => {
      const response = await fetch("/api/admin/workspace-user");
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load acting workspace");
      }
      return payload;
    },
    enabled: Boolean(canUseExecutiveView),
  });
  const { data: mgoUsers = [] } = useQuery({
    queryKey: ["workspace-mgo-users", profileStatus?.user?.id || null],
    queryFn: async () => {
      const response = await fetch("/api/users/mgos");
      const payload = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load MGO users");
      }
      return Array.isArray(payload) ? payload : [];
    },
    enabled: Boolean(canUseExecutiveView),
  });
  const actingWorkspaceUser = actingWorkspaceStatus?.actingUser || null;
  const isExecutiveReadOnly = !profileStatus || Boolean(
    profileStatus.actingAsUser && !canEditWorkspaceAsRole(
      currentRole,
      profileStatus.workspaceUser?.role,
    ),
  );

  const activeWorkspaceUserId = profileStatus?.workspaceUser?.id || null;
  const { data: pledgeData } = useProspectPledgeStatus(
    profileStatus?.user?.id,
    activeWorkspaceUserId,
  );
  const portfolioCategoryQueryKey = [
    "portfolio-categories",
    activeWorkspaceUserId,
  ];

  const {
    data: portfolioCategoryData = { categories: [], assignments: [] },
    isError: isPortfolioCategoryError,
  } = useQuery({
    queryKey: portfolioCategoryQueryKey,
    queryFn: async () => {
      const response = await fetch("/api/portfolio-categories");
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load portfolio categories");
      }

      return {
        categories: Array.isArray(payload?.categories) ? payload.categories : [],
        assignments: Array.isArray(payload?.assignments) ? payload.assignments : [],
      };
    },
    enabled:
      !!user && !!activeWorkspaceUserId && activeWorkspaceTab === "portfolio",
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: prospects = [], isLoading } = useQuery({
    queryKey: ["prospects", activeWorkspaceUserId],
    queryFn: async () => {
      const res = await fetch("/api/prospects");
      if (!res.ok) throw new Error("Failed to fetch prospects");
      return res.json();
    },
    enabled: !!user && !!activeWorkspaceUserId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const topProspectAnnualConstituentIds = useMemo(() => {
    const seen = new Set();
    const ids = [];
    for (const prospect of prospects) {
      if (prospect?.status !== "Active") continue;
      const constituentId = getProspectBlackbaudConstituentId(prospect);
      if (!constituentId || seen.has(constituentId)) continue;
      seen.add(constituentId);
      ids.push(constituentId);
    }
    return ids;
  }, [prospects]);
  const topProspectAnnualConstituentIdParam =
    topProspectAnnualConstituentIds.join(",");

  const {
    data: topProspectAnnualGivingSocietiesByConstituentId = {},
  } = useQuery({
    queryKey: [
      "top-prospect-annual-giving-societies",
      activeWorkspaceUserId,
      topProspectAnnualConstituentIdParam,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("constituentIds", topProspectAnnualConstituentIdParam);
      const res = await fetch(
        `/api/blackbaud/annual-giving-societies?${params.toString()}`,
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          payload?.error || "Failed to fetch annual giving societies",
        );
      }
      return payload?.byConstituentId || {};
    },
    enabled:
      !!user &&
      !!activeWorkspaceUserId &&
      activeWorkspaceTab === "top-prospects" &&
      topProspectAnnualConstituentIds.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: summary } = useQuery({
    queryKey: ["prospect-summary-base", activeWorkspaceUserId],
    queryFn: async () => {
      const res = await fetch("/api/prospects/summary?includeClosed=0");
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
    enabled: !!user && !!activeWorkspaceUserId,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const { data: closedSummary, isLoading: isClosedSummaryLoading, isError: isClosedSummaryError } = useQuery({
    queryKey: ["prospect-summary-closed", activeWorkspaceUserId, "standings-snapshot"],
    queryFn: async () => {
      const res = await fetch("/api/prospects/summary?source=team_standings");
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
    enabled: !!user && !!activeWorkspaceUserId,
    // This now reads a saved snapshot only; refocusing never reruns NXT.
    staleTime: 0,
    refetchOnWindowFocus: true,
  });

  const { data: stewardshipActions = [], isLoading: isStewardshipLoading } = useQuery({
    queryKey: ["stewardship-actions", activeWorkspaceUserId],
    queryFn: async () => {
      const res = await fetch(
        `/api/pending-actions?status=Open&category=${encodeURIComponent(STEWARDSHIP_CATEGORY)}`,
      );
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || "Failed to fetch stewardship follow-up");
      }
      return Array.isArray(payload) ? payload : [];
    },
    enabled:
      !!user && !!activeWorkspaceUserId && activeWorkspaceTab === "top-prospects",
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const {
    data: blackbaudPortfolio,
    isLoading: isBlackbaudPortfolioLoading,
    isError: isBlackbaudPortfolioError,
  } = useQuery({
    queryKey: [
      "blackbaud-portfolio",
      profileStatus?.workspaceUser?.id,
      profileStatus?.workspaceUser?.blackbaud_constituent_id,
      profileStatus?.workspaceUser?.blackbaud_lookup_id,
    ],
    queryFn: async () => {
      const res = await fetch("/api/blackbaud/portfolio");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to fetch Blackbaud portfolio");
      }
      return data;
    },
    enabled:
      !!user &&
      activeWorkspaceTab === "portfolio" &&
      !!(
        profileStatus?.workspaceUser?.blackbaud_constituent_id ||
        profileStatus?.workspaceUser?.blackbaud_lookup_id
      ),
    staleTime: 5 * 60 * 1000,
    // Names omitted by fundraiser assignments are hydrated in small server-side
    // batches. Failed lookups yield briefly so later cards can continue loading.
    refetchInterval: (query) =>
      query.state.data?.portfolioMeta?.identityHydrationPollIntervalMs || false,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
  });

  const isLocalPortfolioFallback =
    blackbaudPortfolio?.portfolioMeta?.source === "local-prospect-snapshot";

  const portfolioRefreshQueryKey = [
    "portfolio-refresh-job",
    activeWorkspaceUserId,
  ];
  const { data: portfolioRefreshState } = useQuery({
    queryKey: portfolioRefreshQueryKey,
    queryFn: async () => {
      const response = await fetch("/api/blackbaud/portfolio-refresh", {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load portfolio refresh progress");
      }
      return payload || { job: null, inventory: null };
    },
    enabled:
      !!user &&
      !!activeWorkspaceUserId &&
      activeWorkspaceTab === "portfolio" &&
      !isExecutiveReadOnly,
    staleTime: 0,
    refetchInterval: (query) =>
      query.state.data?.job?.status === "paused"
        ? 10000
        : ["queued", "processing"].includes(query.state.data?.job?.status) ? 3000 : false,
    refetchOnWindowFocus: false,
  });
  const portfolioRefreshMutation = useMutation({
    mutationFn: async ({ action, mode, jobId } = {}) => {
      const response = await fetch("/api/blackbaud/portfolio-refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, mode, jobId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Portfolio refresh request failed");
      }
      return payload;
    },
    onSuccess: (payload) => {
      queryClient.setQueryData(portfolioRefreshQueryKey, (current) => ({
        ...(current || {}),
        ...(payload || {}),
      }));
      if (["completed", "completed_with_failures"].includes(payload?.job?.status)) {
        queryClient.invalidateQueries({ queryKey: ["blackbaud-portfolio"] });
        queryClient.invalidateQueries({ queryKey: portfolioRefreshQueryKey });
      }
      queryClient.invalidateQueries({ queryKey: ["portfolio-current-fy-giving", activeWorkspaceUserId] });
      queryClient.invalidateQueries({ queryKey: ["portfolio-annual-giving-societies", activeWorkspaceUserId] });
    },
  });
  const portfolioRefreshJob = portfolioRefreshState?.job || null;
  usePortfolioRefreshRunner({
    job: portfolioRefreshJob,
    enabled: activeWorkspaceTab === "portfolio" && !!user && !isExecutiveReadOnly,
    isPending: portfolioRefreshMutation.isPending,
    error: portfolioRefreshMutation.error,
    onProcess: portfolioRefreshMutation.mutate,
  });

  const portfolioAnnualConstituentIds = useMemo(() => {
    const seen = new Set();
    const ids = [];
    const portfolioAssignments = [
      ...(blackbaudPortfolio?.leadSolicitor || []),
      ...(blackbaudPortfolio?.supportingSolicitor || []),
    ];

    for (const person of portfolioAssignments) {
      const constituentId = String(person?.constituentId || "").trim();
      if (!constituentId || seen.has(constituentId)) continue;
      seen.add(constituentId);
      ids.push(constituentId);
    }

    return ids;
  }, [blackbaudPortfolio]);
  const portfolioAnnualConstituentIdParam = portfolioAnnualConstituentIds.join(",");

  const {
    data: portfolioAnnualGivingSocietiesResponse,
  } = useQuery({
    queryKey: [
      "portfolio-annual-giving-societies",
      activeWorkspaceUserId,
      portfolioAnnualConstituentIdParam,
    ],
    queryFn: async () => {
      const combined = {};
      const failedBatches = [];
      for (const constituentIds of chunkValues(
        portfolioAnnualConstituentIds,
        ANNUAL_GIVING_REQUEST_SIZE,
      )) {
        const params = new URLSearchParams();
        params.set("constituentIds", constituentIds.join(","));
        params.set("portfolio_snapshot", "1");
        const res = await fetch(
          `/api/blackbaud/annual-giving-societies?${params.toString()}`,
        );
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          failedBatches.push({ count: constituentIds.length, status: res.status });
          // Do not turn a provider pause into hundreds of follow-up calls.
          if (res.status === 429 || res.status === 503 || payload?.quotaPaused) break;
          continue;
        }
        Object.assign(combined, payload?.byConstituentId || {});
      }
      return { values: combined, failedBatches };
    },
    enabled:
      !!user &&
      !!activeWorkspaceUserId &&
      activeWorkspaceTab === "portfolio" &&
      !isLocalPortfolioFallback &&
      portfolioAnnualConstituentIds.length > 0,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
  const portfolioAnnualGivingSocietiesByConstituentId =
    portfolioAnnualGivingSocietiesResponse?.values || {};

  useEffect(() => {
    setShouldLoadPortfolioCurrentFyGiving(false);

    if (
      !user ||
      !activeWorkspaceUserId ||
      activeWorkspaceTab !== "portfolio" ||
      isLocalPortfolioFallback ||
      portfolioAnnualConstituentIds.length === 0
    ) {
      return undefined;
    }

    // Render the NXT portfolio first. This summary is intentionally delayed so it
    // never controls whether an MGO can see or use their assigned constituents.
    const timeoutId = window.setTimeout(() => {
      setShouldLoadPortfolioCurrentFyGiving(true);
    }, 1800);
    return () => window.clearTimeout(timeoutId);
  }, [
    activeWorkspaceTab,
    activeWorkspaceUserId,
    portfolioAnnualConstituentIdParam,
    portfolioAnnualConstituentIds.length,
    isLocalPortfolioFallback,
    user,
  ]);

  const {
    data: portfolioCurrentFyGivingResponse,
  } = useQuery({
    queryKey: [
      "portfolio-current-fy-giving",
      activeWorkspaceUserId,
      portfolioAnnualConstituentIdParam,
    ],
    queryFn: async () => {
      const payloads = [];
      const failedBatches = [];

      // The API accepts no more than 50 IDs per request. Load one bounded batch
      // at a time so every assigned constituent is included without competing
      // with the initial portfolio render or overloading the Gift API.
      for (const constituentIds of chunkValues(
        portfolioAnnualConstituentIds,
        CURRENT_FY_GIVING_REQUEST_SIZE,
      )) {
        const params = new URLSearchParams();
        params.set("constituentIds", constituentIds.join(","));
        params.set("portfolio_snapshot", "1");
        const res = await fetch(
          `/api/blackbaud/current-fy-giving?${params.toString()}`,
        );
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          failedBatches.push({ count: constituentIds.length, status: res.status });
          if (res.status === 429 || res.status === 503 || payload?.quotaPaused) break;
          continue;
        }
        payloads.push(payload || {});
      }

      return payloads.reduce(
        (combined, payload) => ({
          ...combined,
          // Each batch uses the same fiscal-year window. Retain the first
          // populated period while combining every constituent result.
          period: combined.period || payload?.period || null,
          byConstituentId: {
            ...combined.byConstituentId,
            ...(payload?.byConstituentId || {}),
          },
          warnings: {
            ...combined.warnings,
            ...(payload?.warnings || {}),
          },
        }),
        { period: null, byConstituentId: {}, warnings: {}, failedBatches },
      );
    },
    enabled:
      shouldLoadPortfolioCurrentFyGiving &&
      !!user &&
      !!activeWorkspaceUserId &&
      activeWorkspaceTab === "portfolio" &&
      !isLocalPortfolioFallback &&
      portfolioAnnualConstituentIds.length > 0,
    staleTime: 15 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
  const portfolioCurrentFyGivingByConstituentId =
    portfolioCurrentFyGivingResponse?.byConstituentId || {};
  const portfolioCurrentFyLabel =
    portfolioCurrentFyGivingResponse?.period?.yearLabel || "";

  useEffect(() => {
    if (!user || !profileStatus?.workspaceUser?.id) return;
    // Bootstrap calls its own NXT assignment and prospect-sync workflow.
    // Do not compete with the live portfolio request on the first portfolio view.
    if (activeWorkspaceTab === "portfolio") return;

    const workspaceUser = profileStatus.workspaceUser;
    const hasBlackbaudLink =
      Boolean(workspaceUser.blackbaud_constituent_id) ||
      Boolean(workspaceUser.blackbaud_lookup_id);
    if (!hasBlackbaudLink) return;

    const shouldBootstrap =
      !workspaceUser.blackbaud_portfolio_seeded_at ||
      Boolean(workspaceUser.blackbaud_portfolio_seed_error);
    if (!shouldBootstrap) return;

    const attemptKey = [
      workspaceUser.id,
      workspaceUser.blackbaud_lookup_id || "",
      workspaceUser.blackbaud_constituent_id || "",
      workspaceUser.blackbaud_portfolio_seeded_at || "",
      workspaceUser.blackbaud_portfolio_seed_error || "",
    ].join(":");

    if (autoBootstrapAttemptRef.current === attemptKey) return;
    autoBootstrapAttemptRef.current = attemptKey;

    (async () => {
      try {
        await fetch("/api/users/profile?bootstrapPortfolio=1");
      } catch (error) {
        console.error("Automatic portfolio bootstrap failed:", error);
      } finally {
        queryClient.invalidateQueries({ queryKey: ["profile-sync-status"] });
        queryClient.invalidateQueries({ queryKey: ["prospects"] });
        queryClient.invalidateQueries({ queryKey: ["prospect-summary-base"] });
        queryClient.invalidateQueries({ queryKey: ["prospect-summary-closed"] });
        queryClient.invalidateQueries({ queryKey: ["blackbaud-portfolio"] });
      }
    })();
  }, [activeWorkspaceTab, profileStatus, queryClient, user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const searchParams = new URLSearchParams(window.location.search);
    const requestedTab = searchParams.get("tab");
    const requestedProspectId = searchParams.get("prospectId");
    const requestedPanel = searchParams.get("panel") || "";
    const requestedStatusFilter = searchParams.get("statusFilter");
    const requestedFyFilter = searchParams.get("fyFilter");
    const requestedActionFilter = searchParams.get("actionFilter");
    const requestedSearch = searchParams.get("search");

    if (requestedTab === "portfolio") {
      setActiveWorkspaceTab("portfolio");
    }

    if (requestedStatusFilter) {
      setStatusFilter(requestedStatusFilter);
    }
    if (requestedFyFilter) {
      setFyFilter(requestedFyFilter);
    }
    if (requestedActionFilter) {
      setActionFilter(requestedActionFilter);
    }
    if (requestedSearch) {
      setSearchTerm(requestedSearch);
    }

    if (!requestedProspectId) return;
    const numericId = Number(requestedProspectId);
    if (Number.isInteger(numericId) && numericId > 0) {
      setSelectedProspectId(numericId);
      setSelectedProspectPanel(requestedPanel);
    }
  }, []);

  const updateWorkspaceTab = (tab) => {
    setActiveWorkspaceTab(tab);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (tab === "portfolio") {
      url.searchParams.set("tab", "portfolio");
    } else {
      url.searchParams.delete("tab");
    }
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  };

  const closeProspectWorkspace = () => {
    setSelectedProspectId(null);
    setSelectedProspectPanel("");
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (url.searchParams.has("prospectId")) {
      url.searchParams.delete("prospectId");
      url.searchParams.delete("panel");
      url.searchParams.delete("actionId");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
  };

  const addMutation = useMutation({
    onMutate: () => {
      setAddProspectMessage("");
      setAddProspectError("");
    },
    mutationFn: async (body) => {
      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to add prospect");
      }
      return data;
    },
    onSuccess: async (createdProspect) => {
      if (activeWorkspaceUserId) {
        queryClient.setQueryData(["prospects", activeWorkspaceUserId], (current) => {
          if (!Array.isArray(current) || !createdProspect?.id) return current;
          const normalized = { ...createdProspect, status: createdProspect.status || "Active" };
          const withoutExisting = current.filter(
            (prospect) => String(prospect.id) !== String(normalized.id),
          );
          return [...withoutExisting, normalized].sort((left, right) => {
            const leftOrder = Number(left.priority_order || 999999);
            const rightOrder = Number(right.priority_order || 999999);
            return leftOrder - rightOrder;
          });
        });
      }

      updateWorkspaceTab("top-prospects");
      if (createdProspect?.id) {
        setSelectedProspectId(Number(createdProspect.id));
      }
      setShowAddModal(false);
      setAddProspectInitialData(null);
      setAddProspectMessage(
        createdProspect?.message ||
          `${createdProspect?.prospect_name || "Prospect"} was added to Top Prospects.`,
      );
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["prospects"] }),
        queryClient.refetchQueries({ queryKey: ["prospect-summary-base"] }),
        queryClient.refetchQueries({ queryKey: ["prospect-summary-closed"] }),
      ]);
    },
    onError: (mutationError) => {
      setAddProspectError(
        mutationError instanceof Error ? mutationError.message : "Failed to add prospect",
      );
    },
  });

  const removePortfolioTopProspectMutation = useMutation({
    onMutate: () => {
      setPortfolioSyncMessage("");
      setPortfolioSyncError("");
    },
    mutationFn: async (topProspect) => {
      if (!topProspect?.id) {
        throw new Error("Could not identify the linked Top Prospect record.");
      }

      const res = await fetch(`/api/prospects/${topProspect.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to remove prospect");
      }
      return { data, topProspect };
    },
    onSuccess: async ({ data, topProspect }) => {
      const removedProspect = data?.prospect || { status: "Archived" };
      queryClient.setQueriesData({ queryKey: ["prospects"] }, (current) => {
        if (!Array.isArray(current)) return current;
        return current.map((prospect) =>
          isRemovedTopProspectMatch(prospect, data, topProspect.id)
            ? { ...prospect, ...removedProspect, status: removedProspect.status || "Archived" }
            : prospect,
        );
      });
      setPortfolioSyncMessage(
        `${topProspect.prospect_name || "Prospect"} was removed from Top Prospects. They may still appear in Portfolio if assigned in NXT.`,
      );
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["prospects"] }),
        queryClient.refetchQueries({ queryKey: ["prospect-summary-base"] }),
        queryClient.refetchQueries({ queryKey: ["prospect-summary-closed"] }),
      ]);
    },
    onError: (error) => {
      setPortfolioSyncError(
        error instanceof Error ? error.message : "Failed to remove prospect.",
      );
    },
  });

  const removeSolicitorAssignmentMutation = useMutation({
    onMutate: (person) => {
      setRemovingSolicitorConstituentId(String(person?.constituentId || ""));
      setPortfolioSyncMessage("");
      setPortfolioSyncError("");
    },
    mutationFn: async (person) => {
      const constituentId = String(person?.constituentId || "").trim();
      if (!constituentId) {
        throw new Error("Could not identify the Blackbaud constituent.");
      }

      const res = await fetch("/api/blackbaud/portfolio/solicitor-assignment", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ constituentId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          data?.error || "Failed to remove your solicitor assignment in NXT.",
        );
      }

      return { data, person };
    },
    onSuccess: async ({ data, person }) => {
      setPortfolioSyncMessage(
        data?.message ||
          `${person?.name || "This constituent"} was removed from your active solicitor assignments in NXT.`,
      );
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["blackbaud-portfolio"] }),
        queryClient.invalidateQueries({ queryKey: ["profile-sync-status"] }),
        queryClient.invalidateQueries({ queryKey: ["prospects"] }),
        queryClient.invalidateQueries({ queryKey: ["prospect-summary-base"] }),
        queryClient.invalidateQueries({ queryKey: ["prospect-summary-closed"] }),
      ]);
    },
    onError: (error) => {
      setPortfolioSyncError(
        error instanceof Error
          ? error.message
          : "Failed to remove your solicitor assignment in NXT.",
      );
    },
    onSettled: () => {
      setRemovingSolicitorConstituentId("");
    },
  });

  const createPortfolioCategoryMutation = useMutation({
    onMutate: () => {
      setPortfolioCategoryFeedback("");
      setPortfolioCategoryError("");
    },
    mutationFn: async (name) => {
      const response = await fetch("/api/portfolio-categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not create portfolio category");
      }
      return payload?.category || null;
    },
    onSuccess: async (category) => {
      setPortfolioCategoryFeedback(
        `${category?.name || "Category"} was created for your portfolio.`,
      );
      await queryClient.invalidateQueries({ queryKey: portfolioCategoryQueryKey });
    },
    onError: (error) => {
      setPortfolioCategoryError(
        error instanceof Error ? error.message : "Could not create portfolio category.",
      );
    },
  });

  const renamePortfolioCategoryMutation = useMutation({
    onMutate: () => {
      setPortfolioCategoryFeedback("");
      setPortfolioCategoryError("");
    },
    mutationFn: async ({ category, name }) => {
      const response = await fetch(`/api/portfolio-categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not rename portfolio category");
      }
      return payload?.category || null;
    },
    onSuccess: async (category) => {
      setPortfolioCategoryFeedback(
        `${category?.name || "Category"} was renamed.`,
      );
      await queryClient.invalidateQueries({ queryKey: portfolioCategoryQueryKey });
    },
    onError: (error) => {
      setPortfolioCategoryError(
        error instanceof Error ? error.message : "Could not rename portfolio category.",
      );
    },
  });

  const deletePortfolioCategoryMutation = useMutation({
    onMutate: () => {
      setPortfolioCategoryFeedback("");
      setPortfolioCategoryError("");
    },
    mutationFn: async (category) => {
      const response = await fetch(`/api/portfolio-categories/${category.id}`, {
        method: "DELETE",
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not delete portfolio category");
      }
      return category;
    },
    onSuccess: async (category) => {
      setPortfolioCategoryFeedback(
        `${category?.name || "Category"} was deleted. Its constituents are now Uncategorized.`,
      );
      await queryClient.invalidateQueries({ queryKey: portfolioCategoryQueryKey });
    },
    onError: (error) => {
      setPortfolioCategoryError(
        error instanceof Error ? error.message : "Could not delete portfolio category.",
      );
    },
  });

  const updatePortfolioCategoryParentMutation = useMutation({
    onMutate: () => {
      setPortfolioCategoryFeedback("");
      setPortfolioCategoryError("");
    },
    mutationFn: async ({ category, parentCategoryId }) => {
      const response = await fetch(`/api/portfolio-categories/${category.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ parentCategoryId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not move portfolio category.");
      }
      return payload?.category || null;
    },
    onSuccess: async (category) => {
      setPortfolioCategoryFeedback(
        `${category?.name || "Category"} was moved in your portfolio hierarchy.`,
      );
      await queryClient.invalidateQueries({ queryKey: portfolioCategoryQueryKey });
    },
    onError: (error) => {
      setPortfolioCategoryError(
        error instanceof Error ? error.message : "Could not move portfolio category.",
      );
    },
  });

  const reorderPortfolioCategoryMutation = useMutation({
    onMutate: () => {
      setPortfolioCategoryFeedback("");
      setPortfolioCategoryError("");
    },
    mutationFn: async ({ category, direction }) => {
      const response = await fetch("/api/portfolio-categories/order", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categoryId: category.id, direction }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not reorder portfolio category.");
      }
      return payload?.category || null;
    },
    onSuccess: async (category) => {
      setPortfolioCategoryFeedback(`${category?.name || "Category"} was reordered.`);
      await queryClient.invalidateQueries({ queryKey: portfolioCategoryQueryKey });
    },
    onError: (error) => {
      setPortfolioCategoryError(
        error instanceof Error ? error.message : "Could not reorder portfolio category.",
      );
    },
  });

  const movePortfolioCategoryMutation = useMutation({
    onMutate: ({ person }) => {
      setMovingPortfolioCategoryConstituentId(String(person?.constituentId || ""));
      setPortfolioCategoryFeedback("");
      setPortfolioCategoryError("");
    },
    mutationFn: async ({ person, categoryId }) => {
      const constituentId = String(person?.constituentId || "").trim();
      if (!constituentId) {
        throw new Error("Could not identify the NXT constituent for this category move.");
      }

      const response = await fetch("/api/portfolio-categories/assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ constituentId, categoryId }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.error || "Could not move portfolio constituent");
      }
      return { payload, person };
    },
    onSuccess: async ({ payload, person }) => {
      setPortfolioCategoryFeedback(
        `${person?.name || "Constituent"} moved to ${payload?.category?.name || "Uncategorized"}.`,
      );
      await queryClient.invalidateQueries({ queryKey: portfolioCategoryQueryKey });
    },
    onError: (error) => {
      setPortfolioCategoryError(
        error instanceof Error ? error.message : "Could not move portfolio constituent.",
      );
    },
    onSettled: () => {
      setMovingPortfolioCategoryConstituentId("");
    },
  });

  const syncMutation = useMutation({
    onMutate: () => {
      setPortfolioSyncMessage("");
      setPortfolioSyncError("");
    },
    mutationFn: async () => {
      const res = await fetch("/api/users/profile/blackbaud-sync", {
        method: "POST",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to sync from Blackbaud");
      }
      return data;
    },
    onSuccess: (data) => {
      const result = data?.result || {};
      if (result?.skipped) {
        setPortfolioSyncMessage(
          `NXT portfolio sync skipped: ${result.reason || "No import was needed."}`,
        );
      } else {
        setPortfolioSyncMessage(
          [
            "NXT portfolio sync complete.",
            `${Number(result.matchedOpportunities || 0)} qualifying opportunities found.`,
            `${Number(result.createdProspects || 0)} Top Prospects added.`,
            `${Number(result.createdOpportunities || 0)} opportunity records added.`,
          ].join(" "),
        );
      }
      queryClient.invalidateQueries({ queryKey: ["profile-sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-base"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-closed"] });
      queryClient.invalidateQueries({ queryKey: ["blackbaud-portfolio"] });
    },
    onError: (error) => {
      setPortfolioSyncError(
        error instanceof Error ? error.message : "Failed to sync NXT portfolio.",
      );
    },
  });

  const stopViewingMutation = useMutation({
    mutationFn: async () => {
      await handleActingWorkspaceChange(profileStatus?.user?.id || "");
      return { ok: true };
    },
  });

  async function handleActingWorkspaceChange(nextUserId) {
    if (!canUseExecutiveView) return;

    try {
      setWorkspaceSwitchMessage("");

      if (!nextUserId || String(nextUserId) === String(profileStatus?.user?.id || "")) {
        const response = await fetch("/api/admin/workspace-user", { method: "DELETE" });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to return to your workspace");
        }
        queryClient.setQueryData(["acting-workspace-status", profileStatus?.user?.id || null], {
          adminUser: profileStatus?.user || null,
          actingUser: null,
        });
        queryClient.setQueryData(["profile-sync-status"], (current) =>
          current
            ? {
                ...current,
                workspaceUser: current.user || profileStatus?.user || null,
                actingAsUser: null,
              }
            : current,
        );
        setWorkspaceSwitchMessage("Viewing your dashboard");
      } else {
        const response = await fetch("/api/admin/workspace-user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: Number(nextUserId) }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(payload?.error || "Failed to switch dashboard");
        }
        queryClient.setQueryData(["acting-workspace-status", profileStatus?.user?.id || null], {
          adminUser: profileStatus?.user || null,
          actingUser: payload?.actingUser || null,
        });
        queryClient.setQueryData(["profile-sync-status"], (current) =>
          current
            ? {
                ...current,
                workspaceUser: payload?.actingUser || current.workspaceUser,
                actingAsUser: payload?.actingUser
                  ? {
                      id: payload.actingUser.id,
                      name: payload.actingUser.name,
                      email: payload.actingUser.email,
                      role: payload.actingUser.role,
                    }
                  : null,
              }
            : current,
        );
        setWorkspaceSwitchMessage(
          payload?.actingUser?.name
            ? `Viewing ${payload.actingUser.name}'s dashboard`
            : "Dashboard updated",
        );
      }

      queryClient.invalidateQueries({ queryKey: ["profile-sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-base"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary-closed"] });
      queryClient.invalidateQueries({ queryKey: ["blackbaud-portfolio"] });

      if (typeof window !== "undefined") {
        window.location.href = "/my-top-prospects";
      }
    } catch (error) {
      console.error("Failed to switch acting workspace:", error);
      setWorkspaceSwitchMessage(
        error instanceof Error ? error.message : "Failed to switch dashboard",
      );
    }
  }

  const openPortfolioAddModal = (person) => {
    setAddProspectMessage("");
    setAddProspectError("");
    setAddProspectInitialData({
      prospectName: person.name || "",
      askAmount: "",
      askType: "Major Gift",
      selectedBlackbaudMatch: {
        blackbaudConstituentId: person.constituentId,
        lookupId: person.lookupId,
        name: person.name,
        email: person.email,
      },
    });
    setShowAddModal(true);
  };

  const removePortfolioTopProspect = (topProspect) => {
    if (!topProspect?.id) return;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `Remove ${topProspect.prospect_name || "this prospect"} from Top Prospects? This will not remove the constituent from NXT or from the portfolio assignment list.`,
      );
      if (!confirmed) return;
    }

    removePortfolioTopProspectMutation.mutate(topProspect);
  };

  const removePortfolioSolicitorAssignment = (person) => {
    if (!person?.constituentId) {
      setPortfolioSyncError("Could not identify the linked Blackbaud constituent.");
      return;
    }

    if (typeof window !== "undefined") {
      const confirmed = window.confirm(
        `Remove yourself as solicitor for ${person.name || "this constituent"}? This will change your active NXT solicitor assignment to Former Solicitor and set today's date as the end date.`,
      );
      if (!confirmed) return;
    }

    removeSolicitorAssignmentMutation.mutate(person);
  };

  const createPortfolioCategory = (name) =>
    createPortfolioCategoryMutation.mutateAsync(name);

  const renamePortfolioCategory = (category, name) =>
    renamePortfolioCategoryMutation.mutateAsync({ category, name });

  const deletePortfolioCategory = (category) =>
    deletePortfolioCategoryMutation.mutateAsync(category);

  const changePortfolioCategoryParent = (category, parentCategoryId) =>
    updatePortfolioCategoryParentMutation.mutateAsync({ category, parentCategoryId });

  const reorderPortfolioCategory = (category, direction) =>
    reorderPortfolioCategoryMutation.mutateAsync({ category, direction });

  const movePortfolioCategory = (person, categoryId) => {
    if (!person?.constituentId) {
      setPortfolioCategoryError("Could not identify the linked NXT constituent.");
      return;
    }
    movePortfolioCategoryMutation.mutate({ person, categoryId });
  };

  const openStewardshipProspect = (item) => {
    if (!item?.prospect_id) return;
    setSelectedProspectId(Number(item.prospect_id));
    setSelectedProspectPanel("next-step");
  };

  const combinedSummary =
    summary || closedSummary
      ? {
          activeCount: summary?.activeCount ?? closedSummary?.activeCount ?? 0,
          totalAskPipeline:
            summary?.totalAskPipeline ?? closedSummary?.totalAskPipeline ?? 0,
          currentFY: closedSummary?.currentFY ?? summary?.currentFY ?? "FY",
          priorFY: closedSummary?.priorFY ?? summary?.priorFY ?? null,
          closedThisFY: closedSummary?.closedThisFY,
          closedPriorFY: closedSummary?.closedPriorFY,
          raisedSnapshot: closedSummary?.raisedSnapshot,
        }
      : null;

  const openStewardshipItems = Array.isArray(stewardshipActions)
    ? stewardshipActions
    : [];
  const todayTimestamp = getTodayDateOnlyTimestamp();
  const dueSoonTimestamp = todayTimestamp + 14 * 24 * 60 * 60 * 1000;
  const sortedStewardshipItems = [...openStewardshipItems].sort((a, b) => {
    const aDue = getDateOnlyTimestamp(a.due_date) ?? Number.MAX_SAFE_INTEGER;
    const bDue = getDateOnlyTimestamp(b.due_date) ?? Number.MAX_SAFE_INTEGER;
    if (aDue !== bDue) return aDue - bDue;
    return new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime();
  });
  const overdueStewardshipItems = sortedStewardshipItems.filter((item) => {
    const dueTimestamp = getDateOnlyTimestamp(item.due_date);
    return dueTimestamp != null && dueTimestamp < todayTimestamp;
  });
  const dueSoonStewardshipItems = sortedStewardshipItems.filter((item) => {
    const dueTimestamp = getDateOnlyTimestamp(item.due_date);
    return (
      dueTimestamp != null &&
      dueTimestamp >= todayTimestamp &&
      dueTimestamp <= dueSoonTimestamp
    );
  });
  const visibleStewardshipItems = [
    ...overdueStewardshipItems,
    ...dueSoonStewardshipItems.filter(
      (item) =>
        !overdueStewardshipItems.some(
          (overdueItem) => String(overdueItem.id) === String(item.id),
        ),
    ),
  ].slice(0, 4);

  if (loading || !user) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#F9FAFB",
        }}
      >
        <p style={{ color: "#6B7280" }}>Loading...</p>
      </div>
    );
  }

  const activeProspects = prospects.filter((p) => p.status === "Active");
  const topProspectByConstituentId = new Map();
  for (const prospect of activeProspects) {
    const constituentId = getProspectBlackbaudConstituentId(prospect);
    if (constituentId && !topProspectByConstituentId.has(constituentId)) {
      topProspectByConstituentId.set(constituentId, prospect);
    }
  }
  const topProspectConstituentIds = new Set(topProspectByConstituentId.keys());
  const openPortfolioFollowUp = (kind, person) => {
    const prospect = topProspectByConstituentId.get(
      String(person?.constituentId || ""),
    );
    setPortfolioFollowUp({
      kind,
      person: {
        ...person,
        prospectId: prospect?.id || person?.prospectId || person?.prospect_id || null,
      },
    });
  };
  const closedSecured = prospects.filter(
    (p) => p.status === "Closed – Gift Secured",
  );
  const closedDeclined = prospects.filter(
    (p) => p.status === "Closed – Declined",
  );
  const archivedProspects = prospects.filter((p) => p.status === "Archived");
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const portfolioLeadSolicitor = blackbaudPortfolio?.leadSolicitor || [];
  const portfolioSupportingSolicitor = blackbaudPortfolio?.supportingSolicitor || [];
  const portfolioConstituentById = new Map();
  for (const person of [...portfolioLeadSolicitor, ...portfolioSupportingSolicitor]) {
    const constituentId = String(person?.constituentId || "").trim();
    if (!constituentId || portfolioConstituentById.has(constituentId)) continue;
    portfolioConstituentById.set(constituentId, person);
  }
  const portfolioConstituents = Array.from(portfolioConstituentById.values());
  const totalPortfolioConstituents = portfolioConstituents.length;
  const portfolioSignals = buildPortfolioSignals(prospects);
  const portfolioPreferenceKey = portfolioViewKey(profileStatus?.user?.id, activeWorkspaceUserId);
  const rawPortfolioCategories = Array.isArray(portfolioCategoryData?.categories)
    ? portfolioCategoryData.categories
    : [];
  const rawPortfolioCategoryById = new Map(
    rawPortfolioCategories.map((category) => [String(category.id), category]),
  );
  const categoryChildrenByParentId = new Map();
  for (const category of rawPortfolioCategories) {
    const requestedParentId = String(category?.parent_category_id || "").trim();
    const parentId =
      requestedParentId && rawPortfolioCategoryById.has(requestedParentId)
        ? requestedParentId
        : "";
    const children = categoryChildrenByParentId.get(parentId) || [];
    children.push(category);
    categoryChildrenByParentId.set(parentId, children);
  }
  for (const children of categoryChildrenByParentId.values()) {
    children.sort(
      (left, right) =>
        Number(left.sort_order || 0) - Number(right.sort_order || 0) ||
        Number(left.id) - Number(right.id),
    );
  }
  const portfolioCategories = [];
  const seenPortfolioCategories = new Set();
  const appendPortfolioCategory = (
    category,
    hierarchyDepth = 0,
    parentCategory = null,
  ) => {
    const categoryId = String(category?.id || "");
    if (!categoryId || seenPortfolioCategories.has(categoryId)) return;

    seenPortfolioCategories.add(categoryId);
    portfolioCategories.push({
      ...category,
      hierarchyDepth,
      parentName: parentCategory?.name || null,
      displayName:
        hierarchyDepth > 0
          ? `${"  ".repeat(Math.min(hierarchyDepth, 3))}- ${category.name}`
          : category.name,
    });
    for (const child of categoryChildrenByParentId.get(categoryId) || []) {
      appendPortfolioCategory(child, hierarchyDepth + 1, category);
    }
  };
  for (const rootCategory of categoryChildrenByParentId.get("") || []) {
    appendPortfolioCategory(rootCategory);
  }
  for (const category of rawPortfolioCategories) {
    appendPortfolioCategory(category);
  }
  const portfolioCategoryById = new Map(
    portfolioCategories.map((category) => [String(category.id), category]),
  );
  const portfolioCategoryByConstituentId = {};
  for (const assignment of Array.isArray(portfolioCategoryData?.assignments)
    ? portfolioCategoryData.assignments
    : []) {
    const constituentId = String(assignment?.blackbaud_constituent_id || "").trim();
    const category = portfolioCategoryById.get(String(assignment?.category_id || ""));
    if (constituentId && category) {
      portfolioCategoryByConstituentId[constituentId] = category;
    }
  }
  const portfolioCategoryAccents = [
    { background: "#EEF2FF", text: "#4338CA" },
    { background: "#ECFDF5", text: "#065F46" },
    { background: "#FFF7ED", text: "#9A3412" },
    { background: "#FDF2F8", text: "#9D174D" },
  ];
  const categorizedPortfolioTiers = portfolioCategories.map((category, index) => ({
    key: `category-${category.id}`,
    title: category.displayName || category.name,
    description: category.parentName
      ? `Private subcategory within ${category.parentName}.`
      : "Your private JUMGOGPT organization category.",
    accent: portfolioCategoryAccents[index % portfolioCategoryAccents.length],
    hierarchyDepth: category.hierarchyDepth || 0,
    items: portfolioConstituents.filter(
      (person) =>
        String(
          portfolioCategoryByConstituentId[String(person?.constituentId || "")]
            ?.id || "",
        ) === String(category.id),
    ),
  }));
  const uncategorizedPortfolioItems = portfolioConstituents.filter(
    (person) =>
      !portfolioCategoryByConstituentId[String(person?.constituentId || "")],
  );
  const portfolioCategoryTiers = [
    ...categorizedPortfolioTiers,
    // Do not reserve a column for the fallback category when every card is organized.
    ...(uncategorizedPortfolioItems.length
      ? [
          {
            key: "uncategorized",
            title: "Uncategorized",
            description:
              "NXT portfolio assignments not yet organized into a category.",
            accent: { background: "#F3F4F6", text: "#374151" },
            items: uncategorizedPortfolioItems,
          },
        ]
      : []),
  ];
  const opportunityYearOptions = [...new Set([
    ...FY_OPTIONS,
    ...activeProspects.flatMap((prospect) => prospect.open_opportunity_fys || []),
  ])].sort();
  const filteredActiveProspects = activeProspects.filter((prospect) => {
    const nextAction = getProspectNextAction(prospect);
    const matchesSearch =
      !normalizedSearch ||
      prospect.prospect_name?.toLowerCase().includes(normalizedSearch) ||
      prospect.ask_type?.toLowerCase().includes(normalizedSearch) ||
      prospect.next_action_text?.toLowerCase().includes(normalizedSearch);

    const matchesStatus =
      statusFilter === "all" || prospect.status === statusFilter;
    const matchesFY = matchesProspectFiscalYear(prospect, fyFilter);
    const matchesAction =
      actionFilter === "all" ||
      (actionFilter === "clarification" &&
        prospect.latest_submission_status === "Needs Clarification") ||
      (actionFilter === "overdue" &&
        Boolean(
          prospect.next_action_text &&
            !prospect.next_action_completed_at &&
            prospect.next_action_due_date &&
            new Date(prospect.next_action_due_date).getTime() <
              new Date().setHours(0, 0, 0, 0),
        )) ||
      (actionFilter === "due" &&
        Boolean(
          prospect.next_action_text &&
            !prospect.next_action_completed_at &&
            prospect.next_action_due_date,
        )) ||
      (actionFilter === "follow-up" && isNeedsFollowUpProspect(prospect)) ||
      (actionFilter === "no-opportunity" &&
        (prospect.active_opportunity_count || 0) === 0);

    return matchesSearch && matchesStatus && matchesFY && matchesAction;
  });

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#F9FAFB",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      {/* Header */}
      <header
        style={{
          backgroundColor: "white",
          borderBottom: "1px solid #E5E7EB",
          padding: "16px 24px",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <div
          style={{
            maxWidth: "1480px",
            margin: "0 auto",
            display: "grid",
            gap: "10px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <a
                href="/"
                aria-label="Return to home"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  minHeight: "36px",
                  padding: "0 12px",
                  borderRadius: "8px",
                  backgroundColor: "#F3F4F6",
                  border: "1px solid #E5E7EB",
                  textDecoration: "none",
                  color: "#374151",
                  fontSize: "13px",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                }}
              >
                <ArrowLeft size={18} color="#374151" />
                Return to home
              </a>
              <div>
                <h1
                  style={{
                    fontSize: "18px",
                    fontWeight: "700",
                    color: "#111827",
                    margin: 0,
                  }}
                >
                  My Prospects
                </h1>
                {profileStatus?.actingAsUser ? (
                  <div style={{ fontSize: "13px", color: "#0F766E", marginTop: "3px", fontWeight: 700 }}>
                    {isExecutiveReadOnly ? "Viewing" : "Editing"} {profileStatus.actingAsUser.name}'s workspace
                  </div>
                ) : null}
                {canUseExecutiveView ? (
                  <div style={{ marginTop: "8px", display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                    <label
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        fontSize: "12px",
                        color: "#4B5563",
                        fontWeight: 700,
                      }}
                    >
                      Workspace
                      <select
                        value={actingWorkspaceUser?.id || profileStatus?.user?.id || ""}
                        onChange={(event) => handleActingWorkspaceChange(event.target.value)}
                        style={{
                          padding: "8px 10px",
                          borderRadius: "8px",
                          border: "1px solid #D1D5DB",
                          backgroundColor: "white",
                          color: "#111827",
                          fontSize: "13px",
                          fontWeight: 600,
                        }}
                      >
                        <option value={profileStatus?.user?.id || ""}>My dashboard</option>
                        {mgoUsers
                          .filter(
                            (mgo) =>
                              canViewWorkspaceAsRole(currentRole, mgo.role) &&
                              String(mgo.id) !== String(profileStatus?.user?.id || ""),
                          )
                          .map((mgo) => (
                            <option key={mgo.id} value={mgo.id}>
                              {mgo.name}
                              {getWorkspaceRoleLabel(mgo.role) === "Executive"
                                ? " (Executive)"
                                : ""}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                ) : null}
              </div>
            </div>
            {activeWorkspaceTab === "top-prospects" && !isExecutiveReadOnly ? (
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <a
                  href="/action-opportunity-update"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 16px",
                    backgroundColor: "white",
                    color: "#374151",
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "600",
                    textDecoration: "none",
                  }}
                >
                  <Plus size={16} />
                  Log Update
                </a>
                <button
                  onClick={() => {
                    setAddProspectMessage("");
                    setAddProspectError("");
                    setShowAddModal(true);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "8px 16px",
                    backgroundColor: "#6A5BFF",
                    color: "white",
                    border: "none",
                    borderRadius: "8px",
                    fontSize: "14px",
                    fontWeight: "600",
                    cursor: "pointer",
                    boxShadow: "0 12px 28px rgba(106, 91, 255, 0.22)",
                  }}
                >
                  <Plus size={16} />
                  Add Prospect
                </button>
              </div>
            ) : null}
          </div>
          {profileStatus?.actingAsUser ? (
            <div
              style={{
                backgroundColor: "#ECFEFF",
                borderRadius: "12px",
                border: "1px solid #A5F3FC",
                padding: "12px 14px",
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div style={{ fontSize: "14px", color: "#155E75", lineHeight: 1.5 }}>
                {isExecutiveReadOnly ? (
                  <>You are viewing <strong>{profileStatus.actingAsUser.name}'s</strong> workspace in read-only mode.</>
                ) : (
                  <>Editing <strong>{profileStatus.actingAsUser.name}'s</strong> MGO workspace as Admin. Actions credit this MGO and record you as the person who entered them.</>
                )}
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
                {stopViewingMutation.isPending ? "Returning..." : "Return to my dashboard"}
              </button>
            </div>
          ) : null}
          {addProspectMessage ? (
            <div
              style={{
                backgroundColor: "#ECFDF5",
                borderRadius: "12px",
                border: "1px solid #A7F3D0",
                color: "#047857",
                padding: "12px 14px",
                fontSize: "14px",
                fontWeight: 700,
              }}
            >
              {addProspectMessage}
            </div>
          ) : null}
          {workspaceSwitchMessage ? (
            <div
              style={{
                fontSize: "13px",
                color: workspaceSwitchMessage.toLowerCase().includes("failed") ? "#B91C1C" : "#4B5563",
              }}
            >
              {workspaceSwitchMessage}
            </div>
          ) : null}
        </div>
      </header>

      <main style={{ maxWidth: "1480px", margin: "0 auto", padding: "24px" }}>
        <div
          style={{
            display: "inline-flex",
            gap: "6px",
            padding: "4px",
            borderRadius: "999px",
            backgroundColor: "white",
            border: "1px solid #E5E7EB",
            marginBottom: "18px",
          }}
        >
          {[
            { value: "top-prospects", label: "Top Prospects" },
            { value: "portfolio", label: "My Portfolio" },
          ].map((tab) => {
            const selected = activeWorkspaceTab === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                onClick={() => updateWorkspaceTab(tab.value)}
                style={{
                  border: "none",
                  borderRadius: "999px",
                  padding: "10px 16px",
                  backgroundColor: selected ? "#111827" : "transparent",
                  color: selected ? "white" : "#4B5563",
                  fontSize: "14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {tab.label}
              </button>
            );
          })}
          <a
            href="/prospect-pool"
            style={{
              display: "inline-flex",
              alignItems: "center",
              borderRadius: "999px",
              padding: "10px 16px",
              backgroundColor: "transparent",
              color: "#4B5563",
              fontSize: "14px",
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Prospect Pool
          </a>
        </div>

        {activeWorkspaceTab === "portfolio" &&
        (profileStatus?.workspaceUser?.blackbaud_constituent_id ||
          profileStatus?.workspaceUser?.blackbaud_lookup_id) ? (
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              border: "1px solid #E5E7EB",
              padding: "18px",
              marginBottom: "24px",
              display: "grid",
              gap: "16px",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: "12px",
                alignItems: "baseline",
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
                    marginBottom: "6px",
                  }}
                >
                  My Portfolio
                </div>
                <div style={{ fontSize: "18px", fontWeight: "700", color: "#111827" }}>
                  {isLocalPortfolioFallback
                    ? "Last locally synced Top Prospects"
                    : "Current NXT fundraiser assignments"}
                </div>
                <div style={{ marginTop: "4px", fontSize: "13px", color: "#6B7280", lineHeight: 1.5 }}>
                  {isLocalPortfolioFallback
                    ? "A live NXT assignment refresh is temporarily unavailable. This safe fallback uses your locally saved Top Prospects and does not confirm current NXT solicitor roles."
                    : "Pulled from Raiser's Edge NXT by your fundraiser assignment role. Browse one list, or organize by solicitor role or your categories."}
                </div>
              </div>
              <div style={{ display: "grid", gap: "8px", justifyItems: "end" }}>
                {blackbaudPortfolio?.summary ? (
                  <div style={{ fontSize: "13px", color: "#4B5563", fontWeight: "600" }}>
                    {`${totalPortfolioConstituents} ${
                          isLocalPortfolioFallback ? "saved" : "assigned"
                        } constituents`}
                  </div>
                ) : null}
                {!isExecutiveReadOnly ? (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <button
                      type="button"
                      onClick={() => setShowPortfolioCategoryManager(true)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "10px",
                        border: "1px solid #C7D2FE",
                        backgroundColor: "white",
                        color: "#4338CA",
                        fontSize: "13px",
                        fontWeight: 800,
                        cursor: "pointer",
                      }}
                    >
                      Manage categories
                    </button>
                    <button
                      type="button"
                      onClick={() => syncMutation.mutate()}
                      disabled={syncMutation.isPending || isLocalPortfolioFallback}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "10px",
                        border: "1px solid #C7D2FE",
                        backgroundColor:
                          syncMutation.isPending || isLocalPortfolioFallback
                            ? "#F3F4F6"
                            : "#EEF2FF",
                        color:
                          syncMutation.isPending || isLocalPortfolioFallback
                            ? "#6B7280"
                            : "#4338CA",
                        fontSize: "13px",
                        fontWeight: 800,
                        cursor:
                          syncMutation.isPending || isLocalPortfolioFallback
                            ? "not-allowed"
                            : "pointer",
                      }}
                    >
                      {syncMutation.isPending
                        ? "Syncing..."
                        : isLocalPortfolioFallback
                          ? "NXT sync temporarily unavailable"
                          : "Sync NXT portfolio"}
                    </button>
                  </div>
                ) : null}
              </div>
            </div>

            {!isExecutiveReadOnly && !isLocalPortfolioFallback ? (
              <PortfolioRefreshProgress
                state={portfolioRefreshState}
                isPending={portfolioRefreshMutation.isPending}
                error={portfolioRefreshMutation.error}
                isAdmin={isAdmin}
                onStart={(mode) =>
                  portfolioRefreshMutation.mutate({ action: "start", mode })
                }
                onResume={() =>
                  portfolioRefreshMutation.mutate({
                    action: "resume",
                    jobId: portfolioRefreshJob?.jobId,
                  })
                }
                onRetryFailures={() =>
                  portfolioRefreshMutation.mutate({
                    action: "retry_failed",
                    jobId: portfolioRefreshJob?.jobId,
                  })
                }
                onCancel={() =>
                  portfolioRefreshMutation.mutate({
                    action: "cancel",
                    jobId: portfolioRefreshJob?.jobId,
                  })
                }
              />
            ) : null}

            {portfolioSyncMessage ? (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "12px",
                  backgroundColor: "#ECFDF5",
                  border: "1px solid #A7F3D0",
                  color: "#047857",
                  fontSize: "13px",
                  fontWeight: 700,
                  lineHeight: 1.5,
                }}
              >
                {portfolioSyncMessage}
              </div>
            ) : null}
            {portfolioSyncError ? (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "12px",
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FECACA",
                  color: "#991B1B",
                  fontSize: "13px",
                  fontWeight: 700,
                  lineHeight: 1.5,
                }}
              >
                {portfolioSyncError}
              </div>
            ) : null}
            {blackbaudPortfolio?.portfolioMeta?.fallbackMessage ? (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "12px",
                  backgroundColor: "#FFFBEB",
                  border: "1px solid #FDE68A",
                  color: "#92400E",
                  fontSize: "13px",
                  fontWeight: 700,
                  lineHeight: 1.5,
                }}
              >
                {blackbaudPortfolio.portfolioMeta.fallbackMessage}
              </div>
            ) : null}
            {portfolioCategoryFeedback ? (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "12px",
                  backgroundColor: "#ECFDF5",
                  border: "1px solid #A7F3D0",
                  color: "#047857",
                  fontSize: "13px",
                  fontWeight: 700,
                  lineHeight: 1.5,
                }}
              >
                {portfolioCategoryFeedback} This does not change anything in NXT.
              </div>
            ) : null}
            {portfolioCategoryError || isPortfolioCategoryError ? (
              <div
                style={{
                  padding: "12px 14px",
                  borderRadius: "12px",
                  backgroundColor: "#FEF2F2",
                  border: "1px solid #FECACA",
                  color: "#991B1B",
                  fontSize: "13px",
                  fontWeight: 700,
                  lineHeight: 1.5,
                }}
              >
                {portfolioCategoryError ||
                  "Portfolio categories could not load right now. Your NXT portfolio is unchanged."}
              </div>
            ) : null}

            {isBlackbaudPortfolioLoading ? (
              <div style={{ fontSize: "14px", color: "#6B7280" }}>
                Loading your NXT portfolio...
              </div>
            ) : isBlackbaudPortfolioError ? (
              <div style={{ fontSize: "14px", color: "#B91C1C" }}>
                Could not load your NXT portfolio right now.
              </div>
            ) : blackbaudPortfolio?.warning ? (
              <div style={{ fontSize: "14px", color: "#6B7280" }}>
                {blackbaudPortfolio.warning}
              </div>
            ) : (
              <PortfolioContactRefreshProvider
                key={portfolioPreferenceKey || activeWorkspaceUserId}
                viewerId={profileStatus?.user?.id}
                workspaceId={activeWorkspaceUserId}
                enabled={!isLocalPortfolioFallback}
              >
              <PortfolioWorklist
                key={portfolioPreferenceKey || activeWorkspaceUserId}
                storageKey={portfolioPreferenceKey}
                people={portfolioConstituents}
                signals={portfolioSignals}
                matchesSearch={matchesPortfolioSearch}
                categoryTiers={portfolioCategoryTiers}
                roleTiers={[
                  {
                    key: "lead",
                    title: isLocalPortfolioFallback ? "Locally synced Top Prospects" : "Lead Solicitor",
                    description: isLocalPortfolioFallback
                      ? "A locally saved fallback while live NXT assignments are unavailable."
                      : "Your primary portfolio assignments in NXT.",
                    items: portfolioLeadSolicitor,
                    accent: { background: "#EEF2FF", text: "#4338CA" },
                  },
                  ...(!isLocalPortfolioFallback ? [{
                    key: "supporting",
                    title: "Secondary / Athletics Solicitor",
                    description: "Supporting assignments where you still need visibility and follow-up.",
                    items: portfolioSupportingSolicitor,
                    accent: { background: "#ECFDF5", text: "#065F46" },
                  }] : []),
                ]}
                renderTier={(tier, density) => (
                  <PortfolioTier
                    key={tier.key}
                    title={tier.title}
                    description={tier.description}
                    items={tier.items}
                    totalCount={tier.totalCount}
                    accent={tier.accent}
                    density={density}
                    signals={portfolioSignals}
                    pledgeData={pledgeData}
                    onAddToTopProspects={openPortfolioAddModal}
                    isAdding={addMutation.isPending}
                    isReadOnly={isExecutiveReadOnly}
                    topProspectConstituentIds={topProspectConstituentIds}
                    topProspectByConstituentId={topProspectByConstituentId}
                    onRemoveFromTopProspects={removePortfolioTopProspect}
                    isRemovingFromTopProspects={removePortfolioTopProspectMutation.isPending}
                    onRemoveSolicitorAssignment={removePortfolioSolicitorAssignment}
                    allowSolicitorAssignmentRemoval={!isLocalPortfolioFallback}
                    allowNxtSummary={!isLocalPortfolioFallback}
                    onOpenPortfolioNextStep={(person) => openPortfolioFollowUp("next-step", person)}
                    onOpenPortfolioDiscussion={(person) => openPortfolioFollowUp("discussion", person)}
                    isRemovingSolicitorAssignment={removeSolicitorAssignmentMutation.isPending}
                    removingSolicitorConstituentId={removingSolicitorConstituentId}
                    annualGivingSocietiesByConstituentId={portfolioAnnualGivingSocietiesByConstituentId}
                    currentFiscalYearGivingByConstituentId={portfolioCurrentFyGivingByConstituentId}
                    currentFiscalYearLabel={portfolioCurrentFyLabel}
                    portfolioCategories={portfolioCategories}
                    portfolioCategoryByConstituentId={portfolioCategoryByConstituentId}
                    onMovePortfolioCategory={movePortfolioCategory}
                    movingPortfolioCategoryConstituentId={movingPortfolioCategoryConstituentId}
                  />
                )}
              />
              </PortfolioContactRefreshProvider>
            )}
          </div>
        ) : null}

        {activeWorkspaceTab === "portfolio" &&
        !profileStatus?.workspaceUser?.blackbaud_constituent_id &&
        !profileStatus?.workspaceUser?.blackbaud_lookup_id ? (
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              border: "1px solid #E5E7EB",
              padding: "18px",
              marginBottom: "24px",
              fontSize: "14px",
              color: "#6B7280",
              lineHeight: 1.6,
            }}
          >
            Link your Blackbaud fundraiser record in Access Management to load your NXT portfolio.
          </div>
        ) : null}

        {activeWorkspaceTab === "top-prospects" ? (
        <>
        {/* Summary Stats */}
        {combinedSummary && (
          <div
            style={{
              display: "flex",
              gap: "16px",
              marginBottom: "24px",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "12px",
                border: "1px solid #E5E7EB",
                padding: "20px",
                flex: "1 1 180px",
                minWidth: "180px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <Target size={18} color="#6A5BFF" />
                <span
                  style={{
                    fontSize: "13px",
                    color: "#6B7280",
                    fontWeight: "500",
                  }}
                >
                  Active Prospects
                </span>
              </div>
              <p
                style={{
                  fontSize: "28px",
                  fontWeight: "700",
                  color: "#111827",
                  margin: 0,
                }}
              >
                {combinedSummary.activeCount}
              </p>
            </div>
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "12px",
                border: "1px solid #E5E7EB",
                padding: "20px",
                flex: "1 1 180px",
                minWidth: "180px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <DollarSign size={18} color="#059669" />
                <span
                  style={{
                    fontSize: "13px",
                    color: "#6B7280",
                    fontWeight: "500",
                  }}
                >
                  Total Ask Pipeline
                </span>
              </div>
              <p
                style={{
                  fontSize: "28px",
                  fontWeight: "700",
                  color: "#111827",
                  margin: 0,
                }}
              >
                {formatCurrency(combinedSummary.totalAskPipeline)}
              </p>
            </div>
            <ProspectRaisedCard summary={combinedSummary} isLoading={isClosedSummaryLoading} isError={isClosedSummaryError} />
          </div>
        )}

        {isStewardshipLoading || openStewardshipItems.length ? (
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "14px",
              border: overdueStewardshipItems.length
                ? "1px solid #FCA5A5"
                : "1px solid #A7F3D0",
              padding: "16px",
              marginBottom: "20px",
              boxShadow: overdueStewardshipItems.length
                ? "0 12px 28px rgba(185, 28, 28, 0.08)"
                : "none",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "12px",
                flexWrap: "wrap",
                marginBottom: "12px",
              }}
            >
              <div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "4px",
                  }}
                >
                  <Star size={18} color={overdueStewardshipItems.length ? "#B91C1C" : "#047857"} />
                  <h2
                    style={{
                      margin: 0,
                      fontSize: "15px",
                      color: "#111827",
                      fontWeight: "800",
                    }}
                  >
                    Stewardship follow-up
                  </h2>
                </div>
                <p style={{ margin: 0, color: "#6B7280", fontSize: "13px", lineHeight: 1.5 }}>
                  Gift stewardship next steps created from closed opportunities.
                </p>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                <span
                  style={{
                    padding: "6px 10px",
                    borderRadius: "999px",
                    backgroundColor: overdueStewardshipItems.length ? "#FEF2F2" : "#F9FAFB",
                    border: `1px solid ${overdueStewardshipItems.length ? "#FCA5A5" : "#E5E7EB"}`,
                    color: overdueStewardshipItems.length ? "#991B1B" : "#4B5563",
                    fontSize: "12px",
                    fontWeight: "800",
                  }}
                >
                  {overdueStewardshipItems.length} overdue
                </span>
                <span
                  style={{
                    padding: "6px 10px",
                    borderRadius: "999px",
                    backgroundColor: "#ECFDF5",
                    border: "1px solid #A7F3D0",
                    color: "#047857",
                    fontSize: "12px",
                    fontWeight: "800",
                  }}
                >
                  {dueSoonStewardshipItems.length} due soon
                </span>
              </div>
            </div>
            {isStewardshipLoading ? (
              <p style={{ margin: 0, color: "#6B7280", fontSize: "13px" }}>
                Loading stewardship follow-up...
              </p>
            ) : visibleStewardshipItems.length ? (
              <div style={{ display: "grid", gap: "8px" }}>
                {visibleStewardshipItems.map((item) => {
                  const dueTimestamp = getDateOnlyTimestamp(item.due_date);
                  const isOverdue =
                    dueTimestamp != null && dueTimestamp < todayTimestamp;

                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "minmax(0, 1fr) auto",
                        gap: "12px",
                        alignItems: "center",
                        padding: "10px 12px",
                        borderRadius: "12px",
                        border: `1px solid ${isOverdue ? "#FCA5A5" : "#D1FAE5"}`,
                        backgroundColor: isOverdue ? "#FEF2F2" : "#F0FDF4",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <strong style={{ display: "block", color: "#111827", fontSize: "13px" }}>
                          {item.title}
                        </strong>
                        <p
                          style={{
                            margin: "3px 0 0",
                            color: "#4B5563",
                            fontSize: "12px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.prospect_name || "Prospect"}
                          {item.opportunity_title ? ` · ${item.opportunity_title}` : ""}
                          {item.due_date
                            ? ` · ${isOverdue ? "Overdue" : "Due"} ${formatShortDate(item.due_date)}`
                            : " · No due date"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => openStewardshipProspect(item)}
                        disabled={!item.prospect_id}
                        style={{
                          padding: "7px 12px",
                          borderRadius: "999px",
                          border: "1px solid #A7F3D0",
                          backgroundColor: "white",
                          color: "#047857",
                          fontSize: "12px",
                          fontWeight: "800",
                          cursor: item.prospect_id ? "pointer" : "not-allowed",
                        }}
                      >
                        Open
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style={{ margin: 0, color: "#6B7280", fontSize: "13px" }}>
                No stewardship next steps are overdue or due in the next 14 days.
              </p>
            )}
          </div>
        ) : null}

        <div
          style={{
            backgroundColor: "white",
            borderRadius: "14px",
            border: "1px solid #E5E7EB",
            padding: "16px",
            marginBottom: "20px",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              alignItems: "flex-start",
              flexWrap: "wrap",
              marginBottom: "12px",
            }}
          >
            <div>
              <h2
                style={{
                  fontSize: "15px",
                  fontWeight: "700",
                  color: "#111827",
                  margin: "0 0 4px 0",
                }}
              >
                Filter Top Prospects
              </h2>
              <p style={{ fontSize: "13px", color: "#6B7280", margin: 0 }}>
                Refine the ranked list by prospect, status, open opportunity fiscal year, or next-action state. Years use the linked opportunities' expected close dates.
              </p>
            </div>
            <div
              style={{
                padding: "8px 10px",
                borderRadius: "10px",
                backgroundColor: "#F9FAFB",
                border: "1px solid #E5E7EB",
                fontSize: "12px",
                color: "#4B5563",
                fontWeight: "600",
              }}
            >
              Showing {filteredActiveProspects.length} of {activeProspects.length} active prospects
            </div>
            <ProspectExportButton viewerId={profileStatus?.user?.id} workspaceId={activeWorkspaceUserId}
              workspaceName={profileStatus?.workspaceUser?.name || "this workspace"}
              prospectIds={filteredActiveProspects.map((p) => p.id)} />
            {!isExecutiveReadOnly && <ProspectRanking
              key={`${profileStatus?.user?.id}:${activeWorkspaceUserId}`}
              workspaceId={activeWorkspaceUserId}
              workspaceName={profileStatus?.workspaceUser?.name || "My workspace"}
              onSaved={(ids) => {
                const ranks = new Map(ids.map((id, index) => [String(id), index + 1]));
                // Only ranks changed. Keep cached detail data without an NXT refresh.
                queryClient.setQueryData(["prospects", activeWorkspaceUserId], (current) =>
                  (current || []).map((p) => ranks.has(String(p.id)) ? { ...p, priority_order: ranks.get(String(p.id)) } : p)
                    .sort((a, b) => (a.status === "Active" ? 0 : 1) - (b.status === "Active" ? 0 : 1) ||
                      (a.priority_order ?? Infinity) - (b.priority_order ?? Infinity)));
              }} />}
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
            }}
          >
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by prospect, ask type, or next action"
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #D1D5DB",
                borderRadius: "10px",
                fontSize: "14px",
                boxSizing: "border-box",
              }}
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #D1D5DB",
                borderRadius: "10px",
                fontSize: "14px",
                backgroundColor: "white",
                boxSizing: "border-box",
              }}
            >
              <option value="all">All statuses</option>
              <option value="Active">Active</option>
              <option value="Closed – Gift Secured">Closed – Gift Secured</option>
              <option value="Closed – Declined">Closed – Declined</option>
            </select>
            <select
              value={fyFilter}
              aria-label="Filter by open opportunity fiscal year"
              onChange={(e) => setFyFilter(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #D1D5DB",
                borderRadius: "10px",
                fontSize: "14px",
                backgroundColor: "white",
                boxSizing: "border-box",
              }}
            >
              <option value="all">All open opportunity years</option>
              {opportunityYearOptions.map((fy) => (
                <option key={fy} value={fy}>
                  {fy}
                </option>
              ))}
            </select>
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 12px",
                border: "1px solid #D1D5DB",
                borderRadius: "10px",
                fontSize: "14px",
                backgroundColor: "white",
                boxSizing: "border-box",
              }}
            >
              <option value="all">All action states</option>
              <option value="clarification">Clarification requested</option>
              <option value="overdue">Overdue next steps</option>
              <option value="due">Next action due</option>
              <option value="follow-up">Needs follow-up</option>
              <option value="no-opportunity">No active opportunities</option>
            </select>
          </div>
        </div>

        {/* Active Prospects */}
        <h2
          style={{
            fontSize: "16px",
            fontWeight: "700",
            color: "#111827",
            margin: "0 0 12px 0",
          }}
        >
          Active Prospects ({filteredActiveProspects.length})
        </h2>

        {isLoading ? (
          <div
            style={{
              textAlign: "center",
              padding: "40px",
              color: "#6B7280",
              fontSize: "14px",
            }}
          >
            Loading prospects...
          </div>
        ) : filteredActiveProspects.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "60px 20px",
              backgroundColor: "white",
              borderRadius: "12px",
              border: "1px solid #E5E7EB",
              marginBottom: "24px",
            }}
          >
            <Target
              size={40}
              color="#D1D5DB"
              style={{ margin: "0 auto 12px" }}
            />
            <p
              style={{ fontSize: "15px", color: "#6B7280", margin: "0 0 4px" }}
            >
              No prospects match these filters
            </p>
            <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>
              Adjust your filters or add a new prospect to expand your pipeline.
            </p>
          </div>
        ) : (
          <div style={{ marginBottom: "32px" }}>
            {filteredActiveProspects.map((p) => (
              (() => {
                const nextAction = getProspectNextAction(p);
                const nextStepBadge = getNextStepBadge(p);
                const discussionBadge = getDiscussionBadge(p);
                const prospectBlackbaudConstituentId =
                  getProspectBlackbaudConstituentId(p);
                const annualGivingSocieties =
                  topProspectAnnualGivingSocietiesByConstituentId[
                    prospectBlackbaudConstituentId
                  ] || null;
                const prospectNxtProfileUrl = buildBlackbaudConstituentProfileUrl(
                  prospectBlackbaudConstituentId,
                );

                return (
                  <div
                    key={p.id}
                    style={{
                      backgroundColor: "white",
                      borderRadius: "16px",
                      border: `1px solid ${nextAction.tone.border}`,
                      padding: "16px 18px",
                      marginBottom: "12px",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "16px",
                      cursor: "pointer",
                    }}
                    onClick={() => setSelectedProspectId(p.id)}
                  >
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "13px",
                        fontWeight: "700",
                        color: "#4338CA",
                        width: "32px",
                        height: "32px",
                        borderRadius: "999px",
                        backgroundColor: "#EEF2FF",
                        flexShrink: 0,
                        textAlign: "center",
                      }}
                    >
                      {p.priority_order || activeProspects.findIndex((prospect) => prospect.id === p.id) + 1}
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: "12px",
                          flexWrap: "wrap",
                          alignItems: "flex-start",
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                              flexWrap: "wrap",
                              marginBottom: "8px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "18px",
                                fontWeight: "700",
                                color: "#111827",
                              }}
                            >
                              {p.prospect_name}
                            </span>
                            <StatusBadge status={p.status} />
                            <AnnualGivingSocietyBadge
                              annualGivingSocieties={annualGivingSocieties}
                            />
                            <span
                              style={{
                                backgroundColor: nextAction.tone.soft,
                                color: nextAction.tone.fg,
                                border: `1px solid ${nextAction.tone.border}`,
                                padding: "4px 10px",
                                borderRadius: "999px",
                                fontSize: "12px",
                                fontWeight: 700,
                              }}
                            >
                              {nextAction.label}
                            </span>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedProspectId(p.id);
                                if (typeof window !== "undefined") {
                                  const url = new URL(window.location.href);
                                  url.searchParams.set("prospectId", String(p.id));
                                  url.searchParams.set("panel", "discussion");
                                  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
                                }
                              }}
                              style={{
                                backgroundColor: discussionBadge.bg,
                                color: discussionBadge.text,
                                border: `1px solid ${discussionBadge.border}`,
                                padding: "4px 10px",
                                borderRadius: "999px",
                                fontSize: "12px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              {discussionBadge.label}
                            </button>
                          </div>
                          {p.name_status === "unavailable" ? (
                            <p className="mb-2 text-sm text-slate-600">Name is not available in the saved data. Open the NXT profile to verify this record.</p>
                          ) : null}
                          {nextAction.meta ? (
                            <div
                              style={{
                                fontSize: "13px",
                                color: nextAction.tone.fg,
                                fontWeight: "700",
                                marginBottom: "6px",
                              }}
                            >
                              {nextAction.meta}
                            </div>
                          ) : null}
                          <div
                            style={{
                              marginBottom: "12px",
                              padding: "12px 14px",
                              borderRadius: "12px",
                              backgroundColor: "#FCFCFD",
                              border: `1px solid ${nextAction.tone.border}`,
                            }}
                          >
                            <div
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                color: "#6B7280",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                marginBottom: "6px",
                              }}
                            >
                              Next step
                            </div>
                            <div style={{ fontSize: "15px", fontWeight: 700, color: "#111827" }}>
                              {p.next_action_text || "No next step set yet"}
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "10px" }}>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedProspectId(p.id);
                              }}
                              style={{
                                padding: "9px 12px",
                                borderRadius: "999px",
                                border: "none",
                                backgroundColor: "#6A5BFF",
                                color: "white",
                                fontSize: "12px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              View Prospect
                            </button>
                            {prospectNxtProfileUrl ? (
                              <a
                                href={prospectNxtProfileUrl}
                                target="_blank"
                                rel="noreferrer"
                                onClick={(event) => event.stopPropagation()}
                                style={nxtProfileLinkStyle}
                              >
                                Open NXT profile
                              </a>
                            ) : null}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "8px",
                              flexWrap: "wrap",
                            }}
                          >
                            <span
                              style={{
                                backgroundColor: nextStepBadge.bg,
                                color: nextStepBadge.text,
                                border: `1px solid ${nextStepBadge.border}`,
                                padding: "4px 10px",
                                borderRadius: "999px",
                                fontSize: "12px",
                                fontWeight: 700,
                              }}
                            >
                              {nextStepBadge.label}
                            </span>
                            <span
                              style={{
                                padding: "4px 8px",
                                borderRadius: "999px",
                                backgroundColor: "#F9FAFB",
                                border: "1px solid #E5E7EB",
                                fontSize: "12px",
                                fontWeight: "700",
                                color: "#374151",
                              }}
                            >
                              {getProspectFiscalYearLabel(p)}
                            </span>
                            <span
                              style={{
                                padding: "4px 8px",
                                borderRadius: "999px",
                                backgroundColor: "#F9FAFB",
                                border: "1px solid #E5E7EB",
                                fontSize: "12px",
                                fontWeight: "600",
                                color: "#4B5563",
                              }}
                            >
                              {p.ask_type}
                            </span>
                          </div>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gap: "8px",
                            minWidth: "170px",
                            alignContent: "start",
                          }}
                        >
                          <div
                            style={{
                              padding: "10px 12px",
                              borderRadius: "12px",
                              backgroundColor: "#F9FAFB",
                              border: "1px solid #E5E7EB",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "10px",
                                fontWeight: 700,
                                color: "#6B7280",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                marginBottom: "4px",
                              }}
                            >
                              Open Pipeline
                            </div>
                            <div style={{ fontSize: "16px", fontWeight: 700, color: "#111827" }}>
                              {formatCurrency(p.ask_amount)}
                            </div>
                          </div>
                          <div
                            style={{
                              borderRadius: "12px",
                              backgroundColor: "#F9FAFB",
                              border: "1px solid #E5E7EB",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "10px",
                                fontWeight: 700,
                                color: "#6B7280",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                marginBottom: "4px",
                              }}
                            >
                              Opportunities
                            </div>
                            <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>
                              {p.active_opportunity_count || 0} active
                            </div>
                            <div style={{ fontSize: "12px", color: "#6B7280" }}>
                              {p.linked_opportunity_count || 0} linked
                            </div>
                          </div>
                        </div>
                      </div>

                      {p.latest_submission_reviewer_notes ? (
                        <div
                          style={{
                            marginTop: "12px",
                            padding: "10px 12px",
                            borderRadius: "10px",
                            backgroundColor: "#F9FAFB",
                            border: "1px solid #E5E7EB",
                            fontSize: "12px",
                            color: "#374151",
                            lineHeight: 1.5,
                          }}
                        >
                          <span style={{ fontWeight: 700, color: "#111827" }}>Latest reviewer note:</span>{" "}
                          {p.latest_submission_reviewer_notes}
                        </div>
                      ) : null}
                    </div>

                  </div>
                );
              })()
            ))}
          </div>
        )}

        {/* Closed Prospects */}
        {(closedSecured.length > 0 || closedDeclined.length > 0) && (
          <div>
            <h2
              style={{
                fontSize: "16px",
                fontWeight: "700",
                color: "#111827",
                margin: "0 0 16px 0",
              }}
            >
              Closed Prospects
            </h2>

            {closedSecured.length > 0 && (
              <div style={{ marginBottom: "20px" }}>
                <h3
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#059669",
                    margin: "0 0 8px 0",
                  }}
                >
                  Gift Secured ({closedSecured.length})
                </h3>
                {closedSecured.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      backgroundColor: "white",
                      borderRadius: "12px",
                      border: "1px solid #E5E7EB",
                      padding: "16px 20px",
                      marginBottom: "8px",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      cursor: "pointer",
                      borderLeft: "4px solid #059669",
                    }}
                    onClick={() => setSelectedProspectId(p.id)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          flexWrap: "wrap",
                          marginBottom: "4px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "15px",
                            fontWeight: "600",
                            color: "#111827",
                          }}
                        >
                          {p.prospect_name}
                        </span>
                        <StatusBadge status={p.status} />
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          fontSize: "13px",
                          color: "#6B7280",
                          flexWrap: "wrap",
                        }}
                      >
                        <span>{p.expected_close_fy}</span>
                        <span>·</span>
                        <span
                          style={{
                            fontWeight: "800",
                            color: "#047857",
                            fontSize: "14px",
                          }}
                        >
                          Funded {formatCurrency(getProspectFundedDisplayAmount(p))}
                        </span>
                        {shouldShowProspectAskedAmount(p) ? (
                          <>
                            <span>·</span>
                            <span style={{ color: "#9CA3AF" }}>
                              Asked {formatCurrency(getProspectAskedDisplayAmount(p))}
                            </span>
                          </>
                        ) : null}
                        {Number(p.secured_linked_gift_count || 0) > 0 ? (
                          <>
                            <span>·</span>
                            <span style={{ color: "#6B7280" }}>
                              {p.secured_linked_gift_count} linked gift
                              {Number(p.secured_linked_gift_count) === 1 ? "" : "s"}
                            </span>
                          </>
                        ) : null}
                        {p.close_date && (
                          <>
                            <span>·</span>
                            <span>
                              Closed{" "}
                              {new Date(p.close_date).toLocaleDateString()}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {closedDeclined.length > 0 && (
              <div>
                <h3
                  style={{
                    fontSize: "14px",
                    fontWeight: "600",
                    color: "#DC2626",
                    margin: "0 0 8px 0",
                  }}
                >
                  Declined ({closedDeclined.length})
                </h3>
                {closedDeclined.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      backgroundColor: "white",
                      borderRadius: "12px",
                      border: "1px solid #E5E7EB",
                      padding: "16px 20px",
                      marginBottom: "8px",
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      cursor: "pointer",
                      borderLeft: "4px solid #DC2626",
                    }}
                    onClick={() => setSelectedProspectId(p.id)}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          flexWrap: "wrap",
                          marginBottom: "4px",
                        }}
                      >
                        <span
                          style={{
                            fontSize: "15px",
                            fontWeight: "600",
                            color: "#111827",
                          }}
                        >
                          {p.prospect_name}
                        </span>
                        <StatusBadge status={p.status} />
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          fontSize: "13px",
                          color: "#6B7280",
                          flexWrap: "wrap",
                        }}
                      >
                        <span>{p.expected_close_fy}</span>
                        <span>·</span>
                        <span>{p.ask_type}</span>
                        {p.decline_reason && (
                          <>
                            <span>·</span>
                            <span style={{ fontStyle: "italic" }}>
                              {p.decline_reason}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {archivedProspects.length > 0 && (
          <div style={{ marginTop: "28px" }}>
            <h2
              style={{
                fontSize: "16px",
                fontWeight: "700",
                color: "#111827",
                margin: "0 0 16px 0",
              }}
            >
              Archived Prospects
            </h2>
            {archivedProspects.map((p) => (
              <div
                key={p.id}
                style={{
                  backgroundColor: "white",
                  borderRadius: "12px",
                  border: "1px solid #E5E7EB",
                  padding: "16px 20px",
                  marginBottom: "8px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  cursor: "pointer",
                  borderLeft: "4px solid #9CA3AF",
                }}
                onClick={() => setSelectedProspectId(p.id)}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      flexWrap: "wrap",
                      marginBottom: "4px",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "15px",
                        fontWeight: "600",
                        color: "#111827",
                      }}
                    >
                      {p.prospect_name}
                    </span>
                    <StatusBadge status={p.status} />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      fontSize: "13px",
                      color: "#6B7280",
                      flexWrap: "wrap",
                    }}
                  >
                    <span>{p.expected_close_fy}</span>
                    <span>·</span>
                    <span style={{ fontWeight: "600" }}>{p.ask_type}</span>
                    {p.closed_amount != null ? (
                      <>
                        <span>·</span>
                        <span style={{ color: "#059669", fontWeight: "600" }}>
                          {formatCurrency(p.closed_amount)} closed
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </>
        ) : null}
      </main>

      {/* Modals */}
      {showAddModal && (
        <AddProspectModal
          onClose={() => {
            setShowAddModal(false);
            setAddProspectInitialData(null);
            setAddProspectError("");
          }}
          onSubmit={(data) => addMutation.mutate(data)}
          isPending={addMutation.isPending}
          errorMessage={addProspectError}
          initialData={addProspectInitialData}
        />
      )}

      {selectedProspectId && (
        <ProspectDetailModal
          pledgeData={pledgeData}
          ownerName={profileStatus?.workspaceUser?.name}
          prospectId={selectedProspectId}
          initialPanel={selectedProspectPanel}
          onClose={closeProspectWorkspace}
          readOnly={isExecutiveReadOnly}
        />
      )}

      {portfolioFollowUp ? (
        <PortfolioFollowUpModal
          kind={portfolioFollowUp.kind}
          person={portfolioFollowUp.person}
          ownerName={profileStatus?.workspaceUser?.name}
          onClose={() => setPortfolioFollowUp(null)}
        />
      ) : null}

      {showPortfolioCategoryManager ? (
        <PortfolioCategoryManagerModal
          categories={portfolioCategories}
          onClose={() => {
            setShowPortfolioCategoryManager(false);
            setPortfolioCategoryError("");
          }}
          onCreate={createPortfolioCategory}
          onRename={renamePortfolioCategory}
          onDelete={deletePortfolioCategory}
          onChangeParent={changePortfolioCategoryParent}
          onMoveCategory={reorderPortfolioCategory}
          isCreating={createPortfolioCategoryMutation.isPending}
          renamingCategoryId={String(renamePortfolioCategoryMutation.variables?.category?.id || "")}
          deletingCategoryId={String(deletePortfolioCategoryMutation.variables?.id || "")}
          changingCategoryParentId={
            updatePortfolioCategoryParentMutation.isPending
              ? String(updatePortfolioCategoryParentMutation.variables?.category?.id || "")
              : ""
          }
          movingCategoryId={
            reorderPortfolioCategoryMutation.isPending
              ? String(reorderPortfolioCategoryMutation.variables?.category?.id || "")
              : ""
          }
        />
      ) : null}
    </div>
  );
}
