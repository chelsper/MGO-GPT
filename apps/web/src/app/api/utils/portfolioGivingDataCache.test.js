import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import sql from "./sql";
import { blackbaudApiFetch, listBlackbaudGifts } from "./blackbaud.js";
import { createPortfolioGivingDataSource, PORTFOLIO_GIVING_CACHE_TTL_MS } from "./portfolioGivingDataCache";
import { getPortfolioSummaryStaleAfter, PORTFOLIO_SUMMARY_TTL_MS } from "./portfolioSummaryFreshness";

vi.mock("./sql", () => ({ default: vi.fn() }));
vi.mock("./blackbaud.js", () => ({ blackbaudApiFetch: vi.fn(), listBlackbaudGifts: vi.fn() }));

const scope = { userId: 7, authUserId: 9, origin: "https://www.jumgogpt.app", constituentId: "123" };
const options = { searchParams: { constituent_id: "123", start_gift_date: "2026-01-01", end_gift_date: "2026-09-03" }, pageLimit: 500, maxPages: 20 };
const gifts = [{ id: "g1", amount: { value: 500 }, soft_credits: [{ constituent_id: "456" }] }];
const lifetime = { constituent_id: "123", total_giving: { value: 1000 } };
let entries;

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-03T16:00:00Z"));
  entries = new Map();
  sql.mockImplementation(async (strings, ...values) => {
    const query = strings.join(" ");
    const offset = query.includes("WITH expired") ? 4 : 0;
    const key = JSON.stringify(values.slice(offset, offset + 3));
    if (query.includes("SELECT payload")) return entries.has(key) ? [{ payload: entries.get(key) }] : [];
    if (query.includes("INSERT INTO")) {
      const entry = JSON.parse(values[offset + 4]);
      if (!entries.has(key) || Date.parse(entries.get(key).fetchedAt) <= Date.parse(entry.fetchedAt)) entries.set(key, entry);
    }
    return [];
  });
  blackbaudApiFetch.mockResolvedValue(lifetime);
  listBlackbaudGifts.mockResolvedValue({ gifts, hasMore: false, pageCount: 1 });
});

afterEach(() => { vi.useRealTimers(); });

