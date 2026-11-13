import { describe, expect, it } from "vitest";
import { IMPORT_PRACTICE_SCENARIOS, importPracticeFixture, importPracticeBlockers, importPracticeReducer as reduce, newImportPractice } from "./importPractice";

function review(id, contacts = true) {
  let state = newImportPractice(id);
  if (id !== "custom") state = reduce(state, { type: "contacts", value: contacts });
  return reduce(state, { type: "review" });
}
function approve(state) {
  return reduce(reduce(state, { type: "select-ready" }), { type: "confirm", value: true });
}

describe("isolated import practice model", () => {
  it.each(IMPORT_PRACTICE_SCENARIOS)("provides complete fictional fields for $id", ({ id }) => {
    const fixture = importPracticeFixture(id);
    expect(fixture.fields.every((field) => field?.header && field?.key)).toBe(true);
    expect(fixture.rows).toHaveLength(3);
    for (const row of fixture.rows) {
      expect(Object.keys(row)).toEqual(fixture.headers);
      if (fixture.mappings.blackbaudConstituentId) expect(row[fixture.mappings.blackbaudConstituentId]).toMatch(/^PRACTICE-/);
      if (fixture.mappings.email) expect(row[fixture.mappings.email]).toMatch(/@example\.test$/);
    }
  });
  it("does not accept unknown scenarios or input fixtures", () => {
    const state = newImportPractice();
    expect(importPracticeFixture("real")).toBeNull();
    expect(() => newImportPractice("real")).toThrow();
    expect(reduce(state, { type: "scenario", id: "real", rows: [{ name: "Injected" }] })).toBe(state);
  });
  it("requires an explicit contact decision and correct column mapping", () => {
    let state = newImportPractice();
    expect(importPracticeBlockers(state)).toHaveLength(1);
    expect(reduce(state, { type: "review" })).toBe(state);
    state = reduce(state, { type: "contacts", value: true });
    state = reduce(state, { type: "mapping", key: "email", value: state.mappings.firstName });
    expect(importPracticeBlockers(state)[0]).toContain("map");
    expect(reduce(state, { type: "review" })).toBe(state);
    expect(reduce(state, { type: "mapping", key: "unknown", value: "x" })).toBe(state);
  });
  it("holds a possible duplicate and never preselects a ready record", () => {
    const state = review("new");
    expect(state.rows.map((row) => row.state)).toEqual(["ready", "held", "ready"]);
    expect(state.rows.every((row) => !row.selected)).toBe(true);
    expect(reduce(state, { type: "select", id: state.rows[1].id }).rows[1].selected).toBe(false);
  });
  it("keeps contact omission explicit rather than claiming those fields completed", () => {
    const state = review("new", false);
    expect(state.rows[0].fields).toEqual(["Create fictional identity", "Email excluded; contact details stay unchanged."]);
    expect(review("updates", false).rows.every((row) => row.state === "unchanged")).toBe(true);
  });
  it("uses live pure custom-field rules for additions, exact duplicates and conflicts", () => {
    expect(review("custom").rows.map((row) => row.state)).toEqual(["ready", "unchanged", "held"]);
  });
  it.each(IMPORT_PRACTICE_SCENARIOS)("requires selection and explicit approval for $id", ({ id }) => {
    const state = review(id);
    expect(reduce(state, { type: "simulate" })).toBe(state);
    const selected = reduce(state, { type: "select-ready" });
    expect(reduce(selected, { type: "simulate" })).toBe(selected);
    const confirmedOnly = reduce(state, { type: "confirm", value: true });
    expect(reduce(confirmedOnly, { type: "simulate" })).toBe(confirmedOnly);
    const approved = approve(state);
    expect(reduce(approved, { type: "select", id: state.rows[0].id }).confirmed).toBe(false);
    expect(reduce(approved, { type: "simulate" }).stage).toBe("results");
  });
  it("never applies a nonselected record and keeps holds after completion", () => {
    let state = review("new");
    state = reduce(state, { type: "select", id: state.rows[0].id });
    state = reduce(state, { type: "confirm", value: true });
    state = reduce(state, { type: "simulate" });
    expect(state.rows.map((row) => row.state)).toEqual(["complete", "held", "ready"]);
    expect(reduce(state, { type: "simulate" })).toBe(state);
    expect(reduce(state, { type: "back" })).toBe(state);
  });
  it("models an uncertain result with verification, not another send", () => {
    let state = reduce(approve(review("updates")), { type: "simulate" });
    expect(state.rows.map((row) => row.state)).toEqual(["complete", "unchanged", "uncertain"]);
    expect(reduce(state, { type: "simulate" })).toBe(state);
    state = reduce(state, { type: "verify", id: state.rows[2].id });
    expect(state.rows[2].state).toBe("complete");
    expect(state.rows[2].message).toContain("missing or conflicting evidence stays held");
  });
  it("invalidates all review decisions on back, restart, or another scenario", () => {
    const approved = approve(review("new"));
    const back = reduce(approved, { type: "back" });
    expect(back).toMatchObject({ stage: "setup", rows: [], confirmed: false });
    expect(reduce(back, { type: "review" }).rows.every((row) => !row.selected)).toBe(true);
    expect(reduce(approved, { type: "restart" })).toEqual(newImportPractice("new"));
    expect(reduce(approved, { type: "scenario", id: "custom" })).toEqual(newImportPractice("custom"));
  });
  it("creates independent fixtures and never restores a previous practice approval", () => {
    const one = newImportPractice("custom");
    one.mappings.customFieldValue = "Changed";
    expect(newImportPractice("custom").mappings.customFieldValue).not.toBe("Changed");
    expect(newImportPractice("custom")).toMatchObject({ confirmed: false, rows: [], stage: "setup" });
  });
  it("finishes a no-change practice without inventing writes or clearing holds", () => {
    expect(reduce(review("updates", false), { type: "finish-unchanged" }).stage).toBe("results");
    const held = review("custom");
    expect(reduce(held, { type: "finish-unchanged" })).toBe(held);
  });
});
