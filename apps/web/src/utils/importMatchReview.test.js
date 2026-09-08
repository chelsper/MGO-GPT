import { describe, expect, it } from "vitest";
import { canChangeImportMatch, getSelectedImportMatchId, rejectedImportMatchPreview } from "./importMatchReview";
import { quickImportCandidates } from "./newConstituentImport";

describe("import match review safety", () => {
  it.each(["Ready", "Needs Review", "Conflict", "Skipped"])("allows unsent %s records to be reviewed", (status) => {
    expect(canChangeImportMatch({ status })).toBe(true);
  });
  it.each([
    { status: "Creating" }, { status: "Applying" }, { status: "Applied" }, { status: "Failed" },
    { createdBlackbaudConstituentId: "10" }, { created_blackbaud_constituent_id: "10" },
    { createRequestStartedAt: "2026-09-08" }, { create_request_started_at: "2026-09-08" },
    { appliedAt: "2026-09-08" }, { blackbaudResult: { results: [{ status: "manual_required" }] } },
  ])("protects created, attempted, or in-flight records: %j", (overrides) => {
    expect(canChangeImportMatch({ status: "Ready", ...overrides })).toBe(false);
  });
  it("keeps CSV input but clears every old target and cannot become an automatic new record", () => {
    const input = { blackbaudConstituentId: "old-id", email: "new@example.com" };
    const prior = { input, match: { blackbaudConstituentId: "other-id" }, writePlan: [{ type: "address", targetId: "old-address" }], profileSnapshot: { id: "other-id" } };
    const rejected = rejectedImportMatchPreview(prior, { decision: "rejected" });
    expect(rejected.input).toBe(input);
    expect(rejected.writePlan).toEqual([]);
    expect(rejected.match).toBeNull();
    expect(rejected.profileSnapshot).toBeNull();
    expect(getSelectedImportMatchId(rejected)).toBe("");
    expect(quickImportCandidates([rejected])).toEqual([]);
    expect(prior.match.blackbaudConstituentId).toBe("other-id");
  });

  it("uses the current serialized match decision over a legacy nested preview", () => {
    expect(getSelectedImportMatchId({ input: {}, matchReview: { decision: "rejected" }, preview: { match: { blackbaudConstituentId: "old-id" } } })).toBe("");
  });
});
