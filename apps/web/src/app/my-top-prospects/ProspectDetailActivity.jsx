import { ChevronDown, ChevronUp } from "lucide-react";
import {
  workspaceCardStyle,
  detailLabelStyle,
  formatLongDate,
  getSubmissionTimelineDescription,
} from "./prospectDetailPresentation";

export default function ProspectDetailActivity({
  timelineEvents,
  highlights,
  expandedTimelineId,
  editingUpdateId,
  readOnly,
  isDeleting,
  onToggleEvent,
  onEdit,
  onDelete,
  renderDeleteConfirmation,
  renderEditor,
}) {
  return (
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
      {highlights}
      <details open={Boolean(expandedTimelineId || editingUpdateId)}>
        <summary className="mb-3 cursor-pointer text-sm font-semibold text-gray-700">
          Activity log ({timelineEvents.length})
        </summary>
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
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
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
                    {event.kind === "progress" ||
                    event.kind === "submission" ? (
                      <>
                        {!readOnly && event.kind === "progress" ? (
                          <button
                            type="button"
                            onClick={() => onEdit(event)}
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
                        {!readOnly ? (
                          <button
                            type="button"
                            onClick={() => onDelete(event)}
                            disabled={isDeleting}
                            style={{
                              padding: "6px 10px",
                              borderRadius: "999px",
                              border: "1px solid #FECACA",
                              backgroundColor: "white",
                              color: "#B91C1C",
                              fontSize: "12px",
                              fontWeight: "700",
                              cursor: isDeleting ? "not-allowed" : "pointer",
                              opacity: isDeleting ? 0.7 : 1,
                            }}
                          >
                            Delete
                          </button>
                        ) : null}
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onToggleEvent(event.id)}
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
                      {expandedTimelineId === event.id
                        ? "Hide details"
                        : "See details"}
                      {expandedTimelineId === event.id ? (
                        <ChevronUp size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                    </button>
                  </div>
                </div>
                {renderDeleteConfirmation(event)}
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
                      renderEditor(event)
                    ) : (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(220px, 1fr))",
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
                                {event.raw?.update_notes ||
                                  "No details recorded."}
                              </p>
                            </div>
                            <div>
                              <p style={detailLabelStyle}>Source</p>
                              <p
                                style={{
                                  fontSize: "14px",
                                  color: "#374151",
                                  margin: 0,
                                }}
                              >
                                Saved in the app
                              </p>
                            </div>
                          </>
                        ) : null}
                        {event.kind === "submission" ? (
                          <>
                            <div>
                              <p style={detailLabelStyle}>Submission status</p>
                              <p
                                style={{
                                  fontSize: "14px",
                                  color: "#374151",
                                  margin: 0,
                                }}
                              >
                                {event.raw?.status || "Unknown"}
                              </p>
                            </div>
                            <div>
                              <p style={detailLabelStyle}>Submitted</p>
                              <p
                                style={{
                                  fontSize: "14px",
                                  color: "#374151",
                                  margin: 0,
                                }}
                              >
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
      </details>
    </div>
  );
}
