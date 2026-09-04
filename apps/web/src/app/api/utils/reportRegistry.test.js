import { describe, expect, it } from "vitest";
import {
  ALUMNI_FAMILY_ENGAGEMENT_REPORT_KEY,
  EXECUTIVE_TEAM_STANDINGS_REPORT_KEY,
  FUTURE_MADE_PHASE_TWO_REPORT_KEY,
  getCustomFieldReportMetadata,
  getReportConfigurationCapabilities,
  getReportDefinition,
  getReportHref,
  getReportTypeDefinitions,
  isReportVisibilitySupported,
  PORTFOLIO_GIVING_REPORT_KEY,
  REPORT_TYPES,
  supportsReportDataConfiguration,
  validateReportConfigurationPayload,
} from "./reportRegistry";

describe("report registry", () => {
  it("classifies each built-in report without changing its canonical route", () => {
    expect(getReportDefinition(EXECUTIVE_TEAM_STANDINGS_REPORT_KEY)).toMatchObject({
      title: "Team Standings",
      href: "/reports/executive-team-standings",
    });
    const alumni = getReportDefinition(ALUMNI_FAMILY_ENGAGEMENT_REPORT_KEY);
    const futureMade = getReportDefinition(FUTURE_MADE_PHASE_TWO_REPORT_KEY);
    const portfolio = getReportDefinition(PORTFOLIO_GIVING_REPORT_KEY);

    expect(alumni).toMatchObject({
      reportType: REPORT_TYPES.QUERY_BASED,
      adapterKey: "alumni-family-dashboard",
      href: "/reports/alumni-family-engagement",
    });
    expect(supportsReportDataConfiguration(alumni)).toBe(true);
    expect(futureMade).toMatchObject({
      reportType: REPORT_TYPES.QUERY_BASED,
      href: "/reports/future-made-phase-ii",
    });
    expect(portfolio).toMatchObject({ reportType: REPORT_TYPES.MGO_GPT, href: "/reports" });
    expect(getReportTypeDefinitions().map((definition) => definition.key)).toEqual([
      REPORT_TYPES.QUERY_BASED,
      REPORT_TYPES.MGO_GPT,
    ]);
  });

  it("does not allow an arbitrary report route or unsupported data configuration", () => {
    const portfolio = getReportDefinition(PORTFOLIO_GIVING_REPORT_KEY);

    expect(getReportHref({ href: "https://example.com" })).toBe("/reports");
    expect(getReportHref({ href: "/reports/custom-field/approved-report" })).toBe(
      "/reports/custom-field/approved-report",
    );
    expect(validateReportConfigurationPayload(portfolio, { dataConfiguration: {} })).toMatch(
      /does not accept data configuration/i,
    );
  });

  it("exposes and enforces each report's safe configuration contract", () => {
    const portfolio = getReportDefinition(PORTFOLIO_GIVING_REPORT_KEY);
    const alumni = getReportDefinition(ALUMNI_FAMILY_ENGAGEMENT_REPORT_KEY);
    const portfolioCapabilities = getReportConfigurationCapabilities(portfolio);
    const alumniCapabilities = getReportConfigurationCapabilities(alumni);

    expect(portfolioCapabilities).toMatchObject({
      canEditTitle: true,
      canEditDescription: true,
      dataConfiguration: null,
      access: {
        mode: "visibility",
        allowedVisibilities: ["all_users", "executive", "specific_users"],
        adminRoleBypass: true,
      },
    });
    expect(alumniCapabilities.dataConfiguration).toBe("alumni_family_dashboard");
    expect(isReportVisibilitySupported(portfolio, "specific_users")).toBe(true);
    expect(isReportVisibilitySupported(portfolio, "disabled")).toBe(false);
    expect(validateReportConfigurationPayload(portfolio, { visibility: "disabled" })).toMatch(
      /access setting is not supported/i,
    );
  });

  it("gives generated custom-field reports controlled metadata", () => {
    const metadata = getCustomFieldReportMetadata("future-made-phase-ii-abc");

    expect(metadata).toMatchObject({
      reportType: REPORT_TYPES.CUSTOM_FIELD,
      configurationSchema: "custom-field-report-v1",
      href: "/reports/custom-field/future-made-phase-ii-abc",
      configurationCapabilities: {
        access: {
          mode: "explicit_users",
          allowedVisibilities: ["specific_users"],
          adminRoleBypass: false,
        },
      },
    });
    expect(getReportDefinition("unknown-report")).toBeNull();
  });
});
