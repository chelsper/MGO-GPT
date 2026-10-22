import { describe,expect,it } from 'vitest';
import { buildProspectLifecycle,filterLifecycle,lifecycleTotals,lifecycleCsv } from './prospectLifecycle';
const now = new Date('2026-10-01T14:00:00Z');
const assignment = (overrides={}) => ({id:1,pool_id:1,constituent_id:'100',constituent_name:'Example Donor',fundraiser_id:7,fundraiser_name:'Alex',assigned_at:'2026-08-01T14:00:00Z',field_date:'2026-08-01',field_value:'Identification/Re-Qualification',sync_state:'success',...overrides});
const action = (overrides={}) => ({record_id:'200',owner_user_id:7,constituent_id:'100',state:'saved',updated_at:'2026-09-01T14:00:00Z',payload:{date:'2026-08-05',completed:true,summary:'Call',category:'Phone call'},...overrides});
const gift = (overrides={}) => ({id:'300',constituent_id:'100',date:'2026-08-10',type:'Cash',amount:{value:500},...overrides});
const report = input => buildProspectLifecycle({assignments:[assignment()],...input},now);
describe('prospect lifecycle',()=>{
  it('joins only by constituent and assigned owner, never actor or matching names',()=>{
    const r=report({actions:[action(),action({record_id:'201',owner_user_id:8}),action({record_id:'202',constituent_id:'999'}),action({record_id:'203',state:'review'})]});
    expect(r.rows[0]).toMatchObject({completedCount:1,daysToFirstRecordedAction:4,stage:'Activity recorded',fiscalYear:2027});
  });
  it('does not turn a failed outcome sync into confirmed NXT state',()=>{
    const r=report({outcomes:[{id:1,assignment_id:1,value:'Qualified - Major Gifts',selected_at:'2026-08-20T14:00:00Z',sync_state:'failed'}]});
    expect(r.rows[0]).toMatchObject({stage:'Qualified',daysToOutcome:19,outcome:{syncState:'failed'}});
  });
  it('keeps planned and unknown completion separate, including future planned actions',()=>{
    const r=report({actions:[action({payload:{date:'2026-10-10',completed:false}}),action({record_id:'201',state:'snapshot',payload:{date:'2026-08-06',completed:null}})]});
    expect(r.rows[0]).toMatchObject({completedCount:0,plannedCount:1,actionCount:2,firstActionDate:null});
  });
  it('deduplicates action IDs and uses newer saved completion state',()=>{
    const r=report({actions:[action(),action({updated_at:'2026-09-02',payload:{date:'2026-08-05',completed:null}})]});
    expect(r.rows[0]).toMatchObject({actionCount:1,completedCount:0});
  });
  it('partitions reassignment dates and excludes pre-assignment gifts and actions',()=>{
    const r=report({assignments:[assignment(),assignment({id:2,fundraiser_id:8,assigned_at:'2026-08-05T14:00:00Z'})],
      actions:[action(),action({record_id:'201',owner_user_id:8}),action({record_id:'202',payload:{date:'2026-07-30',completed:true}})],
      gifts:[gift({date:'2026-07-31'}),gift({id:'301',date:'2026-08-05'})]});
    expect(r.rows[0]).toMatchObject({id:'2',completedCount:1,receivedAmount:500});
    expect(r.rows[1]).toMatchObject({id:'1',completedCount:0,receivedAmount:0,endedDate:'2026-08-05'});
  });
  it('does not call missing giving a complete zero; excludes pledges from receipts',()=>{
    expect(report({}).rows[0].givingCoverage).toBe('unavailable');
    const r=report({gifts:[gift(),gift(),gift({id:'301',type:'Pledge',amount:{value:5000}}),gift({id:'302',constituent_id:'999',soft_credits:[{constituent_id:'100'}]})],
      giftCoverage:{startDate:'2026-01-01',endDate:'2026-09-30',checkedAt:'2026-10-01'}});
    expect(r.rows[0]).toMatchObject({receivedAmount:500,givingCoverage:'partial'});
    expect(r.rows[0].gifts).toHaveLength(2);
  });
  it('counts a gift once across joint assignments and holds conflicting duplicates',()=>{
    const r=report({assignments:[assignment(),assignment({id:2,pool_id:2,fundraiser_id:8})],gifts:[gift()]});
    expect(lifecycleTotals(r.rows)).toMatchObject({received:500,giftCount:1,assigned:2});
    expect(report({gifts:[gift(),gift({amount:{value:600}})]}).rows[0]).toMatchObject({receivedAmount:0,giftConflicts:1});
  });
  it('retains outcome history but does not count an outcome cleared in app',()=>{
    const r=report({outcomes:[{id:1,assignment_id:1,value:'Qualified - Annual Fund',selected_at:'2026-08-10'},
      {id:2,assignment_id:1,value:'Outcome cleared',selected_at:'2026-08-11'}]});
    expect(r.rows[0].outcomes).toHaveLength(2);expect(r.rows[0].outcome).toBeNull();
  });
  it('uses organization day at midnight UTC and ignores malformed assignment timestamps',()=>{
    const r=report({assignments:[assignment({assigned_at:'2026-07-01T01:00:00Z'}),assignment({id:2,assigned_at:'bad'})]});
    expect(r.rows).toHaveLength(1);expect(r.rows[0]).toMatchObject({assignedDate:'2026-06-30',fiscalYear:2026});
  });
  it('filters cohorts independently of action and gift dates and exports formula-safe rows',()=>{
    const r=report({assignments:[assignment({constituent_name:'=DANGEROUS()'})],actions:[action()]});
    expect(filterLifecycle(r.rows,{year:'2027',fundraiser:'7',search:'danger'})).toHaveLength(1);
    expect(filterLifecycle(r.rows,{year:'2026'})).toHaveLength(0);
    expect(lifecycleCsv(r.rows)).toContain("'=DANGEROUS()");
    expect(lifecycleCsv(r.rows)).toContain('Known recorded actions');
  });
});
