import { describe, expect, it } from "vitest";

import {
  DEFAULT_ALUMNI_DONOR_CONFIGURATION,
  getAlumniDonorCountRows,
  normalizeAlumniDonorConfiguration,
  validateAlumniDonorConfiguration,
} from "./alumniDonorConfiguration";

describe("alumni donor configuration", () => {
  it("provides direct FY27 and FY26 donor counts by default", () => {
    expect(getAlumniDonorCountRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "fy27-alumni-giving",
          label: "FY27 Alumni Giving",
          fiscalYearStart: "2026-07-01",
          fiscalYearEnd: "2027-06-30",
        }),
        expect.objectContaining({
          key: "fy26-alumni-giving",
          label: "FY26 Alumni Giving",
          fiscalYearStart: "2025-07-01",
          fiscalYearEnd: "2026-06-30",
        }),
      ]),
    );
    expect(DEFAULT_ALUMNI_DONOR_CONFIGURATION.giftTypes).toContain("donation");
  });

  it("normalizes selected constituency and gift-type values without retaining query fields", () => {
    const configuration = normalizeAlumniDonorConfiguration({
      constituencies: [
        "Alumni Bachelor's Degree",
        "alumni bachelor's degree",
        "Alumni Graduate Degree",
      ],
      giftTypes: ["donation", "Donation", "pledge", "not-a-gift-type"],
      rows: [
        {
          label: "FY28 Alumni Giving",
          queryId: 40001,
          queryName: "Legacy saved query",
          fiscalYearStart: "2027-07-01",
          fiscalYearEnd: "2028-06-30",
        },
      ],
    });

    expect(configuration).toMatchObject({
      constituencies: ["Alumni Bachelor's Degree", "Alumni Graduate Degree"],
      giftTypes: ["donation", "pledge"],
      rows: [
        expect.objectContaining({
          label: "FY28 Alumni Giving",
          fiscalYearStart: "2027-07-01",
          fiscalYearEnd: "2028-06-30",
        }),
      ],
    });
    expect(configuration.rows[0]).not.toHaveProperty("queryId");
    expect(configuration.rows[0]).not.toHaveProperty("queryName");
  });

  it("rejects invalid direct donor count rows", () => {
    expect(
      validateAlumniDonorConfiguration({
        constituencies: ["Alumni Bachelor's Degree"],
        giftTypes: ["donation"],
        rows: [
          {
            label: "FY27 Alumni Giving",
            fiscalYearStart: "2026-07-01",
            fiscalYearEnd: "2027-06-30",
          },
          {
            label: "FY27 Alumni Giving",
            fiscalYearStart: "2025-07-01",
            fiscalYearEnd: "2026-06-30",
          },
        ],
      }),
    ).toContain("different label");
    expect(
      validateAlumniDonorConfiguration({
        constituencies: ["Alumni Bachelor's Degree"],
        giftTypes: ["donation"],
        rows: [
          {
            label: "FY27 Alumni Giving",
            fiscalYearStart: "2027-07-01",
            fiscalYearEnd: "2026-06-30",
          },
        ],
      }),
    ).toContain("end date before");
  });

  it("requires at least one constituency and one gift type", () => {
    const rows = [
      {
        label: "FY27 Alumni Giving",
        fiscalYearStart: "2026-07-01",
        fiscalYearEnd: "2027-06-30",
      },
    ];

    expect(
      validateAlumniDonorConfiguration({
        constituencies: [],
        giftTypes: ["donation"],
        rows,
      }),
    ).toContain("at least one constituency");
    expect(
      validateAlumniDonorConfiguration({
        constituencies: ["Alumni Bachelor's Degree"],
        giftTypes: [],
        rows,
      }),
    ).toContain("at least one gift type");
    expect(
      validateAlumniDonorConfiguration({
        constituencies: ["Alumni Bachelor's Degree"],
        giftTypes: ["donation"],
        rows: [],
      }),
    ).toContain("at least one fiscal-year donor count");
  });
});
