import { calendarDate, formatCalendarDate } from "./prospectActivity";
import { projectCsv } from "./projectProspecting";

export const PLEDGE_REMINDER_LIMIT = 200;
export const REMINDER_FIELDS = ["Addressee", "Address_Line_1", "Address_Line_2", "City", "State", "Zip"];
export const REMINDER_HEADERS = ["Letter_Date", ...REMINDER_FIELDS, "Fund", "Pledge_Amount", "Amount_Paid_to_Date", "Installment_Amount",
  "Due_Date", "Pledge_Balance", "Pledge_ID", "Pledge_System_ID", "Constituent_System_ID", "Amounts_As_Of", "Pledge_Last_Verified", "Mailing_Details_Checked"];
const text = value => typeof value === "string" ? value.trim() : "";
const cents = value => Number.isSafeInteger(value) && value >= 0;
const money = value => (value / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

export function pledgeReminderIssue(row) {
  if (row.stale) return "Refresh this pledge before preparing a reminder.";
  if (!/^[1-9]\d*$/.test(row.id) || !/^[1-9]\d*$/.test(row.constituentId) || !Number.isFinite(Date.parse(row.refreshedAt)))
    return "This pledge's saved identity or verification date needs review.";
  if (![row.totalCents, row.paidToDateCents, row.balanceCents, row.amountDueCents].every(cents) || row.amountDueCents <= 0 ||
    row.amountDueCents > row.balanceCents || row.balanceCents > row.totalCents || row.paidToDateCents > row.totalCents - row.balanceCents || !calendarDate(row.dueDate))
    return "The pledge amounts or due date need review.";
  if (row.fundDescriptionsUnavailable || !Array.isArray(row.fundDescriptions) || !row.fundDescriptions.length || row.fundDescriptions.some(value => !text(value)))
    return "Refresh or correct the missing fund description before preparing a reminder.";
  return "";
}

export function pledgeReminderRecipient(profile, expectedId, today) {
  if (String(profile?.id) !== expectedId) throw new Error("The constituent identity could not be verified.");
  const address = profile.address;
  const lines = text(address?.address_lines).split(/\r?\n/).map(text).filter(Boolean);
  const fields = { Addressee: text(profile.name) || [profile.first, profile.middle, profile.last].map(text).filter(Boolean).join(" "),
    Address_Line_1: lines[0] || "", Address_Line_2: lines.slice(1).join("\n"),
    City: text(address?.city), State: text(address?.state), Zip: text(address?.postal_code) };
  const warnings = [];
  let blocked = "";
  if (profile.deceased === true) blocked = "NXT marks this constituent deceased. Review the recipient before creating a reminder.";
  else if (profile.inactive === true) blocked = "NXT marks this constituent inactive. Review the recipient before creating a reminder.";
  else if (address?.do_not_mail === true) blocked = "The NXT address is marked Do not mail. This reminder is not included.";
  if (address && String(address.constituent_id) !== expectedId) blocked = "The mailing address does not match this constituent.";
  if (address?.country && !["united states", "united states of america", "us", "usa"].includes(text(address.country).toLowerCase()))
    blocked = "This template uses a US mailing address. An international reminder needs a country-aware template.";
  const start = address?.start ? calendarDate(address.start) : null;
  const end = address?.end ? calendarDate(address.end) : null;
  if (!address || profile.no_valid_address === true || address.inactive === true ||
    (address.start && (!start || start > today)) || (address.end && (!end || end <= today)) || address.seasonal_start || address.seasonal_end) {
    for (const key of REMINDER_FIELDS.filter(key => key !== "Addressee")) fields[key] = "";
    warnings.push("No confirmed current mailing address. Enter a verified address or leave this reminder out.");
  }
  if (profile.deceased !== false || profile.inactive !== false || profile.no_valid_address !== false || address?.do_not_mail !== false || address?.inactive !== false)
    warnings.push("Review recipient status and mailing permissions in NXT before including this reminder.");
  if (profile.type === "Organization") warnings.push("Review the organization addressee and add an attention/contact line if needed.");
  return { fields, warnings, blocked };
}

export function pledgeReminderDraftIssue(draft) {
  if (draft.blocked) return draft.blocked;
  const pledgeIssue = pledgeReminderIssue(draft.pledge);
  if (pledgeIssue) return pledgeIssue;
  for (const key of REMINDER_FIELDS) {
    const value = draft.fields[key];
    if (typeof value !== "string" || value.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return `Check ${key.replaceAll("_", " ")}.`;
    if (key !== "Address_Line_2" && !value.trim()) return `Enter ${key.replaceAll("_", " ")}.`;
  }
  return "";
}

export function pledgeReminderCsv(drafts, letterDate, today) {
  if (calendarDate(letterDate) !== letterDate || calendarDate(today) !== today) throw new Error("Choose a valid letter date.");
  if (!drafts.length || drafts.length > PLEDGE_REMINDER_LIMIT || new Set(drafts.map(d => d.pledge.id)).size !== drafts.length)
    throw new Error("Choose a unique, nonempty selection of pledges.");
  const rows = drafts.map(draft => {
    const issue = pledgeReminderDraftIssue(draft);
    if (issue) throw new Error(issue);
    const p = draft.pledge;
    return [formatCalendarDate(letterDate), ...REMINDER_FIELDS.map(key => draft.fields[key].trim()), p.fundDescriptions.join("; "),
      money(p.totalCents), money(p.paidToDateCents), money(p.amountDueCents), formatCalendarDate(p.dueDate), money(p.balanceCents),
      p.lookupId, p.id, p.constituentId, formatCalendarDate(today), p.refreshedAt, draft.checkedAt];
  });
  return projectCsv(REMINDER_HEADERS, rows);
}
