import { describe, expect, it } from 'vitest';
import { buildOutreachAging, outreachAgingTotals } from './prospectOutreachAging';
import { buildProspectLifecycle, filterLifecycle, lifecycleCsv } from './prospectLifecycle';

const today = '2026-10-01';
const row = overrides => ({ id:'1', assignedDate:'2026-07-01', endedDate:null, outcome:null, actions:[], ...overrides });
const action = (date, completed=true) => ({date, completed});

describe('saved outreach review', () => {
  it.each([[0,'under30'],[29,'under30'],[30,'30to59'],[59,'30to59'],[60,'60to89'],[89,'60to89'],[90,'90plus'],[120,'90plus']])('uses an exclusive bucket at %i days', (days,bucket) => {
    const assignedDate = new Date(Date.parse(today) - days*86400000).toISOString().slice(0,10);
    expect(buildOutreachAging(row({assignedDate}),today)).toMatchObject({eligible:true,days,bucket,baseline:'assignment',baselineDate:assignedDate});
  });
  it('uses only completed outreach, not gifts, planned actions or unknown completion', () => {
    expect(buildOutreachAging(row({ actions:[action('2026-08-30'),action('2026-09-25',false),action('2026-09-30',null),action('2026-10-10',false)],
      gifts:[{date:'2026-09-30'}] }),today)).toMatchObject({days:32,bucket:'30to59',baselineDate:'2026-08-30',baseline:'completed_action',nextPlannedDate:'2026-10-10'});
  });
  it('ignores future completed and pre-assignment actions; allows planned action today', () => {
    expect(buildOutreachAging(row({actions:[action('2026-06-30'),action('2026-10-02'),action('2026-10-01',false)]}),today))
      .toMatchObject({days:92,baseline:'assignment',nextPlannedDate:today});
  });
  it('excludes ended cycles and selected outcomes, even before successful NXT sync', () => {
    expect(buildOutreachAging(row({endedDate:today}),today)).toMatchObject({eligible:false,reason:'Assignment ended',days:null});
    expect(buildOutreachAging(row({outcome:{value:'Qualified - Major Gifts',syncState:'failed'}}),today)).toMatchObject({eligible:false,reason:'Outcome recorded'});
    expect(buildOutreachAging(row({assignedDate:'2026-10-02'}),today)).toMatchObject({eligible:false,reason:'Not yet assigned'});
    expect(buildOutreachAging(row({assignedDate:'invalid'}),today)).toMatchObject({eligible:false,reason:'Date unavailable'});
  });
  it('reopens review when an outcome is cleared, retaining the original clock', () => {
    const report=buildProspectLifecycle({assignments:[{id:1,assigned_at:'2026-07-01T14:00:00Z'}],outcomes:[
      {id:1,assignment_id:1,value:'Unable to Connect',selected_at:'2026-08-01'},
      {id:2,assignment_id:1,value:'Outcome cleared',selected_at:'2026-09-01'},
    ]},new Date('2026-10-01T14:00:00Z'));
    expect(report.rows[0].outreach).toMatchObject({eligible:true,days:92});
  });
  it('uses organization calendar days across midnight and daylight saving time', () => {
    const report=buildProspectLifecycle({assignments:[{id:1,assigned_at:'2026-03-07T17:00:00Z'}]},new Date('2026-03-10T02:00:00Z'));
    expect(report.asOf).toBe('2026-03-09');expect(report.rows[0].outreach.days).toBe(2);
  });
  it('filters and sorts without mutating input; counts each active cycle in one bucket', () => {
    const rows=[row({id:'1',outreach:buildOutreachAging(row({assignedDate:'2026-09-20'}),today)}),
      row({id:'2',outreach:buildOutreachAging(row({}),today)}),
      row({id:'3',outreach:buildOutreachAging(row({outcome:{value:'Unable to Connect'}}),today)})];
    expect(outreachAgingTotals(rows)).toEqual({under30:1,'30to59':0,'60to89':0,'90plus':1});
    expect(filterLifecycle(rows,{aging:'90plus'}).map(r=>r.id)).toEqual(['2']);
    expect(filterLifecycle(rows,{sort:'oldest-outreach'}).map(r=>r.id)).toEqual(['2','1','3']);
    expect(rows.map(r=>r.id)).toEqual(['1','2','3']);
    expect(lifecycleCsv(rows)).toContain('Assignment; no completed outreach recorded');
    expect(lifecycleCsv(rows)).toContain('Aging is a review prompt, not proof of no contact');
  });
});
