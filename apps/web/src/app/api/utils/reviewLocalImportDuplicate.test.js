import { beforeEach, describe, expect, it, vi } from "vitest";
const { sql, find, api } = vi.hoisted(() => ({ sql: vi.fn(), find: vi.fn(), api: vi.fn() }));
vi.mock("./sql", () => ({ default: sql }));
vi.mock("./safeConstituentCreate", () => ({ findLocalImportDuplicate: find, checkClearNonmatch: vi.fn() }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: api }));
import { reviewLocalImportDuplicate } from "./reviewedConstituentCreate";

const duplicate = { rowId: "2712", runId: "88", fingerprint: "fingerprint", kind: "pending_row", name: "Other Person" };
const value = () => ({ id: "9", status: "Needs Review", preview: { input: { firstName: "Jane", lastName: "Dolphin" } } });
const run = (row, body = {}, reject = false) => reviewLocalImportDuplicate({ row, runId: "42", user: { id: 7 }, origin: "https://example.com", body: { blockerFingerprint: "fingerprint", ...body }, reject });
const saved = () => JSON.parse(sql.mock.calls.at(-1)[1]);
async function loaded() { const row = value(); await run(row); row.preview = saved(); sql.mockClear(); return row; }
const rejectBody = (row, extra = {}) => ({ reviewToken: row.preview.localDuplicateReview.token, confirmed: true, reviewNote: "Compared the two people and their contact details.", ...extra });

describe("explicit import-history decisions", () => {
  beforeEach(() => {
    sql.mockReset().mockResolvedValue([{ id: "9" }]);
    find.mockReset().mockImplementation(async ({ onLocalDuplicate }) => { onLocalDuplicate(duplicate); return "Another import row"; });
    api.mockReset().mockResolvedValue({ id: "77", lookup_id: "729381", first: "Other", last: "Person" });
  });
  it("loads a comparison without approving or creating anything", async () => {
    expect((await run(value())).status).toBe(200);
    expect(saved().localDuplicateReview).toMatchObject({ duplicate, token: expect.any(String), current: null });
    expect(saved().newRecordReview).toBeNull();
    expect(api).not.toHaveBeenCalled();
  });
  it("saves a different-person decision and requires full checks afterward", async () => {
    const row = await loaded();
    expect((await run(row, rejectBody(row), true)).status).toBe(200);
    expect(saved().reviewedLocalDuplicates).toEqual([expect.objectContaining({ decision: "different_person", fingerprint: "fingerprint", reviewedByUserId: "7", note: rejectBody(row).reviewNote })]);
    expect(saved().localDuplicate).toBeNull();
    expect(saved().newRecordReview).toBeNull();
    expect(api).not.toHaveBeenCalled();
    expect(sql.mock.calls[0][0].join(" ")).toContain("AND preview IS NOT DISTINCT FROM");
  });
  it("requires confirmation, a note, and the saved comparison token", async () => {
    const row = await loaded();
    for (const extra of [{ confirmed: false }, { reviewNote: "short" }, { reviewNote: "x".repeat(2001) }]) {
      expect((await run(row, rejectBody(row, extra), true)).status).toBe(400);
    }
    expect((await run(row, rejectBody(row, { reviewToken: "forged" }), true)).status).toBe(409);
    expect(sql).not.toHaveBeenCalled();
  });
  it("expires comparisons and refuses changed input/evidence", async () => {
    const row = await loaded();
    row.preview.localDuplicateReview.checkedAt = new Date(Date.now() - 31 * 60 * 1000).toISOString();
    expect((await run(row, rejectBody(row), true)).status).toBe(409);
    expect((await run(value(), { blockerFingerprint: "other" })).status).toBe(409);
    expect(sql).not.toHaveBeenCalled();
  });
  it("loads and re-verifies current NXT identity, then records a candidate rejection too", async () => {
    find.mockImplementation(async ({ onLocalDuplicate }) => onLocalDuplicate({ ...duplicate, kind: "created", createdConstituentId: "77" }));
    const row = await loaded();
    expect(row.preview.localDuplicateReview.current).toMatchObject({ lookupId: "729381", name: "Other Person" });
    expect((await run(row, rejectBody(row), true)).status).toBe(200);
    expect(saved().rejectedMatches).toEqual([expect.objectContaining({ constituentId: "77", decision: "rejected", localDuplicateFingerprint: "fingerprint" })]);
    expect(saved().reviewedLocalDuplicates[0].liveIdentityFingerprint).toBeTruthy();
    expect(api).toHaveBeenCalledTimes(2);
    expect(api.mock.calls.every(([path, options]) => path.endsWith("/77") && !options.method)).toBe(true);
  });
  it("blocks a changed live record rather than accepting a stale comparison", async () => {
    find.mockImplementation(async ({ onLocalDuplicate }) => onLocalDuplicate({ ...duplicate, kind: "created", createdConstituentId: "77" }));
    const row = await loaded();
    api.mockResolvedValue({ id: "77", lookup_id: "629381", first: "New", last: "Identity" });
    expect((await run(row, rejectBody(row), true)).status).toBe(409);
    expect(sql).not.toHaveBeenCalled();
  });
  it("blocks uncertain history even if the user says it is different", async () => {
    find.mockImplementation(async ({ onLocalDuplicate }) => onLocalDuplicate({ ...duplicate, kind: "unconfirmed_creation" }));
    expect((await run(value())).status).toBe(409);
    expect(api).not.toHaveBeenCalled();
    expect(sql).not.toHaveBeenCalled();
  });
  it.each([401, 403, 404, 429])("keeps holds after live comparison HTTP %s and hides raw responses", async (httpStatus) => {
    find.mockImplementation(async ({ onLocalDuplicate }) => onLocalDuplicate({ ...duplicate, kind: "created", createdConstituentId: "77" }));
    api.mockRejectedValue(Object.assign(new Error("private provider payload"), { httpStatus }));
    const response = await run(value());
    expect(response.status).toBe(409);
    expect(JSON.stringify(await response.json())).not.toContain("private provider payload");
    expect(sql).not.toHaveBeenCalled();
  });
  it("rejects a row claimed or changed during review", async () => {
    const row = await loaded(); sql.mockResolvedValue([]);
    expect((await run(row, rejectBody(row), true)).status).toBe(409);
  });
  it.each([{ status: "Creating" }, { create_request_started_at: "today" }, { created_blackbaud_constituent_id: "77" }, { applied_at: "today" }, { matched_blackbaud_constituent_id: "77" }])("cannot review locked or applied records %j", async (change) => {
    expect((await run({ ...value(), ...change })).status).toBe(409);
    expect(find).not.toHaveBeenCalled();
  });
});
