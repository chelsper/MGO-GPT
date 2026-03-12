"use client";

import { useState } from "react";
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
} from "lucide-react";

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

const STATUS_COLORS = {
  Active: { bg: "#D1FAE5", text: "#065F46", border: "#A7F3D0" },
  "Closed – Gift Secured": {
    bg: "#DBEAFE",
    text: "#1E40AF",
    border: "#BFDBFE",
  },
  "Closed – Declined": { bg: "#FEE2E2", text: "#991B1B", border: "#FECACA" },
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

function getProspectNextAction(prospect) {
  if (prospect.latest_submission_status === "Needs Clarification") {
    return {
      label: "Respond to clarification",
      tone: { bg: "#FEF3C7", fg: "#92400E", border: "#FCD34D" },
    };
  }

  if ((prospect.active_opportunity_count || 0) === 0) {
    return {
      label: "Add first opportunity",
      tone: { bg: "#EDE9FE", fg: "#5B21B6", border: "#DDD6FE" },
    };
  }

  if (!prospect.latest_activity_at) {
    return {
      label: "Log first update",
      tone: { bg: "#DBEAFE", fg: "#1D4ED8", border: "#BFDBFE" },
    };
  }

  const latestActivityAt = new Date(prospect.latest_activity_at);
  const staleDays = (Date.now() - latestActivityAt.getTime()) / (1000 * 60 * 60 * 24);
  if (staleDays >= 30) {
    return {
      label: "Needs follow-up",
      tone: { bg: "#FEE2E2", fg: "#991B1B", border: "#FECACA" },
    };
  }

  return {
    label: "Keep momentum",
    tone: { bg: "#DCFCE7", fg: "#166534", border: "#BBF7D0" },
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

function AddProspectModal({ onClose, onSubmit, isPending }) {
  const [name, setName] = useState("");
  const [fy, setFy] = useState("FY26");
  const [amount, setAmount] = useState("");
  const [askType, setAskType] = useState("Major Gift");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onSubmit({
      prospectName: name.trim(),
      expectedCloseFY: fy,
      askAmount: amount ? parseFloat(amount) : null,
      askType,
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
              onChange={(e) => setName(e.target.value)}
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

function ProspectDetailModal({ prospectId, onClose }) {
  const queryClient = useQueryClient();
  const [showUpdateForm, setShowUpdateForm] = useState(false);
  const [updateNotes, setUpdateNotes] = useState("");
  const [updateDate, setUpdateDate] = useState(
    new Date().toISOString().split("T")[0],
  );
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editData, setEditData] = useState({});
  const [editingOpportunityId, setEditingOpportunityId] = useState(null);
  const [opportunityEditData, setOpportunityEditData] = useState({});
  const [opportunityEditError, setOpportunityEditError] = useState("");

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

  const addUpdateMutation = useMutation({
    mutationFn: async (body) => {
      const res = await fetch(`/api/prospects/${prospectId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error("Failed to add update");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["prospect", prospectId] });
      setUpdateNotes("");
      setUpdateDate(new Date().toISOString().split("T")[0]);
      setShowUpdateForm(false);
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

  const prospect = data?.prospect;
  const updates = data?.updates || [];
  const opportunities = data?.opportunities || [];
  const linkedSubmissions = data?.linkedSubmissions || [];

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
        latestNotes: opportunityEditData.latestNotes,
        closedAmount: opportunityEditData.closedAmount
          ? parseFloat(opportunityEditData.closedAmount)
          : null,
        closeDate: opportunityEditData.closeDate || null,
        declineReason: opportunityEditData.declineReason,
      },
    });
  };

  const isActive = prospect.status === "Active";
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
    })),
  ]
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

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
          maxWidth: "580px",
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
          {/* Details */}
          {editMode ? (
            <div style={{ marginBottom: "24px" }}>
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
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "16px",
                marginBottom: "24px",
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
                  Expected Close FY
                </p>
                <p
                  style={{
                    fontSize: "15px",
                    fontWeight: "600",
                    color: "#111827",
                    margin: 0,
                  }}
                >
                  {prospect.expected_close_fy}
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
                  Ask Amount
                </p>
                <p
                  style={{
                    fontSize: "15px",
                    fontWeight: "600",
                    color: "#111827",
                    margin: 0,
                  }}
                >
                  {formatCurrency(prospect.ask_amount)}
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
                  Ask Type
                </p>
                <p
                  style={{
                    fontSize: "15px",
                    fontWeight: "600",
                    color: "#111827",
                    margin: 0,
                  }}
                >
                  {prospect.ask_type}
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
                  Status
                </p>
                <StatusBadge status={prospect.status} />
              </div>
              {prospect.closed_amount != null && (
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
                    Closed Amount
                  </p>
                  <p
                    style={{
                      fontSize: "15px",
                      fontWeight: "600",
                      color: "#059669",
                      margin: 0,
                    }}
                  >
                    {formatCurrency(prospect.closed_amount)}
                  </p>
                </div>
              )}
              {prospect.close_date && (
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
                    Close Date
                  </p>
                  <p
                    style={{
                      fontSize: "15px",
                      fontWeight: "600",
                      color: "#111827",
                      margin: 0,
                    }}
                  >
                    {new Date(prospect.close_date).toLocaleDateString()}
                  </p>
                </div>
              )}
              {prospect.decline_reason && (
                <div style={{ gridColumn: "1 / -1" }}>
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
                    Decline Reason
                  </p>
                  <p style={{ fontSize: "14px", color: "#374151", margin: 0 }}>
                    {prospect.decline_reason}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          {!editMode && (
            <div
              style={{
                display: "flex",
                gap: "8px",
                marginBottom: "24px",
                flexWrap: "wrap",
              }}
            >
              <button
                onClick={() => setEditMode(true)}
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
                Edit Prospect
              </button>
              <button
                onClick={() => setShowUpdateForm(true)}
                style={{
                  padding: "8px 16px",
                  backgroundColor: "#EDE9FE",
                  color: "#6A5BFF",
                  border: "1px solid #C4B5FD",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Add Progress Update
              </button>
              {isActive && (
                <button
                  onClick={() => setShowCloseModal(true)}
                  style={{
                    padding: "8px 16px",
                    backgroundColor: "#FEF3C7",
                    color: "#92400E",
                    border: "1px solid #FDE68A",
                    borderRadius: "8px",
                    fontSize: "13px",
                    fontWeight: "600",
                    cursor: "pointer",
                  }}
                >
                  Mark Closed
                </button>
              )}
            </div>
          )}

          {/* Add Update Form */}
          {showUpdateForm && (
            <div
              style={{
                backgroundColor: "#F9FAFB",
                borderRadius: "12px",
                padding: "16px",
                marginBottom: "20px",
                border: "1px solid #E5E7EB",
              }}
            >
              <h4
                style={{
                  fontSize: "14px",
                  fontWeight: "600",
                  color: "#374151",
                  margin: "0 0 12px 0",
                }}
              >
                New Progress Update
              </h4>
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
                  value={updateDate}
                  onChange={(e) => setUpdateDate(e.target.value)}
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
                  value={updateNotes}
                  onChange={(e) => setUpdateNotes(e.target.value)}
                  placeholder="What happened? e.g. Meeting completed, proposal delivered..."
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
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={() =>
                    addUpdateMutation.mutate({ updateDate, updateNotes })
                  }
                  disabled={addUpdateMutation.isPending || !updateNotes.trim()}
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
                  {addUpdateMutation.isPending ? "Saving..." : "Save Update"}
                </button>
                <button
                  onClick={() => setShowUpdateForm(false)}
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

          {/* Progress Log */}
          <div style={{ marginBottom: "24px" }}>
            <h3
              style={{
                fontSize: "15px",
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
                              Stage
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
                              {["Identification", "Qualification", "Cultivation", "Solicitation", "Stewardship"].map(
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

          <div>
            <h3
              style={{
                fontSize: "15px",
                fontWeight: "700",
                color: "#111827",
                margin: "0 0 12px 0",
              }}
            >
              Activity Timeline
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
                      }}
                    >
                      <p
                        style={{
                          fontSize: "13px",
                          fontWeight: "700",
                          color: event.accent,
                          margin: 0,
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
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
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
            <h1
              style={{
                fontSize: "18px",
                fontWeight: "700",
                color: "#111827",
                margin: 0,
              }}
            >
              My Top Prospects
            </h1>
          </div>
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
        </div>
      </header>

      <main style={{ maxWidth: "1000px", margin: "0 auto", padding: "24px" }}>
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

        {/* Active Prospects */}
        <h2
          style={{
            fontSize: "16px",
            fontWeight: "700",
            color: "#111827",
            margin: "0 0 12px 0",
          }}
        >
          Active Prospects ({activeProspects.length})
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
        ) : activeProspects.length === 0 ? (
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
              No prospects yet
            </p>
            <p style={{ fontSize: "13px", color: "#9CA3AF", margin: 0 }}>
              Click "Add Prospect" to start building your pipeline.
            </p>
          </div>
        ) : (
          <div style={{ marginBottom: "32px" }}>
            {/* Table header (desktop only) */}
            <div
              className="hidden md:flex"
              style={{
                display: "none",
                padding: "8px 20px",
                fontSize: "12px",
                fontWeight: "600",
                color: "#6B7280",
                textTransform: "uppercase",
                letterSpacing: "0.5px",
              }}
            >
              <span style={{ width: "50px" }}>#</span>
              <span style={{ flex: 2 }}>Prospect</span>
              <span style={{ flex: 1 }}>FY</span>
              <span style={{ flex: 1 }}>Ask Amount</span>
              <span style={{ flex: 1 }}>Ask Type</span>
              <span style={{ width: "80px" }}>Priority</span>
            </div>

            {activeProspects.map((p, idx) => (
              (() => {
                const nextAction = getProspectNextAction(p);

                return (
                  <div
                    key={p.id}
                    style={{
                      backgroundColor: "white",
                      borderRadius: "16px",
                      border: "1px solid #E5E7EB",
                      padding: "18px 20px",
                      marginBottom: "10px",
                      display: "flex",
                      alignItems: "flex-start",
                      gap: "14px",
                      cursor: "pointer",
                    }}
                    onClick={() => setSelectedProspectId(p.id)}
                  >
                    <span
                      style={{
                        fontSize: "16px",
                        fontWeight: "700",
                        color: "#6A5BFF",
                        width: "28px",
                        flexShrink: 0,
                        textAlign: "center",
                        paddingTop: "4px",
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
                              marginBottom: "6px",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "16px",
                                fontWeight: "700",
                                color: "#111827",
                              }}
                            >
                              {p.prospect_name}
                            </span>
                            <StatusBadge status={p.status} />
                            <span
                              style={{
                                backgroundColor: nextAction.tone.bg,
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
                            <span>·</span>
                            <span>{formatRelativeDays(p.latest_activity_at)}</span>
                          </div>
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(2, minmax(110px, 1fr))",
                            gap: "10px 14px",
                            minWidth: "240px",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                color: "#6B7280",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                marginBottom: "4px",
                              }}
                            >
                              Open Pipeline
                            </div>
                            <div style={{ fontSize: "15px", fontWeight: 700, color: "#111827" }}>
                              {formatCurrency(p.ask_amount)}
                            </div>
                          </div>
                          <div>
                            <div
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                color: "#6B7280",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                marginBottom: "4px",
                              }}
                            >
                              Closed So Far
                            </div>
                            <div style={{ fontSize: "15px", fontWeight: 700, color: "#059669" }}>
                              {formatCurrency(p.closed_amount)}
                            </div>
                          </div>
                          <div>
                            <div
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                color: "#6B7280",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                marginBottom: "4px",
                              }}
                            >
                              Opportunities
                            </div>
                            <div style={{ fontSize: "15px", fontWeight: 700, color: "#111827" }}>
                              {p.active_opportunity_count || 0} active / {p.linked_opportunity_count || 0} total
                            </div>
                          </div>
                          <div>
                            <div
                              style={{
                                fontSize: "11px",
                                fontWeight: 700,
                                color: "#6B7280",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                marginBottom: "4px",
                              }}
                            >
                              Latest Review
                            </div>
                            <div style={{ fontSize: "14px", fontWeight: 700, color: "#111827" }}>
                              {p.latest_submission_status || "No review yet"}
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
                            fontSize: "13px",
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
                        flexDirection: "column",
                        gap: "2px",
                        flexShrink: 0,
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        onClick={() =>
                          reorderMutation.mutate({
                            prospectId: p.id,
                            direction: "up",
                          })
                        }
                        disabled={idx === 0}
                        style={{
                          width: "28px",
                          height: "28px",
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
                        disabled={idx === activeProspects.length - 1}
                        style={{
                          width: "28px",
                          height: "28px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "1px solid #E5E7EB",
                          borderRadius: "6px",
                          backgroundColor:
                            idx === activeProspects.length - 1 ? "#F9FAFB" : "white",
                          cursor:
                            idx === activeProspects.length - 1 ? "default" : "pointer",
                          opacity: idx === activeProspects.length - 1 ? 0.3 : 1,
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
      </main>

      {/* Modals */}
      {showAddModal && (
        <AddProspectModal
          onClose={() => setShowAddModal(false)}
          onSubmit={(data) => addMutation.mutate(data)}
          isPending={addMutation.isPending}
        />
      )}

      {selectedProspectId && (
        <ProspectDetailModal
          prospectId={selectedProspectId}
          onClose={() => setSelectedProspectId(null)}
        />
      )}
    </div>
  );
}
