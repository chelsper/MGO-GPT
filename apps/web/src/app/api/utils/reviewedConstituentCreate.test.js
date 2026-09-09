import { beforeEach, describe, expect, it, vi } from "vitest";
const { sql, check } = vi.hoisted(() => ({ sql: vi.fn(), check: vi.fn() }));
vi.mock("./sql", () => ({ default: sql }));
vi.mock("./safeConstituentCreate", () => ({ checkClearNonmatch: check }));
import { newRecordReviewFingerprint, prepareNewRecordReview, reviewedCreationBlocker } from "./reviewedConstituentCreate";
import { ImportReviewRequired } from "@/utils/newConstituentImport";

function row() { return { id: "9", status: "Needs Review", preview: { input: { duplicateCheckVersion: 1, firstName: "Jane", lastName: "Dolphin" }, rejectedMatches: [] } }; }
function clearRow() {
  const value = row();
  value.preview.newRecordReview = { status: "clear", token: "token", checkedAt: new Date().toISOString(), fingerprint: newRecordReviewFingerprint(value) };
  return value;
}
const body = { reviewToken: "token", confirmed: true };
async function prepare(value = row()) { return prepareNewRecordReview({ row: value, runId: "42", user: { id: 7 }, origin: "https://example.com" }); }
const savedPreview = () => JSON.parse(sql.mock.calls[0][1]);

