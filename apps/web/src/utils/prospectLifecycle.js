import { calendarDate } from './prospectActivity';
import { getStandingsPeriods } from './standingsPeriods';
import { prospectExportCsv } from './prospectExport';
import { currentPipelineFiscalYear, pipelineFiscalYear } from './pipelineReport';

const clean = value => typeof value === 'string' ? value.trim().slice(0, 250) : '';
const id = value => value == null ? '' : String(value);
const timestamp = value => Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null;
const localDay = value => timestamp(value) ? getStandingsPeriods(new Date(value)).asOf : null;
const days = (start, end) => start && end ? Math.max(0, Math.floor((Date.parse(end) - Date.parse(start)) / 86400000)) : null;
const received = new Set(['cash', 'donation', 'paycash', 'pledgepayment', 'pledgepaycash', 'recurringgiftpayment', 'recurringgiftpaycash', 'matchinggiftpayment', 'matchinggiftpaycash']);
const token = value => clean(value).toLowerCase().replace(/[^a-z0-9]/g, '');

// Only explicit identities establish relationships. Never match by donor name.
export function buildProspectLifecycle({ assignments = [], outcomes = [], actions = [], gifts = [], giftCoverage = null, nxtActionCoverage = null }, now = new Date()) {
  const today = getStandingsPeriods(now).asOf;
  const sorted = assignments.filter(a => timestamp(a.assigned_at)).sort((a, b) =>
    Date.parse(a.assigned_at) - Date.parse(b.assigned_at) || Number(a.id) - Number(b.id));
  const rows = sorted.map((a, index) => {
    const start = getStandingsPeriods(new Date(a.assigned_at)).asOf;
    const next = sorted.slice(index + 1).find(other => a.pool_id != null && id(other.pool_id) === id(a.pool_id));
    const end = [localDay(a.ended_at), localDay(next?.assigned_at)].filter(Boolean).sort()[0] || null;
    const inCycle = day => day && day >= start && day <= today && (!end || day < end);
    const cycleOutcomes = outcomes.filter(o => id(o.assignment_id) === id(a.id))
      .sort((x, y) => Number(x.id) - Number(y.id)).map(o => ({
        id: id(o.id), value: clean(o.value), date: localDay(o.selected_at), syncState: clean(o.sync_state),
        nxtFieldId: clean(o.nxt_field_id), historicalSnapshot: o.historical_snapshot === true,
      }));
    const outcome = cycleOutcomes.at(-1)?.value === 'Outcome cleared' ? null : cycleOutcomes.at(-1) || null;
    const byAction = new Map();
    for (const action of actions) {
      if (!action.record_id || id(action.constituent_id) !== id(a.constituent_id) ||
          id(action.owner_user_id) !== id(a.fundraiser_id) || !['complete', 'verified', 'saved', 'snapshot'].includes(action.state)) continue;
      const payload = action.payload || {};
      const date = calendarDate(payload.date);
      if (!date || date < start || (end && date >= end) || (payload.completed === true && date > today)) continue;
      const completed = typeof payload.completed === 'boolean' ? payload.completed : null;
      const entry = { id: id(action.record_id), date, summary: clean(payload.summary) || 'NXT action',
        category: clean(payload.category), completed, checkedAt: timestamp(action.updated_at) };
      const previous = byAction.get(entry.id);
      if (!previous || (entry.checkedAt || '') > (previous.checkedAt || '')) byAction.set(entry.id, entry);
    }
    const activity = [...byAction.values()].sort((x, y) => x.date.localeCompare(y.date) || x.id.localeCompare(y.id));
    const completedActions = activity.filter(x => x.completed);
    const byGift = new Map(), conflicts = new Set();
    for (const gift of gifts) {
      if (!gift?.id || id(gift.constituent_id) !== id(a.constituent_id)) continue;
      const date = calendarDate(gift.date), amount = gift.amount?.value;
      if (!inCycle(date) || typeof amount !== 'number' || !Number.isFinite(amount)) continue;
      const entry = { id: id(gift.id), date, amount, type: clean(gift.type), received: received.has(token(gift.type)),
        funds: [...new Set((gift.gift_splits || []).map(s => clean(s.fund?.description)).filter(Boolean))].join('; ') };
      const previous = byGift.get(entry.id);
      if (previous && JSON.stringify(previous) !== JSON.stringify(entry)) conflicts.add(entry.id);
      byGift.set(entry.id, entry);
    }
    const giftActivity = [...byGift.values()].filter(g => !conflicts.has(g.id)).sort((x, y) => x.date.localeCompare(y.date));
    const stage = outcome ? (outcome.value.startsWith('Qualified -') ? 'Qualified' : 'Outcome recorded') : activity.some(x=>x.date<=today) ? 'Activity recorded' : 'Assigned';
    const latest = completedActions.at(-1)?.date || null;
    const coverageEnd = end && end <= today ? calendarDate(new Date(Date.parse(end) - 86400000)) : today;
    const coverageComplete = Boolean(giftCoverage && giftCoverage.startDate <= start && giftCoverage.endDate >= coverageEnd && !conflicts.size);
    return { id: id(a.id), poolId: id(a.pool_id), constituentId: clean(a.constituent_id), constituentName: clean(a.constituent_name),
      fundraiserId: id(a.fundraiser_id), fundraiserName: clean(a.fundraiser_name), assignedAt: timestamp(a.assigned_at),
      assignedDate: start, endedDate: end, fiscalYear: pipelineFiscalYear(start),
      fieldDate: calendarDate(a.field_date), fieldValue: clean(a.field_value), assignmentSync: clean(a.sync_state),
      assignmentFieldId: clean(a.nxt_field_id), outcome, outcomes: cycleOutcomes, stage, actions: activity,
      actionCount:activity.length,completedCount: completedActions.length, plannedCount: activity.filter(x=>x.completed===false).length,
      firstActionDate: completedActions[0]?.date || null, lastActionDate: latest,
      daysToFirstRecordedAction: days(start, completedActions[0]?.date),
      daysToOutcome: days(start, outcome?.date), ageDays: days(start, end || today),
      gifts: giftActivity, givingCoverage: coverageComplete ? 'covered' : giftCoverage ? 'partial' : 'unavailable',
      giftConflicts: conflicts.size,
      receivedAmount: giftActivity.filter(g => g.received).reduce((sum, g) => sum + Math.round(g.amount * 100), 0) / 100,
    };
  });
  return { rows: rows.reverse(), loadedAt: now.toISOString(), currentYear: currentPipelineFiscalYear(now),
    giftCoverage,nxtActionCoverage, actionCoverage: nxtActionCoverage
      ? 'Actions combine confirmed app logs with safely identified NXT actions from saved Team Standings. Coverage depends on the last saved refresh; missing completion status is not treated as completed.'
      : 'Confirmed app-logged actions only so far. NXT actions join after Team Standings is refreshed with system-ID metadata; older unverified app logs are not included.' };
}

