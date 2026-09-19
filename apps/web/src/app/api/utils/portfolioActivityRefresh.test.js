import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), claim: vi.fn(), reserve: vi.fn(), release: vi.fn(), seed: vi.fn(), due: vi.fn(), read: vi.fn(), mark: vi.fn(), save: vi.fn(), defer: vi.fn() }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: mocks.fetch, isBlackbaudQuotaExceededError: e => e?.quota === true }));
vi.mock("./portfolioActivityStore", () => ({ claimActivityGate: mocks.claim, reserveActivityCall: mocks.reserve, releaseActivityGate: mocks.release,
  seedActivityQueue: mocks.seed, dueActivityRows: mocks.due, readActivitySeed: mocks.read, markActivitySeeded: mocks.mark, saveActivityResult: mocks.save, deferActivityRow: mocks.defer }));
import { refreshPortfolioActivity } from "./portfolioActivityRefresh";

const options = { origin: "https://example.com", workspaceIds: ["7"], refreshUser: { id: 99, role: "admin" } };
const gate = { origin: options.origin, token: "lease" };
const row = (kind = "gift", extra = {}) => ({ workspace_user_id: 7, origin: options.origin, constituent_id: "100", kind, seed_complete: true, ...extra });
async function run(overrides) {
  const pending = refreshPortfolioActivity({ ...options, ...overrides });
  await vi.runAllTimersAsync();
  return pending;
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-15T12:00:00Z"));
  Object.values(mocks).forEach(fn => fn.mockReset().mockResolvedValue(undefined));
  mocks.claim.mockResolvedValue(gate);
  mocks.reserve.mockResolvedValue(true);
  mocks.save.mockResolvedValue(true);
  mocks.release.mockResolvedValue();
  mocks.due.mockResolvedValue([row()]);
  mocks.fetch.mockResolvedValue({ id: "g", date: "2026-09-14" });
});
afterEach(() => vi.useRealTimers());

