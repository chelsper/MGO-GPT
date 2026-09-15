import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), schema: vi.fn(), workspace: vi.fn(), fetch: vi.fn(),
  assigned: vi.fn(), read: vi.fn(), save: vi.fn(), claim: vi.fn(), release: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.workspace }));
vi.mock("@/app/api/utils/blackbaud", () => ({
  blackbaudApiFetch: mocks.fetch, isBlackbaudQuotaExceededError: error => error?.quotaPaused === true,
}));
vi.mock("@/app/api/utils/portfolioContactRefresh", async importOriginal => ({
  ...await importOriginal(),
  isAssignedPortfolioConstituent: mocks.assigned, readPortfolioContact: mocks.read,
  savePortfolioContact: mocks.save, claimPortfolioContactGate: mocks.claim, releasePortfolioContactGate: mocks.release,
}));
import { GET } from "./route";
const get = (query = "workspace_id=44&viewer_id=2", id = "100") => GET(
  new Request(`https://example.com/api/blackbaud/constituents/${id}/portfolio-contact?${query}`),
  { params: { constituentId: id } },
);
const contacts = (age = 0) => ({ email: "saved@example.com", phone: null, address: null,
  contactCheckedAt: new Date(Date.now() - age).toISOString() });

describe("portfolio contact-only refresh", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { email: "admin@example.com" } });
    mocks.workspace.mockResolvedValue({ sessionUser: { id: 2 }, workspaceUser: { id: 44 }, isActing: true });
    mocks.assigned.mockResolvedValue(true);
    mocks.read.mockResolvedValue(null);
    mocks.claim.mockResolvedValue({ token: "lease", authUserId: 2, originKey: "origin" });
    mocks.fetch.mockResolvedValue({ id: "100", name: "Donor", email: { address: "new@example.com" } });
  });
  it("uses exactly one bounded constituent GET, separate from summaries/giving", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).contacts.email).toBe("new@example.com");
    expect(mocks.fetch).toHaveBeenCalledExactlyOnceWith("/constituent/v1/constituents/100", {
      userId: 44, authUserId: 2, origin: "https://example.com", timeoutMs: 8000, maxRetries: 0,
    });
    expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ workspaceUserId: 44, authUserId: 2 }),
      expect.objectContaining({ email: "new@example.com", phone: null, address: null }), expect.any(String));
    expect(mocks.release).toHaveBeenCalledWith(expect.objectContaining({ token: "lease" }), 500);
  });
  it("reuses fresh saved contacts, including authoritative empty values", async () => {
    mocks.read.mockResolvedValue({ ...contacts(), email: null });
    expect((await (await get()).json()).status).toBe("fresh");
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("refreshes contacts older than 24 hours", async () => {
    mocks.read.mockResolvedValue(contacts(25 * 3600000));
    expect((await (await get()).json()).status).toBe("updated");
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });
  it("rechecks the cache after acquiring the cross-worker lease", async () => {
    mocks.read.mockResolvedValueOnce(null).mockResolvedValueOnce(contacts());
    expect((await (await get()).json()).status).toBe("fresh");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledTimes(1);
  });
  it("does not start a second request when another worker holds the lease", async () => {
    mocks.claim.mockResolvedValue({ retryAt: "2026-09-15T21:00:00Z" });
    expect((await (await get()).json()).reason).toBe("busy");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(mocks.release).not.toHaveBeenCalled();
  });
  it.each([
    [429, 120000, "throttled"], [503, 0, "unavailable"], [403, 0, "unavailable"],
  ])("preserves saved values and cools down after HTTP %s", async (httpStatus, retryAfterMs, reason) => {
    const saved = contacts(25 * 3600000);
    mocks.read.mockResolvedValue(saved);
    mocks.fetch.mockRejectedValue(Object.assign(new Error("private upstream details"), { httpStatus, retryAfterMs }));
    const response = await get();
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ status: "paused", reason, contacts: saved });
    expect(mocks.save).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledWith(expect.any(Object), Math.max(60000, retryAfterMs));
  });
  it("fails closed when the shared gate database is unavailable", async () => {
    mocks.claim.mockRejectedValue(new Error("database"));
    expect((await get()).status).toBe(503);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("never saves an ID mismatch or searches for another constituent", async () => {
    mocks.fetch.mockResolvedValue({ id: "101", name: "Wrong person" });
    expect((await get()).status).toBe(503);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("does not report a successful save if persistence fails", async () => {
    mocks.save.mockRejectedValue(new Error("database"));
    expect((await get()).status).toBe(503);
  });
  it("requires a signed-in user", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it.each(["workspace_id=45&viewer_id=2", "workspace_id=44&viewer_id=3", ""])("rejects stale or missing workspace scope %s", async query => {
    expect((await get(query)).status).toBe(409);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
  });
  it("requires membership in the server's saved portfolio", async () => {
    mocks.assigned.mockResolvedValue(false);
    expect((await get()).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("uses the MGO's connection in their own workspace", async () => {
    mocks.workspace.mockResolvedValue({ sessionUser: { id: 44 }, workspaceUser: { id: 44 }, isActing: false });
    await get("workspace_id=44&viewer_id=44");
    expect(mocks.fetch).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ userId: 44, authUserId: 44 }));
  });
});
