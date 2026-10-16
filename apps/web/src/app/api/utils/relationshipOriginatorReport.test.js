import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("./sql", () => ({ default: vi.fn() }));
vi.mock("./getOrCreateUser", () => ({ default: vi.fn() }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: vi.fn(), getBlackbaudFundraiserById: vi.fn(),
  listBlackbaudConstituentCustomFieldCategories: vi.fn(), listBlackbaudConstituentCustomFieldCategoryValues: vi.fn() }));
vi.mock("./portfolioGivingDataCache", () => ({ createPortfolioGivingDataSource: vi.fn() }));
vi.mock("./reportCache", () => ({ getCachedReportSnapshot: vi.fn(), saveReportSnapshot: vi.fn() }));
import { buildOriginatorReport, refreshOriginatorReport } from "./relationshipOriginatorReport";
let args, db, readFields, lookup, dataSource;
beforeEach(() => {
  db = vi.fn(async parts => parts.join("").includes("FROM users") ?
    [{ id: 1, name: "Ada", active: true, blackbaud_constituent_id: "101" }] : []);
  readFields = vi.fn().mockResolvedValue([]);
  lookup = vi.fn().mockResolvedValue({ name: "Ada Fundraiser" });
  dataSource = vi.fn().mockReturnValue({ freshUntil: "2099-01-01", listGifts: vi.fn().mockResolvedValue([]) });
  args = { user: { id: 1 }, origin: "https://app.example", db, readFields, lookup, dataSource };
});
const field = { category: "Relationship Originator", parent_id: "200", id: "71", value: "Ada Fundraiser", date: "2020-01-01" };
it("does not scan gifts or fundraiser profiles when there are no tags", async () => {
  const result = await buildOriginatorReport(args);
  expect(result.rows[0]).toMatchObject({ lifetimeCount: 0, lifetimeGiving: 0 });
  expect(readFields).toHaveBeenCalledWith(expect.any(String), expect.any(Object), { category: "Relationship Originator", include_count: false });
  expect(dataSource).not.toHaveBeenCalled(); expect(lookup).not.toHaveBeenCalled();
});
it("counts existing NXT tags without portfolio membership and fetches gifts only for each unique constituent", async () => {
  readFields.mockResolvedValue([field, field]);
  dataSource.mockReturnValue({ listGifts: vi.fn().mockResolvedValue([
    { id: "10", constituent_id: "200", date: "2020-01-01", amount: { value: 100 }, type: "Cash" },
  ]), freshUntil: "2099-01-01" });
  const result = await buildOriginatorReport(args);
  expect(result.rows[0]).toMatchObject({ lifetimeCount: 1, lifetimeGiving: 100 });
  expect(dataSource).toHaveBeenCalledTimes(1);
  expect(dataSource).toHaveBeenCalledWith(expect.objectContaining({ constituentId: "200", authUserId: 1 }));
});
it("reports attribution issues without guessing an origin date or making gift calls", async () => {
  readFields.mockResolvedValue([{ ...field, date: null }]);
  const result = await buildOriginatorReport(args);
  expect(result.issues).toHaveLength(1); expect(result.rows[0].lifetimeCount).toBe(0);
  expect(dataSource).not.toHaveBeenCalled();
});
it("recognizes existing NXT first/last-name entries using the same verified identity rules as saving", async () => {
  readFields.mockResolvedValue([field]);
  lookup.mockResolvedValue({ name: "Ada M. Fundraiser", raw: { first: "Ada", last: "Fundraiser" } });
  const result = await buildOriginatorReport(args);
  expect(result.rows[0].lifetimeCount).toBe(1);
  expect(result.issues).toEqual([]);
});
it("does not assign credit when two linked NXT identities share the shorter table name", async () => {
  args.db = vi.fn(async parts => parts.join("").includes("FROM users") ? [
    { id: 1, name: "Ada M", active: true, blackbaud_constituent_id: "101" },
    { id: 2, name: "Ada R", active: false, blackbaud_constituent_id: "102" },
  ] : []);
  readFields.mockResolvedValue([field]);
  lookup.mockImplementation(async ({ fundraiserId }) => ({ name: fundraiserId === "101" ? "Ada M. Fundraiser" : "Ada R. Fundraiser", raw: { first: "Ada", last: "Fundraiser" } }));
  const result = await buildOriginatorReport(args);
  expect(result.rows[0].lifetimeCount).toBe(0);
  expect(result.issues).toEqual([{ constituentId: "200", reason: "Originator name needs an Admin match" }]);
  expect(dataSource).not.toHaveBeenCalled();
});
it("does not return partial totals when a gift page fails", async () => {
  readFields.mockResolvedValue([field]);
  dataSource.mockReturnValue({ listGifts: vi.fn().mockRejectedValue(new Error("incomplete")) });
  await expect(buildOriginatorReport(args)).rejects.toThrow("incomplete");
});
it("keeps the prior snapshot on a provider failure and releases the refresh lock", async () => {
  const save = vi.fn(), build = vi.fn().mockRejectedValue(new Error("429"));
  const previous = { rows: [{ lifetimeGiving: 50 }], generatedAt: "old" };
  const lockDb = vi.fn().mockResolvedValue([{ token: "lock" }]);
  const result = await refreshOriginatorReport({ ...args, db: lockDb, build, save, load: vi.fn().mockResolvedValue(previous) });
  expect(result).toMatchObject({ ...previous, refreshWarning: expect.any(String) }); expect(save).not.toHaveBeenCalled();
  expect(lockDb.mock.calls.at(-1)[0].join("")).toContain("DELETE");
});
it("prevents overlapping refreshes and does not publish after a lost lock", async () => {
  const build = vi.fn().mockResolvedValue({ rows: [] }), save = vi.fn();
  await expect(refreshOriginatorReport({ ...args, db: vi.fn().mockResolvedValue([]), build, save })).rejects.toThrow("already refreshing");
  expect(build).not.toHaveBeenCalled();
  const db = vi.fn().mockResolvedValueOnce([{ token: "lock" }]).mockResolvedValue([]);
  await expect(refreshOriginatorReport({ ...args, db, build, save, load: vi.fn().mockResolvedValue(null) })).rejects.toThrow("timed out");
  expect(save).not.toHaveBeenCalled();
});
it("publishes only complete results", async () => {
  const save = vi.fn(), result = { rows: [], generatedAt: "new" };
  await refreshOriginatorReport({ ...args, db: vi.fn().mockResolvedValue([{ token: "lock" }]),
    build: vi.fn().mockResolvedValue(result), save });
  expect(save).toHaveBeenCalledWith("report:relationship-originators:v1", result);
});
