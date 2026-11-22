import { validActionDate } from "./actionEntryOptions";

export const OUTREACH_PROGRESS_METRICS = Object.freeze({
  assigned: "Assigned",
  not_started: "Not started",
  overdue: "Overdue",
  today: "Due today",
  complete: "Complete",
  attention: "Assignment needs review",
  draft: "NXT drafts",
  uncertain: "NXT verification needed",
});

const pending = (event, metric) =>
  metric === "draft"
    ? event.state === "draft"
    : event.state !== "draft" && event.state !== "confirmed";

function assignmentMatches(task, metric, today) {
  const open = task.stage !== "complete";
  switch (metric) {
    case "assigned":
      return true;
    case "not_started":
      return task.stage === "not_started";
    case "complete":
      return !open;
    case "overdue":
      return (
        open &&
        validActionDate(today) &&
        validActionDate(task.dueDate) &&
        task.dueDate < today
      );
    case "today":
      return open && validActionDate(today) && task.dueDate === today;
    case "attention":
      return !task.inCurrentQuery || !task.assigneeAvailable;
    default:
      return false;
  }
}

export function matchesOutreachProgress(person, selection, today) {
  if (!selection) return true;
  const task = person.task;
  if (selection.metric === "unassigned") return !task;
  if (!task) return false;
  if (["draft", "uncertain"].includes(selection.metric))
    return task.events.some(
      (event) =>
        event.actorId === selection.callerId &&
        pending(event, selection.metric),
    );
  return (
    task.assigneeId === selection.callerId &&
    assignmentMatches(task, selection.metric, today)
  );
}

// Assignment ownership and action authorship are intentionally separate.
export function outreachProgress(saved, people) {
  if (!saved?.canManage) return null;
  const members = new Map();
  const available = new Set(saved.callers.map((caller) => caller.id));
  const member = (id, name) => {
    if (!members.has(id))
      members.set(id, {
        id,
        name,
        available: available.has(id),
        ...Object.fromEntries(
          Object.keys(OUTREACH_PROGRESS_METRICS).map((key) => [key, 0]),
        ),
      });
    return members.get(id);
  };
  saved.callers.forEach((caller) => member(caller.id, caller.name));
  const assignedPeople = new Set();
  for (const task of saved.tasks) {
    assignedPeople.add(task.constituentId);
    const caller = member(task.assigneeId, task.assigneeName);
    for (const metric of Object.keys(OUTREACH_PROGRESS_METRICS))
      if (assignmentMatches(task, metric, saved.today)) caller[metric]++;
    for (const event of task.events) {
      if (event.state === "confirmed") continue;
      member(event.actorId, event.actorName)[
        event.state === "draft" ? "draft" : "uncertain"
      ]++;
    }
  }
  return {
    unassigned: new Set(
      people
        .filter((person) => !assignedPeople.has(person.constituentId))
        .map((person) => person.constituentId),
    ).size,
    callers: [...members.values()].sort(
      (a, b) => a.name.localeCompare(b.name) || a.id - b.id,
    ),
  };
}
