import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { auth } from "@/auth";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import sql from "@/app/api/utils/sql";
import { blackbaudApiFetch } from "@/app/api/utils/blackbaud";
import { GET } from "./route";

vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/blackbaud", () => ({
  blackbaudApiFetch: vi.fn(),
  getBlackbaudConfigIssues: () => [],
  isBlackbaudQuotaExceededError: error => error?.quotaPaused === true,
  listBlackbaudGifts: vi.fn(),
  withBlackbaudRequestMetrics: callback => callback({ callCount: 0, totalDurationMs: 0 }),
}));

const selected = { id: "100", lookup_id: "LOOKUP-100", name: "Alex Example" };
const summary = (id = "100") => ({
  constituentId: id,
  mapped: { constituent: { id, name: "Saved example" } },
  summaryRefreshedAt: new Date().toISOString(),
});
const read = (query = "contact_only=true&refresh=1", id = "100") => GET(
  new Request(`https://example.org/api/blackbaud/constituents/${encodeURIComponent(id)}/summary?${query}`),
  { params: { constituentId: id } },
);
const writes = () => sql.mock.calls.filter(([s]) => /INSERT|UPDATE|DELETE/.test(s.join(" ")));
const loggedErrors = () => console.error.mock.calls.flat().map(value =>
  value instanceof Error ? `${value.message} ${value.stack}` : JSON.stringify(value)).join(" ");

beforeEach(() => {
  vi.resetAllMocks();
  auth.mockResolvedValue({ user: { email: "reviewer@example.org" } });
  getWorkspaceUser.mockResolvedValue({ workspaceUser: { id: 42 }, sessionUser: { id: 42 }, isActing: false });
  sql.mockResolvedValue([]);
  blackbaudApiFetch.mockResolvedValue(selected);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("constituent summary identity boundary", () => {
  it("uses the selected system ID, never competing name or lookup hints", async () => {
    blackbaudApiFetch.mockResolvedValue({ ...selected, id: 100 });
    const response = await read("contact_only=true&refresh=1&lookupId=OTHER&recordId=200&name=Someone%20Else");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ constituentId: "100", mapped: { constituent: { id: 100 } } });
    expect(blackbaudApiFetch).toHaveBeenCalledExactlyOnceWith("/constituent/v1/constituents/100", {
      userId: 42, authUserId: 42, origin: "https://example.org",
    });
    expect(writes()).toHaveLength(1);
  });

  it.each(["", "0", "-1", "1.5", "1e2", "LOOKUP-100", "100/200"])(
    "rejects invalid system ID %j before NXT or cached donor reads", async id => {
      const response = await read("contact_only=true", id);
      expect(response.status).toBe(400);
      expect(blackbaudApiFetch).not.toHaveBeenCalled();
      expect(sql).not.toHaveBeenCalled();
    },
  );

  it.each(["refresh=1", "raw=true", "report_profile=true&refresh=1"])(
    "stops before enrichment or cache writes on a mismatched ID in mode %s", async mode => {
      blackbaudApiFetch.mockResolvedValue({ ...selected, id: "200" });
      const response = await read(mode);
      expect(response.status).toBe(409);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(blackbaudApiFetch).toHaveBeenCalledTimes(1);
      expect(writes()).toHaveLength(0);
    },
  );

  it.each([
    null, {}, [], { name: selected.name }, { lookup_id: "100" },
    { ...selected, id: "200" }, { ...selected, id: "0100" },
    { ...selected, id: true }, { ...selected, id: 100.5 },
    { ...selected, id: Number.MAX_SAFE_INTEGER + 1 },
  ].map(payload => [payload]))("rejects missing, malformed, or different response identity: %j", async payload => {
    blackbaudApiFetch.mockResolvedValue(payload);
    const response = await read();
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      code: "NXT_CONSTITUENT_IDENTITY_MISMATCH", failureStage: "constituent_identity",
      providerStatus: null,
    });
    expect(blackbaudApiFetch).toHaveBeenCalledTimes(1);
    expect(writes()).toHaveLength(0);
  });

  it.each([
    ["first unrelated result", [{ id: "200", name: "Unrelated person" }]],
    ["duplicate names", [{ id: "200", name: selected.name }, { id: "300", name: selected.name }]],
    ["matching lookup hint on a different record", [{ id: "200", lookup_id: selected.lookup_id }]],
  ])("never recovers a missing selected record using %s", async (_label, matches) => {
    blackbaudApiFetch.mockImplementation(async path => {
      if (path.endsWith("/100")) throw Object.assign(new Error("private provider detail"), { httpStatus: 404 });
      if (path.endsWith("/search")) return { value: matches };
      return { id: "200", name: selected.name };
    });
    const response = await read(`contact_only=true&refresh=1&lookupId=${selected.lookup_id}&name=Alex%20Example`);
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ providerStatus: 404, failureStage: "constituent_retrieval" });
    expect(blackbaudApiFetch).toHaveBeenCalledTimes(1);
    expect(writes()).toHaveLength(0);
  });

  it.each([401, 403, 500, 503, null])("preserves sanitized provider status %s without searching or leaking details", async status => {
    blackbaudApiFetch.mockRejectedValue(Object.assign(new Error("secret-token donor-private-payload"),
      status ? { httpStatus: status } : {}));
    const response = await read("contact_only=true&refresh=1&name=Alex");
    expect(response.status).toBe(status === 401 || status === 403 ? 403 : 502);
    const payload = await response.json();
    expect(payload).toMatchObject({ providerStatus: status, failureStage: "constituent_retrieval" });
    expect(JSON.stringify(payload)).not.toMatch(/secret-token|donor-private-payload/);
    expect(loggedErrors()).not.toMatch(/secret-token|donor-private-payload/);
    expect(blackbaudApiFetch).toHaveBeenCalledTimes(1);
    expect(writes()).toHaveLength(0);
  });

  it("retains token-renewal stage and retry timing without the private provider error", async () => {
    blackbaudApiFetch.mockRejectedValue(Object.assign(new Error("private OAuth response"), {
      httpStatus: 503, stage: "blackbaud_auth", connectionRetryable: true, retryAfterMs: 600000,
    }));
    const response = await read();
    expect(await response.json()).toMatchObject({ failureStage: "blackbaud_auth", providerStatus: 503,
      connectionRetryable: true, retryAfterMs: 600000, quotaPaused: false });
    expect(response.headers.get("Retry-After")).toBe("600");
    expect(loggedErrors()).not.toContain("private OAuth response");
    expect(writes()).toHaveLength(0);
  });

  it.each([false, true])("keeps the existing throttle/backoff contract (quota pause: %s)", async quotaPaused => {
    blackbaudApiFetch.mockRejectedValue(Object.assign(new Error("Requests paused"), {
      httpStatus: 429, retryAfterMs: 30000, quotaPaused,
    }));
    const response = await read("contact_only=true&name=Alex");
    expect(response.status).toBe(quotaPaused ? 503 : 429);
    expect(await response.json()).toMatchObject({ providerStatus: 429, retryAfterMs: 30000, quotaPaused });
    expect(response.headers.get("Retry-After")).toBe("30");
    expect(blackbaudApiFetch).toHaveBeenCalledTimes(1);
    expect(writes()).toHaveLength(0);
  });

  it("does not replace saved data when an explicit refresh cannot verify the donor", async () => {
    sql.mockResolvedValue([{ payload: summary(), summary_payload: summary(), updated_at: new Date().toISOString() }]);
    blackbaudApiFetch.mockResolvedValue({ ...selected, id: "200" });
    expect((await read()).status).toBe(409);
    expect(writes()).toHaveLength(0);
  });
});

