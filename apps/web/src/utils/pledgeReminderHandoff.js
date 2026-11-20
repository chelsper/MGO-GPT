import { calendarDate } from "./prospectActivity";

const clean = value => typeof value === "string" ? value.trim() : "";
export const HANDOFF_LIFETIME_MS = 15 * 60 * 1000;
export const PLEDGE_GIVING_URL = "https://www.ju.edu/give";
export function validReminderEmail(value) {
  return typeof value === "string" && value.length <= 254 &&
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)+$/.test(value);
}

export function pledgeReminderEmailRecipient(profile, expectedId) {
  const hold = reason => ({ address: "", reason });
  if (String(profile?.id) !== expectedId) throw new Error("The constituent identity could not be verified.");
  if (profile.deceased !== false || profile.inactive !== false)
    return hold("Check the constituent's active/deceased status in NXT before preparing email.");
  const email = profile.email;
  if (!email) return hold("No primary email is available in NXT. The PDF is still available for the postal workflow.");
  if (String(email.constituent_id) !== expectedId)
    return hold("The primary email does not match this constituent. Check NXT before preparing email.");
  if (email.do_not_email !== false || email.inactive !== false)
    return hold("The primary NXT email is restricted, inactive, or its permission status is unconfirmed. Check NXT before preparing email.");
  const address = clean(email.address);
  if (!validReminderEmail(address)) return hold("The primary NXT email needs correction before preparing email.");
  return { address, reason: "" };
}

export function reminderEmailText(addressee) {
  const name = clean(addressee).replace(/\s+/g, " ");
  return {
    subject: "Your Jacksonville University pledge reminder",
    message: `Dear ${name},\n\nThank you for your generous support of Jacksonville University. Your investment makes a meaningful difference for our students and faculty.\n\nPlease find your pledge reminder attached. If you have already made this payment, thank you. Please let us know so we can confirm it has been applied.\n\nIf you have questions about your pledge, please reply to this email.\n\nWith appreciation,\nJacksonville University Advancement`,
  };
}

export function reminderEmailLinks(address, subject, message) {
  if (!validReminderEmail(address) || typeof subject !== "string" || !subject.trim() || subject.length > 160 ||
    /[\x00-\x1f\x7f]/.test(subject) || typeof message !== "string" || !message.trim() || message.length > 2000 ||
    /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(message)) return null;
  const query = `subject=${encodeURIComponent(subject.trim())}&body=${encodeURIComponent(message.trim())}`;
  // Encode each value separately so donor text can never add To/CC/BCC parameters.
  const outlook = `https://outlook.office.com/mail/deeplink/compose?to=${encodeURIComponent(address)}&${query}`;
  const desktop = `mailto:${encodeURIComponent(address)}?${query}`;
  return outlook.length <= 6000 ? { outlook, desktop } : null;
}

export function reminderPdfFilename(pledge, letterDate) {
  if (calendarDate(letterDate) !== letterDate) throw new Error("Choose a valid letter date.");
  const id = String(pledge.lookupId || pledge.id).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 50);
  return `pledge-reminder-${id}-${letterDate}.pdf`;
}
