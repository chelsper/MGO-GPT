import { validActionDate, INTERACTION_TYPES } from "./actionEntryOptions";
import {
  projectConstituentId,
  projectIdentity,
  projectProspectRows,
} from "./projectProspecting";

export const OUTREACH_OUTCOMES = Object.freeze({
  reached: "Reached",
  voicemail: "Left voicemail",
  no_answer: "No answer",
  follow_up: "Follow-up needed",
  declined: "Declined",
  contact_issue: "Contact information needs correction",
});
export const OUTREACH_LIMIT = 100;
export const outreachUuid = (value) =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const outreachVersion = (value) =>
  Number.isSafeInteger(value) && value >= 0;
const plain = (value) =>
  value && typeof value === "object" && !Array.isArray(value);

export function validateOutreachSettings(value, headers = []) {
  if (
    !plain(value) ||
    Object.keys(value).some(
      (k) =>
        ![
          "nameColumn",
          "phoneColumn",
          "restrictionColumn",
          "deadline",
          "instructions",
          "interactionType",
        ].includes(k),
    )
  )
    return "Choose valid outreach settings.";
  if (
    !value.nameColumn ||
    headers.filter((h) => h === value.nameColumn).length !== 1
  )
    return "Select the constituent name output column.";
  for (const key of ["phoneColumn", "restrictionColumn"]) {
    if (
      typeof value[key] !== "string" ||
      (value[key] && headers.filter((h) => h === value[key]).length !== 1)
    )
      return "Choose contact columns from the saved query output.";
  }
  if (!validActionDate(value.deadline)) return "Choose a project deadline.";
  if (
    typeof value.instructions !== "string" ||
    value.instructions.length > 2000
  )
    return "Instructions must be 2,000 characters or fewer.";
  if (!INTERACTION_TYPES.includes(value.interactionType))
    return "Choose an NXT action type.";
  return null;
}

export function validateOutreachOutcome(body, today) {
  if (
    !plain(body) ||
    Object.keys(body).some(
      (k) =>
        ![
          "eventId",
          "taskId",
          "version",
          "outcome",
          "notes",
          "actionDate",
          "stage",
          "nextDate",
          "contactReviewed",
        ].includes(k),
    )
  )
    return "Choose a valid outreach result.";
  if (
    !outreachUuid(body.eventId) ||
    !outreachUuid(body.taskId) ||
    !outreachVersion(body.version)
  )
    return "Reload this assignment before recording a result.";
  if (!Object.hasOwn(OUTREACH_OUTCOMES, body.outcome))
    return "Choose what happened.";
  if (
    typeof body.notes !== "string" ||
    !body.notes.trim() ||
    body.notes.length > 4000
  )
    return "Enter notes, up to 4,000 characters.";
  if (!validActionDate(body.actionDate) || body.actionDate > today)
    return "Choose the actual interaction date, not a future date.";
  if (!["follow_up", "complete"].includes(body.stage))
    return "Choose follow-up needed or outreach complete.";
  if (
    body.stage === "follow_up" &&
    (!validActionDate(body.nextDate) || body.nextDate < body.actionDate)
  )
    return "Choose a follow-up date on or after the interaction date.";
  if (body.stage === "complete" && body.nextDate !== "")
    return "Clear the follow-up date when closing outreach.";
  if (body.contactReviewed !== true)
    return "Confirm you reviewed contact preferences before recording outreach.";
  return null;
}

export function outreachPeople(snapshot, source, settings) {
  const identity = projectIdentity(snapshot, source);
  if (identity.error) return [];
  const index = (key) => snapshot?.headers?.indexOf(settings?.[key]);
  return projectProspectRows(snapshot, identity)
    .filter((p) => projectConstituentId(p.id))
    .map((person) => {
      const cell = (key) => person.values[index(key)] || [];
      return {
        constituentId: person.id,
        name: cell("nameColumn").join(" / ") || `NXT constituent ${person.id}`,
        phones: cell("phoneColumn"),
        restrictions: cell("restrictionColumn"),
      };
    });
}

export function outreachCounts(tasks) {
  return {
    assigned: tasks.length,
    attempted: tasks.filter((t) =>
      t.events.some((e) => e.result.outcome !== "contact_issue"),
    ).length,
    reached: tasks.filter((t) =>
      t.events.some((e) => ["reached", "declined"].includes(e.result.outcome)),
    ).length,
    followUp: tasks.filter((t) => t.stage === "follow_up").length,
    complete: tasks.filter((t) => t.stage === "complete").length,
    pendingNxt: tasks.reduce(
      (n, t) => n + t.events.filter((e) => e.state !== "confirmed").length,
      0,
    ),
  };
}
