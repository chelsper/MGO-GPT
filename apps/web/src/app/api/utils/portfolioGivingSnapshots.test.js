import { beforeEach, describe, expect, it, vi } from "vitest";
import sql from "./sql";
import { readPortfolioGivingSnapshots, savePortfolioGivingSnapshot, withPortfolioGivingSnapshot } from "./portfolioGivingSnapshots";

vi.mock("./sql", () => ({ default: vi.fn() }));
beforeEach(() => { sql.mockReset().mockResolvedValue([]); });
const payload = { mapped: { lifetimeGiving: { totalGiving: 50 }, annualGivingSocieties: {} }, currentFyGiving: { recognizedReceived: 50 }, warnings: {} };

describe("persisted daily giving", () => {
  it("writes only the separate giving table and guards against older writes", async () => {
    await savePortfolioGivingSnapshot(7, "123", payload, Date.parse("2026-09-03T06:00:00Z"));
    const [strings, ...values] = sql.mock.calls[0];
    expect(strings.join(" ")).toContain("portfolio_giving_snapshots.refreshed_at <= EXCLUDED.refreshed_at");
    expect(strings.join(" ")).not.toContain("portfolio_constituent_snapshots");
    expect(values).toContain("2026-09-04T02:00:00.000Z");
  });

  it.each([{ ...payload, warnings: { gifts: "429" } }, { mapped: {} }, { ...payload, currentFyGiving: null }])(
    "never saves incomplete giving over a valid snapshot", async (bad) => {
      await expect(savePortfolioGivingSnapshot(7, "123", bad, Date.now())).rejects.toThrow("previous giving snapshot");
      expect(sql).not.toHaveBeenCalled();
    },
  );

  it("updates displayed figures without rewriting or redating the narrative", async () => {
    sql.mockResolvedValue([{ constituent_id: "123", payload, refreshed_at: "2026-09-03T06:00:00Z" }]);
    const summary = { summaryRefreshedAt: "2026-09-01T06:00:00Z", mapped: { prospectSummaryNarrative: "Last good narrative", lifetimeGiving: { totalGiving: 40 } } };
    const result = await withPortfolioGivingSnapshot(7, "123", summary);
    expect(result.mapped.lifetimeGiving.totalGiving).toBe(50);
    expect(result.mapped.prospectSummaryNarrative).toBe("Last good narrative");
    expect(result.summaryRefreshedAt).toBe(summary.summaryRefreshedAt);
    expect(sql).toHaveBeenCalledTimes(1);
  });

  it("does not replace manually refreshed figures with an older nightly snapshot", async () => {
    sql.mockResolvedValue([{ constituent_id: "123", payload, refreshed_at: "2026-09-01T06:00:00Z" }]);
    const summary = { summaryRefreshedAt: "2026-09-03T06:00:00Z", mapped: {} };
    expect(await withPortfolioGivingSnapshot(7, "123", summary)).toBe(summary);
  });

  it("scopes reads to the authorized workspace and requested constituent IDs", async () => {
    await readPortfolioGivingSnapshots(7, ["123"]);
    expect(sql.mock.calls[0].slice(1)).toEqual([7, ["123"]]);
  });
});
