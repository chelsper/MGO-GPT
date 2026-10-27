import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn() }));
vi.mock("./ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("./portfolioContactRefresh", () => ({ isAssignedPortfolioConstituent: vi.fn() }));
vi.mock("./constituents", () => ({ createConstituent: vi.fn(), resolveConstituent: vi.fn() }));
vi.mock("./prospectOpportunities", () => ({ getFiscalYearFromExpectedDate: vi.fn(() => 2027) }));
import sql from "./sql";
import ensureAppSchema from "./ensureAppSchema";
import { isAssignedPortfolioConstituent } from "./portfolioContactRefresh";
import { createConstituent, resolveConstituent } from "./constituents";
import { checkPortfolioOpportunityScope, validatePortfolioOpportunity, findPortfolioProspect, readPortfolioOpportunities, ensurePortfolioProspect, readPortfolioProspectSummary } from "./portfolioOpportunityContext";

const context = { sessionUser: { id: 2, role: "admin" }, workspaceUser: { id: 44, role: "mgo" }, isActing: true };
const scope = { viewerId: 2, workspaceId: 44, constituentId: "100" };
const body = { portfolioContext: scope, donorName: "Fictional Donor", blackbaudConstituentId: "100", createNewOpportunity: true,
  opportunityTitle: "Scholarship", opportunityStage: "Cultivation", purpose: "Campaign", askAmount: 25000, expectedDate: "2027-06-01" };
beforeEach(() => { vi.clearAllMocks(); sql.mockReset().mockResolvedValue([]); isAssignedPortfolioConstituent.mockResolvedValue(true); createConstituent.mockResolvedValue({ id: 6 }); });

it("checks assignment in the selected MGO workspace, not the admin's own portfolio", async () => {
  await checkPortfolioOpportunityScope(context, scope);
  expect(isAssignedPortfolioConstituent).toHaveBeenCalledExactlyOnceWith(44, "100");
  expect(ensureAppSchema).toHaveBeenCalledOnce();
});
it("allows an MGO's own workspace", async () => {
  await checkPortfolioOpportunityScope({ ...context, sessionUser: context.workspaceUser, isActing: false }, { ...scope, viewerId: 44 });
  expect(isAssignedPortfolioConstituent).toHaveBeenCalledOnce();
});
it.each([
  ["executive", { sessionUser: { id: 2, role: "executive" } }, {}],
  ["another MGO", { sessionUser: { id: 2, role: "mgo" } }, {}],
  ["inactive MGO", { workspaceUser: { id: 44, role: "mgo", active: false } }, {}],
  ["invalid acting user", { invalidActingUserId: true }, {}],
  ["different workspace", {}, { workspaceId: 45 }], ["different viewer", {}, { viewerId: 3 }],
  ["invalid constituent", {}, { constituentId: "not-a-system-id" }],
])("rejects %s before reading donor records", async (_, ctx, changed) => {
  await expect(checkPortfolioOpportunityScope({ ...context, ...ctx }, { ...scope, ...changed })).rejects.toMatchObject({ portfolioPreflight: true });
  expect(sql).not.toHaveBeenCalled();
  expect(isAssignedPortfolioConstituent).not.toHaveBeenCalled();
});
it("rejects an unassigned constituent", async () => {
  isAssignedPortfolioConstituent.mockResolvedValue(false);
  await expect(checkPortfolioOpportunityScope(context, scope)).rejects.toMatchObject({ status: 403, portfolioPreflight: true });
});
it.each([
  { blackbaudConstituentId: "101" }, { linkedOpportunityId: 1 }, { createNewOpportunity: false }, { createNewConstituent: true },
  { constituentId: 1 }, { attachments: ["file"] }, { attachments: {} }, { jointMgoUserIds: [45] }, { jointMgoUserIds: {} },
  { sharedOpportunityKey: "shared" }, { donorName: " " }, { opportunityStage: "Funded" }, { expectedDate: "bad" },
])("rejects invalid or advanced options before any writes: %j", changes => {
  expect(() => validatePortfolioOpportunity({ ...body, ...changes })).toThrow();
  expect(sql).not.toHaveBeenCalled();
});
it("accepts the narrow create payload", () => expect(() => validatePortfolioOpportunity(body)).not.toThrow());
it("finds only non-archived exact constituent IDs in the selected workspace, never matching names", async () => {
  sql.mockResolvedValueOnce([{ id: 7 }]);
  expect(await findPortfolioProspect(44, "100")).toEqual({ id: 7 });
  const [parts, ...values] = sql.mock.calls[0];
  expect(parts.join("?")).toContain("p.user_id = ?");
  expect(parts.join("?")).toContain("p.status <> 'Archived'");
  expect(parts.join("?")).not.toMatch(/ILIKE|LOWER\(.*name/);
  expect(values).toEqual([44, "100", "100", "100", "100"]);
});
it("bounds the saved list and deduplicates NXT IDs without hiding unlinked app opportunities", async () => {
  sql.mockResolvedValueOnce(Array.from({ length: 51 }, (_, id) => ({ id })));
  expect(await readPortfolioOpportunities(44, "100")).toMatchObject({ truncated: true, opportunities: expect.any(Array) });
  expect(sql.mock.calls[0][0].join("?")).toMatch(/DISTINCT ON[\s\S]*app:[\s\S]*LIMIT 51/);
  expect(sql.mock.calls[0][0].join("?")).toContain("NOT IN ('funded'");
});
it("reuses an existing exact-ID prospect without creating constituents", async () => {
  sql.mockResolvedValueOnce([{ id: 7, constituent_id: 6 }]);
  expect(await ensurePortfolioProspect(44, body)).toEqual({ id: 7, constituent_id: 6 });
  expect(sql).toHaveBeenCalledOnce();
  expect(createConstituent).not.toHaveBeenCalled();
  expect(resolveConstituent).not.toHaveBeenCalled();
});
it.each([true, false])("links the verified NXT opportunity to an app prospect (existing constituent: %s)", async exists => {
  sql.mockResolvedValueOnce([]).mockResolvedValueOnce(exists ? [{ id: 6 }] : []).mockResolvedValueOnce([{ id: 7, constituent_id: 6 }]);
  expect(await ensurePortfolioProspect(44, body)).toEqual({ id: 7, constituent_id: 6 });
  expect(createConstituent).toHaveBeenCalledTimes(exists ? 0 : 1);
  if (!exists) expect(createConstituent).toHaveBeenCalledWith(44, "Fictional Donor", "100");
  expect(sql.mock.calls[2].slice(1)).toEqual([44, 6, "100", "Fictional Donor", 2027, 25000, 44]);
  expect(resolveConstituent).not.toHaveBeenCalled();
});
it("returns scoped saved totals without provider lookups", async () => {
  sql.mockResolvedValueOnce([{ id: 7, portfolio_open_pipeline_amount: 25000 }]);
  expect(await readPortfolioProspectSummary(44, 7)).toMatchObject({ portfolio_open_pipeline_amount: 25000 });
  expect(sql.mock.calls[0].slice(1)).toEqual([7, 44]);
});
