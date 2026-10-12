import { describe, expect, it } from "vitest";
import Papa from "papaparse";
import {
  csvRequest,
  csvWorkspace,
} from "../../../../test/societyLetterCsvFixture";
import { exportSocietyLetterCsv } from "./societyLetterCsvExport";

describe("read-only society CSV serialization", () => {
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
