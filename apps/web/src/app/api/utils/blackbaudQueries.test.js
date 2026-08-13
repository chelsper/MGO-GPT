import { describe, expect, it } from "vitest";

import { buildFY27CashReceivedByConstituentId } from "./blackbaudQueries.js";

describe("FY27 cash-received saved query results", () => {
  it("maps CSV query output by constituent system record ID", () => {
    const result = buildFY27CashReceivedByConstituentId(
      'Constituent System Record ID,MGOGPT - FY27 Total Cash Received\n227949,"$1,250.50"\n186057,0',
    );

    expect(result).toEqual({
      byConstituentId: { "186057": 0, "227949": 1250.5 },
      rowCount: 2,
      hasRequiredColumns: true,
    });
  });

  it("accepts JSON query output and does not double-count duplicate rows", () => {
    const result = buildFY27CashReceivedByConstituentId({
      value: [
        {
          "System Record ID": "227949",
          "FY27 Total Cash Received": "500",
        },
        {
          "System Record ID": "227949",
          "FY27 Total Cash Received": "1,000",
        },
      ],
    });

    expect(result.byConstituentId).toEqual({ "227949": 1000 });
    expect(result.hasRequiredColumns).toBe(true);
  });

  it("reports missing result columns without exposing partial totals", () => {
    const result = buildFY27CashReceivedByConstituentId(
      "Lookup ID,Amount\n123,250",
    );

    expect(result).toMatchObject({
      byConstituentId: {},
      rowCount: 1,
      hasRequiredColumns: false,
    });
  });
});
