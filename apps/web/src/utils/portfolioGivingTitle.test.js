import { expect, it, vi } from "vitest";
import { portfolioGivingTitle } from "./portfolioGivingTitle";
import { getReportDefinition } from "@/app/api/utils/reportRegistry";
it.each([
  ["2026-06-30T12:00:00Z", "My FY26 Portfolio Giving"],
  ["2026-07-01T12:00:00Z", "My FY27 Portfolio Giving"],
  ["2027-07-01T12:00:00Z", "My FY28 Portfolio Giving"],
])("labels the July-to-June fiscal year for %s", (date, title) => {
  expect(portfolioGivingTitle(date)).toBe(title);
});
it("does not freeze the registry title at server startup", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-06-30T12:00:00Z"));
    expect(getReportDefinition("portfolio-fy-giving").title).toBe(
      "My FY26 Portfolio Giving",
    );
    vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
    expect(getReportDefinition("portfolio-fy-giving").title).toBe(
      "My FY27 Portfolio Giving",
    );
  } finally {
    vi.useRealTimers();
  }
});