describe("cached summary identity boundary", () => {
  function cachedSources(cached, snapshot) {
    sql.mockImplementation(async strings => {
      const query = strings.join(" ");
      if (query.includes("FROM blackbaud_constituent_summary_cache"))
        return cached ? [{ payload: cached, updated_at: new Date().toISOString() }] : [];
      if (query.includes("FROM portfolio_constituent_snapshots"))
        return snapshot ? [{ summary_payload: snapshot }] : [];
      return [];
    });
  }

  it.each([
    summary("200"),
    { ...summary(), mapped: { constituent: { id: "200", name: "Wrong person" } } },
    { ...summary("200"), mapped: { constituent: selected } },
    { mapped: { constituent: { name: "No identity" } } },
    { ...summary(), mapped: { constituent: { id: "" } } },
    { ...summary(), mapped: { constituent: { id: true } } },
    { ...summary(), constituentId: "0100" },
  ])("does not serve a cache entry with unverified identity: %j", async cached => {
    cachedSources(cached, null);
    const response = await read("contact_only=true");
    expect(response.status).toBe(200);
    expect(response.headers.get("X-MGOGPT-NXT-Summary-Cache")).toBe("miss");
    expect(await response.json()).toMatchObject({ constituentId: "100", mapped: { constituent: { id: "100" } } });
    expect(blackbaudApiFetch).toHaveBeenCalledTimes(1);
  });

  it("retains a matching cache entry without a new provider read", async () => {
    cachedSources(summary(), null);
    const response = await read("contact_only=true");
    expect(response.headers.get("X-MGOGPT-NXT-Summary-Cache")).toBe("hit");
    expect(blackbaudApiFetch).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });

  it("uses the matching portfolio snapshot when the keyed cache is mismatched", async () => {
    cachedSources(summary("200"), summary());
    const response = await read("");
    expect(response.headers.get("X-MGOGPT-NXT-Summary-Cache")).toBe("portfolio-snapshot");
    expect(await response.json()).toMatchObject({ constituentId: "100" });
    expect(blackbaudApiFetch).not.toHaveBeenCalled();
  });

  it("rejects a mismatched portfolio snapshot on the normal live-capable path", async () => {
    cachedSources(null, summary("200"));
    blackbaudApiFetch.mockRejectedValue(Object.assign(new Error("NXT not available"), { httpStatus: 503 }));
    const response = await read("");
    expect(response.status).toBe(502);
    expect(blackbaudApiFetch).toHaveBeenCalledTimes(1);
    expect(writes()).toHaveLength(0);
  });

  it("returns a saved miss, without live reads or cache deletion, if neither identity matches", async () => {
    cachedSources(summary("200"), summary("300"));
    const response = await read("saved_only=1");
    expect(await response.json()).toEqual({ constituentId: "100", mapped: {}, savedOnly: true });
    expect(blackbaudApiFetch).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });

  it("does not treat legacy cache entries with no IDs as verified", async () => {
    cachedSources({ mapped: { constituent: { name: "Unknown identity" } } }, { mapped: { lifetimeGiving: { totalGiving: 100 } } });
    const response = await read("saved_only=1");
    expect(await response.json()).toEqual({ constituentId: "100", mapped: {}, savedOnly: true });
    expect(blackbaudApiFetch).not.toHaveBeenCalled();
  });

  it("keeps older saved summaries with one explicit matching ID and no conflicting ID", async () => {
    cachedSources(null, { constituentId: "100", mapped: { lifetimeGiving: { totalGiving: 100 } } });
    expect(await (await read("saved_only=1")).json()).toMatchObject({ constituentId: "100", savedOnly: true,
      mapped: { lifetimeGiving: { totalGiving: 100 } } });
    expect(blackbaudApiFetch).not.toHaveBeenCalled();
  });
});
