// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
const sql = vi.hoisted(() => vi.fn());
vi.mock("@/app/api/utils/sql", () => ({ default: sql }));
import {
  portfolioReportKeys,
  claimPortfolioReport,
  checkpointPortfolioReport,
  publicPortfolioReport,
} from "./portfolioGivingReportStore";
beforeEach(() => {
  sql.mockReset();
  sql.mockResolvedValue([{ report_key: "key" }]);
});
const keys = { snapshot: "saved", job: "job" };
it("isolates snapshots by origin, workspace, fiscal year and fundraiser mapping", () => {
  const user = { id: 7, name: "Example", blackbaud_constituent_id: "700" };
  const base = portfolioReportKeys(user, "https://example.test", {
    startDate: "2026-07-01",
  });
  for (const other of [
    portfolioReportKeys({ ...user, id: 8 }, "https://example.test", {
      startDate: "2026-07-01",
    }),
    portfolioReportKeys(
      { ...user, blackbaud_constituent_id: "800" },
      "https://example.test",
      { startDate: "2026-07-01" },
    ),
    portfolioReportKeys(user, "https://sandbox.test", {
      startDate: "2026-07-01",
    }),
    portfolioReportKeys(user, "https://example.test", {
      startDate: "2027-07-01",
    }),
  ])
    expect(other.snapshot).not.toBe(base.snapshot);
});
it("claims a checkpoint with a revision compare and unexpired-lease exclusion", async () => {
  const claimed = await claimPortfolioReport(
    keys,
    { revision: "old" },
    { id: "job1" },
    100,
  );
  expect(claimed.leaseUntil).toBe(360100);
  const [parts, ...values] = sql.mock.calls[0];
  expect(parts.join(" ")).toContain("ON CONFLICT");
  expect(parts.join(" ")).toContain("leaseUntil");
  expect(values).toContain("old");
  sql.mockResolvedValue([]);
  expect(await claimPortfolioReport(keys, null, {})).toBeNull();
});
it("publishes only through an atomic lease-guarded CTE", async () => {
  expect(
    await checkpointPortfolioReport(
      keys,
      { revision: "lease" },
      { status: "complete" },
      { total: 10 },
    ),
  ).toBe(true);
  const [parts, ...values] = sql.mock.calls[0];
  const query = parts.join(" ");
  expect(query).toContain("WITH finished AS");
  expect(query).toContain("FROM finished");
  expect(query).toContain("leaseUntil");
  expect(values).toContain("lease");
  sql.mockResolvedValue([]);
  expect(
    await checkpointPortfolioReport(keys, { revision: "old-lease" }, {}, {}),
  ).toBe(false);
});
it("keeps refresh internals and unpublished financial data out of the public payload", () => {
  const payload = publicPortfolioReport(
    {
      snapshot: null,
      job: {
        id: "job1",
        status: "pending",
        byConstituentId: { secret: true },
        profiles: { secret: true },
        people: [1],
        givingOffset: 0,
      },
    },
    {},
  );
  expect(payload.snapshot).toBeNull();
  expect(payload.refresh.total).toBe(1);
  expect(JSON.stringify(payload)).not.toContain("secret");
});
