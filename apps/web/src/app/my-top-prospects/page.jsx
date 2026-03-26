"use client";

import { useEffect, useState } from "react";
import useUser from "@/utils/useUser";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Plus,
  ChevronUp,
  ChevronDown,
  Target,
  DollarSign,
  Trophy,
  X,
  MessageSquare,
} from "lucide-react";
import { getSyncBadge } from "@/app/api/utils/nxtTerminologyMap";

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
const ACTION_TYPES = ["visit", "call", "email", "event"];
const OPPORTUNITY_STAGE_OPTIONS = [
  "Identification",
  "Qualification",
  "Cultivation",
  "Solicitation",
  "Solicitation - Verbal",
  "Stewardship",
];

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

const OPPORTUNITY_STATUS_COLORS = {
  Active: { bg: "#DCFCE7", text: "#166534", border: "#BBF7D0" },
  "Closed – Gift Secured": { bg: "#DBEAFE", text: "#1D4ED8", border: "#BFDBFE" },
  "Closed – Declined": { bg: "#FEE2E2", text: "#991B1B", border: "#FECACA" },
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

function OpportunityStatusBadge({ status }) {
  const colors = OPPORTUNITY_STATUS_COLORS[status] || OPPORTUNITY_STATUS_COLORS.Active;
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

function formatCurrency(amount) {
  if (!amount) return "$0";
  return "$" + Number(amount).toLocaleString();
}

function formatBlackbaudCurrency(amount) {
  if (amount == null) return "Unavailable";
  return "$" + Number(amount).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatLongDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getSubmissionTimelineLabel(submission) {
  switch (submission.submission_type) {
    case "donor_update":
      return "Donor update";
    case "opportunity_update":
      return "Opportunity update";
    case "constituent_suggestion":
      return "Constituent suggestion";
    default:
      return "Submission";
  }
}

function getSubmissionTimelineDescription(submission) {
  switch (submission.submission_type) {
    case "donor_update":
      return submission.notes || submission.transcript || "Donor update submitted.";
    case "opportunity_update":
      return submission.notes || submission.next_step || "Opportunity update submitted.";
    case "constituent_suggestion":
      return (
        submission.notes ||
        submission.organization ||
        "New constituent suggestion submitted."
      );
    default:
      return submission.notes || "Submission updated.";
  }
}

function formatRelativeDays(value) {
  if (!value) return "No recent activity";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "No recent activity";
  const diffMs = Date.now() - date.getTime();
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
  if (diffDays === 0) return "Active today";
  if (diffDays === 1) return "Active yesterday";
  return `Active ${diffDays} days ago`;
}

function formatShortDate(value) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatPortfolioContact(person) {
  return [person?.email, person?.phone].filter(Boolean).join(" · ");
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

function PortfolioTier({
  title,
  description,
  items,
  accent,
  onAddToTopProspects,
  isAdding,
}) {
  return (
    <div
      style={{
        backgroundColor: "white",
        borderRadius: "14px",
        border: "1px solid #E5E7EB",
        padding: "16px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          alignItems: "baseline",
          flexWrap: "wrap",
          marginBottom: "8px",
        }}
      >
        <div>
          <div style={{ fontSize: "16px", fontWeight: "700", color: "#111827" }}>
            {title}
          </div>
          <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.5 }}>
            {description}
          </div>
        </div>
        <div
          style={{
            padding: "6px 10px",
            borderRadius: "999px",
            backgroundColor: accent.background,
            color: accent.text,
            fontSize: "12px",
            fontWeight: "700",
          }}
        >
          {items.length} constituent{items.length === 1 ? "" : "s"}
        </div>
      </div>

      {items.length ? (
        <div style={{ display: "grid", gap: "10px", marginTop: "14px" }}>
          {items.map((person) => (
            <div
              key={person.constituentId}
              style={{
                borderRadius: "12px",
                backgroundColor: "#F9FAFB",
                padding: "14px",
                display: "grid",
                gap: "6px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ fontSize: "15px", fontWeight: "700", color: "#111827" }}>
                  {person.name || "Unnamed constituent"}
                </div>
                {person.lookupId ? (
                  <div
                    style={{
                      padding: "5px 10px",
                      borderRadius: "999px",
                      backgroundColor: "#EEF2FF",
                      color: "#4338CA",
                      fontSize: "12px",
                      fontWeight: "700",
                    }}
                  >
                    Lookup ID: {person.lookupId}
                  </div>
                ) : null}
              </div>
              <div style={{ fontSize: "13px", color: "#4B5563", lineHeight: 1.5 }}>
                {formatPortfolioContact(person) || "No email or phone in NXT"}
              </div>
              {person.address ? (
                <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.5 }}>
                  {person.address}
                </div>
              ) : null}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  alignItems: "center",
                  flexWrap: "wrap",
                  marginTop: "4px",
                }}
              >
                <div style={{ fontSize: "12px", color: "#6B7280" }}>
                  {person.assignmentTypes?.join(" · ")}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    flexWrap: "wrap",
                    justifyContent: "flex-end",
                  }}
                >
                  <div style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>
                    Lifetime giving:{" "}
                    {formatBlackbaudCurrency(person.lifetimeGiving?.totalGiving)}
                  </div>
                  <button
                    type="button"
                    onClick={() => onAddToTopProspects?.(person)}
                    disabled={isAdding}
                    style={{
                      padding: "8px 12px",
                      borderRadius: "999px",
                      border: "1px solid #C7D2FE",
                      backgroundColor: "white",
                      color: "#4338CA",
                      fontSize: "12px",
                      fontWeight: "700",
                      cursor: isAdding ? "not-allowed" : "pointer",
                    }}
                  >
                    Add to Top Prospects
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: "12px", fontSize: "13px", color: "#6B7280", lineHeight: 1.6 }}>
          No current constituents in this tier right now.
        </div>
      )}
    </div>
  );
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
      meta: `Last activity ${Math.floor(staleDays)} days ago`,
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

function getOpportunityDisplayAmount(opportunity) {
  if (opportunity.opportunity_status === "Closed – Gift Secured") {
    return opportunity.closed_amount ?? opportunity.estimated_amount ?? 0;
  }

  if (opportunity.opportunity_status === "Closed – Declined") {
    return 0;
  }

  return opportunity.estimated_amount ?? 0;
}

