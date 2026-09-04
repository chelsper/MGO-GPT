import { describe, expect, it } from "vitest";

import {
  DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD,
  getAlumniDonorCountRowFingerprint,
  getAlumniDonorCountRows,
  getAlumniGenericDashboard,
  getAlumniFamilyEngagementDashboardFingerprint,
  normalizeAlumniFamilyEngagementDashboard,
  validateAlumniFamilyEngagementDashboard,
} from "./alumniDonorConfiguration";

describe("Alumni & Family Engagement dashboard configuration", () => {
  it("provides saved FY27 and FY26 query rows by default", () => {
    expect(getAlumniDonorCountRows()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: "fy27-alumni-giving",
          label: "FY27 Alumni Giving",
          queryId: "30976",
          queryName: "Alumni Donors FY27",
          refreshPolicy: "refreshable",
        }),
        expect.objectContaining({
          key: "fy26-alumni-giving",
          label: "FY26 Alumni Giving",
          queryId: "30679",
          queryName: "Alumni Donors FY26",
          refreshPolicy: "frozen",
        }),
      ]),
    );
  });

  it("normalizes a saved-query panel without direct donor criteria", () => {
    const dashboard = normalizeAlumniFamilyEngagementDashboard({
      panels: [
        {
          key: "annual-giving",
          type: "alumni_donor_count",
          title: "Annual Giving",
          rows: [
            {
              key: "fy28",
              label: "FY28 Alumni Giving",
              queryId: 40001,
              queryName: "Alumni Donors FY28",
              refreshPolicy: "refreshable",
            },
          ],
        },
      ],
    });

    expect(dashboard).toEqual({
      dashboardVersion: 2,
      panels: [
        expect.objectContaining({
          key: "annual-giving",
          type: "alumni_donor_count",
          title: "Annual Giving",
          rows: [
            expect.objectContaining({
              key: "fy28",
              label: "FY28 Alumni Giving",
              queryId: "40001",
              queryName: "Alumni Donors FY28",
              refreshPolicy: "refreshable",
            }),
          ],
        }),
      ],
    });
    expect(dashboard.panels[0]).not.toHaveProperty("constituencies");
  });

  it("migrates known legacy fiscal-year rows to their supplied saved NXT queries", () => {
    const dashboard = normalizeAlumniFamilyEngagementDashboard({
      rows: [
        {
          key: "fy27-alumni-giving",
          label: "FY27 Alumni Giving",
          fiscalYearStart: "2026-07-01",
          fiscalYearEnd: "2027-06-30",
        },
        {
          key: "fy26-alumni-giving",
          label: "FY26 Alumni Giving",
          fiscalYearStart: "2025-07-01",
          fiscalYearEnd: "2026-06-30",
          refreshPolicy: "frozen",
        },
      ],
    });

    expect(getAlumniDonorCountRows(dashboard)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "fy27-alumni-giving", queryId: "30976" }),
        expect.objectContaining({ key: "fy26-alumni-giving", queryId: "30679" }),
      ]),
    );
  });

  it("invalidates snapshots only when a saved query definition changes", () => {
    const rows = getAlumniDonorCountRows(DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD);
    const baseline = getAlumniFamilyEngagementDashboardFingerprint(
      DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD,
    );
    const relabeled = {
      ...DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD,
      panels: DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD.panels.map((panel) => ({
        ...panel,
        rows: panel.rows.map((row) =>
          row.key === rows[0].key
            ? { ...row, label: "Updated label", refreshPolicy: "frozen" }
            : row,
        ),
      })),
    };
    const changedQuery = {
      ...DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD,
      panels: DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD.panels.map((panel) => ({
        ...panel,
        rows: panel.rows.map((row) =>
          row.key === rows[0].key ? { ...row, queryId: "40001" } : row,
        ),
      })),
    };

    expect(getAlumniFamilyEngagementDashboardFingerprint(relabeled)).toBe(baseline);
    expect(getAlumniFamilyEngagementDashboardFingerprint(changedQuery)).not.toBe(baseline);
    expect(
      getAlumniDonorCountRowFingerprint(relabeled, {
        ...rows[0],
        refreshPolicy: "frozen",
      }),
    ).toBe(
      getAlumniDonorCountRowFingerprint(
        DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD,
        rows[0],
      ),
    );
  });

  it("requires a numeric saved query ID for every configured count row", () => {
    expect(
      validateAlumniFamilyEngagementDashboard({
        panels: [
          {
            key: "alumni",
            type: "alumni_donor_count",
            title: "Alumni",
            rows: [{ key: "fy28", label: "FY28 Alumni Giving", queryId: "not-a-query" }],
          },
        ],
      }),
    ).toContain("numeric saved NXT query system record ID");
  });

  it("preserves and validates mixed donor-count and Output Query panels", () => {
    const mixed = {
      ...DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD,
      panels: [
        ...DEFAULT_ALUMNI_FAMILY_ENGAGEMENT_DASHBOARD.panels,
        {
          key: "ppc-output",
          title: "PPC 2026-27",
          layout: "query_results",
          width: "full",
          queryId: "30971",
          refreshPolicy: "refreshable",
          columnSettings: [],
          rows: [],
          columns: [],
          values: [],
        },
      ],
    };
    const normalized = normalizeAlumniFamilyEngagementDashboard(mixed);
    expect(validateAlumniFamilyEngagementDashboard(normalized)).toBe("");
    expect(getAlumniDonorCountRows(normalized)).toHaveLength(2);
    expect(getAlumniGenericDashboard(normalized)).toMatchObject({
      version: 1,
      panels: [expect.objectContaining({ queryId: "30971" })],
    });
  });
});
