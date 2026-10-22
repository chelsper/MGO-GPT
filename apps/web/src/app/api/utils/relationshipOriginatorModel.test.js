import { describe, it, expect } from "vitest";
import { getStandingsPeriods } from "@/utils/standingsPeriods";
import { originatorFields, originatorFingerprint, originatorIdentityNames, originatorValuePayload, validateOriginDate,
  matchesOriginatorChange, originatorGiving, resolveOriginators } from "./relationshipOriginatorModel";
const periods = getStandingsPeriods(new Date("2026-10-06T16:00:00Z"));
const field = { id: "71", constituentId: "200", value: "Ada Fundraiser", date: "2026-07-01", comment: "" };
const user = { id: 1, name: "Ada", nxtName: "Ada Fundraiser" };
const gift = (id, date, amount, extra = {}) => ({ id, date, amount: { value: amount }, constituent_id: "200", type: "Donation", ...extra });

describe("relationship originator rules", () => {
  it("uses only the exact category and explicit origin date, never entry/modified dates", () => {
    expect(originatorFields([{ category: "Other Relationship Originator", value: "Wrong" },
      { category: "Relationship Originator", id: "71", parent_id: "200", value: "Ada", date_added: "2026-07-01" }]))
      .toEqual([{ id: "71", constituentId: "200", value: "Ada", date: null, comment: "" }]);
  });
  it.each(["2026-02-30", "2026-10-07", "", "2026-10-06T00:00:00Z"])("rejects invalid/future introduction dates %s", value => {
    expect(() => validateOriginDate(value, periods.asOf)).toThrow();
  });
  it("allows backdated introductions and leap days", () => {
    expect(validateOriginDate("2024-02-29", periods.asOf)).toBe("2024-02-29");
  });
  it("requires an exact table value and fails closed for unsupported field types", () => {
    expect(originatorValuePayload({ dataType: "Text" }, "Ada")).toEqual({ text_value: "Ada" });
    expect(originatorValuePayload({ dataType: "Table" }, "Ada", ["ADA"])).toEqual({ codetableentry_value: "ADA" });
    expect(() => originatorValuePayload({ dataType: "Table" }, "Ada", ["A. Ada"])).toThrow('verified NXT name "Ada"');
    expect(() => originatorValuePayload({ dataType: "ConstituentId" }, "Ada")).toThrow("Text or Table");
  });
  it("matches an omitted middle name only through structured verified NXT names", () => {
    const identity = { name: "Ada M. Fundraiser", raw: { first: "Ada", middle: "M.", last: "Fundraiser" } };
    const names = originatorIdentityNames(identity);
    expect(names).toEqual(["Ada M. Fundraiser", "Ada Fundraiser"]);
    expect(originatorValuePayload({ dataType: "CodeTableEntry" }, identity.name, ["ADA  Fundraiser"], names))
      .toEqual({ codetableentry_value: "ADA  Fundraiser" });
    expect(originatorValuePayload({ dataType: "Text" }, identity.name, [], names)).toEqual({ text_value: identity.name });
    expect(originatorIdentityNames({ name: "Ada M. Fundraiser" })).toEqual(["Ada M. Fundraiser"]);
    expect(originatorIdentityNames(null)).toEqual([]);
    expect(() => originatorValuePayload({ dataType: "Table" }, identity.name, ["A. Fundraiser"], names)).toThrow("No update was submitted");
  });
  it("prefers the exact display-name entry and never guesses between duplicate aliases", () => {
    const names = ["Ada M. Fundraiser", "Ada Fundraiser"];
    expect(originatorValuePayload({ dataType: "Table" }, names[0], names, names)).toEqual({ codetableentry_value: names[0] });
    expect(() => originatorValuePayload({ dataType: "Table" }, names[0], ["Ada Fundraiser", "ADA FUNDRAISER"], names)).toThrow("No unique");
  });
  it("fingerprints dates, values and comments, independent of row ordering", () => {
    const second = { ...field, id: "72" };
    expect(originatorFingerprint([field, second])).toBe(originatorFingerprint([second, field]));
    expect(originatorFingerprint([field])).not.toBe(originatorFingerprint([{ ...field, comment: "changed" }]));
  });
  it("verifies one exact field and does not accept ambiguous duplicates", () => {
    const receipt = { originator_name: field.value, origin_date: field.date, remote_field_id: "71" };
    expect(matchesOriginatorChange([field], receipt)).toBeTruthy();
    expect(matchesOriginatorChange([field, field], receipt)).toBe(false);
    expect(matchesOriginatorChange([{ ...field, id: "72" }], receipt)).toBe(false);
  });
  it("counts distinct constituents without conflating spouse households or double-counting field rows", () => {
    const result = resolveOriginators([field, field, { ...field, id: "72", constituentId: "201" }], [user], [], periods);
    expect(result.resolved).toHaveLength(2); expect(result.issues).toEqual([]);
  });
  it("excludes conflicting originators, ambiguous names, missing/future dates and unmatched names", () => {
    for (const fields of [[field, { ...field, id: "72" }], [{ ...field, date: null }],
      [{ ...field, date: "2026-10-07" }], [{ ...field, value: "Unknown" }]]) {
      expect(resolveOriginators(fields, [user], [], periods)).toMatchObject({ resolved: [], issues: [expect.any(Object)] });
    }
    expect(resolveOriginators([field], [user, { ...user, id: 2 }], [], periods).resolved).toEqual([]);
  });
  it("retains verified app identity after a name changes, but not after NXT field changes", () => {
    const receipts = [{ constituent_id: "200", remote_field_id: "71", originator_name: field.value,
      origin_date: field.date, owner_user_id: 1, state: "confirmed" }];
    expect(resolveOriginators([field], [{ id: 1, name: "New name" }], receipts, periods).resolved[0].userId).toBe("1");
    expect(resolveOriginators([{ ...field, value: "Other" }], [user], receipts, periods).resolved).toEqual([]);
  });
  it("uses hard received giving from introduction forward, including old relationships in FY giving", () => {
    const rows = [gift("1", "2025-06-30", 999), gift("2", "2025-07-01", 100),
      gift("3", "2026-07-01", 20), gift("3", "2026-07-01", 20), gift("4", "2026-10-07", 999),
      gift("5", "2026-10-06", 10, { type: "PledgePayment" }), gift("6", "2026-10-06", 999, { type: "Pledge" }),
      gift("7", "2026-10-06", 999, { constituent_id: "300", soft_credits: [{ constituent_id: "200" }] }),
      gift("8", "2026-10-06", 999, { gift_status: "Deleted" })];
    expect(originatorGiving(rows, "200", "2025-07-01", periods)).toEqual({ fiscalYearGiving: 30, lifetimeGiving: 130 });
  });
  it.each([{ date: "not a date" }, { amount: null }, { type: "Unknown" }, { id: null }])("does not turn malformed gifts into zero %j", extra => {
    expect(() => originatorGiving([gift("1", "2026-07-01", 10, extra)], "200", field.date, periods)).toThrow();
  });
  it("rejects conflicting duplicates and rounds cents rather than rounding every total to dollars", () => {
    expect(() => originatorGiving([gift("1", field.date, 10), gift("1", field.date, 20)], "200", field.date, periods)).toThrow("Conflicting");
    expect(originatorGiving([gift("1", field.date, .1), gift("2", field.date, .2)], "200", field.date, periods).lifetimeGiving).toBe(.3);
  });
});
