import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { sql, fetchNxt, list, resolveConstituent, lookup, email, search } = vi.hoisted(() => ({
  sql: vi.fn(), fetchNxt: vi.fn(), list: vi.fn(), resolveConstituent: vi.fn(),
  lookup: vi.fn(), email: vi.fn(), search: vi.fn(),
}));
vi.mock("./sql", () => ({ default: sql }));
vi.mock("./ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("./blackbaud", () => ({
  blackbaudApiFetch: fetchNxt, listBlackbaudOpportunities: list,
  findBlackbaudConstituentByLookupId: lookup, findBlackbaudConstituentByEmail: email,
  searchBlackbaudConstituents: search,
}));
vi.mock("./constituents", () => ({ resolveConstituent }));
vi.mock("./invitations", () => ({ isBootstrapAdminEmail: () => false }));
import { bootstrapMgoPortfolioFromBlackbaud } from "./bootstrapMgoPortfolio";

const context = { userId: 44, authUserId: 1, origin: "https://example.com", force: true };
const user = { id: 44, role: "mgo", name: "Test Fundraiser", blackbaud_constituent_id: "777" };
const opportunity = {
  id: "900", constituent_id: "123", name: "Animation support", purpose: "STEAM",
  fundraisers: [{ constituent_id: "777" }], status: "Solicitation", inactive: false,
  date_added: "2026-08-25T12:00:00Z", expected_date: "2026-12-31", ask_date: "2026-08-12",
  ask_amount: { value: 250000 }, funded_amount: { value: 0 },
};
const text = (call) => call[0].join("");
const inserts = () => sql.mock.calls.filter(call => text(call).includes("INSERT INTO prospect_opportunities"));
let savedOpportunities;
let prospectStatus;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-06T12:00:00Z"));
  vi.clearAllMocks();
  savedOpportunities = new Map();
  prospectStatus = "Active";
  lookup.mockResolvedValue(null);
  list.mockResolvedValue([opportunity]);
  resolveConstituent.mockResolvedValue({ id: 9 });
  fetchNxt.mockImplementation(async path => {
    if (path.startsWith("/constituent/")) return { id: "123", name: "Test Donor" };
    return opportunity;
  });
  sql.mockImplementation(async (strings, ...values) => {
    const query = strings.join("");
    if (query.includes("SELECT *") && query.includes("FROM users")) return [user];
    if (query.includes("SELECT id, status, priority_order")) return [{ id: 7, status: prospectStatus, priority_order: 1 }];
    if (query.includes("MAX(priority_order)")) return [{ max_order: 1 }];
    if (query.includes("FROM prospect_opportunities")) {
      const saved = savedOpportunities.get(values[1]);
      return saved ? [{ id: saved }] : [];
    }
    if (query.includes("INSERT INTO prospect_opportunities")) savedOpportunities.set(values[2], 100 + savedOpportunities.size);
    if (query.includes("FROM prospects")) return [{ id: 7 }];
    return [];
  });
});
afterEach(() => vi.useRealTimers());

describe("NXT opportunity discovery", () => {
  it("imports a current-FY non-campaign opportunity once and reuses its NXT ID on later syncs", async () => {
    expect(await bootstrapMgoPortfolioFromBlackbaud(context)).toMatchObject({ matchedOpportunities: 1, createdOpportunities: 1 });
    expect(inserts()).toHaveLength(1);
    expect(inserts()[0]).toContain("900");
    expect(await bootstrapMgoPortfolioFromBlackbaud(context)).toMatchObject({ createdOpportunities: 0 });
    expect(inserts()).toHaveLength(1);
    expect(sql.mock.calls.some(call => /DELETE\s/i.test(text(call)))).toBe(false);
    expect(fetchNxt.mock.calls.every(call => !call[1].method || call[1].method === "GET")).toBe(true);
  });

  it("does not import old unrelated or closed opportunities alongside an eligible donor", async () => {
    list.mockResolvedValue([
      opportunity,
      { ...opportunity, id: "901", date_added: "2025-08-25T12:00:00Z" },
      { ...opportunity, id: "902", status: "Funded" },
    ]);
    await bootstrapMgoPortfolioFromBlackbaud(context);
    expect(inserts()).toHaveLength(1);
    expect([...savedOpportunities.keys()]).toEqual(["900"]);
  });

  it("still refreshes an already linked older opportunity without reimporting it", async () => {
    savedOpportunities.set("901", 51);
    list.mockResolvedValue([opportunity, { ...opportunity, id: "901", date_added: "2025-08-25T12:00:00Z" }]);
    await bootstrapMgoPortfolioFromBlackbaud(context);
    const updates = sql.mock.calls.filter(call => text(call).includes("UPDATE prospect_opportunities"));
    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain(51);
    expect(text(updates[0])).toContain("pipeline_change_id IS NULL AND opportunity_status <> 'Archived'");
  });

  it("reads detail creation metadata when an otherwise complete list row omits it", async () => {
    list.mockResolvedValue([{ ...opportunity, date_added: undefined }]);
    await bootstrapMgoPortfolioFromBlackbaud(context);
    expect(fetchNxt).toHaveBeenCalledWith("/opportunity/v1/opportunities/900", expect.objectContaining({ userId: 44, authUserId: 1 }));
    expect(inserts()).toHaveLength(1);
  });

  it.each(["unavailable", "missing", "invalid", "different opportunity", "different constituent"])("does not guess entry dates when detail metadata is %s", async mode => {
    list.mockResolvedValue([{ ...opportunity, date_added: undefined }]);
    if (mode === "unavailable") fetchNxt.mockRejectedValueOnce(new Error("Unavailable"));
    else fetchNxt.mockResolvedValueOnce({ ...opportunity,
      ...(mode === "missing" ? { date_added: undefined } : {}),
      ...(mode === "invalid" ? { date_added: "2026-09-31T12:00:00Z" } : {}),
      ...(mode === "different opportunity" ? { id: "901" } : {}),
      ...(mode === "different constituent" ? { constituent_id: "124" } : {}),
    });
    expect(await bootstrapMgoPortfolioFromBlackbaud(context)).toMatchObject({ matchedOpportunities: 0, createdOpportunities: 0 });
    expect(resolveConstituent).not.toHaveBeenCalled();
  });

  it("retains fundraiser scoping", async () => {
    list.mockResolvedValue([{ ...opportunity, fundraisers: [{ constituent_id: "778" }] }]);
    expect(await bootstrapMgoPortfolioFromBlackbaud(context)).toMatchObject({ matchedOpportunities: 0 });
    expect(fetchNxt).not.toHaveBeenCalled();
    expect(inserts()).toHaveLength(0);
  });

  it("does not reactivate an archived prospect", async () => {
    prospectStatus = "Archived";
    await bootstrapMgoPortfolioFromBlackbaud(context);
    expect(inserts()).toHaveLength(0);
    expect(sql.mock.calls.filter(call => text(call).includes("UPDATE prospects"))).toHaveLength(0);
  });

  it("preserves legacy campaign imports while blocking old non-campaign siblings", async () => {
    list.mockResolvedValue([
      { ...opportunity, purpose: "Future. Made. Campaign", date_added: "2020-01-01" },
      { ...opportunity, id: "901", date_added: "2020-01-01" },
    ]);
    await bootstrapMgoPortfolioFromBlackbaud(context);
    expect([...savedOpportunities.keys()]).toEqual(["900"]);
  });
});
