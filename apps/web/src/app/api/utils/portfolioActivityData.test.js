import { describe, expect, it } from "vitest";
import { actionDatePage, activityOrigin, activityWorkspaceIds, latestGiftDate, savedActivityEntry } from "./portfolioActivityData";

const now = new Date("2026-09-15T12:00:00Z");
const action = (id, date = "2026-09-14") => ({ id, date, constituent_id: "100" });

describe("portfolio activity data", () => {
  it("requires an explicit, valid pilot and canonical HTTPS origin", () => {
    expect(activityWorkspaceIds("")).toEqual([]);
    expect(activityWorkspaceIds("12, 12, 5")).toEqual(["12", "5"]);
    for (const value of ["all", "1,no", "0", "-1", "1.5", "9999999999999999999"]) expect(activityWorkspaceIds(value)).toEqual([]);
    expect(activityOrigin("https://www.jumgogpt.app")).toBe("https://www.jumgogpt.app");
    for (const value of ["", "http://example.com", "https://example.com/path", "https://example.com/"]) expect(activityOrigin(value)).toBeNull();
  });
  it("reuses only dated, verified snapshots, preserving a verified empty result", () => {
    expect(savedActivityEntry({ version: 1, data: { id: "g", date: "2020-01-01" }, fetchedAt: now.toISOString() }, now).date).toBe("2020-01-01");
    expect(savedActivityEntry({ version: 1, data: null, fetchedAt: now.toISOString() }, now)).toMatchObject({ id: null, date: null });
    for (const payload of [{}, { version: 2 }, { version: 1, data: null, fetchedAt: "2099-01-01" },
      { version: 1, data: { id: "g", date: "2026-09-16" }, fetchedAt: now.toISOString() }]) {
      expect(savedActivityEntry(payload, now)).toBeNull();
    }
  });
  it("uses all-time latest gift dates, not the current fiscal year", () => {
    expect(latestGiftDate({ id: "g", date: "2010-04-05" }, now)).toEqual({ id: "g", date: "2010-04-05" });
    expect(latestGiftDate({}, now)).toBeNull();
    for (const value of [null, [], { error: "bad" }, { id: true, date: "2020-01-01" }, { id: "g", date: "2099-01-01" }]) expect(() => latestGiftDate(value, now)).toThrow();
  });
  it("resumes action pages and publishes only after the complete result", () => {
    const first = actionDatePage({ count: 3, value: [action("a", "2020-01-01")], next_link: "/constituent/v1/constituents/100/actions?offset=1" }, "100", null, now);
    expect(first.scan.nextPath).toContain("offset=1");
    const last = actionDatePage({ count: 3, value: [action("b"), action("future", "2026-09-16")] }, "100", JSON.parse(JSON.stringify(first.scan)), now);
    expect(last.scan).toBeNull();
    expect(last.data).toEqual({ id: "b", date: "2026-09-14" });
    expect(last.checkedAt).toBe(now.toISOString());
    expect(JSON.stringify(first.scan)).not.toContain("description");
  });
  it("records a complete empty/future-only action list without inventing a date", () => {
    expect(actionDatePage({ value: [], count: 0 }, "100", null, now).data).toBeNull();
    expect(actionDatePage({ value: [action("f", "2026-09-20")] }, "100", null, now).data).toBeNull();
  });
  it.each([
    { value: [], count: 5 }, { value: [action("a", "bad")] }, { value: [{ ...action("a"), constituent_id: "101" }] },
    { value: [action("a"), action("a")] },
    { value: [action("a")], next_link: "https://evil.example/actions" },
    { value: [action("a")], next_link: "/constituent/v1/constituents/101/actions" },
    { value: [action("a")], next_link: "/gift/v1/gifts" },
  ])("rejects incomplete/unsafe action results: %j", response => {
    expect(() => actionDatePage(response, "100", null, now)).toThrow();
  });
  it("rejects repeated cursors, expired scans and changing counts", () => {
    const response = { value: [action("a")], count: 3, next_link: "/constituent/v1/constituents/100/actions?offset=1" };
    const first = actionDatePage(response, "100", null, now);
    expect(() => actionDatePage({ ...response, value: [action("b")] }, "100", first.scan, now)).toThrow();
    expect(() => actionDatePage({ value: [action("b")], count: 2 }, "100", first.scan, now)).toThrow();
    expect(() => actionDatePage({ value: [] }, "100", first.scan, new Date("2026-09-17"))).toThrow();
  });
});
