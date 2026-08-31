import { describe, expect, it } from "vitest";

import {
  ALUMNI_DONOR_QUERY_CATEGORY_ID,
  ALUMNI_DONOR_QUERY_FIELDS,
  ALUMNI_DONOR_QUERY_TYPE_ID,
  DEFAULT_ALUMNI_DONOR_CONFIGURATION,
  buildAlumniDonorQueryDefinition,
  getAlumniDonorConfigurationFingerprint,
  getAlumniDonorCountRowFingerprint,
  getAlumniDonorCountRows,
  normalizeAlumniDonorConfiguration,
  validateAlumniDonorConfiguration,
} from "./alumniDonorConfiguration";

describe("alumni donor configuration", () => {
  it("provides FY27 and FY26 count rows by default", () => {
    expect(getAlumniDonorCountRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "fy27-alumni-giving",
          label: "FY27 Alumni Giving",
          fiscalYearStart: "2026-07-01",
          fiscalYearEnd: "2027-06-30",
          refreshPolicy: "refreshable",
        }),
        expect.objectContaining({
          key: "fy26-alumni-giving",
          label: "FY26 Alumni Giving",
          fiscalYearStart: "2025-07-01",
          fiscalYearEnd: "2026-06-30",
          refreshPolicy: "frozen",
        }),
      ]),
    );
    expect(DEFAULT_ALUMNI_DONOR_CONFIGURATION.includeSoftCreditedDonors).toBe(true);
  });

  it("normalizes known labels and preserves a custom NXT code ID", () => {
    const configuration = normalizeAlumniDonorConfiguration({
      constituencies: [
        "Alumni Bachelor's Degree",
        "alumni bachelor's degree",
        "45678 | Alumni Certificate",
      ],
      giftTypes: ["donation", "pledge"],
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
      constituencies: ["Alumni Bachelor's Degree", "45678 | Alumni Certificate"],
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

  it("builds the supplied NXT query definition with a distinct-person result count", () => {
    const row = {
      key: "fy27-alumni-giving",
      label: "FY27 Alumni Giving",
      fiscalYearStart: "2026-07-01",
      fiscalYearEnd: "2027-06-30",
    };
    const query = buildAlumniDonorQueryDefinition(DEFAULT_ALUMNI_DONOR_CONFIGURATION, row);

    expect(query).toMatchObject({
      type_id: ALUMNI_DONOR_QUERY_TYPE_ID,
      category_id: ALUMNI_DONOR_QUERY_CATEGORY_ID,
      format: "Dynamic",
      sql_generation_mode: "Query",
      result_layout: "MultiRow",
      suppress_duplicates: true,
      advanced_processing_options: {
        use_alternate_sql_code_table_fields: false,
        use_alternate_sql_multiple_attributes: false,
      },
      constituent_filters: {
        include_deceased: true,
        include_inactive: true,
        include_no_valid_addresses: true,
      },
      gift_processing_options: {
        matching_gift_credit_option: "Both",
        soft_credit_option: "Both",
        soft_credit_sub_option: "FullAmountToAll",
      },
      select_fields: [],
    });
    expect(query.filter_fields).toEqual([
      expect.objectContaining({
        query_field_id: ALUMNI_DONOR_QUERY_FIELDS.constituencyCode,
        operator: "OneOf",
        filter_values: ["13", "12366", "9799", "14061", "9721", "10296", "8818", "8897", "9384"],
      }),
      expect.objectContaining({
        query_field_id: ALUMNI_DONOR_QUERY_FIELDS.giftDate,
        operator: "Between",
        filter_values: ["7/1/2026", "6/30/2027"],
      }),
    ]);
  });

  it("changes the query fingerprint when an NXT inclusion rule changes", () => {
    const baseline = getAlumniDonorConfigurationFingerprint(DEFAULT_ALUMNI_DONOR_CONFIGURATION);
    const withoutSoftCredits = getAlumniDonorConfigurationFingerprint({
      ...DEFAULT_ALUMNI_DONOR_CONFIGURATION,
      includeSoftCreditedDonors: false,
    });

    expect(withoutSoftCredits).not.toBe(baseline);
  });

  it("keeps a row data fingerprint stable when only its snapshot policy changes", () => {
    const baselineRow = DEFAULT_ALUMNI_DONOR_CONFIGURATION.rows[1];
    const baseline = getAlumniDonorCountRowFingerprint(
      DEFAULT_ALUMNI_DONOR_CONFIGURATION,
      baselineRow,
    );
    const refreshableRow = { ...baselineRow, refreshPolicy: "refreshable" };
    const refreshable = getAlumniDonorCountRowFingerprint(
      {
        ...DEFAULT_ALUMNI_DONOR_CONFIGURATION,
        rows: [DEFAULT_ALUMNI_DONOR_CONFIGURATION.rows[0], refreshableRow],
      },
      refreshableRow,
    );
    const changedDates = getAlumniDonorCountRowFingerprint(
      DEFAULT_ALUMNI_DONOR_CONFIGURATION,
      { ...baselineRow, fiscalYearStart: "2024-07-01" },
    );

    expect(refreshable).toBe(baseline);
    expect(changedDates).not.toBe(baseline);
  });

  it("rejects invalid custom codes and fiscal-year rows", () => {
    expect(
      validateAlumniDonorConfiguration({
        constituencies: ["Alumni Bachelor's Degree", "An unnumbered custom code"],
        rows: [
          {
            label: "FY27 Alumni Giving",
            fiscalYearStart: "2026-07-01",
            fiscalYearEnd: "2027-06-30",
          },
        ],
      }),
    ).toContain("NXT code ID");

    expect(
      validateAlumniDonorConfiguration({
        constituencies: ["Alumni Bachelor's Degree"],
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
});
