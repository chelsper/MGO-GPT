import { it, expect } from "vitest";
import {
  validateOutreachPriorities,
  prioritizeOutreachProjects,
} from "./outreachPriorities";
const row = (key, patch = {}) => ({
  key,
  open: 0,
  overdue: 0,
  today: 0,
  upcoming: 0,
  drafts: 0,
  verification: 0,
  ...patch,
});
const payload = (projects) => ({
  canRecord: true,
  today: "2026-11-22",
  checkedAt: "2026-11-22T16:00:00Z",
  projects,
});
it("validates complete count payloads without mutating them", () => {
  const value = payload([
    row("a", { open: 3, overdue: 1, today: 1, upcoming: 1 }),
  ]);
  expect(validateOutreachPriorities(value)).toBe(value);
  expect(
    validateOutreachPriorities({ ...payload([]), canRecord: false }).projects,
  ).toEqual([]);
});
it.each([
  null,
  {},
  { ...payload([]), today: "2026-02-30" },
  { ...payload([]), checkedAt: "bad" },
  payload([row("a"), row("a")]),
  payload([row("a", { overdue: -1 })]),
  payload([row("a", { drafts: "2" })]),
  payload([row("a", { open: 1 })]),
  { ...payload([row("a")]), canRecord: false },
  payload([null]),
  payload(Array.from({ length: 1001 }, (_, i) => row(String(i)))),
])("does not turn incomplete data into zero counts", (value) => {
  expect(() => validateOutreachPriorities(value)).toThrow();
});
it("prioritizes due work then own NXT follow-through without adding inaccessible projects", () => {
  const projects = [
    "later",
    "draft",
    "today",
    "overdue",
    "review",
    "empty",
  ].map((key) => ({ key, title: key }));
  const state = payload([
    row("later", { open: 1, upcoming: 1 }),
    row("draft", { drafts: 2 }),
    row("today", { open: 1, today: 1 }),
    row("overdue", { open: 1, overdue: 1 }),
    row("review", { verification: 1 }),
    row("empty"),
    row("hidden", { overdue: 99, open: 99 }),
  ]);
  const before = structuredClone(projects);
  expect(prioritizeOutreachProjects(projects, state).map((p) => p.key)).toEqual(
    ["overdue", "today", "review", "draft", "later", "empty"],
  );
  expect(projects).toEqual(before);
  expect(
    prioritizeOutreachProjects(projects, state, "actions").map((p) => p.key),
  ).toEqual(["review", "draft"]);
  expect(
    prioritizeOutreachProjects(projects, state, "today").map((p) => p.key),
  ).toEqual(["today"]);
  expect(
    prioritizeOutreachProjects(projects, null).every(
      (p) => p.priorities === undefined,
    ),
  ).toBe(true);
});
