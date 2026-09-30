import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/auth";
import ensureAppSchema from "@/app/api/utils/ensureAppSchema";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { blackbaudApiFetch, getBlackbaudConfigIssues, listBlackbaudGifts } from "@/app/api/utils/blackbaud";
import { loadSocietyAnnualGifts } from "@/app/api/utils/societyGivingSource";
import { reserveMaintenanceCall } from "@/app/api/utils/portfolioMaintenanceStore";
import { reserveBlackbaudRead } from "@/app/api/utils/blackbaudReadBudget";
vi.mock("@/app/api/utils/portfolioMaintenanceStore", () => ({
  reserveMaintenanceCall: vi.fn(),
}));
vi.mock("@/app/api/utils/societyGivingSource", async (importOriginal) => ({
  ...await importOriginal(), loadSocietyAnnualGifts: vi.fn(),
}));

vi.mock("@/auth", () => ({
  auth: vi.fn(),
}));

vi.mock("@/app/api/utils/ensureAppSchema", () => ({
  default: vi.fn(),
}));

vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: vi.fn(),
}));

vi.mock("@/app/api/utils/sql", () => ({
  default: vi.fn(),
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  blackbaudApiFetch: vi.fn(),
  getBlackbaudConfigIssues: vi.fn(() => []),
  isBlackbaudQuotaExceededError: vi.fn(() => false),
  listBlackbaudGifts: vi.fn(),
  withBlackbaudRequestMetrics: vi.fn(async (callback) =>
    callback({
      callCount: 0,
      totalDurationMs: 0,
      lastEndpoint: null,
      lastHttpStatus: null,
      retryAfterMs: null,
    }),
  ),
}));

const baseArgs = {
  educationRecords: [],
  spouseSummary: null,
  primaryBusinessRelationship: null,
  lifetimeGiving: null,
};

describe("scheduled summary continuation authorization", () => {
  const token = "b45c91db-c757-4f88-9258-5fa5d23f411d";
  const origin = "https://www.jumgogpt.app";
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("PORTFOLIO_MAINTENANCE_CONTINUATION_ENABLED", "true");
    vi.stubEnv("PORTFOLIO_MAINTENANCE_ORIGIN", origin);
    vi.stubEnv("CRON_SECRET", "test-maintenance-secret");
    vi.stubEnv("REPORT_REFRESH_USER_ID", "99");
    getBlackbaudConfigIssues.mockReturnValue([]);
    sql.mockImplementation(async strings => {
      const statement = strings.join(" ");
      if (statement.includes("INNER JOIN blackbaud_connections")) return [{ id: 99, role: "admin" }];
      if (statement.includes("SELECT * FROM users")) return [{ id: 42, active: true }];
      return [];
    });
    reserveMaintenanceCall.mockResolvedValue(false);
    blackbaudApiFetch.mockImplementation(async () => {
      await reserveBlackbaudRead("GET");
      throw new Error("Provider reads must be blocked by the exhausted budget");
    });
  });
  afterEach(() => { vi.unstubAllEnvs(); });

  async function read({ authorized = true, host = origin, workspace = "42", lease = token } = {}) {
    const { GET } = await import("./route.js");
    return GET(new Request(`${host}/api/blackbaud/constituents/123/summary?workspaceUserId=${workspace}&giving_only=1&refresh=1`, {
      headers: {
        "x-mgogpt-portfolio-continuation": lease,
        "x-mgogpt-report-refresh": "scheduled",
        authorization: authorized ? "Bearer test-maintenance-secret" : "Bearer incorrect",
      },
    }), { params: { constituentId: "123" } });
  }

  it.each([
    { authorized: false },
    { host: "https://sandbox.example.com" },
    { lease: "not-a-lease" },
  ])("rejects untrusted continuation requests before data access: %j", async options => {
    expect((await read(options)).status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
    expect(blackbaudApiFetch).not.toHaveBeenCalled();
    expect(reserveMaintenanceCall).not.toHaveBeenCalled();
  });

  it("rejects continuation in preview deployments", async () => {
    vi.stubEnv("VERCEL_ENV", "preview");
    expect((await read()).status).toBe(403);
    expect(sql).not.toHaveBeenCalled();
  });

  it("requires an explicit valid workspace", async () => {
    expect((await read({ workspace: "0" })).status).toBe(400);
    expect(sql).not.toHaveBeenCalled();
  });

  it("enforces the lease budget inside the summary and retains good snapshots", async () => {
    const response = await read();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ providerStatus: 429, quotaPaused: true, retryAfterMs: 600000 });
    expect(reserveMaintenanceCall).toHaveBeenCalledExactlyOnceWith({
      origin, token, workspaceUserId: "42", constituentId: "123",
    });
    expect(sql.mock.calls.some(([s]) => /INSERT INTO portfolio_(giving|constituent)_snapshots/.test(s.join(" ")))).toBe(false);
    expect(listBlackbaudGifts).not.toHaveBeenCalled();
  });
});

