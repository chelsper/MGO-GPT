import { describe, expect, it, vi } from "vitest";
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: vi.fn() }));
import { refreshFundraisingTracker, trackerQueryParams } from "./fundraisingTracker";
import { newFundraisingTracker, presentFundraisingTracker, trackerFingerprint, TRACKER_DONOR_VERSION } from "@/utils/fundraisingTracker";

const panel = { ...newFundraisingTracker("campaign", true), funds: [{ id: "123", name: "A-Train Campaign" }] };
const now = new Date("2026-10-13T16:00:00Z");
const gift = (id, constituentId, type = "Donation", amount = 100, extra = {}) => ({
  id, constituent_id: constituentId, type, date: "2026-10-01T00:00:00Z", amount: { value: amount },
  gift_splits: [{ id: `${id}01`, fund_id: "123", amount: { value: amount } }], ...extra,
});
const reader = (gifts, names = (ids) => ({ value: ids.map((id) => ({ id, name: `Donor ${id}` })), count: ids.length })) => vi.fn(async (path) => {
  if (path.startsWith("/fundraising/")) return { id: path.split("/").at(-1) };
  if (path.includes("/gift/v1/")) return { value: gifts, count: gifts.length };
  const url = new URL(path, "https://api.sky.blackbaud.com");
  return names(url.searchParams.get("constituent_id").split(","));
});
const run = (read, cached = null, remaining = 2, definition = panel, date = now) => refreshFundraisingTracker({ panel: definition, cached, read,
  budget: { remaining }, user: { id: 1 }, origin: "https://example.test", now: date });
const old = () => ({ key: panel.key, fingerprint: trackerFingerprint(panel), committedCents: 99900, receivedCents: 33300, refreshedAt: "2026-10-12T12:00:00Z" });

