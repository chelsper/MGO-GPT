"use client";

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import NextStepFields from "@/components/NextStepFields";
import WorkflowNotice from "@/components/WorkflowNotice";
import useUnsavedChangesWarning from "@/utils/useUnsavedChangesWarning";

export default function PortfolioFollowUpModal({ kind, person, ownerName, onClose }) {
  const queryClient = useQueryClient();
  const isNextStep = kind === "next-step";
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  useUnsavedChangesWarning(!successMessage && Boolean(title || details || dueDate || assignedUserId));
  const saveInFlight = useRef(false);
  const dialogRef = useRef(null);
  const previousFocus = useRef(typeof document === "undefined" ? null : document.activeElement);
  useEffect(() => () => previousFocus.current?.focus?.(), []);

  const { data: teammates = [], isLoading: isLoadingTeammates } = useQuery({
    queryKey: ["portfolio-follow-up-teammates"],
    queryFn: async () => {
      const response = await fetch("/api/users/mgos");
      const payload = await response.json().catch(() => []);
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to load teammates");
      }
      return Array.isArray(payload) ? payload : [];
    },
    enabled: !isNextStep,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const requestBody = isNextStep
        ? {
            constituentId: person.constituentId,
            title: title.trim(),
            details: details.trim() || null,
            dueDate: dueDate || null,
            category: "General",
          }
        : {
            prospectId: person.prospectId || person.prospect_id || null,
            constituentId: person.constituentId,
            subject: title.trim(),
            body: details.trim() || null,
            dueDate: dueDate || null,
            assignedUserId: assignedUserId || null,
            taggedUserIds: assignedUserId ? [Number(assignedUserId)] : [],
          };
      const response = await fetch(
        isNextStep ? "/api/pending-actions" : "/api/discussion-items",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        },
      );
      const responsePayload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(responsePayload?.error || "Unable to save follow-up");
      }
      return responsePayload;
    },
    onSuccess: () => {
      saveInFlight.current = false;
      queryClient.invalidateQueries({ queryKey: ["pending-actions"] });
      queryClient.invalidateQueries({ queryKey: ["discussion-items"] });
      setSuccessMessage(
        isNextStep
          ? `Next step saved for ${person?.name || "this constituent"}.`
          : `Team discussion saved for ${person?.name || "this constituent"}.`,
      );
    },
    onError: (mutationError) => {
      saveInFlight.current = false;
      setError(
        mutationError instanceof Error
          ? mutationError.message
          : "Unable to save follow-up",
      );
    },
  });

  const handleSubmit = (event) => {
    event.preventDefault();
    if (saveInFlight.current || saveMutation.isPending) return;
    if (!title.trim()) {
      setError(isNextStep ? "Enter a next step." : "Enter a discussion subject.");
      return;
    }
    setError("");
    saveInFlight.current = true;
    saveMutation.mutate();
  };

  const requestClose = () => {
    if (saveInFlight.current || saveMutation.isPending) return;
    if (!successMessage && (title || details || dueDate || assignedUserId) &&
        !window.confirm("Discard your unsaved follow-up?")) return;
    onClose();
  };

  const fieldStyle = {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #D1D5DB",
    borderRadius: "8px",
    padding: "10px 12px",
    fontSize: "14px",
    color: "#111827",
    backgroundColor: "white",
  };

  return (
    <div
      role="presentation"
      onMouseDown={requestClose}
      onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); requestClose(); }
        if (event.key === "Tab") {
          const controls = Array.from(dialogRef.current?.querySelectorAll("button, input, select, textarea, a[href]") || [])
            .filter(element => !element.matches(":disabled") && !element.closest("[hidden]"));
          const first = controls[0], last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        }
      }}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        backgroundColor: "rgba(17, 24, 39, 0.5)",
        display: "grid",
        placeItems: "center",
        padding: "20px",
      }}
    >
      <div
        role="dialog"
        ref={dialogRef}
        aria-modal="true"
        aria-labelledby="portfolio-follow-up-title"
        onMouseDown={(event) => event.stopPropagation()}
        style={{
          width: "min(100%, 560px)",
          maxHeight: "calc(100vh - 40px)",
          overflowY: "auto",
          backgroundColor: "white",
          borderRadius: "16px",
          boxShadow: "0 24px 48px rgba(17, 24, 39, 0.24)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "16px",
            padding: "20px 22px 16px",
            borderBottom: "1px solid #E5E7EB",
          }}
        >
          <div>
            <h2
              id="portfolio-follow-up-title"
              style={{ margin: 0, fontSize: "20px", color: "#111827" }}
            >
              {isNextStep ? "Set next step" : "Add team discussion"}
            </h2>
            <div style={{ marginTop: "5px", fontSize: "14px", color: "#4B5563" }}>
              {person?.name || "This constituent"}
            </div>
          </div>
          <button
            type="button"
            onClick={requestClose}
            disabled={saveMutation.isPending}
            aria-label="Close"
            style={{
              minWidth: "44px",
              minHeight: "44px",
              border: "none",
              backgroundColor: "transparent",
              color: "#6B7280",
              cursor: saveMutation.isPending ? "not-allowed" : "pointer",
              padding: "2px",
            }}
          >
            <X size={22} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: "20px 22px 22px" }}>
          {!isNextStep ? <div
            style={{
              marginBottom: "18px",
              padding: "10px 12px",
              borderRadius: "9px",
              border: "1px solid #DBEAFE",
              backgroundColor: "#EFF6FF",
              color: "#1E40AF",
              fontSize: "13px",
              lineHeight: 1.5,
            }}
          >
            This stays in JUMGOGPT and does not write to NXT.
          </div> : null}

          {successMessage ? (
            <>
              <WorkflowNotice kind="app"><p>{successMessage}</p><p className="mt-2">No NXT action was created.</p></WorkflowNotice>
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "20px" }}>
                <button
                  type="button"
                  onClick={onClose}
                  style={{
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    backgroundColor: "#4F46E5",
                    color: "white",
                    fontSize: "14px",
                    fontWeight: "700",
                    cursor: "pointer",
                  }}
                >
                  Close
                </button>
              </div>
            </>
          ) : (
            <>
              {isNextStep ? (
                <NextStepFields title={title} details={details} dueDate={dueDate}
                  onTitleChange={setTitle} onDetailsChange={setDetails} onDueDateChange={setDueDate}
                  ownerName={ownerName} disabled={saveMutation.isPending} autoFocus />
              ) : <>
              <label style={{ display: "grid", gap: "7px", marginBottom: "16px" }}>
                <span style={{ fontSize: "14px", fontWeight: "700", color: "#374151" }}>
                  {isNextStep ? "Next step" : "Discussion subject"} *
                </span>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  style={fieldStyle}
                  autoFocus
                />
              </label>
              <label style={{ display: "grid", gap: "7px", marginBottom: "16px" }}>
                <span style={{ fontSize: "14px", fontWeight: "700", color: "#374151" }}>
                  {isNextStep ? "Details" : "Discussion notes"}
                </span>
                <textarea
                  value={details}
                  onChange={(event) => setDetails(event.target.value)}
                  rows={4}
                  style={{ ...fieldStyle, resize: "vertical", lineHeight: 1.45 }}
                />
              </label>
              <label style={{ display: "grid", gap: "7px", marginBottom: "16px" }}>
                <span style={{ fontSize: "14px", fontWeight: "700", color: "#374151" }}>
                  {isNextStep ? "Due date" : "Discuss by"}
                </span>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  style={fieldStyle}
                />
              </label>
              {!isNextStep ? (
                <label style={{ display: "grid", gap: "7px", marginBottom: "16px" }}>
                  <span style={{ fontSize: "14px", fontWeight: "700", color: "#374151" }}>
                    Share with teammate
                  </span>
                  <select
                    value={assignedUserId}
                    onChange={(event) => setAssignedUserId(event.target.value)}
                    disabled={isLoadingTeammates}
                    style={fieldStyle}
                  >
                    <option value="">
                      {isLoadingTeammates ? "Loading teammates..." : "Keep on my discussion list"}
                    </option>
                    {teammates.map((teammate) => (
                      <option key={teammate.id} value={teammate.id}>
                        {teammate.name || teammate.email}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              </>}

              {error ? (
                <div role="alert"
                  style={{
                    marginBottom: "16px",
                    padding: "10px 12px",
                    borderRadius: "8px",
                    border: "1px solid #FECACA",
                    backgroundColor: "#FEF2F2",
                    color: "#991B1B",
                    fontSize: "13px",
                  }}
                >
                  {error}
                </div>
              ) : null}

              <div style={{ display: "flex", justifyContent: "flex-end", flexWrap: "wrap", gap: "10px", marginTop: "20px" }}>
                <button
                  type="button"
                  onClick={requestClose}
                  disabled={saveMutation.isPending}
                  style={{
                    border: "1px solid #D1D5DB",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    backgroundColor: "white",
                    color: "#374151",
                    fontSize: "14px",
                    fontWeight: "700",
                    cursor: saveMutation.isPending ? "not-allowed" : "pointer",
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending || !title.trim()}
                  style={{
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 14px",
                    backgroundColor: "#4F46E5",
                    color: "white",
                    fontSize: "14px",
                    fontWeight: "700",
                    cursor: saveMutation.isPending ? "not-allowed" : "pointer",
                    opacity: saveMutation.isPending ? 0.7 : 1,
                  }}
                >
                  {saveMutation.isPending
                    ? "Saving..."
                    : isNextStep
                      ? "Save next step"
                      : "Save discussion"}
                </button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
