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
      { address_lines: "42", limit: 1000 },
      { search_text: "42 North Main Street", include_inactive: true, strict_search: false, limit: 500 },
      { search_text: "42 n main st", include_inactive: true, strict_search: false, limit: 500 },
    ]);
  });
  it("holds a different name/email with similar address and ZIP+4", async () => {
    api.mockResolvedValueOnce({ results: [] }).mockResolvedValueOnce({ results: [] }).mockResolvedValueOnce({ results: [{ record_id: 8, address_block: "42 N Main St", address_post_code: "32211" }] });
    expect(await check()).toContain("similar address");
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
    expect(api).toHaveBeenCalledTimes(6);
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
  it("does not guess that an old preview checked ZIP and secondary email", async () => {
    await expect(check({ duplicateCheckVersion: undefined })).rejects.toThrow(/new preview/);
    expect(api).not.toHaveBeenCalled();
  });
  it("retains prior attempts even if their original import row was replaced", async () => {
    sql.mockResolvedValue([{ id: 99, input: { firstName: "Different", lastName: "Name", email: "old@example.com" }, created_blackbaud_constituent_id: "777" }]);
    expect(await check({ blackbaudConstituentId: "777" })).toContain("matching NXT ID");
    expect(api).not.toHaveBeenCalled();
    expect(sql.mock.calls[0][0].join(" ")).toContain("FROM constituency_import_create_attempts");
  });
  it("sends a configured name format, never custom text", async () => {
    api.mockResolvedValue({ count: 1, value: [{ id: "5", format: "First Last" }] });
    expect(await configuredNameFormatPayload({ newRecordNameFormats: { addressee: "5" } }, {})).toEqual({ primary_addressee: { custom_format: false, configuration_id: "5" } });
    await expect(configuredNameFormatPayload({ newRecordNameFormats: { addressee: "6" } }, {})).rejects.toThrow(/no longer exists/);
    await expect(configuredNameFormatPayload({ newRecordNameFormats: { addressee: "5" }, nameFormatUpdate: { addressee: "Custom" } }, {})).rejects.toThrow(/not both/);
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
