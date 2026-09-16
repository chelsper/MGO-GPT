import { expect, it } from "vitest";
import { buildNextStepGroups, formatNextStepCompletion, formatNextStepDate, nextStepDay, pageNextStepGroups } from "./nextStepWorklist";

it("groups saved work by Eastern calendar day, including undated items and equal-date IDs", () => {
  const items = [
    { id: 5, due_date: null }, { id: 2, due_date: "2026-09-15" },
    { id: 3, due_date: "2026-09-14" }, { id: 1, due_date: "2026-09-15" }, { id: 4, due_date: "2026-09-16" },
  ];
  const groups = buildNextStepGroups(items, "2026-09-15");
  expect(groups.map(group => [group.label, group.items.map(item => item.id)])).toEqual([
    ["Overdue", [3]], ["Today", [1, 2]], ["Upcoming", [4]], ["No date", [5]],
  ]);
  expect(items[0].id).toBe(5);
});

it("searches all rows before paging and pages across group boundaries", () => {
  const items = Array.from({ length: 32 }, (_, id) => ({ id, title: `Task ${id}`, constituent_name: `Person ${id}`, due_date: id < 20 ? "2026-09-14" : null }));
  const groups = buildNextStepGroups(items, "2026-09-15");
  const first = pageNextStepGroups(groups, 1);
  const second = pageNextStepGroups(groups, 2);
  expect(first.map(group => group.items.length)).toEqual([20, 5]);
  expect(second[0].items.map(item => item.id)).toEqual([25, 26, 27, 28, 29, 30, 31]);
  expect(second[0].total).toBe(12);
  expect(buildNextStepGroups(items, "2026-09-15", "Open", "PERSON 31")[3].items).toHaveLength(1);
});

it("keeps completed history separate and sorts by completion newest first", () => {
  const groups = buildNextStepGroups([{ id: 1, completed_at: "2026-08-01" }, { id: 2, completed_at: "2026-09-01" }], "2026-09-15", "Done");
  expect(groups).toHaveLength(1);
  expect(groups[0].items.map(item => item.id)).toEqual([2, 1]);
});

it("formats date-only fields without moving them to the prior day", () => {
  expect(formatNextStepDate("2026-07-01")).toBe("Jul 1, 2026");
  expect(nextStepDay("2026-02-30")).toBe("");
  expect(nextStepDay("bad date")).toBe("");
});

it("formats completion timestamps in Eastern time rather than truncating their UTC date", () => {
  expect(formatNextStepCompletion("2026-09-15T01:00:00Z")).toBe("Completed Sep 14, 2026");
  expect(formatNextStepCompletion(null)).toBe("Completed (date unavailable)");
});
