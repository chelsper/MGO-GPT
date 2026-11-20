import { buildBlackbaudActionPayload, buildBlackbaudActionMetadataPayload } from "./blackbaud";

export function reminderActionPayload(snapshot, sentDate, user) {
  const s = snapshot.snapshot;
  const money = cents => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  const notes = ["Staff confirmed sending this pledge reminder in Outlook with the matching PDF attached. Email delivery was not verified by the app.",
    `Reminder reference: JU-PR-${snapshot.event_key.slice(0, 24)}`,
    `Pledge: ${s.lookupId} (system ID ${s.pledgeId})`, `Recipient: ${s.name}`, `Email: ${s.email}`,
    `Letter date: ${s.letterDate}`, `Due date: ${s.dueDate}`, `Worklist: ${s.view === "pastDue" ? "Past due" : "Upcoming"}`,
    `Fund: ${s.funds.join("; ")}`, `Amount due on reminder: ${money(s.amountDueCents)}`,
    `Pledged: ${money(s.totalCents)}; paid to date: ${money(s.paidToDateCents)}; balance: ${money(s.balanceCents)}`,
    `Amounts last checked: ${s.refreshedAt}. These are the saved reminder amounts, not a new balance check.`,
    `Recorded by JU staff account ${user.id}: ${user.name || user.email}`].join("\n");
  return { ...buildBlackbaudActionPayload({ blackbaudConstituentId: s.constituentId, actionDate: sentDate,
    actionCategory: "Email", summary: `Pledge reminder sent - ${s.lookupId}`.slice(0, 255), actionNotes: notes,
    authorName: user.name || user.email, completed: true }),
    ...buildBlackbaudActionMetadataPayload({ actionDate: sentDate, interactionType: "Stewardship", completed: true }) };
}
export function reminderActionMatches(record, expected, actionId) {
  const r = record?.value && !Array.isArray(record.value) ? record.value : record;
  const normalize = text => typeof text === "string" ? text.replace(/\r\n/g, "\n") : null;
  return String(r?.id || r?.action_id || "") === actionId && String(r?.constituent_id || "") === expected.constituent_id
    && r.completed === true && r.type === expected.type && r.direction === expected.direction
    && String(r.category || "").toLowerCase() === expected.category.toLowerCase()
    && String(r.date || "").slice(0, 10) === expected.date.slice(0, 10)
    && String(r.completed_date || "").slice(0, 10) === expected.completed_date.slice(0, 10)
    && r.summary === expected.summary && normalize(r.description) === normalize(expected.description);
}