function AddProspectModal({ onClose, onSubmit, isPending, initialData = null }) {
  const [name, setName] = useState(initialData?.prospectName || "");
  const [fy, setFy] = useState(initialData?.expectedCloseFY || "FY26");
  const [amount, setAmount] = useState(initialData?.askAmount || "");
  const [askType, setAskType] = useState(initialData?.askType || "Major Gift");
  const [blackbaudMatches, setBlackbaudMatches] = useState([]);
  const [selectedBlackbaudMatch, setSelectedBlackbaudMatch] = useState(
    initialData?.selectedBlackbaudMatch || null,
  );

  useEffect(() => {
    if (!initialData) return;
    setName(initialData.prospectName || "");
    setFy(initialData.expectedCloseFY || "FY26");
    setAmount(initialData.askAmount || "");
    setAskType(initialData.askType || "Major Gift");
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
      expectedCloseFY: fy,
      askAmount: amount ? parseFloat(amount) : null,
      askType,
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
              Expected Close Fiscal Year
            </label>
            <select
              value={fy}
              onChange={(e) => setFy(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
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
              Ask Amount
            </label>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
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
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
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
              Ask Type
            </label>
            <select
              value={askType}
              onChange={(e) => setAskType(e.target.value)}
              style={{
                width: "100%",
                padding: "10px 14px",
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

function ProspectDetailModal({ prospectId, initialPanel, onClose }) {
  const queryClient = useQueryClient();
  const [expandedTimelineId, setExpandedTimelineId] = useState(null);
  const [editingUpdateId, setEditingUpdateId] = useState(null);
  const [editingUpdateNotes, setEditingUpdateNotes] = useState("");
  const [editingUpdateDate, setEditingUpdateDate] = useState("");
  const [showActionForm, setShowActionForm] = useState(false);
  const [showNextStepForm, setShowNextStepForm] = useState(false);
  const [actionDate, setActionDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [actionType, setActionType] = useState("visit");
  const [actionSummary, setActionSummary] = useState("");
  const [actionNotes, setActionNotes] = useState("");
  const [actionNextStep, setActionNextStep] = useState("");
  const [actionNextStepDueDate, setActionNextStepDueDate] = useState("");
  const [actionLinkedOpportunityId, setActionLinkedOpportunityId] = useState("");
  const [showOpportunityForm, setShowOpportunityForm] = useState(false);
  const [showDiscussionForm, setShowDiscussionForm] = useState(false);
  const [discussionSubject, setDiscussionSubject] = useState("");
  const [discussionBody, setDiscussionBody] = useState("");
  const [discussionDueDate, setDiscussionDueDate] = useState("");
  const [discussionAssignedUserId, setDiscussionAssignedUserId] = useState("");
  const [discussionError, setDiscussionError] = useState("");
  const [nextStepTextDraft, setNextStepTextDraft] = useState("");
  const [nextStepDueDateDraft, setNextStepDueDateDraft] = useState("");
  const [nextStepCompletedDraft, setNextStepCompletedDraft] = useState(false);
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
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (!prospectId) return;
    if (initialPanel === "action") {
      setShowActionForm(true);
      setShowNextStepForm(false);
      setShowOpportunityForm(false);
      setShowDiscussionForm(false);
      return;
    }
    if (initialPanel === "next-step") {
      setShowNextStepForm(true);
      setShowActionForm(false);
      setShowOpportunityForm(false);
      setShowDiscussionForm(false);
      return;
    }
    if (initialPanel === "discussion") {
      setShowDiscussionForm(true);
      setShowActionForm(false);
      setShowNextStepForm(false);
      setShowOpportunityForm(false);
      return;
    }
    if (initialPanel === "opportunity") {
      setShowOpportunityForm(true);
      setShowActionForm(false);
      setShowNextStepForm(false);
      setShowDiscussionForm(false);
      return;
    }
  }, [initialPanel, prospectId]);

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
      queryClient.invalidateQueries({ queryKey: ["prospect-summary"] });
      setActionDate(new Date().toISOString().split("T")[0]);
      setActionType("visit");
      setActionSummary("");
      setActionNotes("");
      setActionNextStep("");
      setActionNextStepDueDate("");
      setActionLinkedOpportunityId("");
      setShowActionForm(false);
      setActionError(
        result?.blackbaudAction?.error
          ? `Saved in the app, but Blackbaud sync failed: ${result.blackbaudAction.error}`
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary"] });
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary"] });
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
      queryClient.invalidateQueries({ queryKey: ["prospect-summary"] });
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
        throw new Error(payload?.error || "Failed to delete prospect");
      }
      return payload;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary"] });
      onClose();
    },
    onError: (mutationError) => {
      setActionError(
        mutationError instanceof Error
          ? mutationError.message
          : "Failed to delete prospect",
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary"] });
      setEditingOpportunityId(null);
      setOpportunityEditData({});
      setOpportunityEditError("");
    },
    onError: (error) => {
      setOpportunityEditError(
        error instanceof Error ? error.message : "Failed to update linked opportunity",
      );
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
      queryClient.invalidateQueries({ queryKey: ["prospect-summary"] });
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

  const prospect = data?.prospect;
  const updates = data?.updates || [];
  const opportunities = data?.opportunities || [];
  const linkedSubmissions = data?.linkedSubmissions || [];
  const discussionItems = data?.discussionItems || [];
  const blackbaudConstituent = blackbaudSummary?.mapped?.constituent || null;
  const blackbaudLifetimeGiving =
    blackbaudSummary?.mapped?.lifetimeGiving || null;
  const blackbaudAssignments =
    blackbaudSummary?.mapped?.fundraiserAssignments || [];

  useEffect(() => {
    setNextStepTextDraft(prospect?.next_action_text || "");
    setNextStepDueDateDraft(prospect?.next_action_due_date || "");
    setNextStepCompletedDraft(Boolean(prospect?.next_action_completed_at));
  }, [
    prospect?.next_action_completed_at,
    prospect?.next_action_due_date,
    prospect?.next_action_text,
  ]);

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
    setOpportunityEditData({
      title: opportunity.title || "",
      currentStage: opportunity.current_stage || "Identification",
      opportunityStatus: opportunity.opportunity_status || "Active",
      estimatedAmount:
        opportunity.estimated_amount != null
          ? String(opportunity.estimated_amount)
          : "",
      askDate: opportunity.ask_date || "",
      expectedDate: opportunity.expected_date || "",
      latestNotes: opportunity.latest_notes || "",
      closedAmount:
        opportunity.closed_amount != null ? String(opportunity.closed_amount) : "",
      closeDate: opportunity.close_date || "",
      declineReason: opportunity.decline_reason || "",
    });
  };

  const saveOpportunityEdit = () => {
    if (!editingOpportunityId) return;
    setOpportunityEditError("");
    updateOpportunityMutation.mutate({
      opportunityId: editingOpportunityId,
      body: {
        title: opportunityEditData.title,
        currentStage: opportunityEditData.currentStage,
        opportunityStatus: opportunityEditData.opportunityStatus,
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
      interactionType: actionType,
      summary: actionSummary,
      notes: actionNotes,
      nextStep: actionNextStep,
      nextActionDueDate: actionNextStepDueDate || null,
      linkedOpportunityId: actionLinkedOpportunityId || null,
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
        "Delete this prospect permanently? This should only be used for records added by mistake.",
      )
    ) {
      return;
    }
    deleteMutation.mutate();
  };
  const timelineEvents = [
    ...updates.map((update) => ({
      id: `progress-${update.id}`,
      occurredAt: update.update_date || update.created_at,
      kind: "progress",
      title: "Progress update",
      description: update.update_notes,
      meta: formatLongDate(update.update_date || update.created_at),
      accent: "#6A5BFF",
      border: "#DDD6FE",
      background: "#F5F3FF",
      raw: update,
    })),
    ...opportunities.map((opportunity) => ({
      id: `opportunity-${opportunity.id}`,
      occurredAt: opportunity.updated_at || opportunity.created_at,
      kind: "opportunity",
      title: `${opportunity.title}`,
      description:
        opportunity.latest_notes ||
        `${opportunity.current_stage} · ${opportunity.opportunity_status || "Active"}`,
      meta: `${opportunity.current_stage} · ${opportunity.opportunity_status || "Active"} · ${formatLongDate(
        opportunity.updated_at || opportunity.created_at,
      )}`,
      accent: "#1D4ED8",
      border: "#BFDBFE",
      background: "#EFF6FF",
      raw: opportunity,
    })),
    ...linkedSubmissions.map((submission) => ({
      id: `submission-${submission.id}`,
      occurredAt:
        submission.reviewed_at ||
        submission.updated_at ||
        submission.date_submitted,
      kind: "submission",
      title: getSubmissionTimelineLabel(submission),
      description: getSubmissionTimelineDescription(submission),
      meta: [
        submission.status,
        submission.reviewer_notes
          ? `Reviewer note from ${submission.reviewer_name || "reviewer"}`
          : null,
        formatLongDate(
          submission.reviewed_at ||
            submission.updated_at ||
            submission.date_submitted,
        ),
      ]
        .filter(Boolean)
        .join(" · "),
      accent:
        submission.status === "Needs Clarification" ? "#B45309" : "#065F46",
      border:
        submission.status === "Needs Clarification" ? "#FCD34D" : "#A7F3D0",
      background:
        submission.status === "Needs Clarification" ? "#FFFBEB" : "#ECFDF5",
      reviewerNotes: submission.reviewer_notes,
      raw: submission,
    })),
  ]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  const workspaceCardStyle = {
    backgroundColor: "white",
    borderRadius: "16px",
    border: "1px solid #E5E7EB",
    padding: "18px",
  };

  const sectionEyebrowStyle = {
    fontSize: "12px",
    fontWeight: "700",
    color: "#6B7280",
    margin: "0 0 6px 0",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  };

  const detailLabelStyle = {
    fontSize: "12px",
    fontWeight: "600",
    color: "#6B7280",
    marginBottom: "2px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  };

  const nextStepSummary = prospect.next_action_text
    ? prospect.next_action_completed_at
      ? `Completed ${formatLongDate(prospect.next_action_completed_at)}`
      : prospect.next_action_due_date
        ? `Due ${formatLongDate(prospect.next_action_due_date)}`
        : "No due date set"
    : "No next action set.";

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

  const saveNextStep = () => {
    setActionError("");
    const trimmed = nextStepTextDraft.trim();
    editMutation.mutate({
      nextActionText: trimmed || null,
      nextActionDueDate: trimmed ? nextStepDueDateDraft || null : null,
      nextActionCompletedAt: trimmed && nextStepCompletedDraft ? new Date().toISOString() : null,
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
                      {prospect.next_action_text || "Nothing queued yet"}
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
                    <p style={sectionEyebrowStyle}>Expected close FY</p>
                    <div style={{ fontSize: "20px", fontWeight: "800", color: "#111827" }}>
                      {prospect.expected_close_fy}
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
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            </>
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
                    Expected Close FY
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

          {showNextStepForm ? (
            <div
              style={{
                ...workspaceCardStyle,
                marginBottom: "20px",
                backgroundColor: "#FFFDF7",
                borderColor: "#FDE68A",
              }}
            >
              <p style={sectionEyebrowStyle}>Next Step</p>
              <p style={{ margin: "0 0 14px", fontSize: "14px", color: "#4B5563", lineHeight: 1.6 }}>
                Keep the follow-up itself current here without opening the full Action form.
              </p>
              <div style={{ display: "grid", gap: "14px" }}>
                <div>
                  <label style={detailLabelStyle}>Next Step</label>
                  <textarea
                    rows={3}
                    value={nextStepTextDraft}
                    onChange={(event) => setNextStepTextDraft(event.target.value)}
                    placeholder="What should happen next?"
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
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                    gap: "14px",
                  }}
                >
                  <div>
                    <label style={detailLabelStyle}>Due Date</label>
                    <input
                      type="date"
                      value={nextStepDueDateDraft}
                      onChange={(event) => setNextStepDueDateDraft(event.target.value)}
                      style={{
                        width: "100%",
                        padding: "10px 12px",
                        border: "1px solid #D1D5DB",
                        borderRadius: "10px",
                        fontSize: "14px",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <label
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      fontSize: "14px",
                      color: "#374151",
                      paddingTop: "26px",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={nextStepCompletedDraft}
                      onChange={(event) => setNextStepCompletedDraft(event.target.checked)}
                    />
                    Mark next step complete
                  </label>
                </div>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={saveNextStep}
                    disabled={editMutation.isPending}
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
                    {editMutation.isPending ? "Saving..." : "Save next step"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowNextStepForm(false);
                      setNextStepTextDraft(prospect.next_action_text || "");
                      setNextStepDueDateDraft(prospect.next_action_due_date || "");
                      setNextStepCompletedDraft(Boolean(prospect.next_action_completed_at));
                    }}
                    disabled={editMutation.isPending}
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
              </div>
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
              <div
                style={{
                  marginBottom: "12px",
                  display: "flex",
                  gap: "8px",
                  flexWrap: "wrap",
                }}
              >
                {ACTION_TYPES.map((type) => {
                  const selected = actionType === type;
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setActionType(type)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: "999px",
                        border: selected ? "1px solid #6A5BFF" : "1px solid #D1D5DB",
                        backgroundColor: selected ? "#EDE9FE" : "white",
                        color: selected ? "#5B21B6" : "#374151",
                        fontSize: "12px",
                        fontWeight: "700",
                        cursor: "pointer",
                        textTransform: "capitalize",
                      }}
                    >
                      {type}
                    </button>
                  );
                })}
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
                  Date
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
                  ? "This action will be logged in the app and sent to the linked Blackbaud constituent."
                  : "This action will be saved in the app only because this prospect is not linked to Blackbaud."}
              </div>
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={saveActionLog}
                  disabled={
                    addActionMutation.isPending ||
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
                  onClick={() => setShowActionForm(false)}
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
          {linkedBlackbaudConstituentId ? (
            <div
              style={{
                ...workspaceCardStyle,
                borderColor: "#BFDBFE",
                backgroundColor: "#EFF6FF",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "12px",
                  alignItems: "flex-start",
                  marginBottom: "10px",
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "14px",
                      fontWeight: "700",
                      color: "#1D4ED8",
                    }}
                  >
                    Blackbaud Summary
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
                    fontWeight: "700",
                    color: "#1D4ED8",
                    backgroundColor: "#DBEAFE",
                    border: "1px solid #93C5FD",
                    borderRadius: "999px",
                    padding: "4px 10px",
                  }}
                >
                  Read-only NXT data
                </div>
              </div>

              {blackbaudSummaryLoading ? (
                <div style={{ fontSize: "13px", color: "#4B5563" }}>
                  Loading Blackbaud summary...
                </div>
              ) : blackbaudSummaryError ? (
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
                      gridTemplateColumns: "1fr 1fr",
                      gap: "14px",
                    }}
                  >
                    <div>
                      <p
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6B7280",
                          marginBottom: "2px",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        Constituent Name
                      </p>
                      <p style={{ fontSize: "15px", fontWeight: "600", color: "#111827", margin: 0 }}>
                        {blackbaudConstituent?.name || "Unavailable"}
                      </p>
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6B7280",
                          marginBottom: "2px",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        Preferred Name
                      </p>
                      <p style={{ fontSize: "15px", fontWeight: "600", color: "#111827", margin: 0 }}>
                        {blackbaudConstituent?.preferredName || "Unavailable"}
                      </p>
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6B7280",
                          marginBottom: "2px",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        Email
                      </p>
                      <p style={{ fontSize: "14px", color: "#374151", margin: 0 }}>
                        {blackbaudConstituent?.email || "Unavailable"}
                      </p>
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6B7280",
                          marginBottom: "2px",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        Phone
                      </p>
                      <p style={{ fontSize: "14px", color: "#374151", margin: 0 }}>
                        {blackbaudConstituent?.phone || "Unavailable"}
                      </p>
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6B7280",
                          marginBottom: "2px",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        Lifetime Giving
                      </p>
                      <p style={{ fontSize: "15px", fontWeight: "600", color: "#111827", margin: 0 }}>
                        {formatBlackbaudCurrency(
                          blackbaudLifetimeGiving?.totalGiving,
                        )}
                      </p>
                    </div>
                    <div>
                      <p
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6B7280",
                          marginBottom: "2px",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        Years Given
                      </p>
                      <p style={{ fontSize: "15px", fontWeight: "600", color: "#111827", margin: 0 }}>
                        {blackbaudLifetimeGiving?.totalYearsGiven ?? "Unavailable"}
                      </p>
                    </div>
                  </div>
                  {blackbaudConstituent?.address ? (
                    <div style={{ marginTop: "14px" }}>
                      <p
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6B7280",
                          marginBottom: "2px",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        Preferred Address
                      </p>
                      <p
                        style={{
                          fontSize: "14px",
                          color: "#374151",
                          margin: 0,
                          whiteSpace: "pre-line",
                        }}
                      >
                        {blackbaudConstituent.address}
                      </p>
                    </div>
                  ) : null}
                  {blackbaudAssignments.length > 0 ? (
                    <div style={{ marginTop: "14px" }}>
                      <p
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#6B7280",
                          marginBottom: "6px",
                          textTransform: "uppercase",
                          letterSpacing: "0.5px",
                        }}
                      >
                        Active Fundraiser Assignment
                      </p>
                      <div
                        style={{
                          padding: "10px 12px",
                          borderRadius: "8px",
                          backgroundColor: "white",
                          border: "1px solid #DBEAFE",
                          fontSize: "13px",
                          color: "#374151",
                          lineHeight: 1.6,
                        }}
                      >
                        <div>
                          Type:{" "}
                          <strong>{blackbaudAssignments[0]?.type || "Unavailable"}</strong>
                        </div>
                        <div>
                          Fundraiser ID:{" "}
                          <strong>
                            {blackbaudAssignments[0]?.fundraiserId || "Unavailable"}
                          </strong>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          ) : (
            <div style={{ ...workspaceCardStyle, backgroundColor: "#F9FAFB" }}>
              <p style={sectionEyebrowStyle}>Blackbaud</p>
              <p
                style={{
                  margin: 0,
                  fontSize: "14px",
                  color: "#4B5563",
                  lineHeight: 1.6,
                }}
              >
                This prospect is not linked to a Blackbaud constituent yet. Actions and opportunities will stay in the app only until the record is linked.
              </p>
            </div>
          )}

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

          <div style={{ ...workspaceCardStyle, marginBottom: 0 }}>
            <h3
              style={{
                fontSize: "16px",
                fontWeight: "700",
                color: "#111827",
                margin: "0 0 12px 0",
              }}
            >
              Linked Opportunities
            </h3>
            {opportunities.length === 0 ? (
              <p
                style={{
                  fontSize: "14px",
                  color: "#9CA3AF",
                  fontStyle: "italic",
                }}
              >
                No linked opportunities yet. New opportunity updates for this prospect will appear here and roll into
                the total ask pipeline.
              </p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {opportunities.map((opportunity) => (
                  <div
                    key={opportunity.id}
                    style={{
                      padding: "14px",
                      backgroundColor: "#EFF6FF",
                      borderRadius: "10px",
                      border: "1px solid #BFDBFE",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "12px",
                        marginBottom: "6px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: "14px",
                            fontWeight: "700",
                            color: "#1E3A8A",
                            marginBottom: "2px",
                          }}
                        >
                          {opportunity.title}
                        </div>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                          <div style={{ fontSize: "12px", color: "#1D4ED8" }}>
                            {opportunity.current_stage}
                          </div>
                          <OpportunityStatusBadge status={opportunity.opportunity_status || "Active"} />
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: "700",
                          color: "#111827",
                        }}
                      >
                        {formatCurrency(getOpportunityDisplayAmount(opportunity))}
                      </div>
                    </div>
                    {editingOpportunityId === opportunity.id ? (
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
                              {OPPORTUNITY_STAGE_OPTIONS.map(
                                (stage) => (
                                  <option key={stage} value={stage}>
                                    {stage}
                                  </option>
                                ),
                              )}
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
                              Opportunity status
                            </label>
                            <select
                              value={opportunityEditData.opportunityStatus || "Active"}
                              onChange={(e) =>
                                setOpportunityEditData((prev) => ({
                                  ...prev,
                                  opportunityStatus: e.target.value,
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
                              {["Active", "Closed – Gift Secured", "Closed – Declined"].map((status) => (
                                <option key={status} value={status}>
                                  {status}
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
                        {opportunityEditData.opportunityStatus === "Closed – Gift Secured" ? (
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
                                Closed amount
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
                                Close date
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
                        {opportunityEditData.opportunityStatus === "Closed – Declined" ? (
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
                              cursor: updateOpportunityMutation.isPending ? "not-allowed" : "pointer",
                            }}
                          >
                            {updateOpportunityMutation.isPending ? "Saving..." : "Save Opportunity"}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingOpportunityId(null);
                              setOpportunityEditData({});
                              setOpportunityEditError("");
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
                    ) : (
                      <>
                        {opportunity.latest_notes ? (
                          <p
                            style={{
                              fontSize: "13px",
                              color: "#374151",
                              lineHeight: 1.5,
                              margin: "0 0 6px 0",
                            }}
                          >
                            {opportunity.latest_notes}
                          </p>
                        ) : null}
                        {opportunity.opportunity_status === "Closed – Gift Secured" &&
                        (opportunity.closed_amount != null || opportunity.close_date) ? (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#166534",
                              marginBottom: "6px",
                              lineHeight: 1.5,
                            }}
                          >
                            {opportunity.closed_amount != null
                              ? `Closed amount ${formatCurrency(opportunity.closed_amount)}`
                              : null}
                            {opportunity.closed_amount != null && opportunity.close_date ? " · " : ""}
                            {opportunity.close_date
                              ? `Closed ${new Date(opportunity.close_date).toLocaleDateString("en-US", {
                                  month: "long",
                                  day: "numeric",
                                  year: "numeric",
                                })}`
                              : null}
                          </div>
                        ) : null}
                        {opportunity.opportunity_status === "Closed – Declined" &&
                        (opportunity.decline_reason || opportunity.close_date) ? (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#991B1B",
                              marginBottom: "6px",
                              lineHeight: 1.5,
                            }}
                          >
                            {opportunity.decline_reason || "Opportunity declined"}
                            {opportunity.close_date
                              ? ` · Closed ${new Date(opportunity.close_date).toLocaleDateString("en-US", {
                                  month: "long",
                                  day: "numeric",
                                  year: "numeric",
                                })}`
                              : ""}
                          </div>
                        ) : null}
                        {(opportunity.ask_date || opportunity.expected_date) ? (
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#6B7280",
                              marginBottom: "6px",
                              lineHeight: 1.5,
                            }}
                          >
                            {opportunity.ask_date
                              ? `Ask date ${formatLongDate(opportunity.ask_date)}`
                              : null}
                            {opportunity.ask_date && opportunity.expected_date ? " · " : ""}
                            {opportunity.expected_date
                              ? `Expected ${formatLongDate(opportunity.expected_date)}`
                              : null}
                          </div>
                        ) : null}
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: "12px",
                            flexWrap: "wrap",
                          }}
                        >
                          <div style={{ fontSize: "12px", color: "#6B7280" }}>
                            Last updated{" "}
                            {new Date(opportunity.updated_at).toLocaleDateString("en-US", {
                              month: "long",
                              day: "numeric",
                              year: "numeric",
                            })}
                            {opportunity.close_date
                              ? ` · Closed ${new Date(opportunity.close_date).toLocaleDateString("en-US", {
                                  month: "long",
                                  day: "numeric",
                                  year: "numeric",
                                })}`
                              : ""}
                          </div>
                          <button
                            type="button"
                            onClick={() => startEditingOpportunity(opportunity)}
                            style={{
                              padding: "7px 12px",
                              borderRadius: "999px",
                              border: "1px solid #93C5FD",
                              backgroundColor: "white",
                              color: "#1D4ED8",
                              fontSize: "12px",
                              fontWeight: "700",
                              cursor: "pointer",
                            }}
                          >
                            Edit Opportunity
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
          </div>

          <div style={workspaceCardStyle}>
            <h3
              style={{
                fontSize: "16px",
                fontWeight: "700",
                color: "#111827",
                margin: "0 0 12px 0",
              }}
            >
              Recent Actions & Activity
            </h3>
            {timelineEvents.length === 0 ? (
              <p
                style={{
                  fontSize: "14px",
                  color: "#9CA3AF",
                  fontStyle: "italic",
                }}
              >
                No activity yet for this prospect.
              </p>
            ) : (
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                {timelineEvents.map((event) => (
                  <div
                    key={event.id}
                    style={{
                      padding: "12px",
                      backgroundColor: event.background,
                      borderRadius: "8px",
                      border: `1px solid ${event.border}`,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        alignItems: "flex-start",
                        marginBottom: "4px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: "220px" }}>
                        <p
                          style={{
                            fontSize: "13px",
                            fontWeight: "700",
                            color: event.accent,
                            margin: "0 0 2px 0",
                          }}
                        >
                          {event.title}
                        </p>
                        <p
                          style={{
                            fontSize: "12px",
                            fontWeight: "600",
                            color: "#6B7280",
                            margin: 0,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {formatLongDate(event.occurredAt)}
                        </p>
                      </div>
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "8px",
                          flexWrap: "wrap",
                        }}
                      >
                        {event.kind === "progress" ? (
                          <button
                            type="button"
                            onClick={() => startEditingTimelineUpdate(event)}
                            style={{
                              padding: "6px 10px",
                              borderRadius: "999px",
                              border: "1px solid #C4B5FD",
                              backgroundColor: "white",
                              color: "#5B21B6",
                              fontSize: "12px",
                              fontWeight: "700",
                              cursor: "pointer",
                            }}
                          >
                            Edit
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedTimelineId((current) =>
                              current === event.id ? null : event.id,
                            )
                          }
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "6px 10px",
                            borderRadius: "999px",
                            border: `1px solid ${event.border}`,
                            backgroundColor: "white",
                            color: event.accent,
                            fontSize: "12px",
                            fontWeight: "700",
                            cursor: "pointer",
                          }}
                        >
                          {expandedTimelineId === event.id ? "Hide details" : "See details"}
                          {expandedTimelineId === event.id ? (
                            <ChevronUp size={14} />
                          ) : (
                            <ChevronDown size={14} />
                          )}
                        </button>
                      </div>
                    </div>
                    <p
                      style={{
                        fontSize: "14px",
                        color: "#374151",
                        margin: "0 0 4px 0",
                        lineHeight: "1.5",
                      }}
                    >
                      {event.description}
                    </p>
                    {event.reviewerNotes ? (
                      <p
                        style={{
                          fontSize: "13px",
                          color: "#6B7280",
                          margin: "0 0 4px 0",
                          lineHeight: "1.5",
                        }}
                      >
                        Reviewer note: {event.reviewerNotes}
                      </p>
                    ) : null}
                    <p
                      style={{
                        fontSize: "12px",
                        color: "#6B7280",
                        margin: 0,
                        lineHeight: "1.5",
                      }}
                    >
                      {event.meta}
                    </p>
                    {expandedTimelineId === event.id ? (
                      <div
                        style={{
                          marginTop: "12px",
                          paddingTop: "12px",
                          borderTop: `1px solid ${event.border}`,
                        }}
                      >
                        {event.kind === "progress" &&
                        editingUpdateId === event.raw?.id ? (
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
                                {updateTimelineEntryMutation.isPending
                                  ? "Saving..."
                                  : "Save update"}
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
                        ) : (
                          <div
                            style={{
                              display: "grid",
                              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
                              gap: "12px",
                            }}
                          >
                            {event.kind === "progress" ? (
                              <>
                                <div>
                                  <p style={detailLabelStyle}>Recorded update</p>
                                  <p
                                    style={{
                                      fontSize: "14px",
                                      color: "#374151",
                                      margin: 0,
                                      whiteSpace: "pre-line",
                                      lineHeight: 1.6,
                                    }}
                                  >
                                    {event.raw?.update_notes || "No details recorded."}
                                  </p>
                                </div>
                                <div>
                                  <p style={detailLabelStyle}>Source</p>
                                  <p style={{ fontSize: "14px", color: "#374151", margin: 0 }}>
                                    Saved in the app
                                  </p>
                                </div>
                              </>
                            ) : null}
                            {event.kind === "opportunity" ? (
                              <>
                                <div>
                                  <p style={detailLabelStyle}>Status</p>
                                  <p style={{ fontSize: "14px", color: "#374151", margin: 0 }}>
                                    {event.raw?.current_stage || "Unavailable"} ·{" "}
                                    {event.raw?.opportunity_status || "Active"}
                                  </p>
                                </div>
                                <div>
                                  <p style={detailLabelStyle}>Ask amount</p>
                                  <p style={{ fontSize: "14px", color: "#374151", margin: 0 }}>
                                    {formatCurrency(getOpportunityDisplayAmount(event.raw))}
                                  </p>
                                </div>
                                <div>
                                  <p style={detailLabelStyle}>Ask timing</p>
                                  <p style={{ fontSize: "14px", color: "#374151", margin: 0 }}>
                                    {event.raw?.ask_date
                                      ? `Ask ${formatLongDate(event.raw.ask_date)}`
                                      : "No ask date"}
                                    {event.raw?.expected_date
                                      ? ` · Expected ${formatLongDate(event.raw.expected_date)}`
                                      : ""}
                                  </p>
                                </div>
                                <div style={{ gridColumn: "1 / -1" }}>
                                  <p style={detailLabelStyle}>Opportunity notes</p>
                                  <p
                                    style={{
                                      fontSize: "14px",
                                      color: "#374151",
                                      margin: 0,
                                      whiteSpace: "pre-line",
                                      lineHeight: 1.6,
                                    }}
                                  >
                                    {event.raw?.latest_notes || "No opportunity notes recorded."}
                                  </p>
                                </div>
                              </>
                            ) : null}
                            {event.kind === "submission" ? (
                              <>
                                <div>
                                  <p style={detailLabelStyle}>Submission status</p>
                                  <p style={{ fontSize: "14px", color: "#374151", margin: 0 }}>
                                    {event.raw?.status || "Unknown"}
                                  </p>
                                </div>
                                <div>
                                  <p style={detailLabelStyle}>Submitted</p>
                                  <p style={{ fontSize: "14px", color: "#374151", margin: 0 }}>
                                    {formatLongDate(
                                      event.raw?.date_submitted ||
                                        event.raw?.updated_at ||
                                        event.raw?.reviewed_at,
                                    )}
                                  </p>
                                </div>
                                <div style={{ gridColumn: "1 / -1" }}>
                                  <p style={detailLabelStyle}>Submission details</p>
                                  <p
                                    style={{
                                      fontSize: "14px",
                                      color: "#374151",
                                      margin: 0,
                                      whiteSpace: "pre-line",
                                      lineHeight: 1.6,
                                    }}
                                  >
                                    {getSubmissionTimelineDescription(event.raw) ||
                                      "No additional submission details."}
                                  </p>
                                </div>
                                {event.raw?.reviewer_notes ? (
                                  <div style={{ gridColumn: "1 / -1" }}>
                                    <p style={detailLabelStyle}>Reviewer notes</p>
                                    <p
                                      style={{
                                        fontSize: "14px",
                                        color: "#374151",
                                        margin: 0,
                                        whiteSpace: "pre-line",
                                        lineHeight: 1.6,
                                      }}
                                    >
                                      {event.raw.reviewer_notes}
                                    </p>
                                  </div>
                                ) : null}
                              </>
                            ) : null}
                          </div>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function MyTopProspectsPage() {
  const { data: user, loading } = useUser();
  const queryClient = useQueryClient();
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedProspectId, setSelectedProspectId] = useState(null);
  const [selectedProspectPanel, setSelectedProspectPanel] = useState("");
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState("top-prospects");
  const [statusFilter, setStatusFilter] = useState("all");
  const [fyFilter, setFyFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [addProspectInitialData, setAddProspectInitialData] = useState(null);

  const { data: prospects = [], isLoading } = useQuery({
    queryKey: ["prospects"],
    queryFn: async () => {
      const res = await fetch("/api/prospects");
      if (!res.ok) throw new Error("Failed to fetch prospects");
      return res.json();
    },
    enabled: !!user,
  });

  const { data: summary } = useQuery({
    queryKey: ["prospect-summary"],
    queryFn: async () => {
      const res = await fetch("/api/prospects/summary");
      if (!res.ok) throw new Error("Failed to fetch summary");
      return res.json();
    },
    enabled: !!user,
  });

  const { data: profileStatus } = useQuery({
    queryKey: ["profile-sync-status"],
    queryFn: async () => {
      const res = await fetch("/api/users/profile");
      if (!res.ok) throw new Error("Failed to fetch profile");
      const data = await res.json();
      return data;
    },
    enabled: !!user,
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
    ],
    queryFn: async () => {
      const res = await fetch("/api/blackbaud/portfolio");
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to fetch Blackbaud portfolio");
      }
      return data;
    },
    enabled: !!user && !!profileStatus?.workspaceUser?.blackbaud_constituent_id,
  });

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
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    }
  };

  const addMutation = useMutation({
    mutationFn: async (body) => {
      const res = await fetch("/api/prospects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to add prospect");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary"] });
      setShowAddModal(false);
      setAddProspectInitialData(null);
    },
  });

  const reorderMutation = useMutation({
    mutationFn: async (body) => {
      const res = await fetch("/api/prospects/reorder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to reorder");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
    },
  });

  const syncMutation = useMutation({
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary"] });
      queryClient.invalidateQueries({ queryKey: ["blackbaud-portfolio"] });
    },
  });

  const stopViewingMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/workspace-user", {
        method: "DELETE",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to return to admin view");
      }
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["prospects"] });
      queryClient.invalidateQueries({ queryKey: ["prospect-summary"] });
      window.location.href = "/access-management";
    },
  });

  const openPortfolioAddModal = (person) => {
    setAddProspectInitialData({
      prospectName: person.name || "",
      expectedCloseFY: "FY26",
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
  const closedSecured = prospects.filter(
    (p) => p.status === "Closed – Gift Secured",
  );
  const closedDeclined = prospects.filter(
    (p) => p.status === "Closed – Declined",
  );
  const archivedProspects = prospects.filter((p) => p.status === "Archived");
  const normalizedSearch = searchTerm.trim().toLowerCase();
  const filteredActiveProspects = activeProspects.filter((prospect) => {
    const nextAction = getProspectNextAction(prospect);
    const matchesSearch =
      !normalizedSearch ||
      prospect.prospect_name?.toLowerCase().includes(normalizedSearch) ||
      prospect.ask_type?.toLowerCase().includes(normalizedSearch) ||
      prospect.next_action_text?.toLowerCase().includes(normalizedSearch);

    const matchesStatus =
      statusFilter === "all" || prospect.status === statusFilter;
    const matchesFY =
      fyFilter === "all" || prospect.expected_close_fy === fyFilter;
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
            maxWidth: "1000px",
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
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: "36px",
                  height: "36px",
                  borderRadius: "8px",
                  backgroundColor: "#F3F4F6",
                  border: "1px solid #E5E7EB",
                  textDecoration: "none",
                }}
              >
                <ArrowLeft size={18} color="#374151" />
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
                    Viewing as {profileStatus.actingAsUser.name}
                  </div>
                ) : null}
              </div>
            </div>
            {activeWorkspaceTab === "top-prospects" ? (
              <button
                onClick={() => setShowAddModal(true)}
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
                }}
              >
                <Plus size={16} />
                Add Prospect
              </button>
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
                You are editing <strong>{profileStatus.actingAsUser.name}'s</strong> MGO workspace and portfolio.
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
                {stopViewingMutation.isPending ? "Returning..." : "Return to admin view"}
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "24px" }}>
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

        {activeWorkspaceTab === "portfolio" && profileStatus?.workspaceUser?.blackbaud_lookup_id ? (
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "12px",
              border: "1px solid #E5E7EB",
              padding: "14px 18px",
              marginBottom: "16px",
              display: "flex",
              justifyContent: "space-between",
              gap: "16px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div style={{ display: "grid", gap: "6px", flex: 1, minWidth: "260px" }}>
              <div style={{ fontSize: "14px", fontWeight: "700", color: "#111827" }}>
                NXT sync
              </div>
              <div style={{ fontSize: "13px", color: "#6B7280", lineHeight: 1.5 }}>
                {profileStatus.workspaceUser.blackbaud_portfolio_seeded_at
                  ? `Auto-sync is on. Last refreshed ${formatLongDate(
                      profileStatus.workspaceUser.blackbaud_portfolio_seeded_at,
                    )}.`
                  : "Auto-sync is on. Your portfolio has not been refreshed yet."}
              </div>
              {profileStatus.workspaceUser.blackbaud_portfolio_seed_error ? (
                <div style={{ fontSize: "12px", color: "#B91C1C" }}>
                  Last error: {profileStatus.workspaceUser.blackbaud_portfolio_seed_error}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => syncMutation.mutate()}
              disabled={syncMutation.isPending}
              style={{
                padding: "10px 16px",
                backgroundColor: syncMutation.isPending ? "#C7D2FE" : "#6A5BFF",
                color: "white",
                border: "none",
                borderRadius: "8px",
                fontSize: "14px",
                fontWeight: "700",
                cursor: syncMutation.isPending ? "not-allowed" : "pointer",
              }}
            >
              {syncMutation.isPending ? "Syncing..." : "Sync from Blackbaud opportunities"}
            </button>
          </div>
        ) : null}

        {activeWorkspaceTab === "portfolio" && profileStatus?.workspaceUser?.blackbaud_lookup_id ? (
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
                  Current NXT fundraiser assignments
                </div>
                <div style={{ marginTop: "4px", fontSize: "13px", color: "#6B7280", lineHeight: 1.5 }}>
                  Pulled from Raiser's Edge NXT by your fundraiser assignment role. Lead
                  Solicitor appears first, followed by Secondary and Athletics Solicitor assignments.
                </div>
              </div>
              {blackbaudPortfolio?.summary ? (
                <div style={{ fontSize: "13px", color: "#4B5563", fontWeight: "600" }}>
                  {blackbaudPortfolio.summary.leadCount + blackbaudPortfolio.summary.supportingCount} assigned constituents
                </div>
              ) : null}
            </div>

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
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                  gap: "14px",
                }}
              >
                <PortfolioTier
                  title="Lead Solicitor"
                  description="Your primary portfolio assignments in NXT."
                  items={blackbaudPortfolio?.leadSolicitor || []}
                  accent={{ background: "#EEF2FF", text: "#4338CA" }}
                  onAddToTopProspects={openPortfolioAddModal}
                  isAdding={addMutation.isPending}
                />
                <PortfolioTier
                  title="Secondary / Athletics Solicitor"
                  description="Supporting assignments where you still need visibility and follow-up."
                  items={blackbaudPortfolio?.supportingSolicitor || []}
                  accent={{ background: "#ECFDF5", text: "#065F46" }}
                  onAddToTopProspects={openPortfolioAddModal}
                  isAdding={addMutation.isPending}
                />
              </div>
            )}
          </div>
        ) : null}

        {activeWorkspaceTab === "portfolio" && !profileStatus?.workspaceUser?.blackbaud_lookup_id ? (
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
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "12px",
            border: "1px solid #E5E7EB",
            padding: "16px 18px",
            marginBottom: "20px",
            display: "flex",
            justifyContent: "space-between",
            gap: "12px",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ minWidth: "240px", flex: "1 1 320px" }}>
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
              Work this list
            </div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#111827" }}>
              Start with the top-ranked prospect that needs follow-up.
            </div>
            <div style={{ marginTop: "4px", fontSize: "13px", color: "#6B7280", lineHeight: 1.5 }}>
              Use Add Prospect for manual adds, log progress when activity happens, and sync only
              when you need fresh opportunity data.
            </div>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              style={{
                padding: "10px 14px",
                borderRadius: "10px",
                border: "none",
                backgroundColor: "#6A5BFF",
                color: "white",
                fontSize: "14px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Add prospect
            </button>
            <a
              href="/action-opportunity-update"
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid #D1D5DB",
                backgroundColor: "white",
                color: "#374151",
                fontSize: "14px",
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Log progress update
            </a>
          </div>
        </div>

        {/* Summary Stats */}
        {summary && (
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
                {summary.activeCount}
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
                {formatCurrency(summary.totalAskPipeline)}
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
                <Trophy size={18} color="#F59E0B" />
                <span
                  style={{
                    fontSize: "13px",
                    color: "#6B7280",
                    fontWeight: "500",
                  }}
                >
                  Closed {summary.currentFY}
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
                {formatCurrency(summary.closedThisFY)}
              </p>
            </div>
          </div>
        )}

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
                Refine the ranked list by prospect, status, fiscal year, or next-action state.
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
              <option value="all">All fiscal years</option>
              {FY_OPTIONS.map((fy) => (
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
            {filteredActiveProspects.map((p, idx) => (
              (() => {
                const nextAction = getProspectNextAction(p);
                const nextStepBadge = getNextStepBadge(p);
                const discussionBadge = getDiscussionBadge(p);

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
                      {idx + 1}
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
                                if (typeof window !== "undefined") {
                                  const url = new URL(window.location.href);
                                  url.searchParams.set("prospectId", String(p.id));
                                  url.searchParams.set("panel", "action");
                                  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
                                }
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
                              Log Action
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedProspectId(p.id);
                                if (typeof window !== "undefined") {
                                  const url = new URL(window.location.href);
                                  url.searchParams.set("prospectId", String(p.id));
                                  url.searchParams.set("panel", "next-step");
                                  window.history.replaceState({}, "", `${url.pathname}${url.search}`);
                                }
                              }}
                              style={{
                                padding: "9px 12px",
                                borderRadius: "999px",
                                border: "1px solid #FED7AA",
                                backgroundColor: "#FFF7ED",
                                color: "#C2410C",
                                fontSize: "12px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              Set Next Step
                            </button>
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedProspectId(p.id);
                              }}
                              style={{
                                padding: "9px 12px",
                                borderRadius: "999px",
                                border: "1px solid #D1D5DB",
                                backgroundColor: "white",
                                color: "#374151",
                                fontSize: "12px",
                                fontWeight: 700,
                                cursor: "pointer",
                              }}
                            >
                              View Prospect
                            </button>
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
                              {p.expected_close_fy}
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
                            <span
                              style={{
                                fontSize: "12px",
                                color: "#6B7280",
                              }}
                            >
                              {formatRelativeDays(p.latest_activity_at)}
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

                    <div
                      style={{
                        display: "flex",
                        flexDirection: "row",
                        gap: "6px",
                        flexShrink: 0,
                        alignItems: "center",
                        alignSelf: "flex-start",
                      }}
                      onClick={(e) => e.stopPropagation()}
                      aria-label={`Reorder ${p.prospect_name}`}
                    >
                      <div
                        style={{
                          fontSize: "10px",
                          color: "#6B7280",
                          fontWeight: "700",
                          textTransform: "uppercase",
                          letterSpacing: "0.04em",
                          lineHeight: 1.2,
                          marginRight: "2px",
                        }}
                      >
                        Rank
                      </div>
                      <button
                        onClick={() =>
                          reorderMutation.mutate({
                            prospectId: p.id,
                            direction: "up",
                          })
                        }
                        disabled={idx === 0}
                        title="Promote prospect"
                        style={{
                          width: "30px",
                          height: "30px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "1px solid #E5E7EB",
                          borderRadius: "6px",
                          backgroundColor: idx === 0 ? "#F9FAFB" : "white",
                          cursor: idx === 0 ? "default" : "pointer",
                          opacity: idx === 0 ? 0.3 : 1,
                        }}
                      >
                        <ChevronUp size={14} color="#374151" />
                      </button>
                      <button
                        onClick={() =>
                          reorderMutation.mutate({
                            prospectId: p.id,
                            direction: "down",
                          })
                        }
                        disabled={idx === filteredActiveProspects.length - 1}
                        title="Demote prospect"
                        style={{
                          width: "30px",
                          height: "30px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "1px solid #E5E7EB",
                          borderRadius: "6px",
                          backgroundColor:
                            idx === filteredActiveProspects.length - 1 ? "#F9FAFB" : "white",
                          cursor:
                            idx === filteredActiveProspects.length - 1 ? "default" : "pointer",
                          opacity: idx === filteredActiveProspects.length - 1 ? 0.3 : 1,
                        }}
                      >
                        <ChevronDown size={14} color="#374151" />
                      </button>
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
                        <span style={{ fontWeight: "600", color: "#059669" }}>
                          {formatCurrency(p.closed_amount)}
                        </span>
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
          }}
          onSubmit={(data) => addMutation.mutate(data)}
          isPending={addMutation.isPending}
          initialData={addProspectInitialData}
        />
      )}

      {selectedProspectId && (
        <ProspectDetailModal
          prospectId={selectedProspectId}
          initialPanel={selectedProspectPanel}
          onClose={closeProspectWorkspace}
        />
      )}
    </div>
  );
}
