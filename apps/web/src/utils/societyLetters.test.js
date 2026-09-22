import { describe, expect, it } from "vitest";
import {
  LETTER_COLUMNS,
  dateOnly,
  letterPeriod,
  householdsFromQuery,
  letterDisposition,
  letterIssue,
  validateLetterSettings,
  mergeLetterText,
  letterHierarchy,
} from "./societyLetters";

const definitions = [
  {
    key: "presidents_society",
    name: "President's Society",
    active: true,
    basis: "annual",
    displayOrder: 1,
  },
  {
    key: "order_of_the_dolphin",
    name: "Order of the Dolphin",
    active: true,
    basis: "annual",
    displayOrder: 2,
  },
];
const settings = {
  queryId: "123",
  periodBasis: "calendar_year",
  societyKeys: definitions.map((d) => d.key),
  columns: LETTER_COLUMNS,
};
const period = letterPeriod(settings, "2026-09-22");
const rawRow = {
  householdId: "10",
  memberIds: "10|11",
  name: "Sample Household",
  society: "presidents_society",
  addressee: "Alex and Pat Sample",
  salutation: "Alex and Pat",
  address: "10 Test Street\nJacksonville, FL 32211",
  email: "sample@example.org",
  emailAllowed: "Yes",
  mailAllowed: "Yes",
  periodStart: "2026-01-01",
  periodEnd: "2026-12-31",
};
const table = (...rows) => ({
  headers: Object.values(LETTER_COLUMNS),
  tableRows: rows.map((row) =>
    Object.keys(LETTER_COLUMNS).map((key) => row[key]),
  ),
});
const parse = (...rows) =>
  householdsFromQuery(table(...rows), settings, definitions, period);

