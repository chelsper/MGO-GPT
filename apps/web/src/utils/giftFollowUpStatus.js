import { calendarDate } from "./prospectActivity";

// Share only task progress, never editable notes or the donor's gift snapshot.
export function giftFollowUpStatus(task, ownerName) {
  if (!task?.id || !task.owner_user_id || !["Open", "Done"].includes(task.status)) return null;
  return {
    id: String(task.id), ownerId: String(task.owner_user_id),
    ownerName: String(ownerName || "").trim() || "Workspace owner",
    title: task.title || "Stewardship follow-up", status: task.status,
    dueDate: calendarDate(task.due_date),
  };
}
