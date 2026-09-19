import { expect, it, vi } from "vitest";
import { portfolioGivingTitle } from "./portfolioGivingTitle";
import { getReportDefinition } from "@/app/api/utils/reportRegistry";
it.each([
  ["2026-06-30T12:00:00Z", "FY26 portfolio giving"],
  ["2026-07-01T12:00:00Z", "FY27 portfolio giving"],
  ["2027-07-01T12:00:00Z", "FY28 portfolio giving"],
])("labels the July-to-June fiscal year for %s", (date, title) => {
  expect(portfolioGivingTitle(date)).toBe(title);
});
it("does not freeze the registry title at server startup", () => {
  vi.useFakeTimers();
  try {
    vi.setSystemTime(new Date("2026-06-30T12:00:00Z"));
    expect(getReportDefinition("portfolio-fy-giving").title).toBe(
      "FY26 portfolio giving",
    );
    vi.setSystemTime(new Date("2026-07-01T12:00:00Z"));
    expect(getReportDefinition("portfolio-fy-giving").title).toBe(
      "FY27 portfolio giving",
    );
  } finally {
    vi.useRealTimers();
  }
});
