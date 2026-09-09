import { beforeEach, describe, expect, it, vi } from "vitest";
const { blackbaudApiFetchMock } = vi.hoisted(() => ({ blackbaudApiFetchMock: vi.fn() }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: blackbaudApiFetchMock }));
import { verifyImportTargetIdentity } from "./importTargetIdentity";

const request = new Request("https://example.com/api/import/apply", { method: "POST" });
const user = { id: 7 };
const row = () => ({
  id: "9", status: "Ready", matched_blackbaud_constituent_id: "100", matched_lookup_id: "629381",
  preview: { input: { lookupId: "629381", firstName: "Test", lastName: "Person" },
    match: { blackbaudConstituentId: "100", lookupId: "629381", name: "Test Person" } },
});
const live = { id: "100", lookup_id: "629381", first: "Test", last: "Person", name: "Test Person" };
const verify = (value = row()) => verifyImportTargetIdentity({ request, user, row: value });

describe("live import identity verification", () => {
  beforeEach(() => { blackbaudApiFetchMock.mockReset().mockResolvedValue(live); });

  it("rereads the exact system record on every apply, without cached matching", async () => {
    expect(await verify()).toEqual({ ok: true });
    expect(await verify()).toEqual({ ok: true });
    expect(blackbaudApiFetchMock).toHaveBeenCalledTimes(2);
    expect(blackbaudApiFetchMock).toHaveBeenCalledWith("/constituent/v1/constituents/100", expect.objectContaining({ method: "GET", userId: 7, authUserId: 7 }));
  });

  it("blocks a saved 629381 match when the friend now has Lookup ID 729381", async () => {
    blackbaudApiFetchMock.mockResolvedValue({ ...live, lookup_id: "729381" });
    expect(await verify()).toMatchObject({ ok: false, diagnostic: { code: "lookup_id_changed" } });
    expect(blackbaudApiFetchMock).toHaveBeenCalledTimes(1);
  });

  it("blocks the old numeric Lookup-ID-as-system-ID fallback even without a saved Lookup ID", async () => {
    const value = row();
    value.matched_lookup_id = null;
    value.preview.match.lookupId = null;
    blackbaudApiFetchMock.mockResolvedValue({ ...live, lookup_id: "729381" });
    expect(await verify(value)).toMatchObject({ ok: false, diagnostic: { code: "source_identifier_conflict" } });
  });

  it("requires explicit comparison for legacy name/email-only automatic matches", async () => {
    const value = row();
    value.preview.input = { firstName: "Test", lastName: "Person", email: "test@example.com" };
    expect(await verify(value)).toMatchObject({ ok: false, diagnostic: { code: "explicit_identity_review_required" } });
  });

  it("allows a deliberate reviewer-selected record overriding rejected CSV identifiers", async () => {
    const value = row();
    value.preview.input.lookupId = "old-rejected-id";
    value.preview.matchReview = { decision: "selected", constituentId: "100" };
    expect(await verify(value)).toEqual({ ok: true });
  });

  it("still blocks a changed lookup ID after an explicit selection", async () => {
    const value = row();
    value.preview.matchReview = { decision: "selected", constituentId: "100" };
    blackbaudApiFetchMock.mockResolvedValue({ ...live, lookup_id: "729381" });
    expect(await verify(value)).toMatchObject({ ok: false, diagnostic: { code: "lookup_id_changed" } });
  });

  it("allows staged updates on a separately created record without reusing rejected CSV IDs", async () => {
    const value = row();
    value.created_blackbaud_constituent_id = "100";
    value.preview.input = { blackbaudConstituentId: "old-system-id", lookupId: "old-lookup" };
    expect(await verify(value)).toEqual({ ok: true });
  });

  it("blocks conflicting saved system IDs without making any API call", async () => {
    const value = row(); value.matched_blackbaud_constituent_id = "200";
    expect(await verify(value)).toMatchObject({ ok: false });
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });

  it.each([null, [], {}, "<html>error</html>", { ...live, id: "200" }, { id: "100", lookup_id: "629381" }])("fails closed for malformed or wrong identity response %j", async (payload) => {
    blackbaudApiFetchMock.mockResolvedValue(payload);
    expect(await verify()).toMatchObject({ ok: false, diagnostic: { code: "malformed_identity_response" } });
  });

  it.each([401, 403, 404, 429, 500, null])("holds API failures without exposing provider data (%s)", async (httpStatus) => {
    blackbaudApiFetchMock.mockRejectedValue(Object.assign(new Error("secret donor/token response"), { httpStatus }));
    const result = await verify();
    expect(result).toMatchObject({ ok: false, diagnostic: { code: "identity_read_failed", httpStatus } });
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("blocks an unreviewed different person even with an exact ID", async () => {
    blackbaudApiFetchMock.mockResolvedValue({ ...live, first: "Other", name: "Other Person" });
    expect(await verify()).toMatchObject({ ok: false, diagnostic: { code: "explicit_identity_review_required" } });
  });

  it("requires a fresh review if a manually selected identity name changed", async () => {
    const value = row(); value.preview.matchReview = { decision: "selected", constituentId: "100" };
    blackbaudApiFetchMock.mockResolvedValue({ ...live, first: "Other", name: "Other Person" });
    expect(await verify(value)).toMatchObject({ ok: false, diagnostic: { code: "reviewed_name_changed" } });
  });
});
