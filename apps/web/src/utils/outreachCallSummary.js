import { validActionDate } from "./actionEntryOptions";
import { OUTREACH_OUTCOMES } from "./projectOutreach";
import { outreachCallQueue } from "./outreachCallQueue";

const easternDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
});
export function outreachRecordedDay(value) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  const parts = Object.fromEntries(easternDay.formatToParts(new Date(value)).map(({ type, value }) => [type, value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function outreachResumeQueue(saved, excludedIds = []) {
  const todayIds = outreachCallSummary(saved)?.today.map(({ task }) => task.id) || [];
  return outreachCallQueue(saved, [...excludedIds, ...todayIds]);
}

// Count saved records, never a POST acknowledgement or an unsaved draft.
export function outreachCallSummary(saved) {
  if (!saved?.canRecord || !validActionDate(saved.today)) return null;
  const seen = new Set();
  const events = saved.tasks.flatMap(task => task.events
    .filter(event => {
      if (event.actorId !== saved.viewerId || seen.has(event.id)) return false;
      seen.add(event.id);
      return true;
    })
    .map(event => ({ task, event })))
    .sort((a, b) => (Date.parse(b.event.createdAt) || 0) - (Date.parse(a.event.createdAt) || 0) || a.event.id.localeCompare(b.event.id));
  const today = events.filter(({ event }) => outreachRecordedDay(event.createdAt) === saved.today);
  const latest = new Map();
  for (const entry of today) if (!latest.has(entry.task.id)) latest.set(entry.task.id, entry);
  const outcomes = Object.fromEntries(Object.keys(OUTREACH_OUTCOMES).map(key => [key, 0]));
  for (const { event } of latest.values()) if (Object.hasOwn(outcomes, event.result.outcome)) outcomes[event.result.outcome]++;
  const statusCounts = entries => ({
    confirmed: entries.filter(({ event }) => event.state === "confirmed").length,
    draft: entries.filter(({ event }) => event.state === "draft").length,
    verification: entries.filter(({ event }) => !["draft", "confirmed"].includes(event.state)).length,
  });
  return {
    today, people: latest.size, outcomes, statuses: statusCounts(today),
    followUps: [...latest.values()].filter(({ event }) => event.result.stage === "follow_up").length,
    unfinished: events.filter(({ event }) => event.state !== "confirmed"),
    hasHistory: events.length > 0,
  };
}
