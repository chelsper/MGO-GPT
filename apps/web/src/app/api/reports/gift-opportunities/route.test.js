import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), workspace: vi.fn(), access: vi.fn(), sql: vi.fn(), fetch: vi.fn(), gift: vi.fn(), list: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.workspace }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/reportAccess", () => ({ getReportAccessForUser: mocks.access, PORTFOLIO_GIVING_REPORT_KEY: "portfolio-fy-giving" }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
vi.mock("@/app/api/utils/blackbaud", () => ({ blackbaudApiFetch: mocks.fetch, getBlackbaudGift: mocks.gift, listBlackbaudOpportunities: mocks.list }));
import { GET, POST } from "./route";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "test@example.org" } });
  mocks.workspace.mockResolvedValue({ sessionUser: { id: 7 }, workspaceUser: { id: 7 }, isActing: false });
  mocks.access.mockResolvedValue({ canView: true });
  mocks.sql.mockResolvedValue([]);
  mocks.list.mockResolvedValue([]);
  mocks.fetch.mockResolvedValue({ id: "51", constituent_id: "200", status: "Solicitation" });
  mocks.gift.mockResolvedValue({ id: "999", constituent_id: "100", soft_credits: [{ constituent_id: "200" }], date: "2026-08-01", type: "Donation", amount: { value: 20000 }, fund: { description: "Science" } });
});
const post = (extra = {}) => POST(new Request("https://example.org/api/reports/gift-opportunities", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ constituentId: "200", opportunityId: "51", giftId: "999", ...extra }),
}));
const queries = () => mocks.sql.mock.calls.map(([strings]) => strings.join("?")).join("\n");

it("requires sign-in, report permission and own workspace for reads and writes", async () => {
  mocks.auth.mockResolvedValueOnce(null);
  expect((await post()).status).toBe(401);
  mocks.access.mockResolvedValueOnce({ canView: false });
  expect((await post()).status).toBe(403);
  mocks.workspace.mockResolvedValue({ sessionUser: { id: 7 }, workspaceUser: { id: 8 }, isActing: true });
  expect((await GET(new Request("https://example.org/api/reports/gift-opportunities?constituentIds=200"))).status).toBe(403);
  expect((await post()).status).toBe(403);
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.sql).not.toHaveBeenCalled();
});
it("rejects unbounded or invalid lookup requests", async () => {
  expect((await GET(new Request("https://example.org/api/reports/gift-opportunities?constituentIds="))).status).toBe(400);
  expect((await GET(new Request(`https://example.org/api/reports/gift-opportunities?constituentIds=${Array.from({ length: 51 }, (_, i) => i + 1).join(",")}`))).status).toBe(400);
  expect((await post({ opportunityId: "../other" })).status).toBe(400);
  expect(mocks.sql).not.toHaveBeenCalled();
});
it("rechecks the exact constituent and open state before saving", async () => {
  mocks.fetch.mockResolvedValueOnce({ id: "51", constituent_id: "201", status: "Solicitation" });
  expect((await post()).status).toBe(409);
  mocks.fetch.mockResolvedValueOnce({ id: "51", constituent_id: "200", status: "Funded" });
  expect((await post()).status).toBe(409);
  expect(mocks.gift).not.toHaveBeenCalled();
  expect(mocks.sql).not.toHaveBeenCalled();
});
it("rejects a gift unrelated to the chosen constituent", async () => {
  mocks.gift.mockResolvedValueOnce({ constituent_id: "100" });
  expect((await post()).status).toBe(400);
  expect(mocks.sql).not.toHaveBeenCalled();
});
it("links an NXT-only opportunity without creating prospects or changing NXT", async () => {
  const result = await post({ amount: 999999, type: "Invented", fund: "Invented" });
  expect(result.status).toBe(200);
  expect((await result.json()).nxtSync.state).toBe("manual_required");
  expect(queries()).toContain("ON CONFLICT (workspace_user_id, blackbaud_opportunity_id, blackbaud_gift_id)");
  expect(queries()).not.toContain("INSERT INTO prospects");
  expect(mocks.sql.mock.calls[1]).toContain(20000);
  expect(mocks.sql.mock.calls[1]).not.toContain(999999);
  expect(mocks.sql.mock.calls[1]).toContain("Science");
  expect(mocks.fetch).toHaveBeenCalledWith("/opportunity/v1/opportunities/51", expect.objectContaining({ userId: 7, authUserId: 7 }));
  expect(mocks.fetch.mock.calls[0][1].method).toBeUndefined();
});
it("uses the existing local relationship when the opportunity is in Top Prospects", async () => {
  mocks.sql.mockResolvedValueOnce([{ id: 9, constituent_id: 15 }]);
  expect((await post()).status).toBe(200);
  expect(queries()).toContain("ON CONFLICT (prospect_opportunity_id, blackbaud_gift_id)");
  expect(mocks.sql.mock.calls[1]).toContain(9);
});
it("preserves links and returns a safe failure when NXT or DB fails", async () => {
  mocks.fetch.mockRejectedValueOnce(new Error("secret upstream diagnostic"));
  const result = await post();
  expect(result.status).toBe(502);
  expect(JSON.stringify(await result.json())).not.toContain("secret");
  expect(mocks.sql).not.toHaveBeenCalled();
  mocks.sql.mockRejectedValueOnce(new Error("DB unavailable"));
  expect((await post()).status).toBe(502);
});
