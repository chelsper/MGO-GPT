import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import {
  csvRequest,
  csvWorkspace,
} from "../../../../test/societyLetterCsvFixture";
import { exportSocietyLetterCsv } from "./societyLetterCsvExport";

describe("read-only society CSV serialization", () => {
  it.each([undefined, { salutation: "household_preferred" }])(
    "includes separate address columns even when the saved template only uses a full address: %j",
    (csvFormat) => {
      const workspace = csvWorkspace(2);
      workspace.rows[0].addressParts.address_line_2 = "Suite 200";
      const result = exportSocietyLetterCsv(workspace, {
        ...csvRequest(workspace),
        csvFormat,
      });
      const parsed = Papa.parse(result.csv, { header: true });
      expect(parsed.errors).toEqual([]);
      const fields = [
        "address_line_1",
        "address_line_2",
        "city",
        "state",
        "zip",
      ];
      expect(
        parsed.meta.fields.filter((field) => fields.includes(field)),
      ).toEqual(fields);
      expect(parsed.data[0]).toMatchObject({
        address_line_1: "10 Test Street",
        address_line_2: "Suite 200",
        city: "Example City",
        state: "FL",
        zip: "00123",
      });
      expect(parsed.data[1].address_line_2).toBe("");
    },
  );
  it("uses only the selected household member's matching address components", () => {
    const workspace = csvWorkspace();
    const row = workspace.rows[0];
    Object.assign(row, {
      members: ["1000", "2000"],
      addressConstituentId: "2000",
      addressParts: undefined,
      address: "20 Test Lane\nUnit 5\nOther City, MA 02108-1234",
      recipientCandidates: [
        {
          constituentId: "1000",
          address: row.address,
          addressParts: row.addressParts,
        },
        {
          constituentId: "2000",
          address: "20 Test Lane\nUnit 5\nOther City, MA 02108-1234",
          addressParts: {
            address_line_1: "20 Test Lane",
            address_line_2: "Unit 5",
            city: "Other City",
            state: "MA",
            zip: "02108-1234",
          },
        },
      ],
    });
    const result = exportSocietyLetterCsv(workspace, csvRequest(workspace));
    expect(Papa.parse(result.csv, { header: true }).data[0]).toMatchObject({
      address_line_1: "20 Test Lane",
      address_line_2: "Unit 5",
      city: "Other City",
      state: "MA",
      zip: "02108-1234",
      app_member_ids: "1000|2000",
    });
  });
  it("round trips Unicode, commas, quotes, newlines, ZIPs and long IDs exactly", () => {
    const workspace = csvWorkspace(70);
    Object.assign(workspace.rows[0], {
      addressee: 'Alex "Al", Example & Renée',
      address: '10 Test Street\nSuite "A", East\nExample City, FL 00123',
      members: ["1234567890123456789", "1234567890123456790"],
    });
    const before = structuredClone(workspace);
    const result = exportSocietyLetterCsv(workspace, csvRequest(workspace));
    expect(result.count).toBe(70);
    expect(result.csv.charCodeAt(0)).toBe(0xfeff);
    const parsed = Papa.parse(result.csv, { header: true });
    expect(parsed.errors).toEqual([]);
    expect(parsed.data).toHaveLength(70);
    expect(parsed.data[0]).toMatchObject({
      addressee: 'Alex "Al", Example & Renée',
      Address: workspace.rows[0].address,
      zip: "00123",
      app_member_ids: "1234567890123456789|1234567890123456790",
    });
    expect(workspace).toEqual(before);
  });
  it.each([
    { revision: 6 },
    { revision: "7" },
    { periodKey: "old" },
    { periodKey: null },
    { householdIds: ["1000", "1000"] },
    { householdIds: [] },
    { householdIds: [1000] },
    { householdIds: ["different"] },
    { householdIds: ["1000", "1001"] },
  ])("rejects stale or altered export requests: %j", (change) => {
    const workspace = csvWorkspace();
    expect(() =>
      exportSocietyLetterCsv(workspace, {
        ...csvRequest(workspace),
        ...change,
      }),
    ).toThrow();
  });
  it("refuses silent partial export when a review changes after count/selection", () => {
    const workspace = csvWorkspace(2);
    const body = csvRequest(workspace);
    workspace.rows[1].recipientReview.status = "needs_review";
    expect(() => exportSocietyLetterCsv(workspace, body)).toThrow(
      "eligible recipients changed",
    );
    body.householdIds.pop();
    expect(exportSocietyLetterCsv(workspace, body).count).toBe(1);
  });
});
