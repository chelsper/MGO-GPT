import { afterEach, describe, expect, it, vi } from "vitest";
const provider = vi.hoisted(() => ({ config: vi.fn() }));
vi.mock("./sql", () => ({ default: vi.fn() }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: vi.fn(), getBlackbaudConfig: (...args) => provider.config(...args) }));
import { giftBelongsTo, readSocietySourcePage, replaceAnnualSocieties, validateSocietyNextLink, loadSocietyAnnualGifts, societySourceScope } from "./societyGivingSource";
import { calculateAnnualGivingSocieties, fetchAnnualGivingSocieties } from "./annualGivingSocieties";
import { getDefaultGivingSocietyConfigurations } from "./givingSocietyDefinitions";

const now = new Date("2026-09-23T12:00:00Z");
const raw = { id: "100", constituent_id: "200", type: "Donation", date: "2026-09-17T00:00:00Z", amount: { value: 10342 },
  soft_credits: [{ id: "301", gift_id: "100", constituent_id: "401", amount: { value: 10342 } },
    { id: "302", gift_id: "100", constituent_id: "402", amount: { value: 10342 } }],
  gift_splits: [{ fund_id: "500" }], notes: "must not be stored", receipt: "private" };
const normalize = (overrides = {}, funds = { "500": "Scholarship Fund" }) => readSocietySourcePage({ value: [{ ...raw, ...overrides }] }, "gifts", funds).gifts[0];
const calculate = (gifts, constituentId = "401") => calculateAnnualGivingSocieties({ gifts, constituentId, now });
const config = origin => ({ clientId: "test", redirectUri: process.env.BLACKBAUD_REDIRECT_URI || `${origin || "https://test"}/api/blackbaud/callback`, subscriptionKey: "key" });
provider.config.mockImplementation(config);
afterEach(() => { vi.unstubAllEnvs(); provider.config.mockReset().mockImplementation(config); });

describe("stable society source identity", () => {
  const db = async () => [{ id: "1", connected_at: "2026-01-01" }];
  const scope = origin => societySourceScope({ authUserId: "1", origin, db });
  it("shares the published source across production cron, deployment changes and browser aliases", async () => {
    vi.stubEnv("AUTH_URL", "https://example.app/"); vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("BLACKBAUD_REDIRECT_URI", "");
    const keys = [];
    for (const origin of ["https://old-project.vercel.app", "https://new-project.vercel.app", "https://example.app", "https://www.example.app"]) keys.push(await scope(origin));
    expect(new Set(keys).size).toBe(1);
    expect(provider.config.mock.calls.every(([origin]) => origin === "https://example.app")).toBe(true);
  });
  it("keeps different app, credential, connection and reconnect identities separate", async () => {
    vi.stubEnv("AUTH_URL", "https://example.app"); vi.stubEnv("BLACKBAUD_REDIRECT_URI", "");
    const original = await scope("https://deployment.vercel.app");
    vi.stubEnv("AUTH_URL", "https://sandbox.example.app");
    expect(await scope("https://deployment.vercel.app")).not.toBe(original);
    vi.stubEnv("AUTH_URL", "https://example.app");
    for (const patch of [{ clientId: "different-app" }, { subscriptionKey: "different-subscription" }, { redirectUri: "https://other.app/callback" }]) {
      provider.config.mockReturnValueOnce({ ...config("https://example.app"), ...patch });
      expect(await scope("https://deployment.vercel.app")).not.toBe(original);
    }
    expect(await societySourceScope({ authUserId: "2", origin: "https://example.app", db })).not.toBe(original);
    for (const row of [{ id: "2", connected_at: "2026-01-01" }, { id: "1", connected_at: "2026-02-01" }]) {
      expect(await societySourceScope({ authUserId: "1", origin: "https://example.app", db: async () => [row] })).not.toBe(original);
    }
  });
  it("preserves an explicitly configured callback and never changes OAuth settings", async () => {
    vi.stubEnv("AUTH_URL", ""); vi.stubEnv("BLACKBAUD_REDIRECT_URI", "https://oauth.example.app/callback");
    vi.stubEnv("VERCEL_ENV", "production");
    const before = await scope("https://old.vercel.app");
    vi.stubEnv("AUTH_URL", "https://example.app");
    expect(await scope("https://www.example.app")).toBe(before);
    expect(process.env.BLACKBAUD_REDIRECT_URI).toBe("https://oauth.example.app/callback");
  });
  it.each(["invalid", "https://user:password@example.app", "https://example.app?tenant=other", "https://example.app/#other", "http://example.app"])("fails closed for invalid configured origin %s", async authUrl => {
    vi.stubEnv("AUTH_URL", authUrl); vi.stubEnv("VERCEL_ENV", "production");
    await expect(scope("https://example.app")).rejects.toThrow();
    expect(provider.config).not.toHaveBeenCalled();
  });
  it("never silently uses a changing deployment host in an unconfigured production", async () => {
    vi.stubEnv("AUTH_URL", ""); vi.stubEnv("BLACKBAUD_REDIRECT_URI", ""); vi.stubEnv("VERCEL_ENV", "production");
    await expect(scope("https://new.vercel.app")).rejects.toThrow(/stable application origin/);
  });
  it("does not read the production source from a Vercel preview", async () => {
    vi.stubEnv("AUTH_URL", "https://example.app"); vi.stubEnv("VERCEL_ENV", "preview");
    const read = vi.fn();
    await expect(societySourceScope({ authUserId: "1", origin: "https://preview.vercel.app", db: read })).rejects.toThrow(/preview/);
    expect(read).not.toHaveBeenCalled();
  });
  it("supports a configured local development origin", async () => {
    vi.stubEnv("AUTH_URL", "http://localhost:4000"); vi.stubEnv("VERCEL_ENV", "development");
    await scope("http://localhost:4000");
    expect(provider.config).toHaveBeenCalledWith("http://localhost:4000");
  });
});

