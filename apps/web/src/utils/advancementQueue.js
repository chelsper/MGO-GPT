export const QUEUE_CATEGORIES = [
  ["all", "All requests"], ["data", "Data updates"], ["research", "Research"],
  ["lists", "List requests"], ["reviews", "Submission reviews"],
  ["imports", "Imports"], ["exceptions", "NXT exceptions"],
];
export const QUEUE_VIEWS = [["active", "Open work"], ["waiting", "Waiting on requester"], ["history", "History"]];

const clean = (value) => String(value ?? "").trim();
const closed = ["Complete", "Completed", "Approved", "Declined"];
export const hasQueueSyncFailure = (row) => clean(row.blackbaud_sync_status).toLowerCase() === "failed" || Boolean(clean(row.blackbaud_sync_error));
export const isDirectNxtSuccess = (row) => !hasQueueSyncFailure(row) && ["synced", "success"].includes(clean(row.blackbaud_sync_status).toLowerCase());

export function getQueueGroup(source, row) {
  if (source === "imports") return [row.readyCount, row.needsReviewCount, row.conflictCount, row.failedCount].some((count) => Number(count) > 0) ? "active" : "history";
  // Direct NXT writes can retain a Pending review status. They are not manual work.
  if (source === "submissions" && hasQueueSyncFailure(row)) return "active";
  if (source === "submissions" && isDirectNxtSuccess(row)) return "history";
  if (clean(row.status) === "Needs Clarification") return "waiting";
  return closed.includes(clean(row.status)) ? "history" : "active";
}

const labels = {
  nxt_only: "Deliver in NXT", csv: "CSV file", excel: "Excel workbook",
  donor_update: "Donor update", opportunity_update: "Opportunity update",
  constituent_suggestion: "Constituent suggestion", not_requested: "Not requested",
};
export function formatQueueValue(value) {
  if (value == null || value === "") return "Not provided";
  if (Array.isArray(value)) return value.map(formatQueueValue).join(", ") || "None";
  if (typeof value === "object") return Object.entries(value).map(([key, entry]) => `${formatQueueValue(key)}: ${formatQueueValue(entry)}`).join("\n");
  return labels[value] || clean(value).replaceAll("_", " ");
}

export function formatQueueDate(value) {
  if (!value) return "Not set";
  const day = clean(value).slice(0, 10);
  const date = new Date(`${day}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== day) return "Not set";
  return date.toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" });
}

export function buildQueueItems(sources) {
  return Object.entries(sources).flatMap(([source, rows]) => rows.map((record) => {
    const category = source === "data" ? (/research/i.test(record.request_type || "") ? "research" : "data")
      : source === "submissions" ? (hasQueueSyncFailure(record) ? "exceptions" : "reviews") : source;
    const constituent = clean(record.constituent_name || record.donor_name);
    const type = source === "lists" ? "List request" : source === "imports" ? "Import batch"
      : formatQueueValue(record.request_type || record.submission_type || "Submission");
    const title = source === "lists" ? formatQueueValue(record.purpose_other || record.purpose || "List request")
      : source === "imports" ? record.sourceFilename || "Untitled import" : constituent || type;
    const status = source === "submissions" && hasQueueSyncFailure(record) ? "NXT follow-up required"
      : source === "submissions" && isDirectNxtSuccess(record) ? "Synced to NXT"
      : source === "imports" ? Number(record.failedCount) + Number(record.conflictCount) > 0 ? "Needs attention"
        : Number(record.needsReviewCount) > 0 ? "Needs review" : Number(record.readyCount) > 0 ? "Ready to import" : "No pending work"
      : record.status || (source === "data" ? "Open" : "Pending");
    return {
      key: `${source}-${record.id}`, source, record, category, type, title, constituent, status,
      group: getQueueGroup(source, record),
      requester: clean(record.requester_name || record.requester_user_name || record.requester_email || record.officer_name || record.createdByName || record.createdByEmail) || "Unknown requester",
      created: record.date_submitted || record.created_at || record.createdAt,
      due: record.date_needed || null,
      priority: [1, 2, 3].includes(Number(record.queue_priority)) ? Number(record.queue_priority) : 2,
    };
  }));
}

export function isQueueOverdue(item, now = new Date()) {
  if (item.group !== "active" || formatQueueDate(item.due) === "Not set") return false;
  const today = now.toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  return clean(item.due).slice(0, 10) < today;
}

export function filterQueueItems(items, { category = "all", view = "active", search = "", sort = "priority" } = {}) {
  const term = clean(search).toLowerCase();
  return items.filter((item) => item.group === view && (category === "all" || item.category === category)
    && `${item.title} ${item.requester} ${item.constituent} ${item.type} ${item.record.id}`.toLowerCase().includes(term))
    .sort((a, b) => {
      const oldest = (Date.parse(a.created) || 0) - (Date.parse(b.created) || 0);
      if (sort === "newest") return -oldest;
      if (sort === "oldest") return oldest;
      return a.priority - b.priority || Number(isQueueOverdue(b)) - Number(isQueueOverdue(a)) || oldest;
    });
}

export function getQueueActions(item) {
  if (item.source === "imports") return [];
  if (item.source === "data") return item.group === "history"
    ? [["Open", "Reopen request"]]
    : [...(item.status !== "In Progress" ? [["In Progress", "Start work"]] : []), ["Completed", "Complete request"], ["Declined", "Decline request"]];
  if (item.source === "lists") return item.group === "history" ? [["Pending", "Reopen request"]]
    : [...(item.group === "waiting" ? [["Pending", "Return to open work"]] : [["Needs Clarification", "Request clarification"]]), ["Complete", "Complete request"]];
  if (isDirectNxtSuccess(item.record)) return [];
  if (hasQueueSyncFailure(item.record)) return [];
  return item.group === "history" ? [["Pending", "Reopen review"]]
    : [...(item.group === "waiting" ? [["Pending", "Return to open work"]] : [["Needs Clarification", "Request clarification"]]), ["Approved", "Approve review"], ["Ready for CRM", "Ready for CRM"]];
}

export function buildQueueMutation(item, { status, reviewerNotes, queuePriority } = {}) {
  if (item.source === "imports") throw new Error("Open the import workspace to review this batch.");
  if (status && !getQueueActions(item).some(([value]) => value === status)) throw new Error("This action is not available for this request.");
  const notes = clean(reviewerNotes ?? item.record.reviewer_notes);
  if (status === "Needs Clarification" && !notes) throw new Error("Write your clarification question in Reviewer notes first.");
  const body = { reviewerNotes: notes };
  if (status) body.status = status;
  if (item.source === "data") {
    body.status = status || item.record.status || "Open";
    return { url: `/api/data-requests/${encodeURIComponent(item.record.id)}?view=reviewer`, method: "PATCH", body };
  }
  body.id = item.record.id;
  if (item.source === "lists") {
    body.queuePriority = Number(queuePriority ?? item.priority);
    return { url: "/api/list-requests/update", method: "POST", body };
  }
  return { url: "/api/submissions/update-status", method: "POST", body };
}