describe("campaign donor snapshots", () => {
  it("groups hard-credit giving by system ID, not name, and reconciles pledges/payments without double counting", async () => {
    const read = reader([gift("1", "10", "Pledge", 1000), gift("2", "10", "PledgePayment", 250),
      gift("3", "10", "Donation", 50), gift("4", "20", "Donation", 75), gift("5", "10", "MatchingGiftPledge", 500),
      gift("6", "10", "MatchingGiftPayment", 100), gift("7", "10", "PledgeWriteOff", 50)],
    (ids) => ({ value: ids.map((id) => ({ id, name: "Same Name", email: "not-for-the-dashboard@example.test" })) }));
    const first = await run(read, old());
    expect(first).toMatchObject({ committedCents: 99900, receivedCents: 33300, pending: { phase: "names", nameIndex: 0 } });
    expect(first.donors).toBeUndefined();
    const result = await run(read, first);
    expect(result).toMatchObject({ committedCents: 162500, pledgedCents: 150000, receivedCents: 47500, pending: null, excludedCount: 1 });
    expect(result.donors).toEqual([
      { key: "constituent:10", kind: "constituent", constituentId: "10", name: "Same Name", pledgedCents: 150000, receivedCents: 40000, committedCents: 155000 },
      { key: "constituent:20", kind: "constituent", constituentId: "20", name: "Same Name", pledgedCents: 0, receivedCents: 7500, committedCents: 7500 },
    ]);
    expect(presentFundraisingTracker(panel, result).donors).toEqual(result.donors);
    expect(JSON.stringify(result)).not.toContain("email");
    expect(read).toHaveBeenCalledTimes(3);
    expect(read.mock.calls[2][1]).toEqual({ userId: 1, origin: "https://example.test", maxRetries: 0 });
  });

  it("uses only selected splits and ignores soft-credit names, including refunds", async () => {
    const read = reader([gift("1", "10", "Donation", 100, {
      gift_splits: [{ id: "101", fund_id: "123", amount: { value: 60.25 } }, { id: "102", fund_id: "999", amount: { value: 39.75 } }],
      soft_credits: [{ constituent_id: "30", amount: { value: 100 } }],
    }), gift("2", "10", "Donation", -10.15)]);
    const result = await run(read, null, 3);
    expect(result).toMatchObject({ committedCents: 5010, receivedCents: 5010, pledgedCents: 0 });
    expect(result.donors).toHaveLength(1);
    expect(result.donors[0]).toMatchObject({ constituentId: "10", committedCents: 5010, receivedCents: 5010 });
    expect(read.mock.calls[2][0]).not.toContain("30");
  });

  it("keeps both gift-level and constituent-level anonymous giving private", async () => {
    const read = reader([gift("1", "10", "Donation", 100, { is_anonymous: true }), gift("2", "20", "Pledge", 500),
      gift("3", "30", "Donation", 50), gift("4", "30", "Donation", 25, { is_anonymous: true })],
    (ids) => ({ value: ids.map((id) => ({ id, name: id === "20" ? "Private name" : "Public donor", gives_anonymously: id === "20" })) }));
    const result = await run(read, null, 3);
    expect(result.donors).toEqual([
      { key: "anonymous", kind: "anonymous", constituentId: null, name: "Anonymous giving", pledgedCents: 50000, receivedCents: 12500, committedCents: 62500 },
      { key: "constituent:30", kind: "constituent", constituentId: "30", name: "Public donor", pledgedCents: 0, receivedCents: 5000, committedCents: 5000 },
    ]);
    expect(JSON.stringify(result)).not.toContain("Private name");
    expect(JSON.stringify(result)).not.toContain('"20"');
    const url = new URL(read.mock.calls[2][0], "https://example.test");
    expect(url.searchParams.get("constituent_id")).toBe("20,30");
  });

  it("keeps missing donor identities in reconciled totals without guessing names", async () => {
    const read = reader([gift("1", undefined), gift("2", "20"), gift("3", "30")], () => ({ value: [{ id: "20", name: "" }] }));
    const result = await run(read, null, 3);
    expect(result.donors).toEqual([{ key: "unavailable", kind: "unavailable", constituentId: null, name: "Donor unavailable", pledgedCents: 0, receivedCents: 30000, committedCents: 30000 }]);
    expect(presentFundraisingTracker(panel, result).donorNamesIncomplete).toBe(true);
  });

  it("never scans all constituents and shares the two-call budget across bounded name batches", async () => {
    const read = reader(Array.from({ length: 101 }, (_, index) => gift(String(index + 1), String(index + 101))));
    let result = await run(read, old());
    expect(read).toHaveBeenCalledTimes(2);
    result = await run(read, result);
    expect(read).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({ committedCents: 99900, pending: { nameIndex: 100 } });
    result = await run(read, result);
    expect(read).toHaveBeenCalledTimes(5);
    expect(result).toMatchObject({ pending: null, committedCents: 1010000 });
    expect(result.donors).toHaveLength(101);
    for (const [path] of read.mock.calls.slice(2)) {
      const url = new URL(path, "https://example.test");
      expect(url.pathname).toBe("/constituent/v1/constituents");
      expect(url.searchParams.get("constituent_id").split(",").length).toBeLessThanOrEqual(50);
      expect(url.searchParams.get("limit")).toBe("50");
      expect(url.searchParams.get("include_inactive")).toBe("true");
      expect(url.searchParams.get("include_deceased")).toBe("true");
    }
  });

  it("does not re-read successful gift pages or name batches after throttling", async () => {
    const read = reader(Array.from({ length: 51 }, (_, index) => gift(String(index + 1), String(index + 101))));
    const first = await run(read, null, 3);
    expect(first.pending.nameIndex).toBe(50);
    const failed = vi.fn().mockRejectedValue(Object.assign(new Error("private provider detail"), { httpStatus: 429 }));
    const paused = await run(failed, first);
    expect(paused.pending).toEqual(first.pending);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(paused)).not.toContain("private provider detail");
    const finished = await run(read, paused);
    expect(finished.donors).toHaveLength(51);
    expect(read).toHaveBeenCalledTimes(4);
    expect(read.mock.calls[3][0]).toContain("constituent_id=151");
  });

  it.each([
    { value: [{ id: "999", name: "Unrequested donor" }] },
    { value: [{ id: "10", name: "Name" }, { id: "10", name: "Conflicting name" }] },
    { value: [{ id: "10", name: "Name", gives_anonymously: "true" }] },
    { value: [{ id: "10", name: "Name" }], count: 2 },
    { value: [{ id: "10", name: "Name" }], next_link: "https://evil.test" },
  ])("fails closed on malformed name responses without losing verified revenue: %j", async (payload) => {
    const result = await run(reader([gift("1", "10")], () => payload), null, 3);
    expect(result).toMatchObject({ pending: null, committedCents: 10000, receivedCents: 10000 });
    expect(result.donors).toHaveLength(1);
    expect(result.donors[0]).toMatchObject({ kind: "unavailable", constituentId: null });
    expect(presentFundraisingTracker(panel, result).donorNamesIncomplete).toBe(true);
  });

  it("stops further name calls on a permanent permission error and allows a fresh refresh to recover", async () => {
    const gifts = Array.from({ length: 51 }, (_, index) => gift(String(index + 1), String(index + 101)));
    const read = reader(gifts, () => { throw Object.assign(new Error("sensitive error"), { httpStatus: 403 }); });
    const failed = await run(read, null, 10);
    expect(read).toHaveBeenCalledTimes(3);
    expect(failed.pending).toBeNull();
    expect(failed.donors[0]).toMatchObject({ kind: "unavailable", committedCents: 510000 });
    expect(JSON.stringify(failed)).not.toContain("sensitive error");
    const restored = await run(reader(gifts), failed, 4);
    expect(restored.donors).toHaveLength(51);
    expect(presentFundraisingTracker(panel, restored).donorNamesIncomplete).toBe(false);
  });

  it("skips name reads for excluded gifts, empty results and anonymous-only gifts", async () => {
    for (const gifts of [[], [gift("1", "10", "PlannedGift", 10000)], [gift("1", "10", "Donation", 100, { is_anonymous: true })]]) {
      const read = reader(gifts);
      const result = await run(read);
      expect(result.pending).toBeNull();
      expect(read).toHaveBeenCalledTimes(2);
      expect(result.donorVersion).toBe(TRACKER_DONOR_VERSION);
    }
  });

  it("retains complete donor results on failed gift refreshes and invalidates them for changed funds", async () => {
    const saved = await run(reader([gift("1", "10")]), null, 3);
    const failed = await run(reader([gift("1", "10", "Unknown")]), saved);
    expect(failed.donors).toEqual(saved.donors);
    const changed = await run(reader([gift("1", "10")]), saved, 1, { ...panel, funds: [{ id: "456", name: "Other" }] });
    expect(changed.donors).toBeUndefined();
    expect(changed.committedCents).toBeUndefined();
  });

  it("restarts pre-donor and expired name checkpoints while retaining last-good totals", async () => {
    const partial = await run(reader([gift("1", "10")]), old());
    const legacy = structuredClone(partial);
    delete legacy.pending.donorVersion;
    const read = reader([gift("1", "10")]);
    const restarted = await run(read, legacy, 1);
    expect(read.mock.calls[0][0]).toBe("/fundraising/v1/funds/123");
    expect(restarted).toMatchObject({ committedCents: 99900, pending: { phase: "gifts", rows: 0, nameIndex: 0 } });
    read.mockClear();
    await run(read, partial, 1, panel, new Date("2026-10-15T16:00:00Z"));
    expect(read.mock.calls[0][0]).toBe("/fundraising/v1/funds/123");
  });

  it("aggregates donors across gift pages but never publishes a partial donor list", async () => {
    const next = `https://api.sky.blackbaud.com/gift/v1/gifts?${new URLSearchParams({ ...trackerQueryParams(panel), offset: "1" })}`;
    const read = reader([gift("1", "10")]);
    read.mockImplementationOnce(async () => ({ id: "123" })).mockImplementationOnce(async () => ({ value: [gift("1", "10")], count: 2, next_link: next }));
    const first = await run(read);
    expect(presentFundraisingTracker(panel, first).donors).toBeNull();
    read.mockImplementationOnce(async () => ({ value: [gift("2", "10")], count: 2 }));
    const result = await run(read, first);
    expect(result.donors).toHaveLength(1);
    expect(result.donors[0].receivedCents).toBe(20000);
  });
});