describe("checked new-record review", () => {
  beforeEach(() => { sql.mockReset().mockResolvedValue([{ id: "9" }]); check.mockReset().mockResolvedValue(null); });
  it("persists a clear check, without authorizing or creating a constituent", async () => {
    const response = await prepare();
    expect(response.status).toBe(200);
    expect(savedPreview().newRecordReview).toMatchObject({ status: "clear", checkedByUserId: "7", nextAction: "confirm_new" });
    expect(sql.mock.calls[0][0].join(" ")).not.toContain("SET status");
    expect(sql.mock.calls[0][0].join(" ")).toContain("AND blackbaud_result IS NOT DISTINCT FROM");
  });
  it("preserves and displays new candidates and offers match review", async () => {
    check.mockImplementation(async ({ onCandidates }) => { onCandidates([{ blackbaudConstituentId: "55", name: "Suggested Person" }]); return "Possible email match"; });
    await prepare();
    expect(savedPreview().matchCandidates).toHaveLength(1);
    expect(savedPreview().newRecordReview).toMatchObject({ status: "blocked", nextAction: "review_matches" });
    expect(savedPreview().newRecordReview.token).toBeUndefined();
  });
  it("requires a decision on saved suggestions even if a later search omits them", async () => {
    const value = row(); value.preview.matchCandidates = [{ blackbaudConstituentId: "55" }];
    await prepare(value);
    expect(savedPreview().newRecordReview.status).toBe("blocked");
  });
  it("clears old irrelevant suggestions after fresh complete checks, without requiring pointless rejections", async () => {
    const value = row();
    value.preview.matchCandidates = [{ blackbaudConstituentId: "55", firstName: "Different", lastName: "Person" }];
    value.blackbaud_result = { type: "import_duplicate_review", matchCandidates: value.preview.matchCandidates, duplicateCheckAt: "2026-09-08" };
    await prepare(value);
    value.preview = savedPreview();
    expect(value.preview.matchCandidates).toEqual([]);
    expect(value.preview.matchCriteriaVersion).toBe(2);
    expect(reviewedCreationBlocker(value, { confirmed: true, reviewToken: value.preview.newRecordReview.token })).toBeNull();
  });
  it("retains a genuine saved name match until rejected, even when live search omits it", async () => {
    const value = row(); value.preview.matchCandidates = [{ blackbaudConstituentId: "55", name: "Jane Dolphin" }];
    await prepare(value);
    expect(savedPreview().newRecordReview.status).toBe("blocked");
  });
  it("does not resurrect old result candidates after a checked rejection, but blocks newly found matches", async () => {
    const value = row();
    value.preview.rejectedMatches = [{ decision: "rejected", constituentId: "55", reviewedByUserId: "7", reviewedAt: "2026-09-08" }];
    value.blackbaud_result = { type: "import_duplicate_review", matchCandidates: [{ blackbaudConstituentId: "55", name: "Jane Dolphin" }], duplicateCheckAt: "2026-09-08" };
    await prepare(value);
    value.preview = savedPreview();
    const confirm = { confirmed: true, reviewToken: value.preview.newRecordReview.token, reviewNote: "Reviewed and confirmed a separate person." };
    expect(reviewedCreationBlocker(value, confirm)).toBeNull();
    value.blackbaud_result = { type: "import_duplicate_review", matchCandidates: [{ blackbaudConstituentId: "99", name: "Jane Dolphin" }], duplicateCheckAt: new Date(Date.now() + 1000).toISOString() };
    expect(reviewedCreationBlocker(value, confirm)).toContain("suggested matches");
  });
  it.each([403, 429])("offers retry, never a clear check, for NXT %s", async (httpStatus) => {
    check.mockRejectedValue(Object.assign(new Error("secret provider response"), { httpStatus, retryAfterMs: 5000 }));
    await prepare();
    expect(savedPreview().newRecordReview).toMatchObject({ status: "blocked", nextAction: "retry", retryAfterMs: 5000 });
    expect(JSON.stringify(savedPreview())).not.toContain("secret provider response");
  });
  it("offers a corrected preview for missing source fields", async () => {
    check.mockRejectedValue(new ImportReviewRequired("Prepare a new preview so all mapped duplicate-check fields are included."));
    await prepare();
    expect(savedPreview().newRecordReview.nextAction).toBe("correct_csv");
  });
  it("offers batch review for a local duplicate", async () => {
    check.mockResolvedValue("Another import row has a matching email");
    await prepare();
    expect(savedPreview().newRecordReview.nextAction).toBe("review_batch");
  });
  it("fails closed if the row changed during checking", async () => {
    sql.mockResolvedValue([]);
    expect((await prepare()).status).toBe(409);
  });
  it("accepts a current check only with explicit confirmation", () => {
    expect(reviewedCreationBlocker(clearRow(), body)).toBeNull();
    expect(reviewedCreationBlocker(clearRow(), { ...body, confirmed: false })).toContain("Explicitly");
    expect(reviewedCreationBlocker(clearRow(), { ...body, reviewToken: "forged" })).toContain("fresh duplicate checks");
  });
  it("invalidates checks when input, candidates, or rejections change or the token expires", () => {
    const value = clearRow();
    value.preview.input.email2 = "new@example.com";
    expect(reviewedCreationBlocker(value, body)).toContain("fresh duplicate checks");
    const candidate = clearRow(); candidate.preview.matchCandidates = [{ blackbaudConstituentId: "55" }];
    expect(reviewedCreationBlocker(candidate, body)).toContain("suggested matches");
    const rejected = clearRow(); rejected.preview.rejectedMatches.push({ constituentId: "55" });
    expect(reviewedCreationBlocker(rejected, body)).toContain("fresh duplicate checks");
    expect(reviewedCreationBlocker(clearRow(), body, Date.now() + 31 * 60 * 1000)).toContain("expired");
  });
  it("requires an audit note for rejected suggestions and uses only saved reviewed IDs", async () => {
    const value = row();
    value.preview.rejectedMatches = [{ decision: "rejected", constituentId: "55", reviewedByUserId: "7", reviewedAt: new Date().toISOString() }, { constituentId: "forged" }];
    await prepare(value);
    expect(check.mock.calls[0][0].reviewedCandidateIds).toEqual(["55"]);
    value.preview = savedPreview();
    const confirm = { confirmed: true, reviewToken: value.preview.newRecordReview.token };
    expect(reviewedCreationBlocker(value, confirm)).toContain("review note");
    expect(reviewedCreationBlocker(value, { ...confirm, reviewNote: "Different people verified by contact details." })).toBeNull();
  });
  it.each([{ create_request_started_at: "today" }, { created_blackbaud_constituent_id: "55" }, { status: "Creating" }, { status: "Skipped" }, { create_approved_at: "today" }, { applied_at: "today" }, { matched_blackbaud_constituent_id: "55" }])("blocks unsafe creation %j", (change) => {
    expect(reviewedCreationBlocker({ ...clearRow(), ...change }, body)).toContain("locked");
  });
  it("hashes JSONB input independently of object key order", () => {
    const a = row(); const b = row(); b.preview.input = { lastName: "Dolphin", firstName: "Jane", duplicateCheckVersion: 1 };
    expect(newRecordReviewFingerprint(a)).toBe(newRecordReviewFingerprint(b));
  });
});
