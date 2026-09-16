import { afterEach, beforeEach, expect, it, vi } from "vitest";

const sql = vi.hoisted(() => vi.fn(async strings => strings.join("").includes("FROM blackbaud_connections")
  ? [{ access_token: "test-token" }] : []));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: sql }));
import { getBlackbaudFundraiserById } from "./blackbaud";

const options = { userId: 7, authUserId: 2, origin: "https://example.org", fundraiserId: " 123 " };
const record = { id: "123", type: "Individual", name: "Example MGO", fundraiser_status: "Active", is_solicitor: true };
beforeEach(() => {
  sql.mockClear();
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(record)));
  vi.stubEnv("BLACKBAUD_SUBSCRIPTION_KEY", "test-subscription");
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("verifies the mapped fundraiser through Constituent GET using the signed-in Admin connection", async () => {
  expect(await getBlackbaudFundraiserById(options)).toEqual({ fundraiserId: "123", constituentId: "123",
    name: "Example MGO", fundraiserStatus: "Active", raw: record });
  expect(fetch).toHaveBeenCalledExactlyOnceWith(new URL("https://api.sky.blackbaud.com/constituent/v1/constituents/123"),
    expect.objectContaining({ method: "GET", headers: expect.objectContaining({ Authorization: "Bearer test-token" }) }));
  expect(sql.mock.calls.find(([parts]) => parts.join("").includes("FROM blackbaud_connections")).slice(1)).toEqual([2]);
});
it.each([{}, { id: "999", fundraiser_status: "Active" }, { id: "123" },
  { id: "123", fundraiser_status: "None", is_solicitor: true }])
  ("does not treat a fallback ID or non-fundraiser as verification %j", async payload => {
    fetch.mockResolvedValue(Response.json(payload));
    expect(await getBlackbaudFundraiserById(options)).toBeNull();
  });
it("retains inactive identity for historical reads, without marking it active", async () => {
  fetch.mockResolvedValue(Response.json({ ...record, fundraiser_status: "Inactive" }));
  expect(await getBlackbaudFundraiserById(options)).toMatchObject({ fundraiserId: "123", fundraiserStatus: "Inactive" });
});
it("handles wrapped constituent records without guessing identity", async () => {
  fetch.mockResolvedValue(Response.json({ data: record }));
  expect(await getBlackbaudFundraiserById(options)).toMatchObject({ fundraiserId: "123", fundraiserStatus: "Active" });
});
it("preserves transport errors instead of misreporting a bad mapping", async () => {
  fetch.mockResolvedValue(Response.json({ message: "Forbidden" }, { status: 403 }));
  await expect(getBlackbaudFundraiserById(options)).rejects.toMatchObject({ httpStatus: 403 });
  expect(fetch).toHaveBeenCalledOnce();
});
it("does not call NXT for a missing mapping", async () => {
  expect(await getBlackbaudFundraiserById({ ...options, fundraiserId: "" })).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
