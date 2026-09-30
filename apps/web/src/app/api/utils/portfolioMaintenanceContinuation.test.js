import { describe, expect, it } from "vitest";
import { isPortfolioOvernight, maintenanceContinuationEnabled, maintenanceOrigin } from "./portfolioMaintenanceContinuation";
const env = { VERCEL_ENV: "production", PORTFOLIO_MAINTENANCE_CONTINUATION_ENABLED: "true", PORTFOLIO_MAINTENANCE_ORIGIN: "https://example.org" };
describe("portfolio maintenance rollout", () => {
  it("requires a production opt-in and exact HTTPS origin", () => {
    expect(maintenanceContinuationEnabled(env)).toBe(true);
    for (const value of [{}, { ...env, VERCEL_ENV: "preview" }, { ...env, VERCEL_ENV: "development" },
      { ...env, PORTFOLIO_MAINTENANCE_CONTINUATION_ENABLED: "false" },
      ...["", "http://example.org", "https://user:pass@example.org", "https://example.org/", "https://example.org?x=1"].map(origin => ({ ...env, PORTFOLIO_MAINTENANCE_ORIGIN: origin }))]) {
      expect(maintenanceContinuationEnabled(value)).toBe(false);
    }
    expect(maintenanceOrigin(env)).toBe("https://example.org");
  });
  it.each([
    ["2026-09-30T04:00:00Z", false], ["2026-09-30T05:00:00Z", true],
    ["2026-09-30T10:59:59Z", true], ["2026-09-30T11:00:00Z", false],
    ["2026-11-01T05:30:00Z", true], ["2026-11-01T06:30:00Z", true],
    ["2026-11-01T12:00:00Z", false], ["2027-03-14T07:30:00Z", true],
  ])("uses the Eastern clock through DST: %s", (date, overnight) => {
    expect(isPortfolioOvernight(new Date(date))).toBe(overnight);
  });
});