describe("complete recognition-aware society data", () => {
  it("qualifies both credited individuals, independently of the direct donor", () => {
    const gift = normalize();
    for (const person of ["401", "402"]) {
      expect(giftBelongsTo(gift, person)).toBe(true);
      expect(calculate([gift], person)).toMatchObject({ receivedRevenueTotal: 0, recognitionCreditTotal: 10342,
        primarySociety: { label: "President's Society" } });
    }
    expect(calculate([gift], "999").societies).toEqual([]);
    expect(calculate([gift], "200")).toMatchObject({ receivedRevenueTotal: 10342, recognitionCreditTotal: 0 });
    expect(gift.notes).toBeUndefined(); expect(gift.receipt).toBeUndefined();
  });
  it("deduplicates repeated gifts, credits and the donor's self-credit", () => {
    const g = normalize({ soft_credits: [...raw.soft_credits, raw.soft_credits[0]] });
    expect(calculate([g, g]).recognitionCreditTotal).toBe(10342);
    expect(calculate([normalize({ constituent_id: "401" })])).toMatchObject({ combinedAnnualGiving: 10342, recognitionCreditTotal: 0 });
  });
  it("uses recipient credit amount, not the donor's full gift or another recipient's share", () => {
    const g = normalize({ soft_credits: [{ constituent_id: "401", amount: { value: 1500 } }, raw.soft_credits[1]] });
    expect(calculate([g])).toMatchObject({ combinedAnnualGiving: 1500, primarySociety: { label: "Order of the Dolphin" } });
  });
  it("honors verified fund exclusions, gift types, and calendar boundaries", () => {
    expect(calculate([normalize({}, { "500": "Credit Card Processing Fee" })]).combinedAnnualGiving).toBe(0);
    expect(calculate([normalize({ type: "Pledge" })]).combinedAnnualGiving).toBe(0);
    expect(calculate([normalize({ date: "2025-12-31" })]).combinedAnnualGiving).toBe(0);
  });
  it.each([
    { value: null }, { value: [{ ...raw, constituent_id: undefined }] },
    { value: [{ ...raw, soft_credits: {} }] }, { value: [{ ...raw, amount: {} }] },
    { value: [{ ...raw, soft_credits: [{ constituent_id: "401", amount: { value: 10 }, gift_id: "999" }] }] },
  ])("rejects incomplete/ambiguous input rather than converting it to zero: %j", (payload) => {
    expect(() => readSocietySourcePage(payload, "gifts", { "500": "Scholarship" })).toThrow();
  });
  it("requires the actual fund mapping, including inactive funds", () => {
    expect(() => normalize({}, {})).toThrow(/fund/);
    expect(readSocietySourcePage({ value: [{ id: "500", description: "Old Fund", inactive: true }] }, "funds").funds).toEqual({ "500": "Old Fund" });
  });
  it("never follows an untrusted pagination host or unrelated endpoint", () => {
    for (const link of ["https://evil.test/gift/v1/gifts", "https://api.sky.blackbaud.com/constituent/v1/constituents", "https://user@api.sky.blackbaud.com/gift/v1/gifts"]) {
      expect(() => validateSocietyNextLink(link, "gifts")).toThrow();
    }
    expect(validateSocietyNextLink("/gift/v1/gifts?offset=500", "gifts")).toContain("offset=500");
  });
  it("uses the complete saved period, not the last gift or donor-filtered list", async () => {
    const listGifts = vi.fn();
    const summary = await fetchAnnualGivingSocieties({ constituentId: "401", now, listGifts,
      loadAnnualGifts: async () => ({ gifts: [normalize()], source: { version: 1, checkedAt: now.toISOString() } }) });
    expect(listGifts).not.toHaveBeenCalled();
    expect(summary.recognitionCreditTotal).toBe(10342);
    expect(summary.recognitionSource.version).toBe(1);
  });
  it("does not replace an unavailable source with a misleading donor-only total", async () => {
    const listGifts = vi.fn();
    await expect(fetchAnnualGivingSocieties({ constituentId: "401", listGifts,
      loadAnnualGifts: async () => { throw new Error("pending"); } })).rejects.toThrow("pending");
    expect(listGifts).not.toHaveBeenCalled();
  });
  it("retains an existing badge during cooldown without a failing normal giving refresh", async () => {
    const previous = calculate([normalize()]);
    const result = await fetchAnnualGivingSocieties({ constituentId: "401", listGifts: vi.fn(),
      loadAnnualGifts: async () => { throw new Error("pending"); }, loadSavedSocieties: async () => previous });
    expect(result).toEqual({ ...previous, refreshPending: true });
  });
  it("retains historical planned gifts, but not obsolete current-year direct/credit data", async () => {
    const definitions = [...getDefaultGivingSocietyConfigurations(), { key: "planned", name: "Heritage", basis: "lifetime", periodBasis: "lifetime", countSources: ["planned_gift"], minimumAmount: 0, displayAlongside: true }];
    const old = { id: "50", constituent_id: "401", type: "PlannedGift", date: "2020-01-01", amount: { value: 50000 } };
    const summary = await fetchAnnualGivingSocieties({ constituentId: "401", now, societyDefinitions: definitions,
      listGifts: async () => [old, { ...raw, constituent_id: "401" }],
      loadAnnualGifts: async () => ({ gifts: [normalize()], source: { version: 1 } }) });
    expect(summary.combinedAnnualGiving).toBe(10342);
    expect(summary.lifetimeSocieties.some((s) => s.key === "planned")).toBe(true);
  });
  it("annual reconciliation preserves lifetime badges and totals exactly", () => {
    const lifetime = { basis: "lifetime", label: "1934 Club", hierarchy: 5 };
    const previous = { lifetimeSocieties: [lifetime], allQualifiedLifetimeSocieties: [lifetime], lifetimeGiving: { committedTotal: 130692 }, primaryLifetimeSociety: lifetime };
    const result = replaceAnnualSocieties(previous, calculate([normalize()]));
    expect(result.societies.map((s) => s.label)).toEqual(["President's Society", "1934 Club"]);
    expect(result.lifetimeGiving).toEqual(previous.lifetimeGiving);
  });
  it("does not drop a future-dated lifetime planned gift when the annual source ends today", async () => {
    const definitions = [...getDefaultGivingSocietyConfigurations(), { key: "planned", name: "Heritage", basis: "lifetime", periodBasis: "lifetime", countSources: ["planned_gift"], minimumAmount: 0, displayAlongside: true }];
    const summary = await fetchAnnualGivingSocieties({ constituentId: "401", now, societyDefinitions: definitions,
      listGifts: async () => [{ id: "900", constituent_id: "401", type: "PlannedGift", date: "2030-01-01", amount: { value: 50000 } }],
      loadAnnualGifts: async () => ({ gifts: [], source: { version: 1 } }) });
    expect(summary.combinedAnnualGiving).toBe(0);
    expect(summary.lifetimeSocieties.some((s) => s.key === "planned")).toBe(true);
  });
  it("scopes completed data to the actual connection, application and reconnect epoch", async () => {
    const first = await societySourceScope({ authUserId: 1, db: async () => [{ id: 1, connected_at: "2026-01-01" }] });
    const second = await societySourceScope({ authUserId: 1, db: async () => [{ id: 1, connected_at: "2026-02-01" }] });
    expect(first).not.toBe(second);
  });
  it("a missing complete source fails closed without making an NXT call", async () => {
    const db = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 1, connected_at: "2026-01-01" }]).mockResolvedValueOnce([]);
    await expect(loadSocietyAnnualGifts({ authUserId: 1, constituentId: "401", startDate: "2026-01-01", endDate: "2026-09-23", db })).rejects.toThrow(/pending/);
  });
});
