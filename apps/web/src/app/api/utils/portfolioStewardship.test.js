import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn() }));
vi.mock("./ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("./portfolioContactRefresh", () => ({ isAssignedPortfolioConstituent: vi.fn() }));
import sql from "./sql";
import ensureAppSchema from "./ensureAppSchema";
import { isAssignedPortfolioConstituent } from "./portfolioContactRefresh";
import { checkPortfolioStewardshipScope, readPortfolioStewardship } from "./portfolioStewardship";

const context = { sessionUser: { id: 2, role: "admin" }, workspaceUser: { id: 44, role: "mgo" }, isActing: true };
const scope = { viewerId: "2", workspaceId: "44", constituentId: "100" };
beforeEach(() => { vi.resetAllMocks(); sql.mockResolvedValue([]); isAssignedPortfolioConstituent.mockResolvedValue(true); });

it("checks the exact constituent assignment in the selected portfolio", async () => {
  await checkPortfolioStewardshipScope(context, scope);
  expect(isAssignedPortfolioConstituent).toHaveBeenCalledExactlyOnceWith(44, "100");
  expect(ensureAppSchema).toHaveBeenCalledOnce();
});
it.each(["mgo", "admin", "advancement_services"])("allows a %s's own editable portfolio", async role => {
  const user = { id: 44, role };
  await checkPortfolioStewardshipScope({ sessionUser: user, workspaceUser: user, isActing: false }, { ...scope, viewerId: "44" });
  expect(isAssignedPortfolioConstituent).toHaveBeenCalledOnce();
});
it.each([
  ["executive", { sessionUser: { id: 2, role: "executive" } }, {}],
  ["another MGO", { sessionUser: { id: 2, role: "mgo" } }, {}],
  ["inactive actor", { sessionUser: { id: 2, role: "admin", active: false } }, {}],
  ["inactive workspace", { workspaceUser: { id: 44, role: "mgo", active: false } }, {}],
  ["invalid acting user", { invalidActingUserId: "55" }, {}],
  ["unknown role", { sessionUser: { id: 44, role: "unknown" }, isActing: false }, { viewerId: "44" }],
  ["different viewer", {}, { viewerId: "3" }], ["different workspace", {}, { workspaceId: "45" }],
  ["missing context", {}, { viewerId: null, workspaceId: null }],
  ["invalid constituent", {}, { constituentId: "abc" }], ["overflow ID", {}, { constituentId: "1".repeat(30) }],
])("rejects %s without reading donor details", async (_, ctx, params) => {
  await expect(checkPortfolioStewardshipScope({ ...context, ...ctx }, { ...scope, ...params })).rejects.toMatchObject({ stewardshipScope: true });
  expect(sql).not.toHaveBeenCalled(); expect(isAssignedPortfolioConstituent).not.toHaveBeenCalled();
});
it("rejects an unassigned constituent", async () => {
  isAssignedPortfolioConstituent.mockResolvedValue(false);
  await expect(checkPortfolioStewardshipScope(context, scope)).rejects.toMatchObject({ status: 403 });
});
it("bounds all lists, omits private receipt fields and preserves missing receipt dates", async () => {
  sql.mockResolvedValueOnce(Array.from({ length: 11 }, (_, id) => ({ id })))
    .mockResolvedValueOnce(Array.from({ length: 11 }, (_, id) => ({ id })))
    .mockResolvedValueOnce(Array.from({ length: 6 }, (_, id) => ({ id, received_on: null, item_snapshot: { name: "Fictional keepsake" },
      source_kind: id ? "app" : "nxt_history", source_snapshot: { private: true }, note: "private", recorded_by_name: "private" })));
  const data = await readPortfolioStewardship(context, "100");
  expect(data.requests).toHaveLength(10); expect(data.followUps).toHaveLength(10); expect(data.receivedItems).toHaveLength(5);
  expect(data).toMatchObject({ requestsTruncated: true, followUpsTruncated: true, receivedItemsTruncated: true });
  expect(data.receivedItems[0]).toEqual({ id: 0, name: "Fictional keepsake", receivedOn: null, source: "Imported NXT history" });
  expect(JSON.stringify(data)).not.toContain("private");
});
it.each(["admin", "mgo"])("reads only exact-ID, authorized saved data for %s without writes", async role => {
  await readPortfolioStewardship({ ...context, sessionUser: { id: 2, role } }, "100");
  expect(sql).toHaveBeenCalledTimes(3);
  const queries = sql.mock.calls.map(([parts]) => parts.join("?"));
  expect(queries[0]).toContain("r.owner_user_id = ? AND r.blackbaud_constituent_id = ?");
  expect(queries[0]).toContain("r.source_pending_action_id IS NOT NULL");
  expect(queries[1]).toContain("pa.owner_user_id = ? AND pa.status = 'Open'");
  expect(queries[1]).toContain("pa.category = 'Stewardship'");
  expect(queries[1]).toContain("AND NOT EXISTS (SELECT 1 FROM unnest(identity.ids) id WHERE id <> ?)");
  expect(queries[1]).toContain("c.id = pa.constituent_id");
  expect(queries[1]).toContain("p.id = pa.prospect_id");
  expect(queries[2]).toContain("OR d.owner_user_id=actor.id");
  expect(queries[2]).toContain("OR d.voided_at IS NULL");
  expect(queries[2]).toContain("d.constituent_id=?");
  expect(sql.mock.calls[2].slice(1)).toEqual(expect.arrayContaining([2, role, role === "admin", false, "100"]));
  expect(queries.every(query => !/\b(INSERT|UPDATE|DELETE)\b/.test(query))).toBe(true);
  expect(queries.every(query => !/ILIKE|LOWER\(.*name/.test(query))).toBe(true);
});
it("does not turn a database failure into empty history", async () => {
  sql.mockRejectedValue(new Error("offline"));
  await expect(readPortfolioStewardship(context, "100")).rejects.toThrow("offline");
});