it("does not run without a pilot or privileged refresh user", async () => {
  expect((await run({ workspaceIds: [] })).status).toBe("disabled");
  expect((await run({ refreshUser: { id: 99, role: "mgo" } })).status).toBe("disabled");
  expect(mocks.claim).not.toHaveBeenCalled();
});
it("does not read NXT if another worker has the lease", async () => {
  mocks.claim.mockResolvedValue(null);
  expect((await run()).reason).toBe("busy_or_cooldown");
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("uses only a constituent-specific GET with a timeout and no automatic retries", async () => {
  expect(await run()).toMatchObject({ calls: 1, updated: 1 });
  expect(mocks.fetch).toHaveBeenCalledWith("/constituent/v1/constituents/100/givingsummary/latest", {
    userId: 7, authUserId: 99, origin: options.origin, timeoutMs: 8000, maxRetries: 0,
  });
  expect(mocks.save).toHaveBeenCalledWith(row(), { id: "g", date: "2026-09-14", checkedAt: "2026-09-15T12:00:00.000Z" }, 99, gate);
});
const noGiftsError = { httpStatus: 404, blackbaudErrorCode: 404, blackbaudErrorName: "ConstituentDoesNotHaveGifts" };
it.each([null, "2026-09-14T12:00:00Z"])("saves an explicit no-gifts response as verified empty, including after an earlier success (%s)", async checkedAt => {
  const gift = row("gift", { checked_at: checkedAt });
  mocks.due.mockResolvedValue([gift, row("action")]);
  mocks.fetch.mockRejectedValueOnce(noGiftsError).mockResolvedValueOnce({ value: [], count: 0 });
  expect(await run()).toMatchObject({ status: "complete", calls: 2, updated: 2, deferred: 0 });
  expect(mocks.save).toHaveBeenCalledWith(gift, { id: null, date: null, checkedAt: "2026-09-15T12:00:00.000Z" }, 99, gate);
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  expect(mocks.defer).not.toHaveBeenCalled();
});
it.each([
  { httpStatus: 404 },
  { httpStatus: 404, message: "The given constituent does not have any gifts." },
  { ...noGiftsError, blackbaudErrorName: "ConstituentNotFound" },
  { ...noGiftsError, blackbaudErrorCode: "404" },
  { ...noGiftsError, blackbaudErrorCode: 400 },
  { ...noGiftsError, httpStatus: 500 },
  { ...noGiftsError, httpStatus: 403 },
  { ...noGiftsError, httpStatus: 429 },
])("does not clear a previous gift for an unverified or mismatched error: %j", async error => {
  mocks.due.mockResolvedValue([row("gift", { checked_at: "2026-09-14T12:00:00Z" })]);
  mocks.fetch.mockRejectedValue(error);
  expect(await run()).toMatchObject({ calls: 1, updated: 0, deferred: 1 });
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.defer).toHaveBeenCalledTimes(1);
});
it("does not interpret the no-gifts error as an empty action response", async () => {
  mocks.due.mockResolvedValue([row("action")]);
  mocks.fetch.mockRejectedValue(noGiftsError);
  expect(await run()).toMatchObject({ updated: 0, deferred: 1 });
  expect(mocks.save).not.toHaveBeenCalled();
  expect(mocks.defer.mock.calls[0][1].error).toBe("unverified_response");
});
it("does not verify no gifts after the worker loses its save lease", async () => {
  mocks.fetch.mockRejectedValue(noGiftsError);
  mocks.save.mockResolvedValue(false);
  expect(await run()).toMatchObject({ reason: "lease_lost", updated: 0 });
  expect(mocks.release).toHaveBeenCalled();
});
it("enforces the eight-request batch limit", async () => {
  mocks.due.mockResolvedValue(Array.from({ length: 20 }, (_, i) => row("gift", { constituent_id: String(i + 1) })));
  expect(await run()).toMatchObject({ calls: 8, status: "queued" });
  expect(mocks.fetch).toHaveBeenCalledTimes(8);
  expect(mocks.reserve).toHaveBeenCalledTimes(8);
});
it("shares the same eight-call budget across all enrolled portfolios instead of multiplying it", async () => {
  const workspaceIds = ["7", "8", "9", "10", "11"];
  mocks.due.mockResolvedValue(Array.from({ length: 20 }, (_, i) => row("gift", { workspace_user_id: workspaceIds[i % 5], constituent_id: String(i + 1) })));
  expect(await run({ workspaceIds })).toMatchObject({ calls: 8, status: "queued" });
  expect(mocks.seed).toHaveBeenCalledWith(workspaceIds, options.origin);
  expect(mocks.fetch).toHaveBeenCalledTimes(8);
  expect(mocks.reserve).toHaveBeenCalledTimes(8);
  expect(mocks.claim).toHaveBeenCalledTimes(1);
});
it("makes no NXT calls for enrolled accounts without saved assigned constituents", async () => {
  mocks.due.mockResolvedValue([]);
  expect(await run({ workspaceIds: ["12"] })).toMatchObject({ calls: 0, updated: 0 });
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("counts confirmed no-gifts checks against the same request budget", async () => {
  mocks.due.mockResolvedValue(Array.from({ length: 20 }, (_, i) => row("gift", { constituent_id: String(i + 1) })));
  mocks.fetch.mockRejectedValue(noGiftsError);
  expect(await run()).toMatchObject({ calls: 8, updated: 8, deferred: 0, status: "queued" });
  expect(mocks.fetch).toHaveBeenCalledTimes(8);
  expect(mocks.reserve).toHaveBeenCalledTimes(8);
  expect(mocks.save).toHaveBeenCalledTimes(8);
});
it("saves gift amount and action summary using only the existing two requests", async () => {
  mocks.due.mockResolvedValue([row(), row("action")]);
  mocks.fetch.mockResolvedValueOnce({ id: "g", date: "2026-09-14", amount: { value: 250.75 } })
    .mockResolvedValueOnce({ value: [{ id: "a", date: "2026-09-14", summary: "Called about proposal", notes: "omit" }], count: 1 });
  expect(await run()).toMatchObject({ updated: 2, calls: 2 });
  expect(mocks.fetch).toHaveBeenCalledTimes(2);
  expect(mocks.save.mock.calls.map(call => call[1])).toEqual([
    { id: "g", date: "2026-09-14", amount: 250.75, checkedAt: "2026-09-15T12:00:00.000Z" },
    { id: "a", date: "2026-09-14", summary: "Called about proposal", checkedAt: "2026-09-15T12:00:00.500Z" },
  ]);
});
it("can seed richer saved details without any NXT calls", async () => {
  mocks.due.mockResolvedValue([row("action", { seed_complete: false })]);
  mocks.read.mockResolvedValue({ version: 1, fetchedAt: "2026-09-15T10:00:00Z", data: { id: "a", date: "2020-01-01", summary: "Saved call" } });
  expect(await run()).toMatchObject({ reused: 1, calls: 0 });
  expect(mocks.save.mock.calls[0][1]).toMatchObject({ summary: "Saved call", checkedAt: "2026-09-15T10:00:00.000Z" });
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("stops before a request when the shared daily budget is exhausted", async () => {
  mocks.reserve.mockResolvedValue(false);
  expect((await run()).reason).toBe("budget_or_lease");
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.release).toHaveBeenCalled();
});
it("reuses a fresh exact-connection saved result without NXT reads", async () => {
  mocks.due.mockResolvedValue([row("gift", { seed_complete: false })]);
  mocks.read.mockResolvedValue({ version: 1, data: { id: "old", date: "2020-01-01" }, fetchedAt: "2026-09-15T10:00:00Z" });
  expect(await run()).toMatchObject({ reused: 1, calls: 0 });
  expect(mocks.read).toHaveBeenCalledWith(expect.objectContaining({ workspace_user_id: 7 }), 99);
  expect(mocks.save.mock.calls[0][1].checkedAt).toBe("2026-09-15T10:00:00.000Z");
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("does not skip a newer action-write refresh hint when seeding", async () => {
  mocks.due.mockResolvedValue([row("action", { seed_complete: false, requested_at: "2026-09-15T11:00:00Z" })]);
  mocks.read.mockResolvedValue({ version: 1, data: null, fetchedAt: "2026-09-15T10:00:00Z" });
  mocks.fetch.mockResolvedValue({ value: [], count: 0 });
  expect(await run()).toMatchObject({ calls: 1, updated: 1, reused: 0 });
});
it("persists pagination instead of publishing an incomplete latest action", async () => {
  mocks.due.mockResolvedValue([row("action")]);
  mocks.fetch.mockResolvedValue({ count: 2, value: [{ id: "a", date: "2020-01-01" }], next_link: "/constituent/v1/constituents/100/actions?offset=1" });
  expect(await run()).toMatchObject({ deferred: 1, updated: 0 });
  expect(mocks.save).not.toHaveBeenCalled();
  const scan = mocks.defer.mock.calls[0][1].scan;
  mocks.due.mockResolvedValue([row("action", { scan })]);
  mocks.fetch.mockResolvedValue({ count: 2, value: [{ id: "b", date: "2026-09-15" }] });
  expect(await run()).toMatchObject({ updated: 1 });
  expect(mocks.fetch.mock.calls[1][0]).toContain("offset=1");
  expect(mocks.save.mock.calls[0][1].date).toBe("2026-09-15");
});
it("keeps good gift data when an action response is incomplete", async () => {
  mocks.due.mockResolvedValue([row(), row("action")]);
  mocks.fetch.mockResolvedValueOnce({ id: "g", date: "2020-01-01" }).mockResolvedValueOnce({ value: [], count: 10 });
  expect(await run()).toMatchObject({ updated: 1, deferred: 1 });
  expect(mocks.save).toHaveBeenCalledTimes(1);
  expect(mocks.defer.mock.calls[0][1].error).toBe("unverified_response");
});
it.each([{ httpStatus: 429 }, { quota: true }, { httpStatus: 403 }, { httpStatus: 401 }])("pauses the entire worker on throttle/connection failures: %j", async error => {
  mocks.due.mockResolvedValue([row(), row("action")]);
  mocks.fetch.mockRejectedValue({ ...error, retryAfterMs: 172800000 });
  expect((await run()).status).toBe("paused");
  expect(mocks.fetch).toHaveBeenCalledTimes(1);
  expect(mocks.release).toHaveBeenCalledWith(gate, 172800000);
});
it("stops if the worker lost its lease before saving", async () => {
  mocks.save.mockResolvedValue(false);
  expect((await run()).reason).toBe("lease_lost");
});

it("rejects an unsafe or expired persisted cursor before any NXT request", async () => {
  for (const nextPath of ["https://evil.example/actions", "/constituent/v1/constituents/101/actions"]) {
    mocks.due.mockResolvedValue([row("action", { scan: { startedAt: "2026-09-15T10:00:00Z", ids: [], paths: [nextPath], nextPath } })]);
    expect(await run()).toMatchObject({ deferred: 1, updated: 0 });
  }
  mocks.due.mockResolvedValue([row("action", { scan: { startedAt: "2026-09-01T10:00:00Z", ids: [], paths: [] } })]);
  await run();
  expect(mocks.fetch).not.toHaveBeenCalled();
});
