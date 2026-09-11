import { describe, expect, it } from "vitest";
import { buildQueueItems, buildQueueMutation, getQueueActions } from "./advancementQueue";
import { canReviewSubmission, getSubmissionActivityNotice, getSubmissionDisplayStatus, getSubmissionQueueGroup, getSubmissionReviewFilter, isSubmissionHistoryOnly } from "./submissionReview";

const activity = { id: 78, submission_type: "donor_update", interaction_type: "Cultivation", status: "Pending", blackbaud_sync_status: "not_requested" };

describe("submission review policy", () => {
  it.each(["donor_update", "opportunity_update"])("keeps legacy %s logs in History without changing their saved status", (type) => {
    const row = { ...activity, submission_type: type };
    const original = { ...row };
    const item = buildQueueItems({ submissions: [row] })[0];
    expect(item).toMatchObject({ group: "history", status: "Saved in app" });
    expect(getQueueActions(item)).toEqual([]);
    expect(canReviewSubmission(row)).toBe(false);
    expect(getSubmissionReviewFilter(row)).toBe("History");
    expect(getSubmissionActivityNotice(row)).toContain("NXT sync is not confirmed");
    expect(() => buildQueueMutation(item, { status: "Approved" })).toThrow("does not require review");
    expect(() => buildQueueMutation(item, { reviewerNotes: "Approve" })).toThrow("does not require review");
    expect(row).toEqual(original);
  });

  it.each([null, "", " not_requested "])("handles legacy missing sync evidence: %j", (sync) => {
    expect(isSubmissionHistoryOnly({ ...activity, blackbaud_sync_status: sync })).toBe(true);
  });

  it.each(["Data update", "Assignment request", "Add to top prospects", "DATA UPDATE + Assignment request"])("keeps explicit legacy requests reviewable: %s", (interaction_type) => {
    const row = { ...activity, interaction_type };
    expect(getSubmissionQueueGroup(row)).toBe("active");
    expect(canReviewSubmission(row)).toBe(true);
    expect(getSubmissionDisplayStatus(row)).toBe("Pending");
  });

  it.each(["constituent_suggestion", "unknown_request", null])("conservatively preserves other request types: %s", (submission_type) => {
    expect(canReviewSubmission({ ...activity, submission_type })).toBe(true);
    expect(getSubmissionQueueGroup({ ...activity, submission_type })).toBe("active");
  });

  it("preserves real clarification questions even on routine activity", () => {
    const row = { ...activity, status: "Needs Clarification" };
    expect(getSubmissionQueueGroup(row)).toBe("waiting");
    expect(canReviewSubmission(row)).toBe(true);
    expect(getSubmissionReviewFilter(row)).toBe("Needs Clarification");
  });

  it.each([
    { blackbaud_sync_status: "failed" },
    { blackbaud_sync_status: "synced", blackbaud_sync_error: "Metadata failed" },
    { blackbaud_sync_status: "not_requested", blackbaud_sync_error: "Failed" },
    { blackbaud_sync_status: "queued" },
    { blackbaud_sync_status: "unexpected" },
  ])("never buries failures or unfinished/unknown NXT state: %j", (sync) => {
    const row = { ...activity, status: "Approved", ...sync };
    expect(getSubmissionQueueGroup(row)).toBe("active");
    expect(canReviewSubmission(row)).toBe(false);
    expect(getSubmissionDisplayStatus(row)).toBe("NXT follow-up required");
    const item = buildQueueItems({ submissions: [row] })[0];
    expect(item.category).toBe("exceptions");
    expect(getQueueActions(item)).toEqual([]);
    expect(buildQueueMutation(item, { reviewerNotes: "Investigating" }).body).toEqual({ id: 78, reviewerNotes: "Investigating" });
  });

  it.each(["synced", " SUCCESS "])("labels verified NXT activity truthfully: %s", (blackbaud_sync_status) => {
    const row = { ...activity, blackbaud_sync_status };
    expect(getSubmissionDisplayStatus(row)).toBe("Synced to NXT");
    expect(getSubmissionQueueGroup(row)).toBe("history");
    expect(canReviewSubmission(row)).toBe(false);
  });
});
