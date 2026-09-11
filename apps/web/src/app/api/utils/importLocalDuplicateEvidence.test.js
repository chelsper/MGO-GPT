import { beforeEach, describe, expect, it, vi } from "vitest";
const { api } = vi.hoisted(() => ({ api: vi.fn() }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: api }));
import { duplicateEvidenceFingerprint, localDuplicateFingerprint, readLocalDuplicateIdentity, isReviewedLocalDuplicate } from "./importLocalDuplicateEvidence";

const duplicate = { kind: "created", fingerprint: "fingerprint", createdConstituentId: "77" };
const live = { id: "77", lookup_id: "729381", first: "Another", last: "Person" };
const decision = { decision: "different_person", fingerprint: "fingerprint", reviewedAt: "2026-09-09", reviewedByUserId: "7", note: "Compared both identities; different people." };

describe("reviewed import-history evidence", () => {
  beforeEach(() => { api.mockReset().mockResolvedValue(live); });
  it("reads the current system ID directly, never a cached Lookup ID", async () => {
    expect(await readLocalDuplicateIdentity(duplicate, { userId: 7 })).toMatchObject({ blackbaudConstituentId: "77", lookupId: "729381", name: "Another Person" });
    expect(api).toHaveBeenCalledWith("/constituent/v1/constituents/77", { userId: 7 });
  });
  it.each([{}, { id: "wrong", lookup_id: "729381", name: "Someone" }, { id: "77", name: "Someone" }, { id: "77", lookup_id: "729381" }])("rejects malformed live identity %j", async (value) => {
    api.mockResolvedValue(value);
    await expect(readLocalDuplicateIdentity(duplicate, {})).rejects.toThrow(/complete current identity/);
  });
  it.each([401, 403, 404, 429])("does not dismiss a created record after HTTP %s", async (httpStatus) => {
    api.mockRejectedValue(Object.assign(new Error("NXT unavailable"), { httpStatus }));
    await expect(isReviewedLocalDuplicate(duplicate, [decision], {})).rejects.toThrow();
  });
  it("rechecks known created records, invalidating a changed current identity", async () => {
    const current = await readLocalDuplicateIdentity(duplicate, {});
    const reviewed = { ...decision, liveIdentityFingerprint: duplicateEvidenceFingerprint(current) };
    expect(await isReviewedLocalDuplicate(duplicate, [reviewed], {})).toBe(true);
    api.mockResolvedValue({ ...live, lookup_id: "changed" });
    expect(await isReviewedLocalDuplicate(duplicate, [reviewed], {})).toBe(false);
    const updated = await readLocalDuplicateIdentity(duplicate, {});
    const rereviewed = { ...decision, liveIdentityFingerprint: duplicateEvidenceFingerprint(updated) };
    expect(await isReviewedLocalDuplicate(duplicate, [reviewed, rereviewed], {})).toBe(true);
  });
  it("cannot dismiss an uncertain creation even with a saved acknowledgment", async () => {
    expect(await isReviewedLocalDuplicate({ ...duplicate, kind: "unconfirmed_creation" }, [decision], {})).toBe(false);
    expect(api).not.toHaveBeenCalled();
  });
  it("accepts only an exact audited pending-row decision", async () => {
    const pending = { ...duplicate, kind: "pending_row" };
    expect(await isReviewedLocalDuplicate(pending, [decision], {})).toBe(true);
    for (const change of [{ fingerprint: "changed" }, { reviewedByUserId: null }, { note: "short" }, { decision: "seen" }]) {
      expect(await isReviewedLocalDuplicate(pending, [{ ...decision, ...change }], {})).toBe(false);
    }
  });
  it("binds a decision to both inputs and creation state, independent of JSON key order", () => {
    const input = { firstName: "Jane", lastName: "Dolphin" }, row = { id: 3, input: { email: "a@example.com" } };
    const fingerprint = localDuplicateFingerprint(input, row, "pending_row");
    expect(localDuplicateFingerprint({ lastName: "Dolphin", firstName: "Jane" }, row, "pending_row")).toBe(fingerprint);
    expect(localDuplicateFingerprint({ ...input, lookupId: "123" }, row, "pending_row")).not.toBe(fingerprint);
    expect(localDuplicateFingerprint(input, { ...row, input: { email: "b@example.com" } }, "pending_row")).not.toBe(fingerprint);
    expect(localDuplicateFingerprint(input, { ...row, created_blackbaud_constituent_id: "77" }, "created")).not.toBe(fingerprint);
  });
});
