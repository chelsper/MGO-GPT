import { calendarDate, formatCalendarDate } from "./prospectActivity";
import { normalizeDashboardAssistant } from "./dashboardAssistantSettings";

const clean = (value, max = 1200) => typeof value === "string"
  ? value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
const dateLabel = value => formatCalendarDate(value, { month: "short", day: "numeric", year: "numeric" });
const money = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);

export function priorityDraftContext(item) {
  if (!item || !["follow-up", "opportunity", "gift"].includes(item.kind) || !item.key || !item.revision) return null;
  const name = clean(item.constituentName, 200) || "This constituent";
  const title = clean(item.title, 300);
  const date = calendarDate(item.dueDate);
  if (!title || !date) return null;
  const gift = item.kind === "gift" && typeof item.giftAmount === "number" && Number.isFinite(item.giftAmount) && item.giftAmount > 0;
  if (item.kind === "gift" && !gift) return null;
  const checked = calendarDate(item.savedAt);
  return {
    identity: item.key, revision: item.revision, name, kind: item.kind,
    giftAmount: gift ? item.giftAmount : null,
    facts: [{ title: item.kind === "gift" ? "Gift" : item.kind === "opportunity" ? "Opportunity" : "Follow-up",
      text: gift ? `A ${money(item.giftAmount)} gift was recorded on ${dateLabel(date)}.`
        : `${title}. ${item.kind === "opportunity" ? "Expected" : "Due"} ${dateLabel(date)}.`,
      source: `${gift ? "Saved NXT gift source" : "Saved app record"}${checked ? ` · ${gift ? "Checked" : "Updated"} ${dateLabel(checked)}` : " · Check date unavailable"}` }],
  };
}

export function briefingDraftContext({ constituentId, name, sections }) {
  if (!constituentId || !Array.isArray(sections)) return null;
  const facts = sections.slice(0, 8).map(section => ({ title: clean(section.title, 80), text: clean(section.text), source: clean(section.source, 200) }))
    .filter(section => section.title && section.text && section.source);
  if (!facts.length) return null;
  return { identity: `constituent:${constituentId}`, name: clean(name, 200) || "This constituent", kind: "briefing", facts };
}

export const draftModes = context => context?.kind === "gift" ? ["thank-you", "meeting"] : ["meeting"];
export const draftLabel = mode => mode === "thank-you" ? "Thank-you draft" : "Meeting notes";
export const draftFingerprint = context => JSON.stringify(context);
export const hasDraftPlaceholders = text => /\[(?:Preferred greeting|Your name)\]/i.test(text);

// These starters use only the supplied saved facts. No model, network, storage,
// or inferred relationship/impact/solicitation claims belong in this builder.
export function buildOutreachDraft(context, mode) {
  if (!context || !draftModes(context).includes(mode)) return "";
  const { tone, thankYouMessage } = normalizeDashboardAssistant(context.drafting);
  if (mode === "thank-you") {
    const wording = thankYouMessage || (tone === "professional"
      ? "We appreciate your support. Please let me know if you have any questions or would like an update."
      : tone === "concise" ? "I appreciate your support. Please reach out if you have any questions."
        : "I appreciate your support and would welcome the chance to hear what inspired your gift.\n\nIf you have any questions or would like to stay in touch, please let me know.");
    return `Dear [Preferred greeting],\n\nThank you for your gift of ${money(context.giftAmount)}.${thankYouMessage ? "\n\n" : " "}${wording}\n\n${tone === "professional" ? "With appreciation" : tone === "concise" ? "Thank you" : "With thanks"},\n[Your name]`;
  }
  let questions = context.kind === "opportunity"
    ? ["What would be most useful to discuss at this point?", "Does the expected timing still fit?", "What would a useful next step look like, and who will follow up?"]
    : context.kind === "gift"
      ? ["What inspired this gift?", "How would they prefer to hear about the work they support?", "Would they welcome another conversation or an update?"]
      : ["What matters most to them right now?", "What would make this conversation useful for them?", "What next step, owner, and timing should we agree on?"];
  if (tone === "professional") questions = context.kind === "opportunity"
    ? ["Which topics would be most helpful to address?", "Is the expected timing still appropriate?", "What next step and follow-up responsibilities should we agree on?"]
    : context.kind === "gift" ? ["What motivated this gift?", "How would they prefer to receive updates?", "Would a further conversation be helpful?"]
      : ["What are their current priorities?", "Which topics would be most useful to discuss?", "What next step, owner, and timeline should we agree on?"];
  if (tone === "concise") questions = context.kind === "opportunity"
    ? ["What should we discuss?", "Does the timing still work?", "Who will do what next, and when?"]
    : context.kind === "gift" ? ["What inspired the gift?", "How would they like updates?", "Would they like to talk again?"]
      : ["What matters most now?", "What would be useful to discuss?", "Who will follow up, and when?"];
  return `Meeting preparation: ${context.name}\n\nSAVED CONTEXT (not a live NXT check)\n${context.facts.map(fact => `${fact.title}: ${fact.text}\nSource: ${fact.source}`).join("\n\n")}\n\nQUESTIONS TO CONSIDER (suggestions, not recorded donor preferences)\n${questions.map(question => `- ${question}`).join("\n")}\n\nMY GOAL FOR THE CONVERSATION\n\n\nNOTES TO ADD AFTER THE CONVERSATION\n\n\nAGREED NEXT STEP, OWNER, AND DATE\n\n\nPreparation only. No meeting, action, or follow-up has been recorded.`;
}
