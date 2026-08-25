import { describe, expect, it } from "vitest";

import {
  DEFAULT_ALUMNI_DONOR_CONFIGURATION,
  getAlumniDonorQueryRows,
  normalizeAlumniDonorConfiguration,
  validateAlumniDonorConfiguration,
} from "./alumniDonorConfiguration";

describe("alumni donor configuration", () => {
  it("provides the configured FY27 and FY26 saved queries by default", () => {
    expect(getAlumniDonorQueryRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ queryId: "30976", label: "FY27 Alumni Giving" }),
        expect.objectContaining({ queryId: "30679", label: "FY26 Alumni Giving" }),
      ]),
    );
    expect(DEFAULT_ALUMNI_DONOR_CONFIGURATION.includeSoftCreditedDonors).toBe(true);
  });

  it("normalizes a custom configuration without losing the saved query rows", () => {
    const configuration = normalizeAlumniDonorConfiguration({
      sourceLabel: "Donors by Degree",
      constituencies: ["Alumni Bachelor's Degree", "Alumni Bachelor's Degree", "Alumni Graduate Degree"],
      rows: [
        {
          label: "FY28 Alumni Giving",
          queryId: 40001,
          queryName: "Alumni Donors FY28",
          fiscalYearStart: "2027-07-01",
          fiscalYearEnd: "2028-06-30",
        },
      ],
    });

    expect(configuration).toMatchObject({
      sourceLabel: "Donors by Degree",
      constituencies: ["Alumni Bachelor's Degree", "Alumni Graduate Degree"],
      rows: [
        expect.objectContaining({
          label: "FY28 Alumni Giving",
          queryId: "40001",
          queryName: "Alumni Donors FY28",
        }),
      ],
    });
  });

  it("rejects duplicate saved query system record IDs", () => {
    expect(
      validateAlumniDonorConfiguration({
        rows: [
          {
            label: "FY27 Alumni Giving",
            queryId: "30976",
            queryName: "Alumni Donors FY27",
          },
          {
            label: "FY27 Duplicate",
            queryId: "30976",
            queryName: "Duplicate",
          },
        ],
      }),
    ).toContain("only once");
  });
});
