import { validActionDate } from "./actionEntryOptions";

export function outreachCallPriority(task, today) {
  if (task.stage === "follow_up" && task.dueDate < today) return 0;
  if (task.dueDate <= today) return 1;
  return 2;
}

export function outreachCallLabel(task, today) {
  if (outreachCallPriority(task, today) === 0) return "Overdue follow-up";
  if (task.dueDate < today) return "Overdue assignment";
  if (task.dueDate === today) return "Due today";
  return "Not started";
}

// Saved data only. Pending NXT paperwork never makes a completed call due again.
export function outreachCallQueue(saved, handledIds = []) {
  if (!saved?.canRecord || !validActionDate(saved.today)) return [];
  const handled = new Set(handledIds);
  return saved.tasks
    .filter(
      (task) =>
        task.assigneeId === saved.viewerId &&
        task.assigneeAvailable &&
        task.inCurrentQuery &&
        !handled.has(task.id) &&
        validActionDate(task.dueDate) &&
        (task.stage === "not_started" ||
          (task.stage === "follow_up" && task.dueDate <= saved.today)) &&
        !task.events.some((event) =>
          ["processing", "review"].includes(event.state),
        ),
    )
    .sort(
      (a, b) =>
        outreachCallPriority(a, saved.today) -
          outreachCallPriority(b, saved.today) ||
        a.dueDate.localeCompare(b.dueDate) ||
        a.name.localeCompare(b.name) ||
        a.id.localeCompare(b.id),
    );
}

// Confirm the exact immutable result, not just a successful POST response.
export function recordedCallOutcome(saved, attempt) {
  if (!attempt) return null;
  const result = attempt.result;
  const event = saved?.tasks
    .find((task) => task.id === result.taskId)
    ?.events.find((event) => event.id === result.eventId);
  if (!event || event.actorId !== saved.viewerId) return null;
  const fields = [
    "eventId",
    "taskId",
    "version",
    "outcome",
    "actionDate",
    "stage",
    "nextDate",
    "contactReviewed",
  ];
  if (
    fields.some((key) => event.result?.[key] !== result[key]) ||
    event.result?.notes !== result.notes.trim()
  )
    return null;
  return event;
}

export function canAdvanceCall(saved, attempt) {
  const event = recordedCallOutcome(saved, attempt);
  return (
    !!event &&
    (event.state === "confirmed" || (!attempt.send && event.state === "draft"))
  );
}
