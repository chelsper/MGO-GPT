import { beforeEach, describe, it, expect, vi } from "vitest";
const { api, sql } = vi.hoisted(() => ({ api: vi.fn(), sql: vi.fn() }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: api }));
vi.mock("./sql", () => ({ default: sql }));
import { checkClearNonmatch, configuredNameFormatPayload, markConstituentCreateStarted, claimConstituentCreateLease, renewConstituentCreateLease, releaseConstituentCreateLease } from "./safeConstituentCreate";
const input = { firstName: "Jane", lastName: "Dolphin", email: "jane@example.com", addressLine1: "42 North Main Street", postalCode: "32211-1234", duplicateCheckVersion: 1 };
const check = (overrides = {}) => checkClearNonmatch({ input: { ...input, ...overrides }, rowId: "9", runId: "42", credentials: { userId: 7 } });

describe("live duplicate preflight", () => {
  beforeEach(() => { vi.clearAllMocks(); api.mockReset().mockImplementation(async (path) => path === "/constituent/v1/constituents/search" ? { value: [], count: 0 } : { results: [] }); sql.mockReset().mockResolvedValue([]); });
  it("checks email, name, and address independently without cached lookups", async () => {
    expect(await check()).toBeNull();
    expect(api.mock.calls.map(([, options]) => options.searchParams)).toEqual([
      { email: "jane@example.com", limit: 1000 },
      { first_name: "Jane", last_name: "Dolphin", include_alias: true, include_maiden_name: true, limit: 1000 },
      { search_text: "42 North Main Street", include_inactive: true, strict_search: true, limit: 500 },
      { search_text: "42 n main st", include_inactive: true, strict_search: true, limit: 500 },
    ]);
  });
  it("continues every duplicate channel after an explicitly reviewed ID, email, name, or address match", async () => {
    api.mockImplementation(async (path) => {
      if (path.endsWith("/8")) return { id: "8" };
      if (path === "/constituent/v1/constituents/search") return { value: [{ id: "8" }], count: 1 };
      return { results: [{ record_id: "8" }] };
    });
    const onCandidates = vi.fn();
    expect(await checkClearNonmatch({ input: { ...input, blackbaudConstituentId: "8", lookupId: "8", email2: "second@example.com" }, rowId: "9", runId: "42", reviewedCandidateIds: ["8"], credentials: {}, onCandidates })).toBeNull();
    expect(api).toHaveBeenCalledTimes(7);
    expect(onCandidates).not.toHaveBeenCalled();
  });
  it("still holds a newly discovered candidate after ignoring a reviewed suggestion", async () => {
    api.mockResolvedValueOnce({ results: [{ record_id: "8" }] }).mockResolvedValueOnce({ results: [{ record_id: "9", first_name: "Jane", last_name: "Dolphin" }] });
    const onCandidates = vi.fn();
    expect(await checkClearNonmatch({ input, rowId: "9", runId: "42", reviewedCandidateIds: ["8"], credentials: {}, onCandidates })).toContain("first and last name");
    expect(onCandidates).toHaveBeenCalledWith([expect.objectContaining({ blackbaudConstituentId: "9" })]);
  });
  it("does not exempt failed or incomplete searches even when all known matches were rejected", async () => {
    api.mockResolvedValueOnce({ results: [{ record_id: "8" }] }).mockResolvedValueOnce({ results: [], count: 1 });
    await expect(checkClearNonmatch({ input, rowId: "9", runId: "42", reviewedCandidateIds: ["8"], credentials: {} })).rejects.toThrow(/incomplete/);
  });
  it("excludes only skipped pending rows, retaining started, created, and durable attempts", async () => {
    await check();
    const query = sql.mock.calls[0][0].join(" ");
    expect(query).toContain("AND status <> 'Skipped'");
    expect(query).toContain("OR create_request_started_at IS NOT NULL");
    expect(query).toContain("OR created_blackbaud_constituent_id IS NOT NULL");
    expect(query).toContain("WHERE outcome <> 'rejected'");
  });
  it("holds a different name/email with similar address and ZIP+4", async () => {
    api.mockResolvedValueOnce({ results: [] }).mockResolvedValueOnce({ results: [] }).mockResolvedValueOnce({ value: [{ id: "8", address: { address_lines: "42 N Main St", postal_code: "32211" } }], count: 1 });
    expect(await check()).toContain("similar address");
  });
  it("verifies historical addresses before suggesting a household match", async () => {
    api.mockResolvedValueOnce({ results: [] }).mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ value: [{ id: "8", first: "Janet", last: "Other" }], count: 1 })
      .mockResolvedValueOnce({ value: [{ address_lines: "42 N Main St", postal_code: "32211" }], count: 1 });
    const onCandidates = vi.fn();
    expect(await checkClearNonmatch({ input, rowId: "9", runId: "42", credentials: {}, onCandidates })).toContain("similar address");
    expect(onCandidates).toHaveBeenCalledWith([expect.objectContaining({ blackbaudConstituentId: "8", name: "Janet Other", matchCategory: "Possible household" })]);
    expect(api.mock.calls.at(-1)[0]).toBe("/constituent/v1/constituents/8/addresses");
  });
  it("retains all suggested email matches and their comparison fields without weakening the hold", async () => {
    api.mockResolvedValueOnce({ results: [
      { record_id: 8, constituent_id: "LOOKUP8", first_name: "Jane", last_name: "Dolphin", primary_email: input.email, address_block: "42 Main St", address_post_code: "32211" },
      { record_id: 9, first_name: "Janet", last_name: "Dolphin", primary_email: input.email },
    ] });
    const onCandidates = vi.fn();
    expect(await checkClearNonmatch({ input, rowId: "9", runId: "42", credentials: { userId: 7 }, onCandidates })).toContain("possible email match");
    expect(onCandidates).toHaveBeenCalledWith([
      expect.objectContaining({ blackbaudConstituentId: "8", lookupId: "LOOKUP8", name: "Jane Dolphin", email: input.email, address: "42 Main St", postalCode: "32211" }),
      expect.objectContaining({ blackbaudConstituentId: "9", name: "Janet Dolphin" }),
    ]);
    expect(api).toHaveBeenCalledOnce();
  });
  it("holds duplicates within the file before making an NXT call", async () => {
    sql.mockResolvedValue([{ id: 10, input: { ...input } }]);
    expect(await check()).toContain("Another import row");
    expect(api).not.toHaveBeenCalled();
  });
  it("does not treat failed ID lookup as absence", async () => {
    api.mockRejectedValue(Object.assign(new Error("Forbidden"), { httpStatus: 403 }));
    await expect(check({ blackbaudConstituentId: "8" })).rejects.toThrow("Forbidden");
    expect(api).toHaveBeenCalledTimes(1);
  });
  it("allows a genuine 404 ID lookup to continue other matching checks", async () => {
    api.mockRejectedValueOnce(Object.assign(new Error("Not Found"), { httpStatus: 404 }));
    expect(await check({ blackbaudConstituentId: "8" })).toBeNull();
    expect(api).toHaveBeenCalledTimes(5);
  });
  it.each([null, {}, { results: {} }, { results: [{ bad: true }] }, { results: [], count: 2 }, { results: Array.from({ length: 1000 }, () => ({ record_id: 1 })) }])("fails closed for malformed or truncated results", async (result) => {
    api.mockResolvedValue(result);
    await expect(check()).rejects.toThrow();
  });
  it.each([429, 403])("propagates throttling status %s and Retry-After", async (status) => {
    const error = Object.assign(new Error("Throttled"), { httpStatus: status, retryAfterMs: 30000 });
    api.mockRejectedValue(error);
    await expect(check()).rejects.toBe(error);
  });
  it("ignores unrelated name hits without asking the reviewer to reject each", async () => {
    api.mockResolvedValueOnce({ results: [] }).mockResolvedValueOnce({ results: Array.from({ length: 28 }, (_, i) => ({ record_id: i + 1, first_name: "Someone", last_name: `Unrelated${i}` })) });
    expect(await check()).toBeNull();
    expect(api).toHaveBeenCalledTimes(4);
  });
  it("never uses a numeric Lookup ID as a system ID", async () => {
    expect(await check({ lookupId: "123" })).toBeNull();
    expect(api.mock.calls.some(([path]) => path.endsWith("/123"))).toBe(false);
    expect(api.mock.calls[0][1].searchParams).toMatchObject({ lookup_id: "123" });
  });
  it("dismisses an unrelated address result only after checking all returned mailing addresses", async () => {
    api.mockResolvedValueOnce({ results: [] }).mockResolvedValueOnce({ results: [] })
      .mockResolvedValueOnce({ value: [{ id: "8", first: "Other", last: "Person" }], count: 1 })
      .mockResolvedValueOnce({ value: [{ address_lines: "42 Different Street", postal_code: "32211" }], count: 1 });
    expect(await check()).toBeNull();
  });
  it("checks alternate emails rather than assuming a different preferred email means no match", async () => {
    api.mockResolvedValueOnce({ results: [{ record_id: "8", first_name: "Other", last_name: "Person", primary_email: "other@example.com" }] })
      .mockResolvedValueOnce({ value: [{ address: input.email }], count: 1 });
    expect(await check()).toContain("email match");
  });
  it("fails closed when a contact comparison is partial", async () => {
    api.mockResolvedValueOnce({ results: [{ record_id: "8", first_name: "Other", last_name: "Person" }] })
      .mockResolvedValueOnce({ value: [], count: 2 });
    await expect(check()).rejects.toThrow(/incomplete/);
  });
  it("does not guess that an old preview checked ZIP and secondary email", async () => {
    await expect(check({ duplicateCheckVersion: undefined })).rejects.toThrow(/new preview/);
    expect(api).not.toHaveBeenCalled();
  });
  it("retains prior attempts even if their original import row was replaced", async () => {
    sql.mockResolvedValue([{ id: 99, input: { firstName: "Different", lastName: "Name", email: "old@example.com" }, created_blackbaud_constituent_id: "777" }]);
    expect(await check({ blackbaudConstituentId: "777" })).toContain("matching NXT system ID");
    expect(api).not.toHaveBeenCalled();
    expect(sql.mock.calls[0][0].join(" ")).toContain("FROM constituency_import_create_attempts");
  });
  it("sends a configured name format, never custom text", async () => {
    api.mockResolvedValue({ count: 1, value: [{ id: "5", format: "First Last" }] });
    expect(await configuredNameFormatPayload({ newRecordNameFormats: { addressee: "5" } }, {})).toEqual({ primary_addressee: { custom_format: false, configuration_id: "5" } });
    await expect(configuredNameFormatPayload({ newRecordNameFormats: { addressee: "6" } }, {})).rejects.toThrow(/no longer exists/);
    await expect(configuredNameFormatPayload({ newRecordNameFormats: { addressee: "5" }, nameFormatUpdate: { addressee: "Custom" } }, {})).rejects.toThrow(/not both/);
  });

  it("returns actionable same-batch duplicate context without inventing an NXT match", async () => {
    sql.mockResolvedValue([{ id: 2712, run_id: 88, row_number: 4, status: "Ready", input: { ...input, lookupId: "628866" } }]);
    const onLocalDuplicate = vi.fn(), onCandidates = vi.fn();
    const message = await checkClearNonmatch({ input: { ...input, lookupId: "628866" }, rowId: "2711", runId: "88", onLocalDuplicate, onCandidates, credentials: {} });
    expect(message).toContain("import #88, CSV row 4");
    expect(message).toContain("matching NXT Lookup ID");
    expect(onLocalDuplicate).toHaveBeenCalledWith(expect.objectContaining({ rowId: "2712", runId: "88", rowNumber: 4, kind: "pending_row", sameRun: true, name: "Jane Dolphin", createdConstituentId: null }));
    expect(onCandidates).not.toHaveBeenCalled();
    expect(api).not.toHaveBeenCalled();
  });

  it.each([
    [{ created_blackbaud_constituent_id: "777" }, "created"],
    [{ create_request_started_at: "2026-09-09" }, "unconfirmed_creation"],
    [{ source: "creation_history" }, "unconfirmed_creation"],
  ])("retains prior creation safeguards and identifies their kind (%j)", async (fields, kind) => {
    sql.mockResolvedValue([{ id: 90, run_id: 20, row_number: 2, input, ...fields }]);
    const onLocalDuplicate = vi.fn();
    const message = await checkClearNonmatch({ input, rowId: "9", runId: "42", credentials: {}, onLocalDuplicate, reviewedCandidateIds: ["777"] });
    expect(message).not.toContain("skip the extra unsent row");
    expect(onLocalDuplicate).toHaveBeenCalledWith(expect.objectContaining({ runId: "20", kind, sameRun: false }));
    expect(api).not.toHaveBeenCalled();
  });
  it("requires a durable pre-POST checkpoint and an owned live lease", async () => {
    await expect(markConstituentCreateStarted(9, {})).rejects.toThrow(/row changed/);
    await expect(renewConstituentCreateLease("token")).rejects.toThrow(/lock expired/);
    expect(await claimConstituentCreateLease()).toBeNull();
    sql.mockResolvedValue([{ token: "owned" }]);
    expect(await claimConstituentCreateLease()).toBeTruthy();
    await releaseConstituentCreateLease("owned");
    expect(sql.mock.calls.at(-1)[0].join(" ")).toContain("AND token =");
  });
});
