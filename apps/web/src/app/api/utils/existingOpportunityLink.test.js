import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sql: vi.fn(), remote: vi.fn(), transaction: vi.fn() }));
vi.mock("./sql", () => ({ default: Object.assign(mocks.sql, { transaction: mocks.transaction }) }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: mocks.remote }));
import { candidateOpportunity, loadLinkProspect, listLinkCandidates, linkExistingOpportunity } from "./existingOpportunityLink";
import { isOpportunityEligibleForImport } from "./opportunityImportEligibility";
const prospect = { id: 7, user_id: 44, constituent_id: 6, nxtId: "123", fundraiser_id: "777" };
const remote = { id: "900", constituent_id: "123", name: "Memorial Scholarship", status: "Solicitation", purpose: "College of Law",
  date_added: "2026-03-31T12:47:32.22-05:00", ask_amount: { value: 25000 }, fundraisers: [{ constituent_id: "777" }], inactive: false };
const context = { userId: 44, authUserId: 1, origin: "https://example.com" };
beforeEach(() => {
  vi.clearAllMocks(); mocks.sql.mockResolvedValue([]); mocks.remote.mockResolvedValue({ value: [remote], count: 1 });
  mocks.transaction.mockResolvedValue([[], [], [{ id: 91, already_linked: false }], [], [], []]);
});
it("permits explicit linking of an old undated opportunity without broadening bulk import", () => {
  expect(isOpportunityEligibleForImport(remote, new Date("2026-11-09T12:00:00Z"))).toBe(false);
  expect(candidateOpportunity(remote, prospect)).toMatchObject({ id: "900", estimated_amount: 25000, expected_date: null, opportunity_status: "Active" });
});
it.each([{ status: "Funded" }, { status: "Withdrawn" }, { status: "Declined" }, { status: "Archived" }, { status: "Inactive" }, { status: "Closed" }, { inactive: true }, { funded_amount: { value: 1 } }, { fundraisers: [] }, { fundraisers: [{ constituent_id: "888" }] }])("does not offer closed, inactive or unassigned opportunities: %j", change => {
  expect(candidateOpportunity({ ...remote, ...change }, prospect)).toBeNull();
});
it.each([{ id: "bad" }, { constituent_id: "999" }, { ask_amount: { value: -1 } }, { expected_date: "invalid" }, { inactive: "false" }])("rejects malformed identity or data: %j", change => {
  expect(() => candidateOpportunity({ ...remote, ...change }, prospect)).toThrow();
});
it("preserves a zero ask instead of interpreting it as missing", () => {
  expect(candidateOpportunity({ ...remote, ask_amount: { value: 0 } }, prospect).estimated_amount).toBe(0);
});
it("supports indirect constituent links and does not match names", async () => {
  mocks.sql.mockResolvedValue([{ ...prospect, status: "Active", linked_nxt_id: "123" }]);
  expect(await loadLinkProspect(44, 7)).toMatchObject({ nxtId: "123" });
  expect(mocks.sql.mock.calls[0][0].join("")).toContain("p.user_id =");
  expect(mocks.sql.mock.calls[0]).toContain(44);
});
it.each([null, { status: "Archived" }, { status: "Active", blackbaud_constituent_id: "456", linked_nxt_id: "123", fundraiser_id: "777" },
  { status: "Active", linked_nxt_id: "123" }])("rejects missing, archived, conflicting or unmapped prospects", async row => {
  mocks.sql.mockResolvedValue(row ? [row] : []);
  await expect(loadLinkProspect(44, 7)).rejects.toThrow(); expect(mocks.remote).not.toHaveBeenCalled();
});
it("lists a single constituent on demand with no retry and labels existing links", async () => {
  mocks.sql.mockResolvedValue([{ blackbaud_opportunity_id: "900", prospect_id: 7 }]);
  expect(await listLinkCandidates(context, prospect)).toEqual([expect.objectContaining({ id: "900", linkState: "linked" })]);
  expect(mocks.remote).toHaveBeenCalledWith("/opportunity/v1/opportunities", expect.objectContaining({ method: "GET", maxRetries: 0, searchParams: { constituent_id: "123", limit: 100 } }));
  mocks.sql.mockResolvedValue([{ blackbaud_opportunity_id: "900", prospect_id: 8 }]);
  expect((await listLinkCandidates(context, prospect))[0].linkState).toBe("elsewhere");
});
it.each([{ value: [remote], next_link: "more" }, { value: [remote], count: 2 }, { value: [remote, remote] }, {}])("rejects incomplete or duplicate lists", async payload => {
  mocks.remote.mockResolvedValue(payload);
  await expect(listLinkCandidates(context, prospect)).rejects.toThrow(); expect(mocks.remote).toHaveBeenCalledTimes(1);
});
it("rechecks the selected ID and uses only provider values in an atomic local link", async () => {
  mocks.remote.mockResolvedValue(remote);
  expect(await linkExistingOpportunity(context, prospect, "900")).toEqual({ opportunityId: 91, alreadyLinked: false, expectedDateNeeded: true });
  expect(mocks.remote).toHaveBeenCalledWith("/opportunity/v1/opportunities/900", expect.objectContaining({ method: "GET", maxRetries: 0 }));
  expect(mocks.transaction).toHaveBeenCalledWith(expect.any(Array), { isolationLevel: "ReadCommitted" });
  const queries = mocks.sql.mock.calls.map(call => call[0].join(""));
  expect(queries[0]).toContain("FOR UPDATE");
  expect(queries.join(" ")).toContain("pg_advisory_xact_lock");
  expect(queries.join(" ")).not.toContain("status = 'Active',");
});
it("returns an existing link after a retry without creating another", async () => {
  mocks.remote.mockResolvedValue(remote); mocks.transaction.mockResolvedValue([[], [], [{ id: 91, already_linked: true }]]);
  expect(await linkExistingOpportunity(context, prospect, "900")).toMatchObject({ alreadyLinked: true });
});
it.each([{ id: "901" }, { constituent_id: "456" }, { status: "Funded" }, { fundraisers: [] }])("refuses changed selection before local writes", async change => {
  mocks.remote.mockResolvedValue({ ...remote, ...change });
  await expect(linkExistingOpportunity(context, prospect, "900")).rejects.toThrow();
  expect(mocks.transaction).not.toHaveBeenCalled();
});
it("reports a concurrent local conflict rather than success", async () => {
  mocks.remote.mockResolvedValue(remote); mocks.transaction.mockResolvedValue([[], [], []]);
  await expect(linkExistingOpportunity(context, prospect, "900")).rejects.toThrow(/changed, conflicts/);
});
