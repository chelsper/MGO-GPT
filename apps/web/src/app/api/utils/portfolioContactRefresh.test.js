import { beforeEach, describe, expect, it, vi } from "vitest";
const sql = vi.hoisted(() => vi.fn());
vi.mock("@/app/api/utils/sql", () => ({ default: sql }));
import { claimPortfolioContactGate, mapPortfolioContact, portfolioContactCacheKey,
  readPortfolioContact, releasePortfolioContactGate, savePortfolioContact } from "./portfolioContactRefresh";
const scope = { workspaceUserId: 44, authUserId: 2, constituentId: "100", origin: "https://example.com" };

describe("portfolio contact persistence", () => {
  beforeEach(() => sql.mockReset());
  it("maps valid primary contacts, trims values, and keeps explicit absence", () => {
    expect(mapPortfolioContact({ id: "100", name: "Donor", email: { address: " a@b.com " },
      phone: null, address: { formatted_address: "100 Main Street" } }, "100"))
      .toMatchObject({ id: "100", email: "a@b.com", phone: null, address: "100 Main Street" });
    expect(mapPortfolioContact({ id: "100", name: "Donor" }, "100"))
      .toMatchObject({ email: null, phone: null, address: null });
  });
  it.each([null, {}, { id: "101", name: "Wrong" }, { id: "100", name: "Donor", email: [] },
    { id: "100", name: "Donor", phone: {} }, { id: "100", name: "Donor", address: { line_1: 5 } },
    { id: "100", name: "Donor", email_address: {} }])("rejects malformed contact responses %j", record => {
    expect(() => mapPortfolioContact(record, "100")).toThrow();
  });
  it("isolates contact cache keys by origin and constituent", () => {
    expect(portfolioContactCacheKey(scope.origin, "100")).not.toBe(portfolioContactCacheKey("https://other.com", "100"));
    expect(portfolioContactCacheKey(scope.origin, "100")).not.toBe(portfolioContactCacheKey(scope.origin, "101"));
  });
  it("reads complete contact projections, not full summaries, scoped to workspace/connection", async () => {
    sql.mockResolvedValue([{ constituent: { email: null, phone: null, address: null }, checked_at: "2026-09-15T12:00:00Z" }]);
    expect(await readPortfolioContact(scope)).toMatchObject({ email: null, contactCheckedAt: "2026-09-15T12:00:00.000Z" });
    const [parts, ...values] = sql.mock.calls[0];
    expect(values).toEqual([44, 2, "100", portfolioContactCacheKey(scope.origin, "100"), 44, "100", "100"]);
    expect(parts.join("?")).toContain("jsonb_typeof(constituent -> 'email') IN ('string', 'null')");
    expect(parts.join("?")).toContain("checked_at <= NOW()");
  });
  it("persists contacts with their request timestamp without changing the full summary", async () => {
    sql.mockResolvedValue([]);
    const checkedAt = "2026-09-15T12:00:00Z";
    await savePortfolioContact(scope, { id: "100", email: null, phone: null, address: null }, checkedAt);
    const [parts, ...values] = sql.mock.calls[0];
    expect(values).toContain(checkedAt);
    expect(values).toContain(portfolioContactCacheKey(scope.origin, "100"));
    expect(parts.join("?")).toContain("updated_at <= EXCLUDED.updated_at");
    expect(parts.join("?")).not.toContain("portfolio_constituent_snapshots");
  });
  it("uses an atomic expiring connection lease and token-checked release", async () => {
    sql.mockResolvedValueOnce([{ lease_token: "lease" }]).mockResolvedValueOnce([]);
    const gate = await claimPortfolioContactGate(scope);
    expect(gate.token).toBeTruthy();
    expect(sql.mock.calls[0][0].join("?")).toContain("ON CONFLICT (auth_user_id, origin_key)");
    expect(sql.mock.calls[0][0].join("?")).toContain("next_allowed_at <= NOW()");
    await releasePortfolioContactGate(gate, 120000);
    expect(sql.mock.calls[1].slice(1)).toEqual([120000, 2, gate.originKey, gate.token]);
  });
});