export function filterLifecycle(rows, { year = 'all', fundraiser = 'all', stage = 'all', search = '' } = {}) {
  const term = clean(search).toLowerCase();
  return rows.filter(row => (year === 'all' || row.fiscalYear === Number(year)) &&
    (fundraiser === 'all' || row.fundraiserId === fundraiser) && (stage === 'all' || row.stage === stage) &&
    (!term || [row.constituentName, row.constituentId, row.fundraiserName, row.outcome?.value].join(' ').toLowerCase().includes(term)));
}

export function lifecycleTotals(rows) {
  const gifts = new Map(), conflicts = new Set();
  for (const row of rows) for (const gift of row.gifts) {
    const previous = gifts.get(gift.id);
    if (previous && JSON.stringify(previous) !== JSON.stringify(gift)) conflicts.add(gift.id);
    gifts.set(gift.id, gift);
  }
  return { assigned: rows.length, engaged: rows.filter(r => r.actionCount > 0).length,
    outcomes: rows.filter(r => r.outcome).length, qualified: rows.filter(r => r.stage === 'Qualified').length,
    received: [...gifts.values()].filter(g => g.received && !conflicts.has(g.id)).reduce((sum, g) => sum + Math.round(g.amount * 100), 0) / 100,
    giftCount: gifts.size - conflicts.size };
}

export function lifecycleCsv(rows) {
  const columns = [['constituentName','Constituent'],['constituentId','NXT constituent ID'],['fundraiserName','Assigned fundraiser'],
    ['assignedDate','App assignment date'],['fieldDate','Requested MGOGPT identification date'],['assignmentSync','Assignment NXT sync'],
    ['endedDate','Assignment ended (exclusive)'],['actionCount','Known recorded actions'],['completedCount','Known completed actions'],['plannedCount','Known planned actions'],
    ['firstActionDate','First recorded completed action'],['daysToFirstRecordedAction','Days to first recorded action'],['outcomeValue','Latest recorded outcome'],
    ['outcomeDate','Outcome recorded date'],['outcomeSync','Outcome NXT sync'],['receivedAmount','Known direct monetary receipts'],['givingCoverage','Giving coverage'],['scope','Coverage note']]
    .map(([key,label]) => ({key,label}));
  return prospectExportCsv({ columns, summary: rows.map(r => ({ ...r, outcomeValue:r.outcome?.value, outcomeDate:r.outcome?.date,
    outcomeSync:r.outcome?.syncState, scope:'Saved app and safely identified Team Standings actions only; history may be incomplete. Giving is not fundraiser credit; joint assignment rows may overlap.' })) });
}
