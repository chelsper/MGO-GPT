import { describe, expect, it } from "vitest";
import { canChangeImportMatch, getImportMatchCandidates, getSelectedImportMatchId, normalizeImportMatchCandidate, rejectedImportMatchPreview } from "./importMatchReview";
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

  it("unlocks only known pre-creation duplicate holds, not uncertain failures", () => {
    const row = { status: "Needs Review", createApprovedAt: "2026-09-08", quickCreateStatus: "review", blackbaudError: "NXT found a possible email match. Held for review." };
    expect(canChangeImportMatch(row)).toBe(true);
    expect(canChangeImportMatch({ ...row, blackbaudError: "Creation timed out" })).toBe(false);
    expect(canChangeImportMatch({ ...row, createRequestStartedAt: "2026-09-08" })).toBe(false);
    expect(canChangeImportMatch({ ...row, createdBlackbaudConstituentId: "123" })).toBe(false);
    expect(canChangeImportMatch({ ...row, blackbaudResult: { createFailedAt: "2026-09-08" } })).toBe(false);
    expect(canChangeImportMatch({ ...row, blackbaudResult: { type: "import_duplicate_review", results: [{}] } })).toBe(false);
  });

  it("combines preview and duplicate-check candidates, deduplicates and persists rejections", () => {
    const first = { blackbaudConstituentId: "123", name: "First Person" };
    const second = { blackbaudConstituentId: "456", name: "Second Person" };
    const row = { preview: { matchCandidates: [first] }, blackbaud_result: { matchCandidates: [first, second], duplicateCandidate: { constituentId: "789", name: "Legacy Person" } } };
    expect(getImportMatchCandidates(row).map((item) => item.blackbaudConstituentId)).toEqual(["123", "456", "789"]);
    const rejected = rejectedImportMatchPreview({ matchCandidates: getImportMatchCandidates(row) }, { decision: "rejected", constituentId: "123" });
    rejected.rejectedMatches = [{ constituentId: "123" }];
    expect(getImportMatchCandidates(JSON.parse(JSON.stringify(rejected))).map((item) => item.blackbaudConstituentId)).toEqual(["456", "789"]);
    expect(getImportMatchCandidates(rejected, { includeRejected: true })).toHaveLength(3);
    expect(quickImportCandidates([rejected])).toEqual([]);
  });

  it("maps search fields without confusing lookup IDs with record IDs or leaking raw data", () => {
    expect(normalizeImportMatchCandidate({ record_id: 123, constituent_id: "LOOKUP", first_name: "Jane", last_name: "Doe", address_block: "42 Main St", address_post_code: "32211", primary_email: "jane@example.com", token: "secret", raw: { private: true } })).toEqual({ blackbaudConstituentId: "123", lookupId: "LOOKUP", name: "Jane Doe", address: "42 Main St", postalCode: "32211", email: "jane@example.com", email2: "", reason: "" });
    expect(normalizeImportMatchCandidate({ constituent_id: "lookup-only" })).toBeNull();
  });
});