describe("household society letters", () => {
  it("validates real dates and handles leap years", () => {
    expect(dateOnly("2/29/2024")).toBe("2024-02-29");
    expect(dateOnly("2026-02-29")).toBeNull();
    expect(dateOnly("2026-13-01")).toBeNull();
  });
  it("uses complete period boundaries, including fiscal and custom periods", () => {
    expect(period).toEqual({
      start: "2026-01-01",
      end: "2026-12-31",
      key: "2026-01-01/2026-12-31",
    });
    expect(
      letterPeriod(
        { periodBasis: "fiscal_year", fiscalYearStartMonth: 7 },
        "2026-06-30",
      ).key,
    ).toBe("2025-07-01/2026-06-30");
    expect(
      letterPeriod(
        { periodBasis: "fiscal_year", fiscalYearStartMonth: 7 },
        "2026-07-01",
      ).key,
    ).toBe("2026-07-01/2027-06-30");
    expect(
      letterPeriod(
        {
          periodBasis: "custom",
          startDate: "2026-03-01",
          endDate: "2026-11-30",
        },
        "2026-09-22",
      ).key,
    ).toBe("2026-03-01/2026-11-30");
    expect(() =>
      letterPeriod(
        {
          periodBasis: "custom",
          startDate: "2026-12-01",
          endDate: "2026-01-01",
        },
        "2026-09-22",
      ),
    ).toThrow();
  });
  it("requires an explicitly confirmed source and separate mapped fields", () => {
    expect(() =>
      validateLetterSettings(settings, definitions, "2026-09-22"),
    ).toThrow(/Confirm/);
    expect(
      validateLetterSettings(
        { ...settings, confirmSource: true },
        definitions,
        "2026-09-22",
      ).queryId,
    ).toBe("123");
    expect(() =>
      validateLetterSettings(
        {
          ...settings,
          confirmSource: true,
          columns: { ...LETTER_COLUMNS, memberIds: LETTER_COLUMNS.householdId },
        },
        definitions,
        "2026-09-22",
      ),
    ).toThrow(/distinct/);
    expect(
      letterHierarchy(definitions, {
        societyKeys: [...settings.societyKeys].reverse(),
      }).map((d) => d.key),
    ).toEqual(settings.societyKeys);
  });
  it("produces one highest letter and explicitly covers the lower society", () => {
    const rows = parse(
      rawRow,
      { ...rawRow, society: "order_of_the_dolphin" },
      rawRow,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      societyKey: "presidents_society",
      coveredKeys: ["presidents_society", "order_of_the_dolphin"],
    });
    expect(letterDisposition(rows[0], [])).toMatchObject({ status: "ready" });
  });
  it("covers the lower letter even if the higher amount excludes it from query results", () => {
    expect(parse(rawRow)[0].coveredKeys).toEqual([
      "presidents_society",
      "order_of_the_dolphin",
    ]);
  });
  it("accepts configured society names without fuzzy name matching", () => {
    expect(
      parse({ ...rawRow, society: "President's Society" })[0].societyKey,
    ).toBe("presidents_society");
    expect(() => parse({ ...rawRow, society: "President" })).toThrow(/society/);
  });
  it("blocks wrong periods, missing identities, conflicting recipients and overlapping households", () => {
    expect(() => parse({ ...rawRow, periodStart: "2025-01-01" })).toThrow(
      /period/,
    );
    expect(() => parse({ ...rawRow, householdId: "Alex" })).toThrow(
      /identities/,
    );
    expect(() => parse({ ...rawRow, memberIds: "11" })).toThrow(/identities/);
    expect(() =>
      parse(rawRow, { ...rawRow, email: "different@example.org" }),
    ).toThrow(/conflicting/);
    expect(() => parse(rawRow, { ...rawRow, householdId: "11" })).toThrow(
      /different households/,
    );
  });
  it("blocks duplicate/missing mapped headers without discarding the source error", () => {
    const output = table(rawRow);
    output.headers[0] = "Unexpected";
    expect(() =>
      householdsFromQuery(output, settings, definitions, period),
    ).toThrow(/Household ID/);
  });
  it.each(["sending", "pending_email", "needs_review", "prepared"])(
    "holds %s across channels and even a higher qualification",
    (status) => {
      const high = parse(rawRow)[0],
        low = parse({ ...rawRow, society: "order_of_the_dolphin" })[0];
      expect(
        letterDisposition(high, [{ ...low, status, channel: "email" }]).status,
      ).toBe("held");
    },
  );
  it.each(["mailed", "emailed", "delivered"])(
    "never resuggests an acknowledged household (%s)",
    (status) => {
      const row = parse(rawRow)[0];
      expect(letterDisposition(row, [{ ...row, status }]).status).toBe(
        "covered",
      );
      const low = parse({ ...rawRow, society: "order_of_the_dolphin" })[0];
      expect(letterDisposition(low, [{ ...row, status }]).status).toBe(
        "covered",
      );
    },
  );
  it("permits a higher-tier upgrade, but not a lower letter after it", () => {
    const high = parse(rawRow)[0],
      low = parse({ ...rawRow, society: "order_of_the_dolphin" })[0];
    expect(letterDisposition(high, [{ ...low, status: "mailed" }])).toEqual({
      status: "ready",
      reason: "New higher society qualification",
    });
  });
  it("remembers member IDs when the designated household head changes", () => {
    const original = parse(rawRow)[0];
    const changed = parse({ ...rawRow, householdId: "11" })[0];
    expect(
      letterDisposition(changed, [{ ...original, status: "delivered" }]).status,
    ).toBe("covered");
  });
  it("requalifies in a new period and releases only explicitly cancelled preparations", () => {
    const row = parse(rawRow)[0];
    expect(
      letterDisposition(row, [
        { ...row, period: { key: "2025-01-01/2025-12-31" }, status: "mailed" },
      ]).status,
    ).toBe("ready");
    expect(
      letterDisposition(row, [{ ...row, status: "cancelled" }]).status,
    ).toBe("ready");
  });
  it("requires channel-specific permission instead of guessing contact eligibility", () => {
    const row = parse({ ...rawRow, emailAllowed: "", mailAllowed: "No" })[0];
    expect(letterIssue(row, "email", {})).toMatch(/eligibility/);
    expect(letterIssue(row, "post", {})).toMatch(/eligibility/);
    expect(
      letterIssue(
        { ...row, emailAllowed: true, email: "a@example.org,b@example.org" },
        "email",
        {},
      ),
    ).toMatch(/single/);
    expect(letterIssue(row, "post", null)).toMatch(/template/);
  });
  it("merges only the approved flat fields", () => {
    expect(mergeLetterText("Dear {salutation}", { salutation: "Alex" })).toBe(
      "Dear Alex",
    );
    expect(() => mergeLetterText("{constructor}", {})).toThrow(/Unknown/);
  });
});
