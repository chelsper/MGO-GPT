import { beforeEach, describe, expect, it, vi } from "vitest";

const sqlMock = vi.fn();

function sqlTag(strings, ...values) {
  return sqlMock(strings, ...values);
}

vi.mock("@/app/api/utils/sql", () => ({ default: sqlTag }));

describe("dashboard cache invalidation", () => {
  beforeEach(() => {
    sqlMock.mockReset();
    sqlMock.mockResolvedValue([]);
  });

  it("preserves NXT portfolio snapshots during scheduled dashboard refreshes", async () => {
    const { clearAllDashboardDataCaches } = await import("./userDataCache.js");

    await clearAllDashboardDataCaches();

    expect(sqlMock).toHaveBeenCalledTimes(1);
    const statement = sqlMock.mock.calls[0][0].join(" ");
    expect(statement).toContain("blackbaud_summary_cache = NULL");
    expect(statement).not.toContain("blackbaud_portfolio_cache = NULL");
  });
});
