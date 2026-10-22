import { calendarDate, closedOpportunityKind, formatCalendarDate, latestDatedAction } from "./prospectActivity";
import { savedPortfolioActivityDate } from "./portfolioActivity";
import { ORGANIZATION_REPORTING_POLICY } from "./organizationRuntimePolicy";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: ORGANIZATION_REPORTING_POLICY.currencyCode });
const clean = (value, limit = 300) => typeof value === "string"
  ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, limit) : "";
const amount = value => (typeof value === "number" || typeof value === "string") && String(value).trim() !== "" &&
  Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const day = value => formatCalendarDate(value, { month: "short", day: "numeric", year: "numeric" });
const sentence = value => /[.!?]$/.test(value) ? value : `${value}.`;

function source(label, checkedAt, now) {
  const timestamp = Date.parse(checkedAt);
  if (!Number.isFinite(timestamp) || timestamp > now.getTime()) return `${label} · Check date unavailable`;
  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: ORGANIZATION_REPORTING_POLICY.timeZone, month: "short", day: "numeric", year: "numeric",
  }).format(new Date(timestamp));
  return `${label} · Checked ${date}`;
}

function isOpen(opportunity) {
  const labels = [opportunity.current_stage, opportunity.opportunity_status, opportunity.status]
    .map(value => clean(value).toLowerCase());
  if (closedOpportunityKind(opportunity) || labels.some(label => /archived|closed|cancelled|canceled/.test(label))) return false;
  return labels.some(label => ["active", "identification", "qualification", "cultivation", "solicitation", "solicitation - verbal"].includes(label));
}