function entry(label, dates = {}) {
  return {
    label,
    normalized: label.toLowerCase(),
    start: dates.start || null,
    end: dates.end || null,
  };
}

describe("Blackbaud constituent summary identity language", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getBlackbaudConfigIssues.mockReturnValue([]);
  });

  it("uses gendered alumna language for bachelor's alumni", async () => {
    const { buildIdentitySentence } = await import("./route.js");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Chelsea Santoro", gender: "Female" },
        constituencyEntries: [entry("Alumni - Bachelor's Degree")],
      }),
    ).toBe("Chelsea Santoro is a JU alumna.");
  });

  it("uses Double Dolphin language instead of listing undergraduate and graduate alumni separately", async () => {
    const { buildIdentitySentence } = await import("./route.js");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Jordan Dolphin" },
        constituencyEntries: [
          entry("Alumni - Bachelor's Degree"),
          entry("Alumni - Graduate Degree"),
        ],
      }),
    ).toBe(
      "Jordan Dolphin is a Double Dolphin, having earned both undergraduate and graduate degrees from JU.",
    );
  });

  it("distinguishes current and former employees using active constituency dates", async () => {
    const { buildIdentitySentence } = await import("./route.js");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Leslie Redd" },
        constituencyEntries: [entry("Employee")],
        primaryBusinessRelationship: {
          organizationName: "Jacksonville University",
          position: "Vice President",
        },
      }),
    ).toBe("Leslie Redd is a current JU employee, serving as vice president.");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Former Employee" },
        constituencyEntries: [entry("Employee", { end: "2024-06-30" })],
      }),
    ).toBe("Former Employee previously worked at JU.");
  });

  it("uses Society of Trustees only when there is no active trustee constituency", async () => {
    const { buildIdentitySentence } = await import("./route.js");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Pat Trustee" },
        constituencyEntries: [entry("Former Trustee", { end: "2022-05-31" })],
      }),
    ).toBe("Pat Trustee is a member of JU's Society of Trustees.");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Current Trustee" },
        constituencyEntries: [
          entry("Former Trustee", { end: "2022-05-31" }),
          entry("Trustee"),
        ],
      }),
    ).toBe("Current Trustee currently serves on Jacksonville University's Board of Trustees.");
  });

  it("uses parent dates only when present on the parent constituency", async () => {
    const { buildIdentitySentence } = await import("./route.js");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Parent Current" },
        constituencyEntries: [entry("Parent - Current", { end: "2028" })],
      }),
    ).toBe(
      "Parent Current is the parent of a current JU student expected to graduate in 2028.",
    );

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Parent Former" },
        constituencyEntries: [entry("Parent - Former", { start: "2021" })],
      }),
    ).toBe("Parent Former is the parent of a JU graduate from 2021.");
  });

  it("classifies friends with giving as supporters and friends without giving as prospects", async () => {
    const { buildIdentitySentence } = await import("./route.js");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Giving Friend" },
        constituencyEntries: [entry("Friend")],
        lifetimeGiving: { totalGiving: 250 },
      }),
    ).toBe("Giving Friend is a donor and supporter of JU.");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Prospect Friend" },
        constituencyEntries: [entry("Friend")],
        lifetimeGiving: { totalGiving: 0 },
      }),
    ).toBe("Prospect Friend is currently a prospect.");
  });

  it("does not invent a JU relationship sentence for sparse placeholder records", async () => {
    const { buildIdentitySentence } = await import("./route.js");

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Dolphin Dasher 12 Anonymous" },
        constituencyEntries: [entry("Individual")],
        lifetimeGiving: { totalGiving: 0 },
      }),
    ).toBeNull();

    expect(
      buildIdentitySentence({
        ...baseArgs,
        constituent: { name: "Sparse Record" },
        constituencyEntries: [],
        lifetimeGiving: { totalGiving: 0 },
      }),
    ).toBeNull();
  });

  it("loads only primary contact details when contact_only is requested", async () => {
    auth.mockResolvedValue({ user: { email: "mgo@ju.edu" } });
    ensureAppSchema.mockResolvedValue();
    getWorkspaceUser.mockResolvedValue({
      workspaceUser: { id: 42 },
      sessionUser: { id: 42 },
      isActing: false,
    });
    sql.mockResolvedValue([]);
    blackbaudApiFetch.mockResolvedValue({
      id: "5044931",
      lookup_id: "5044931",
      name: "Armando M. Codina",
      email: { address: "acodina@example.com", primary: true },
      phone: { number: "904-555-0100", primary: true },
      address: {
        formatted_address: "50 Casuarina Concourse, Miami, FL 33143",
        preferred: true,
      },
    });

    const { GET } = await import("./route.js");
    const response = await GET(
      new Request(
        "https://jumgogpt.app/api/blackbaud/constituents/5044931/summary?contact_only=true",
      ),
      { params: { constituentId: "5044931" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      constituentId: "5044931",
      mapped: {
        constituent: {
          email: "acodina@example.com",
          phone: "904-555-0100",
          address: "50 Casuarina Concourse, Miami, FL 33143",
        },
      },
    });
    expect(blackbaudApiFetch).toHaveBeenCalledTimes(1);
  });

  it("loads a lightweight identity and constituency profile for reports", async () => {
    auth.mockResolvedValue({ user: { email: "mgo@ju.edu" } });
    ensureAppSchema.mockResolvedValue();
    getWorkspaceUser.mockResolvedValue({
      workspaceUser: { id: 42 },
      sessionUser: { id: 42 },
      isActing: false,
    });
    sql.mockResolvedValue([]);
    blackbaudApiFetch.mockImplementation(async (path) => {
      if (path.endsWith("/constituentcodes")) {
        return { value: [{ description: "Donor Advised Fund" }] };
      }
      return {
        id: "42933",
        lookup_id: "42933",
        name: "Healy Foundation",
      };
    });

    const { GET } = await import("./route.js");
    const response = await GET(
      new Request(
        "https://jumgogpt.app/api/blackbaud/constituents/42933/summary?report_profile=true",
      ),
      { params: { constituentId: "42933" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      constituentId: "42933",
      mapped: {
        constituent: {
          name: "Healy Foundation",
          constituencies: [{ label: "Donor Advised Fund" }],
          constituencyCodesVerified: true,
        },
      },
    });
    expect(blackbaudApiFetch).toHaveBeenCalledTimes(2);
  });

  it("does not treat an unverified report profile as safe for constituency filtering", async () => {
    auth.mockResolvedValue({ user: { email: "mgo@ju.edu" } });
    ensureAppSchema.mockResolvedValue();
    getWorkspaceUser.mockResolvedValue({
      workspaceUser: { id: 42 },
      sessionUser: { id: 42 },
      isActing: false,
    });
    sql.mockResolvedValue([]);
    blackbaudApiFetch.mockImplementation(async (path) => {
      if (path.endsWith("/constituentcodes")) {
        throw new Error("Constituent codes unavailable");
      }
      return {
        id: "42933",
        lookup_id: "42933",
        name: "Healy Foundation",
      };
    });

    const { GET } = await import("./route.js");
    const response = await GET(
      new Request(
        "https://jumgogpt.app/api/blackbaud/constituents/42933/summary?report_profile=true",
      ),
      { params: { constituentId: "42933" } },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      mapped: {
        constituent: {
          constituencies: [],
          constituencyCodesVerified: false,
        },
      },
      warnings: {
        constituentCodes: "Constituent codes unavailable",
      },
    });
  });

  it.each([{}, { value: null }, { value: [null] }])("does not verify or cache malformed report constituency codes: %j", async codes => {
    auth.mockResolvedValue({ user: { email: "mgo@ju.edu" } });
    ensureAppSchema.mockResolvedValue();
    getWorkspaceUser.mockResolvedValue({ workspaceUser: { id: 42 }, sessionUser: { id: 42 }, isActing: false });
    sql.mockResolvedValue([]);
    blackbaudApiFetch.mockImplementation(async path => path.endsWith("/constituentcodes") ? codes : { id: "42933", name: "Example Foundation" });
    const { GET } = await import("./route.js");
    const response = await GET(new Request("https://jumgogpt.app/api/blackbaud/constituents/42933/summary?report_profile=true&refresh=1"), { params: { constituentId: "42933" } });
    expect((await response.json()).mapped.constituent.constituencyCodesVerified).toBe(false);
    expect(sql.mock.calls.some(([strings]) => strings.join("").includes("INSERT INTO blackbaud_constituent_summary_cache"))).toBe(false);
  });

  it("serves the workspace-level last-good portfolio snapshot without new NXT calls", async () => {
    auth.mockResolvedValue({ user: { email: "mgo@ju.edu" } });
    ensureAppSchema.mockResolvedValue();
    getWorkspaceUser.mockResolvedValue({
      workspaceUser: { id: 42 },
      sessionUser: { id: 42 },
      isActing: false,
    });
    const snapshot = {
      constituentId: "5044931",
      mapped: {
        constituent: { id: "5044931", name: "Cached Prospect" },
        prospectSummaryNarrative: "Last complete summary.",
      },
      warnings: {},
    };
    sql.mockImplementation(async (strings) =>
      String(strings).includes("portfolio_constituent_snapshots")
        ? [{ summary_payload: snapshot }]
        : [],
    );

    const { GET } = await import("./route.js");
    const response = await GET(
      new Request("https://jumgogpt.app/api/blackbaud/constituents/5044931/summary"),
      { params: { constituentId: "5044931" } },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("x-mgogpt-nxt-summary-cache")).toBe(
      "portfolio-snapshot",
    );
    await expect(response.json()).resolves.toEqual(snapshot);
    expect(blackbaudApiFetch).not.toHaveBeenCalled();
  });
});