describe("shared portfolio giving data", () => {
  it("reuses persisted badge reads from a separately created summary data source", async () => {
    const badges = createPortfolioGivingDataSource(scope);
    await badges.loadLifetimeGiving();
    await badges.listGifts(options);
    const summary = createPortfolioGivingDataSource(scope);
    expect(await summary.loadLifetimeGiving()).toEqual(lifetime);
    expect(await summary.listGifts(options)).toEqual(gifts);
    expect(blackbaudApiFetch).toHaveBeenCalledTimes(1);
    expect(listBlackbaudGifts).toHaveBeenCalledTimes(1);
    expect(listBlackbaudGifts).toHaveBeenCalledWith(expect.objectContaining({
      ...options, includePageMetadata: true, strictResponse: true,
    }));
  });

  it("coalesces overlapping same-worker requests without changing the returned data", async () => {
    let complete;
    listBlackbaudGifts.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const badgeRead = createPortfolioGivingDataSource(scope).listGifts(options);
    const summaryRead = createPortfolioGivingDataSource(scope).listGifts(options);
    await Promise.resolve();
    expect(listBlackbaudGifts).toHaveBeenCalledTimes(1);
    complete({ gifts, hasMore: false, pageCount: 1 });
    expect(await badgeRead).toEqual(await summaryRead);
  });

  it("expires after 24 hours, without extending expiry on a cache hit", async () => {
    const first = createPortfolioGivingDataSource(scope);
    await first.loadLifetimeGiving();
    const expiry = first.freshUntil;
    vi.setSystemTime(Date.now() + PORTFOLIO_GIVING_CACHE_TTL_MS - 1000);
    const reused = createPortfolioGivingDataSource(scope);
    await reused.loadLifetimeGiving();
    expect(reused.freshUntil).toBe(expiry);
    expect(getPortfolioSummaryStaleAfter({ givingDataFreshUntil: reused.freshUntil })).toBe(new Date(Date.now() + PORTFOLIO_SUMMARY_TTL_MS).toISOString());
    vi.setSystemTime(Date.now() + 1000);
    await createPortfolioGivingDataSource(scope).loadLifetimeGiving();
    expect(blackbaudApiFetch).toHaveBeenCalledTimes(2);
  });

  it("bypasses cached data for an explicit manual refresh", async () => {
    await createPortfolioGivingDataSource(scope).loadLifetimeGiving();
    blackbaudApiFetch.mockResolvedValue({ ...lifetime, total_giving: { value: 2000 } });
    await createPortfolioGivingDataSource({ ...scope, forceRefresh: true }).loadLifetimeGiving();
    expect(await createPortfolioGivingDataSource(scope).loadLifetimeGiving()).toMatchObject({ total_giving: { value: 2000 } });
    expect(blackbaudApiFetch).toHaveBeenCalledTimes(2);
  });

  it("does not share data across workspace, connection, constituent, or app origin", async () => {
    for (const overrides of [{}, { userId: 8 }, { authUserId: 10 }, { constituentId: "456" }, { origin: "https://preview.example.com" }]) {
      await createPortfolioGivingDataSource({ ...scope, ...overrides }).loadLifetimeGiving();
    }
    expect(blackbaudApiFetch).toHaveBeenCalledTimes(5);
  });

  it("requires exactly matching date filters and pagination limits", async () => {
    const data = createPortfolioGivingDataSource(scope);
    await data.listGifts(options);
    await data.listGifts({ ...options, searchParams: { constituent_id: "123" } });
    await data.listGifts({ ...options, maxPages: 2 });
    await data.listGifts({ ...options, searchParams: { ...options.searchParams, end_gift_date: "2026-09-04" } });
    expect(listBlackbaudGifts).toHaveBeenCalledTimes(4);
  });

  it("rejects accidentally mismatched or multi-constituent requests", async () => {
    const data = createPortfolioGivingDataSource(scope);
    await expect(data.listGifts({ searchParams: { constituent_id: "456" } })).rejects.toThrow("exact constituent");
    await expect(data.listGifts({ searchParams: { constituent_id: ["123"] } })).rejects.toThrow("exact constituent");
    expect(listBlackbaudGifts).not.toHaveBeenCalled();
  });

  it("caches a genuine empty gift list and zero lifetime giving", async () => {
    listBlackbaudGifts.mockResolvedValue({ gifts: [], hasMore: false, pageCount: 1 });
    blackbaudApiFetch.mockResolvedValue({ total_giving: { value: 0 } });
    for (let i = 0; i < 2; i++) {
      const data = createPortfolioGivingDataSource(scope);
      expect(await data.listGifts(options)).toEqual([]);
      expect(await data.loadLifetimeGiving()).toEqual({ total_giving: { value: 0 } });
    }
    expect(listBlackbaudGifts).toHaveBeenCalledTimes(1);
    expect(blackbaudApiFetch).toHaveBeenCalledTimes(1);
  });

  it.each([null, {}, { gifts, hasMore: true }, { gifts: [null], hasMore: false }])(
    "does not cache a malformed or truncated gift response: %j", async (response) => {
      listBlackbaudGifts.mockResolvedValue(response);
      await expect(createPortfolioGivingDataSource(scope).listGifts(options)).rejects.toThrow("incomplete");
      expect(entries.size).toBe(0);
    },
  );

  it("does not cache a malformed lifetime response", async () => {
    blackbaudApiFetch.mockResolvedValue({});
    await expect(createPortfolioGivingDataSource(scope).loadLifetimeGiving()).rejects.toThrow("malformed");
    expect(entries.size).toBe(0);
  });

  it("returns unusually large successful histories without putting them in the database cache", async () => {
    const largeHistory = { gifts: [{ id: "g1", note: "x".repeat(2 * 1024 * 1024) }], hasMore: false };
    listBlackbaudGifts.mockResolvedValue(largeHistory);
    expect(await createPortfolioGivingDataSource(scope).listGifts(options)).toEqual(largeHistory.gifts);
    expect(entries.size).toBe(0);
  });

  it.each([429, 403, 500])("retains last-good data and propagates an HTTP %i refresh failure", async (httpStatus) => {
    await createPortfolioGivingDataSource(scope).listGifts(options);
    const failure = Object.assign(new Error("Provider paused"), { httpStatus, retryAfterMs: 30_000 });
    listBlackbaudGifts.mockRejectedValue(failure);
    await expect(createPortfolioGivingDataSource({ ...scope, forceRefresh: true }).listGifts(options)).rejects.toBe(failure);
    expect(await createPortfolioGivingDataSource(scope).listGifts(options)).toEqual(gifts);
    expect(listBlackbaudGifts).toHaveBeenCalledTimes(2);
  });

  it("still returns successful live data if the cache database is unavailable", async () => {
    sql.mockRejectedValue(new Error("Cache unavailable"));
    expect(await createPortfolioGivingDataSource(scope).loadLifetimeGiving()).toEqual(lifetime);
    expect(await createPortfolioGivingDataSource(scope).listGifts(options)).toEqual(gifts);
  });

  it("never writes an older read over a newer forced refresh", async () => {
    let completeOld;
    blackbaudApiFetch.mockImplementationOnce(() => new Promise((resolve) => { completeOld = resolve; }));
    const oldRead = createPortfolioGivingDataSource(scope).loadLifetimeGiving();
    await Promise.resolve();
    vi.setSystemTime(Date.now() + 1000);
    const newer = { total_giving: { value: 2000 } };
    blackbaudApiFetch.mockResolvedValue(newer);
    await createPortfolioGivingDataSource({ ...scope, forceRefresh: true }).loadLifetimeGiving();
    completeOld(lifetime);
    await oldRead;
    expect(await createPortfolioGivingDataSource(scope).loadLifetimeGiving()).toEqual(newer);
    expect(sql.mock.calls.some(([strings]) => strings.join(" ").includes("updated_at <= EXCLUDED.updated_at"))).toBe(true);
  });
});

describe("summary refresh schedule", () => {
  it("uses seven days independently of the daily giving cache", () => {
    expect(getPortfolioSummaryStaleAfter({})).toBe(new Date(Date.now() + PORTFOLIO_SUMMARY_TTL_MS).toISOString());
  });
  it("does not let a dependency extend a summary past its normal refresh deadline", () => {
    expect(getPortfolioSummaryStaleAfter({ givingDataFreshUntil: "2027-01-01" })).toBe(new Date(Date.now() + PORTFOLIO_SUMMARY_TTL_MS).toISOString());
  });
});