// A briefing only describes supplied records. It never fetches, infers intent,
// or treats an absent field (or a limited proposal sample) as complete history.
export function buildDonorBriefing({
  constituentId, name, summary, activity, recentActivity, localActions = [],
  opportunities, signal, pledgeStatus, pledgeIncomplete = false, nextStep, now = new Date(),
}) {
  const id = String(constituentId || "");
  const matches = [summary?.constituentId, summary?.mapped?.constituent?.id]
    .every(value => value == null || String(value) === id);
  const mapped = matches ? summary?.mapped || {} : {};
  const warnings = matches ? summary?.warnings || {} : {};
  const checkedAt = matches ? summary?.summaryRefreshedAt : null;
  const sections = [];
  const add = (key, title, text, attribution) => {
    if (text) sections.push({ key, title, text, source: attribution });
  };
  const donor = clean(name || mapped.constituent?.name) || "This constituent";
  const education = !warnings.education && Array.isArray(mapped.jacksonvilleUniversityEducation)
    ? mapped.jacksonvilleUniversityEducation.find(record => clean(record.school)) : null;
  const business = !warnings.relationships ? mapped.primaryBusinessRelationship : null;
  const relationship = [];
  if (education) {
    const year = /^\d{4}$/.test(String(education.classOf)) ? education.classOf : null;
    relationship.push(`${donor}'s saved education record lists ${clean(education.school)}${year ? `, class of ${year}` : ""}.`);
  }
  if (clean(business?.organizationName)) {
    relationship.push(`The saved business relationship is with ${clean(business.organizationName)}${clean(business.position) ? ` (${clean(business.position)})` : ""}.`);
  }
  add("relationship", "Connection", relationship.join(" "), source("NXT summary", checkedAt, now));

  const lifetime = !warnings.lifetimeGiving &&
    (mapped.lifetimeGiving?.constituentId == null || String(mapped.lifetimeGiving.constituentId) === id)
    ? amount(mapped.lifetimeGiving?.totalGiving) : null;
  if (lifetime !== null) add("giving", "Giving", `Recorded lifetime giving is ${money.format(lifetime)}.`,
    source("NXT giving summary", summary?.givingRefreshedAt || checkedAt, now));

  for (const kind of ["gift", "action"]) {
    const recent = recentActivity?.[kind];
    const candidates = [activity?.[kind], recent?.data && { ...recent.data, checkedAt: recent.fetchedAt }]
      .filter(entry => savedPortfolioActivityDate(entry, now));
    // A later successful check takes precedence, even if a corrected record's
    // activity date is earlier. Do not borrow details from a different gift.
    candidates.sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt));
    const entry = candidates[0];
    const local = kind === "action" ? latestDatedAction(localActions.filter(item => item.action_category || item.action_type)
      .map(item => ({ id: item.id, date: item.update_date, summary: item.update_title, updatedAt: item.updated_at })), now) : null;
    if (local && (!entry || calendarDate(local.date) > calendarDate(entry.date))) {
      add("action", "Last action", sentence(`The latest action saved in the app is dated ${day(local.date)}${clean(local.summary) ? `: ${clean(local.summary)}` : ""}`), "Saved app activity");
    } else if (entry) {
      const value = kind === "gift" ? amount(entry.amount) : null;
      add(kind, kind === "gift" ? "Last gift" : "Last action", kind === "gift"
        ? `The latest saved gift${value !== null ? ` was ${money.format(value)}, dated` : " is dated"} ${day(entry.date)}.`
        : sentence(`The latest saved action is dated ${day(entry.date)}${clean(entry.summary) ? `: ${clean(entry.summary)}` : ""}`),
      source("NXT activity", entry.checkedAt, now));
    }
  }

  if (Array.isArray(opportunities)) {
    const unique = new Map();
    for (const item of opportunities) {
      const key = item.blackbaud_opportunity_id || item.id;
      if (key == null) continue;
      const previous = unique.get(String(key));
      if (!previous || Date.parse(item.updated_at) > Date.parse(previous.updated_at)) unique.set(String(key), item);
    }
    const open = [...unique.values()].filter(isOpen);
    if (open.length) {
      const amounts = open.map(item => amount(item.estimated_amount));
      const total = amounts.every(value => value !== null) ? amounts.reduce((sum, value) => sum + value, 0) : null;
      const nearest = open.filter(item => calendarDate(item.expected_date))
        .sort((a, b) => calendarDate(a.expected_date).localeCompare(calendarDate(b.expected_date)))[0];
      let text = `There ${open.length === 1 ? "is 1 open opportunity" : `are ${open.length} open opportunities`} in the saved app records${total !== null && Number.isFinite(total) ? `, totaling ${money.format(total)}` : ""}.`;
      if (nearest) text += ` ${clean(nearest.title) || "The earliest dated opportunity"} is in ${clean(nearest.current_stage) || "an open status"}, with an expected date of ${day(nearest.expected_date)}.`;
      add("opportunities", "Opportunities", text, "Saved app opportunities · Not a live NXT check");
    }
  } else if (signal?.hasOpen) {
    const count = Number.isSafeInteger(signal.openCount) && signal.openCount > 0 ? signal.openCount : null;
    const value = amount(signal.amount);
    add("opportunities", "Opportunities", `The saved app records include ${count ? `${count} open opportunit${count === 1 ? "y" : "ies"}` : "open opportunities"}${value !== null ? ` totaling ${money.format(value)}` : ""}.`, "Saved app opportunities · Not a live NXT check");
  }

  if (Number.isSafeInteger(pledgeStatus?.count) && pledgeStatus.count > 0) {
    const cents = pledgeStatus.balanceCents;
    let text = `The saved pledge report lists ${pledgeStatus.count} active pledge${pledgeStatus.count === 1 ? "" : "s"}${Number.isSafeInteger(cents) && cents >= 0 ? ` with ${money.format(cents / 100)} remaining` : ""}.`;
    if (calendarDate(pledgeStatus.nextPaymentDueDate)) text += ` The next payment date listed is ${day(pledgeStatus.nextPaymentDueDate)}.`;
    if (pledgeStatus.stale || pledgeIncomplete) text += " Confirm the current pledge details before outreach.";
    add("pledges", "Pledges", text, source("Pledge Payments report", pledgeStatus.verifiedAt, now));
  }
  const step = nextStep === undefined && signal?.nextStep
    ? { title: signal.nextStep, due_date: signal.dueDate, status: "Open" } : nextStep;
  if (step?.status === "Open" && !step.completed_at && clean(step.title)) {
    add("next-step", "Next step", `${sentence(clean(step.title))}${calendarDate(step.due_date) ? ` Due ${day(step.due_date)}.` : ""}`, "Saved next step");
  }
  return sections;
}