describe("saved-only donor briefing reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.mockResolvedValue({ user: { email: "mgo@ju.edu" } });
    ensureAppSchema.mockResolvedValue();
    getWorkspaceUser.mockResolvedValue({ workspaceUser: { id: 42 }, sessionUser: { id: 7 }, isActing: true });
    getBlackbaudConfigIssues.mockReturnValue([]);
    sql.mockResolvedValue([]);
  });
  async function read(query = "saved_only=1") {
    const { GET } = await import("./route.js");
    return GET(new Request(`https://jumgogpt.app/api/blackbaud/constituents/100/summary?${query}`), { params: { constituentId: "100" } });
  }
  it("returns an empty saved result on a miss without any NXT requests", async () => {
    getBlackbaudConfigIssues.mockReturnValue(["Connection unavailable"]);
    const response = await read();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ constituentId: "100", mapped: {}, savedOnly: true });
    expect(blackbaudApiFetch).not.toHaveBeenCalled();
    expect(listBlackbaudGifts).not.toHaveBeenCalled();
    expect(sql.mock.calls.some(([strings]) => /INSERT|UPDATE/.test(strings.join("")))).toBe(false);
  });
  it("returns the newer saved snapshot even when both sources have expired", async () => {
    const cached = { constituentId: "100", summaryRefreshedAt: "2020-01-01", mapped: { lifetimeGiving: { totalGiving: 10 } } };
    const snapshot = { ...cached, summaryRefreshedAt: "2020-02-01", mapped: { lifetimeGiving: { totalGiving: 20 } }, raw: { private: "not needed" } };
    sql.mockImplementation(async strings => {
      const query = strings.join("");
      if (query.includes("FROM blackbaud_constituent_summary_cache")) return [{ payload: cached, updated_at: cached.summaryRefreshedAt }];
      if (query.includes("FROM portfolio_constituent_snapshots")) return [{ summary_payload: snapshot }];
      return [];
    });
    const response = await read();
    expect(await response.json()).toEqual({ constituentId: "100", summaryRefreshedAt: "2020-02-01", mapped: snapshot.mapped, savedOnly: true });
    expect(blackbaudApiFetch).not.toHaveBeenCalled();
    const cacheRead = sql.mock.calls.find(([strings]) => strings.join("").includes("FROM blackbaud_constituent_summary_cache"));
    expect(cacheRead.slice(1, 3)).toEqual([42, 7]);
  });
  it.each(["refresh=1", "giving_only=1", "raw=true", "contact_only=true", "report_profile=true"])("rejects incompatible %s without live reads", async flag => {
    expect((await read(`saved_only=1&${flag}`)).status).toBe(400);
    expect(blackbaudApiFetch).not.toHaveBeenCalled();
    expect(listBlackbaudGifts).not.toHaveBeenCalled();
  });
  it("still requires authentication", async () => {
    auth.mockResolvedValue(null);
    expect((await read()).status).toBe(401);
    expect(sql).not.toHaveBeenCalled();
    expect(blackbaudApiFetch).not.toHaveBeenCalled();
  });
});

