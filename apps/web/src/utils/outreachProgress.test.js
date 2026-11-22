import { expect, it } from "vitest";
import { saved, result } from "../../test/fixtures/projectOutreach";
import { outreachProgress, matchesOutreachProgress } from "./outreachProgress";
const task = (id, changes = {}) => ({
  ...structuredClone(saved.tasks[0]),
  id,
  constituentId: id,
  ...changes,
});
const event = (actorId, state) => ({
  actorId,
  actorName: `Caller ${actorId}`,
  state,
  result,
});
const state = (tasks) => ({
  ...saved,
  canManage: true,
  callers: [
    { id: 8, name: "Caller 8" },
    { id: 9, name: "Caller 9" },
  ],
  tasks,
});

it("keeps completion, due work and action authorship distinct after reassignment", () => {
  const data = state([
    task("1", {
      assigneeId: 9,
      stage: "complete",
      dueDate: "2026-01-01",
      events: [event(8, "draft"), event(8, "review"), event(9, "confirmed")],
    }),
    task("2", {
      dueDate: "2026-11-19",
      stage: "follow_up",
      events: [event(8, "processing")],
    }),
    task("3", { dueDate: saved.today }),
    task("4", { dueDate: "2026-12-31" }),
  ]);
  const before = structuredClone(data);
  const progress = outreachProgress(data, []);
  expect(progress.callers[0]).toMatchObject({
    id: 8,
    assigned: 3,
    complete: 0,
    overdue: 1,
    today: 1,
    not_started: 2,
    draft: 1,
    uncertain: 2,
  });
  expect(progress.callers[1]).toMatchObject({
    id: 9,
    assigned: 1,
    complete: 1,
    overdue: 0,
    today: 0,
    draft: 0,
    uncertain: 0,
  });
  expect(data).toEqual(before);
});
it("counts unassigned people by identity, not query row or name", () => {
  const progress = outreachProgress(state([task("1")]), [
    { constituentId: "1" },
    { constituentId: "2" },
    { constituentId: "2" },
    { constituentId: "3" },
  ]);
  expect(progress.unassigned).toBe(2);
});
it("keeps unavailable assignees and outstanding action authors visible without making them eligible", () => {
  const progress = outreachProgress(
    state([
      task("1", {
        assigneeId: 10,
        assigneeName: "Former caller",
        assigneeAvailable: false,
        inCurrentQuery: false,
        events: [event(11, "draft")],
      }),
    ]),
    [],
  );
  expect(progress.callers.find((c) => c.id === 10)).toMatchObject({
    available: false,
    assigned: 1,
    attention: 1,
  });
  expect(progress.callers.find((c) => c.id === 11)).toMatchObject({
    available: false,
    assigned: 0,
    draft: 1,
  });
  expect(progress.callers.find((c) => c.id === 9)).toMatchObject({
    available: true,
    assigned: 0,
  });
});
it("does not build manager progress for a caller or read-only viewer", () => {
  expect(outreachProgress(saved, [])).toBeNull();
  expect(outreachProgress(null, [])).toBeNull();
});
it("keeps two callers with the same name separate by their user ID", () => {
  const data = state([task("1"), task("2", { assigneeId: 9 })]);
  data.callers.forEach((caller) => {
    caller.name = "Shared name";
  });
  expect(
    outreachProgress(data, []).callers.map((caller) => [
      caller.id,
      caller.assigned,
    ]),
  ).toEqual([
    [8, 1],
    [9, 1],
  ]);
});
it("does not mark invalid or missing dates as due", () => {
  const progress = outreachProgress(
    state([task("1", { dueDate: "" }), task("2", { dueDate: "2026-02-30" })]),
    [],
  );
  expect(progress.callers[0]).toMatchObject({ overdue: 0, today: 0 });
  expect(
    outreachProgress({ ...state([task("1")]), today: "bad" }, []).callers[0]
      .overdue,
  ).toBe(0);
});
it.each([
  ["assigned", { stage: "complete" }, true],
  ["not_started", { stage: "follow_up" }, false],
  ["overdue", { dueDate: "2026-11-19" }, true],
  ["overdue", { stage: "complete", dueDate: "2026-11-19" }, false],
  ["today", { dueDate: saved.today }, true],
  ["today", { dueDate: "2026-11-19" }, false],
  ["complete", { stage: "complete" }, true],
  ["attention", { inCurrentQuery: false }, true],
  ["attention", { assigneeAvailable: false }, true],
  ["attention", {}, false],
  ["unknown", {}, false],
])("matches the %s assignment count exactly", (metric, overrides, expected) => {
  expect(
    matchesOutreachProgress(
      { task: task("1", overrides) },
      { callerId: 8, metric },
      saved.today,
    ),
  ).toBe(expected);
  expect(
    matchesOutreachProgress(
      { task: task("1", overrides) },
      { callerId: 9, metric },
      saved.today,
    ),
  ).toBe(false);
});
it("filters pending actions by author and never by the new assignee", () => {
  const person = {
    task: task("1", {
      assigneeId: 9,
      events: [event(8, "draft"), event(8, "review")],
    }),
  };
  expect(
    matchesOutreachProgress(
      person,
      { callerId: 8, metric: "draft" },
      saved.today,
    ),
  ).toBe(true);
  expect(
    matchesOutreachProgress(
      person,
      { callerId: 9, metric: "draft" },
      saved.today,
    ),
  ).toBe(false);
  expect(
    matchesOutreachProgress(
      person,
      { callerId: 8, metric: "uncertain" },
      saved.today,
    ),
  ).toBe(true);
  expect(
    matchesOutreachProgress(
      person,
      { callerId: 9, metric: "assigned" },
      saved.today,
    ),
  ).toBe(true);
});
it("counts actions while the drill-down deduplicates their people", () => {
  const t = task("1", { events: [event(8, "draft"), event(8, "draft")] });
  expect(outreachProgress(state([t]), []).callers[0].draft).toBe(2);
  expect(
    [{ task: t }].filter((p) =>
      matchesOutreachProgress(p, { callerId: 8, metric: "draft" }, saved.today),
    ),
  ).toHaveLength(1);
  expect(
    matchesOutreachProgress({}, { metric: "unassigned" }, saved.today),
  ).toBe(true);
  expect(
    matchesOutreachProgress({ task: t }, { metric: "unassigned" }, saved.today),
  ).toBe(false);
  expect(matchesOutreachProgress({}, null, saved.today)).toBe(true);
});
