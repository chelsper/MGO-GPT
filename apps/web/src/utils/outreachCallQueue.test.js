import { expect, it } from "vitest";
import { saved, result } from "../../test/fixtures/projectOutreach";
import {
  outreachCallQueue,
  outreachCallLabel,
  recordedCallOutcome,
  canAdvanceCall,
} from "./outreachCallQueue";
const task = (id, overrides = {}) => ({
  ...structuredClone(saved.tasks[0]),
  id,
  name: id,
  ...overrides,
});
const state = (tasks) => ({ ...saved, tasks });
it("prioritizes overdue follow-ups, due assignments and then untouched assignments deterministically", () => {
  const tasks = [
    task("later", { dueDate: "2026-12-01" }),
    task("today", { dueDate: saved.today }),
    task("old assignment", { dueDate: "2026-11-01" }),
    task("followup", { stage: "follow_up", dueDate: "2026-11-19" }),
    task("future followup", { stage: "follow_up", dueDate: "2026-11-21" }),
    task("followup today", { stage: "follow_up", dueDate: saved.today }),
  ];
  expect(outreachCallQueue(state(tasks)).map((t) => t.id)).toEqual([
    "followup",
    "old assignment",
    "followup today",
    "today",
    "later",
  ]);
  expect(tasks[0].id).toBe("later");
  expect(outreachCallLabel(tasks[3], saved.today)).toBe("Overdue follow-up");
  expect(outreachCallLabel(tasks[2], saved.today)).toBe("Overdue assignment");
  expect(outreachCallLabel(tasks[1], saved.today)).toBe("Due today");
  expect(outreachCallLabel(tasks[0], saved.today)).toBe("Not started");
});
it.each([
  { assigneeId: 9 },
  { assigneeAvailable: false },
  { inCurrentQuery: false },
  { stage: "complete" },
  { dueDate: "" },
  { dueDate: "2026-02-30" },
  { stage: "unknown" },
  { events: [{ state: "processing" }] },
  { events: [{ state: "review" }] },
])("does not suggest unavailable or completed work: %j", (overrides) => {
  expect(outreachCallQueue(state([task("test", overrides)]))).toEqual([]);
});
it("keeps drafts independent from actual outreach and omits already handled session tasks", () => {
  const tasks = [
    task("draft", { events: [{ state: "draft" }] }),
    task("finished", { stage: "complete", events: [{ state: "draft" }] }),
  ];
  expect(outreachCallQueue(state(tasks)).map((t) => t.id)).toEqual(["draft"]);
  expect(outreachCallQueue(state(tasks), ["draft"])).toEqual([]);
  expect(outreachCallQueue({ ...state(tasks), canRecord: false })).toEqual([]);
  expect(outreachCallQueue({ ...state(tasks), today: "bad" })).toEqual([]);
  expect(outreachCallQueue(null)).toEqual([]);
});
const attempt = {
  result: { ...result, notes: "  Fictional outcome.  " },
  send: false,
};
const recorded = () =>
  state([
    {
      ...saved.tasks[0],
      events: [
        {
          id: result.eventId,
          actorId: 8,
          state: "draft",
          result: structuredClone(result),
        },
      ],
    },
  ]);
it("advances only after the exact persisted result is reloaded, and NXT only when confirmed", () => {
  expect(canAdvanceCall(saved, attempt)).toBe(false);
  const data = recorded();
  expect(canAdvanceCall(data, attempt)).toBe(true);
  expect(canAdvanceCall(data, { ...attempt, send: true })).toBe(false);
  for (const status of ["processing", "review", "unknown"]) {
    data.tasks[0].events[0].state = status;
    expect(canAdvanceCall(data, attempt)).toBe(false);
  }
  data.tasks[0].events[0].state = "confirmed";
  expect(canAdvanceCall(data, { ...attempt, send: true })).toBe(true);
});
it.each([
  "eventId",
  "taskId",
  "version",
  "outcome",
  "notes",
  "actionDate",
  "stage",
  "nextDate",
  "contactReviewed",
])("rejects a different persisted %s", (key) => {
  const data = recorded();
  data.tasks[0].events[0].result[key] = "different";
  expect(recordedCallOutcome(data, attempt)).toBeNull();
});
it("does not accept another actor or event ID", () => {
  const data = recorded();
  data.tasks[0].events[0].actorId = 9;
  expect(recordedCallOutcome(data, attempt)).toBeNull();
  data.tasks[0].events[0].actorId = 8;
  data.tasks[0].events[0].id = "other";
  expect(recordedCallOutcome(data, attempt)).toBeNull();
  expect(recordedCallOutcome(data, null)).toBeNull();
});