describe("portfolio badges and summary shared giving reads", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-03T16:00:00Z"));
    loadSocietyAnnualGifts.mockResolvedValue({
      gifts: [{ id: "gift-1", constituent_id: "123", gift_type: "Donation", amount: { value: 1500 }, date: "2026-08-03" }],
      source: { version: 1, checkedAt: "2026-09-03T16:00:00.000Z" },
    });
    auth.mockResolvedValue({ user: { email: "mgo@ju.edu" } });
    getBlackbaudConfigIssues.mockReturnValue([]);
    getWorkspaceUser.mockResolvedValue({
      workspaceUser: { id: 42 }, sessionUser: { id: 42 }, isActing: false,
    });
    const entries = new Map();
    sql.mockImplementation(async (strings, ...values) => {
      const statement = strings.join(" ");
      const offset = statement.includes("WITH expired") ? 4 : 0;
      const key = JSON.stringify(values.slice(offset, offset + 3));
      if (!String(values[offset + 2]).startsWith("portfolio-giving-v1|")) return [];
      if (statement.includes("SELECT payload")) return entries.has(key) ? [{ payload: entries.get(key) }] : [];
      if (statement.includes("INSERT INTO")) entries.set(key, JSON.parse(values[offset + 4]));
      return [];
    });
    blackbaudApiFetch.mockImplementation(async (path) => {
      if (path.endsWith("/lifetimegiving")) {
        return { constituent_id: "123", total_giving: { value: 1500 } };
      }
      if (path.endsWith("/constituents/123")) {
        return { id: "123", name: "Test Prospect" };
      }
      return { value: [] };
    });
    listBlackbaudGifts.mockResolvedValue({
      gifts: [{ id: "gift-1", constituent_id: "123", gift_type: "Donation", amount: { value: 1500 }, date: "2026-08-03" }],
      hasMore: false, pageCount: 1,
    });
  });

  afterEach(() => { vi.useRealTimers(); });

  async function badges() {
    const { GET } = await import("../../../annual-giving-societies/route.js");
    return GET(new Request("https://jumgogpt.app/api/blackbaud/annual-giving-societies?constituentIds=123"));
  }

  async function summary(query = "refresh=1&reuse_giving=1") {
    const { GET } = await import("./route.js");
    return GET(new Request(`https://jumgogpt.app/api/blackbaud/constituents/123/summary?${query}`), { params: { constituentId: "123" } });
  }

  it("uses badge giving data in the stale-only summary job without repeat API calls", async () => {
    const badgeResponse = await badges();
    const badgeData = await badgeResponse.json();
    const summaryResponse = await summary();
    const summaryData = await summaryResponse.json();
    expect(summaryResponse.status).toBe(200);
    expect(summaryData.mapped.annualGivingSocieties).toEqual(badgeData.byConstituentId["123"]);
    expect(summaryData.mapped.lifetimeGiving.totalGiving).toBe(1500);
    expect(listBlackbaudGifts).not.toHaveBeenCalled();
    expect(blackbaudApiFetch.mock.calls.filter(([path]) => path.endsWith("/lifetimegiving"))).toHaveLength(1);
    expect(summaryData.givingDataFreshUntil).toBe("2026-09-04T16:00:00.000Z");
  });

  it("persists a giving-only update without identity, relationship, education or narrative regeneration", async () => {
    const response = await summary("giving_only=1&refresh=1");
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.currentFyGiving.recognizedReceived).toBe(1500);
    expect(payload.mapped.prospectSummaryNarrative).toBeUndefined();
    expect(blackbaudApiFetch.mock.calls.every(([path]) => path.endsWith("/lifetimegiving"))).toBe(true);
    expect(sql.mock.calls.some(([s]) => s.join(" ").includes("INSERT INTO portfolio_giving_snapshots"))).toBe(true);
    expect(sql.mock.calls.some(([s]) => s.join(" ").includes("INSERT INTO portfolio_constituent_snapshots"))).toBe(false);
  });

  it("does not persist a giving snapshot if the FY gift request fails after lifetime data succeeds", async () => {
    listBlackbaudGifts.mockImplementation(async ({ searchParams }) => {
      if (Array.isArray(searchParams.constituent_id)) throw Object.assign(new Error("Rate limited"), { httpStatus: 429, retryAfterMs: 30000 });
      return { gifts: [], hasMore: false };
    });
    const response = await summary("giving_only=1&refresh=1");
    expect(response.status).toBe(429);
    expect((await response.json()).retryAfterMs).toBe(30000);
    expect(sql.mock.calls.some(([s]) => s.join(" ").includes("INSERT INTO portfolio_giving_snapshots"))).toBe(false);
    expect(sql.mock.calls.some(([s]) => s.join(" ").includes("INSERT INTO portfolio_constituent_snapshots"))).toBe(false);
  });

  it("reports a local proposal-query failure without replacing a good giving snapshot", async () => {
    const previousImplementation = sql.getMockImplementation();
    sql.mockImplementation(async (strings, ...values) => {
      if (strings.join(" ").includes("WITH proposals AS")) throw new Error("Local proposal query failed");
      return previousImplementation(strings, ...values);
    });
    const response = await summary("giving_only=1&refresh=1");
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ failureStage: "proposal_summary", providerStatus: null });
    expect(sql.mock.calls.some(([s]) => s.join(" ").includes("INSERT INTO portfolio_giving_snapshots"))).toBe(false);
    expect(sql.mock.calls.some(([s]) => s.join(" ").includes("INSERT INTO portfolio_constituent_snapshots"))).toBe(false);
  });

  it("also lets badge loading reuse data fetched first by a summary", async () => {
    const first = await (await summary()).json();
    const second = await (await badges()).json();
    expect(second.byConstituentId["123"]).toEqual(first.mapped.annualGivingSocieties);
    expect(listBlackbaudGifts).not.toHaveBeenCalled();
    expect(blackbaudApiFetch.mock.calls.filter(([path]) => path.endsWith("/lifetimegiving"))).toHaveLength(1);
  });

  it("still fetches fresh giving data for an individual manual refresh", async () => {
    await badges();
    const response = await summary("refresh=1");
    expect(response.status).toBe(200);
    expect(listBlackbaudGifts).not.toHaveBeenCalled();
    expect(blackbaudApiFetch.mock.calls.filter(([path]) => path.endsWith("/lifetimegiving"))).toHaveLength(2);
  });

  it("keeps the weekly summary deadline separate from older giving data expiry", async () => {
    await badges();
    vi.setSystemTime(new Date("2026-09-03T20:00:00Z"));
    const response = await summary();
    expect((await response.json()).givingDataFreshUntil).toBe("2026-09-04T16:00:00.000Z");
    const snapshotWrite = sql.mock.calls.find(([strings]) => strings.join(" ").includes("INSERT INTO portfolio_constituent_snapshots"));
    expect(snapshotWrite).toContain("2026-09-10T20:00:00.000Z");
    expect(listBlackbaudGifts).not.toHaveBeenCalled();
  });

  it("does not overwrite a good summary when a forced gift-history refresh is incomplete", async () => {
    await summary();
    sql.mockClear();
    loadSocietyAnnualGifts.mockRejectedValue(new Error("Society gift history is incomplete"));
    const response = await summary("refresh=1");
    expect((await response.json()).warnings.annualGivingSocieties).toContain("incomplete");
    expect(sql.mock.calls.some(([strings]) => strings.join(" ").includes("INSERT INTO portfolio_constituent_snapshots"))).toBe(false);
  });
});
