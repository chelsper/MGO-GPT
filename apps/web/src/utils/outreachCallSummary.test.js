import { expect, it } from "vitest";
import { outreachCallSummary, outreachRecordedDay, outreachResumeQueue } from "./outreachCallSummary";
import { saved, result } from "../../test/fixtures/projectOutreach";

const event = (id, patch = {}) => ({ id, actorId: saved.viewerId, createdAt: "2026-11-20T15:00:00Z", state: "draft", result, ...patch });
const data = events => ({ ...saved, tasks: [{ ...saved.tasks[0], events }] });
it.each([
  ["2026-11-20T04:59:59Z", "2026-11-19"],
  ["2026-11-20T05:00:00Z", "2026-11-20"],
  ["2026-07-02T03:59:59Z", "2026-07-01"],
  ["2026-07-02T04:00:00Z", "2026-07-02"],
  [null, null], ["invalid", null],
])("dates recorded outcomes in Eastern time: %s", (input, expected) => {
  expect(outreachRecordedDay(input)).toBe(expected);
});
it("uses saved creation dates, not interaction dates, with exact actor scoping and unique event IDs", () => {
  const first = event("1", { result: { ...result, actionDate: "2026-10-01" } });
  const summary = outreachCallSummary(data([first, first,
    event("2", { actorId: 9 }),
    event("3", { createdAt: "2026-11-19T12:00:00Z" }),
    event("4", { createdAt: null }),
  ]));
  expect(summary.people).toBe(1);
  expect(summary.today.map(({event}) => event.id)).toEqual(["1"]);
  expect(summary.unfinished).toHaveLength(3);
  expect(summary.statuses).toEqual({ confirmed: 0, draft: 1, verification: 0 });
});
it("uses the latest outcome per person while counting all actions and retaining earlier unfinished records", () => {
  const state = data([
    event("1", { createdAt: "2026-11-20T14:00:00Z", state: "confirmed" }),
    event("2", { result: { ...result, outcome: "voicemail", stage: "follow_up", nextDate: "2026-11-25" } }),
    event("3", { createdAt: "2026-11-19T12:00:00Z", state: "review" }),
  ]);
  state.tasks.push({ ...state.tasks[0], id: "other", events: [event("4", { state: "processing" })] });
  const summary = outreachCallSummary(state);
  expect(summary.people).toBe(2);
  expect(summary.outcomes.reached).toBe(1);
  expect(summary.outcomes.voicemail).toBe(1);
  expect(summary.followUps).toBe(1);
  expect(summary.statuses).toEqual({ confirmed: 1, draft: 1, verification: 1 });
  expect(summary.unfinished).toHaveLength(3);
});
it("keeps authored outcomes after reassignment without including the new caller's actions", () => {
  const state = data([event("1"), event("2", { actorId: 9 })]);
  state.tasks[0].assigneeId = 9;
  expect(outreachCallSummary(state).today).toHaveLength(1);
  expect(outreachResumeQueue(state)).toEqual([]);
});
it("does not show personal summaries without recording permission or a valid saved date", () => {
  expect(outreachCallSummary(null)).toBeNull();
  expect(outreachCallSummary({ ...data([event("1")]), canRecord: false })).toBeNull();
  expect(outreachCallSummary({ ...saved, today: "bad" })).toBeNull();
});
it("reconstructs a safe resume queue without repeating today's recorded calls, including same-day follow-ups", () => {
  const state = data([event("1")]);
  state.tasks[0].stage = "follow_up";
  state.tasks[0].dueDate = state.today;
  expect(outreachResumeQueue(state)).toEqual([]);
  const later = { ...state, today: "2026-11-21" };
  expect(outreachResumeQueue(later).map(t => t.id)).toEqual([state.tasks[0].id]);
  expect(outreachResumeQueue(later, [state.tasks[0].id])).toEqual([]);
  state.tasks[0].events[0].state = "review";
  expect(outreachResumeQueue(later)).toEqual([]);
});
it("keeps completed, future, unavailable, other-caller, and removed assignments out of resume", () => {
  for (const patch of [{ stage: "complete" }, { stage: "follow_up", dueDate: "2026-12-31" }, { assigneeAvailable: false }, { assigneeId: 9 }, { inCurrentQuery: false }]) {
    expect(outreachResumeQueue({ ...saved, tasks: [{ ...saved.tasks[0], ...patch }] })).toEqual([]);
  }
});
