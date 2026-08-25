import { describe, expect, it } from "vitest";
import {
  getVisibleReportConfigurations,
  normalizeReportConfigurationPayload,
} from "@/app/reports/useReportConfigurations";

describe("report configuration client helpers", () => {
  it("preserves the server catalog and exposes only explicitly accessible reports", () => {
    const payload = normalizeReportConfigurationPayload({
      canManage: true,
      configurations: [
        { key: "portfolio-fy-giving", canView: true },
        { key: "hidden-report", canView: false },
        { key: "missing-access" },
      ],
    });

    expect(payload.canManage).toBe(true);
    expect(getVisibleReportConfigurations(payload.configurations)).toEqual([
      { key: "portfolio-fy-giving", canView: true },
    ]);
  });

  it("handles an invalid API body without showing unverified report links", () => {
    expect(normalizeReportConfigurationPayload(null)).toEqual({
      configurations: [],
      canManage: false,
    });
    expect(getVisibleReportConfigurations(null)).toEqual([]);
  });
});
