import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sql: vi.fn(), fetch: vi.fn() }));
vi.mock("./sql", () => ({ default: mocks.sql }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: mocks.fetch }));
import { loadProspectRecentActivity, normalizeLatestGift, normalizeRecentActions } from "./prospectRecentActivity";
const context = { userId: 4, authUserId: 4, origin: "https://example.com", constituentId: "100" };
const actionResponse = { count: 1, value: [{ id: "a", constituent_id: "100", date: "2026-08-01", summary: "Meeting", type: "Cultivation" }] };
const giftResponse = { id: "g", date: "2026-08-02", amount: { value: 0 }, type: "Gift", funds: [{ description: "Scholarships" }] };
beforeEach(() => {
  vi.resetAllMocks(); mocks.sql.mockResolvedValue([]);
  mocks.fetch.mockImplementation((path) => Promise.resolve(path.endsWith("/actions") ? actionResponse : giftResponse));
});

it("uses two exact single-constituent endpoints and persists normalized values", async () => {
  const response = await loadProspectRecentActivity(context);
  expect(mocks.fetch.mock.calls.map(([path]) => path)).toEqual([
    "/constituent/v1/constituents/100/actions", "/constituent/v1/constituents/100/givingsummary/latest",
  ]);
  expect(response.action.data.summary).toBe("Meeting");
  expect(response.gift.data.amount).toBe(0);
  expect(response.gift.data.funds).toEqual(["Scholarships"]);
  expect(mocks.sql).toHaveBeenCalledTimes(4);
});
it("uses fresh cached sections without new NXT calls", async () => {
  const entry = { version: 1, fetchedAt: new Date().toISOString(), data: { id: "cached" } };
  mocks.sql.mockResolvedValue([{ payload: entry }]);
  const result = await loadProspectRecentActivity(context);
  expect(result.action.stale).toBe(false);
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("retains each stale value independently on 429/403 and never caches the error as no data", async () => {
  const entry = { version: 1, fetchedAt: "2020-01-01T00:00:00Z", data: { id: "last-good" } };
  mocks.sql.mockResolvedValue([{ payload: entry }]);
  mocks.fetch.mockRejectedValue(Object.assign(new Error("private response"), { status: 403 }));
  const result = await loadProspectRecentActivity(context);
  expect(result.action).toMatchObject({ data: { id: "last-good" }, stale: true, unavailable: false });
  expect(result.gift).toMatchObject({ data: { id: "last-good" }, stale: true });
  expect(mocks.sql).toHaveBeenCalledTimes(2);
  expect(JSON.stringify(result)).not.toContain("private response");
});
it("isolates an action failure so the latest gift still loads", async () => {
  mocks.fetch.mockImplementation((path) => path.endsWith("/actions") ? Promise.reject(new Error("429")) : Promise.resolve(giftResponse));
  const result = await loadProspectRecentActivity(context);
  expect(result.action.unavailable).toBe(true);
  expect(result.gift.data.id).toBe("g");
});
it("scopes cache lookup to workspace, connection, origin, and constituent", async () => {
  await loadProspectRecentActivity({ ...context, authUserId: 9 });
  const [parts, ...values] = mocks.sql.mock.calls[0];
  expect(parts.join("?")).toContain("auth_user_id =");
  expect(values).toEqual([4, 9, "100", expect.stringContaining("prospect-activity-v1|action|")]);
  expect(mocks.fetch.mock.calls[0][1].authUserId).toBe(9);
});
it.each([{ value: [], count: 2 }, { value: [], next_link: "private-url" }, { error: "bad" }, { value: [{ id: "a", date: "broken" }] }, { value: [{ id: "a", date: "2026-08-01", constituent_id: "999" }] }])("rejects incomplete or malformed action data %j", (response) => {
  expect(() => normalizeRecentActions(response, "100")).toThrow();
});
it.each([null, "<html>", { message: "error" }, { id: "g", date: "2026-08-02", amount: { value: "" } }, { ...giftResponse, amount: { value: NaN } }])("rejects malformed latest gifts %j", (response) => {
  expect(() => normalizeLatestGift(response)).toThrow();
});
it("distinguishes a successful empty response from failure", () => {
  expect(normalizeRecentActions({ value: [], count: 0 }, "100")).toBeNull();
  expect(normalizeLatestGift({})).toBeNull();
});
