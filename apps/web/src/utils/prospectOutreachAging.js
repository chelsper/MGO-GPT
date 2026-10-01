import { calendarDate } from './prospectActivity';

export const OUTREACH_BUCKETS = [
  { key: 'under30', label: 'Under 30 days' },
  { key: '30to59', label: '30-59 days' },
  { key: '60to89', label: '60-89 days' },
  { key: '90plus', label: '90+ days' },
];

// Saved evidence supports a review prompt, not a claim that no contact occurred.
export function buildOutreachAging(row, asOf) {
  const start = calendarDate(row.assignedDate);
  const today = calendarDate(asOf);
  const ended = calendarDate(row.endedDate);
  const inactive = reason => ({ eligible: false, reason, asOf: today, days: null, bucket: null, baselineDate: null, baseline: null, nextPlannedDate: null });
  if (!start || !today || (row.endedDate && !ended)) return inactive('Date unavailable');
  if (start > today) return inactive('Not yet assigned');
  if (ended && ended <= today) return inactive('Assignment ended');
  if (row.outcome) return inactive('Outcome recorded');
  const actions = (row.actions || []).map(action => ({ ...action, date: calendarDate(action.date) }))
    .filter(action => action.date && action.date >= start && (!ended || action.date < ended));
  const lastCompleted = actions.filter(a => a.completed === true && a.date <= today)
    .map(a => a.date).sort().at(-1);
  const nextPlannedDate = actions.filter(a => a.completed === false && a.date >= today)
    .map(a => a.date).sort()[0] || null;
  const baselineDate = lastCompleted || start;
  const days = Math.floor((Date.parse(today) - Date.parse(baselineDate)) / 86400000);
  return { eligible: true, reason: 'Awaiting outcome', asOf: today, days,
    bucket: days >= 90 ? '90plus' : days >= 60 ? '60to89' : days >= 30 ? '30to59' : 'under30',
    baselineDate, baseline: lastCompleted ? 'completed_action' : 'assignment', nextPlannedDate };
}

export function outreachAgingTotals(rows) {
  const result = Object.fromEntries(OUTREACH_BUCKETS.map(bucket => [bucket.key, 0]));
  for (const row of rows) if (row.outreach?.eligible && Object.hasOwn(result, row.outreach.bucket)) result[row.outreach.bucket] += 1;
  return result;
}
