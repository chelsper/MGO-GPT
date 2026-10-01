// Disposable local PostgreSQL only; never uses DATABASE_URL or calls NXT.
import {execFileSync} from 'node:child_process';
import Papa from 'papaparse';
import {afterAll,beforeAll,beforeEach,describe,expect,it,vi} from 'vitest';
vi.mock('./sql',()=>({default:vi.fn()}));
import schema from './prospectLifecycleSchema';
import {readProspectLifecycle} from './prospectLifecycleStore';
import {EXECUTIVE_TEAM_STANDINGS_CACHE_KEY} from './teamStandingsSnapshot';
const socket=process.env.LIFECYCLE_TEST_PG_SOCKET;
const enabled=/^\/(?:private\/)?tmp\/ju-maintenance-pg-[A-Za-z0-9]+$/.test(socket||'');
function execute(query) {
  const output=execFileSync('/opt/homebrew/opt/postgresql@18/bin/psql',['-X','--no-password','-q','--csv','-v','ON_ERROR_STOP=1','-h',socket,'-p','55443','-d','postgres'],
    {input:`SET search_path=lifecycle_fixture;\n${query}`,encoding:'utf8',stdio:['pipe','pipe','pipe']});
  return output.trim()?Papa.parse(output.trim(),{header:true}).data.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>
    [key,value===''?null:['payload','period','actions','gifts','active_metadata'].includes(key)?JSON.parse(value):value]))):[];
}
const literal=value=>value==null?'NULL':Array.isArray(value)?`ARRAY[${value.map(literal).join(',')}]`:typeof value==='number'?String(value):`'${String(value).replaceAll("'","''")}'`;
const db=async(parts,...values)=>execute(parts.reduce((text,part,i)=>text+part+(i<values.length?literal(values[i]):''),''));
describe.skipIf(!enabled)('lifecycle PostgreSQL history and saved report',()=>{
  beforeAll(()=>execute(`CREATE SCHEMA lifecycle_fixture;
    CREATE TABLE prospect_pool(id bigint PRIMARY KEY,current_assignment_audit_id bigint,assigned_user_id bigint,blackbaud_constituent_id text,
      mgogpt_disposition_value text,mgogpt_disposition_updated_at timestamptz,mgogpt_disposition_sync_state text,mgogpt_disposition_sync_debug jsonb,mgogpt_disposition_synced_at timestamptz);
    CREATE TABLE prospect_pool_assignment_audits(id bigint PRIMARY KEY,prospect_pool_id bigint REFERENCES prospect_pool(id) ON DELETE CASCADE,
      blackbaud_constituent_id text,constituent_name text,assigned_to_user_id bigint,assigned_to_name text,assigned_at timestamptz,
      desired_nxt_start_date date,desired_nxt_custom_field_value text,nxt_sync_status text,nxt_sync_debug jsonb,nxt_synced_at timestamptz);
    CREATE TABLE nxt_create_receipts(owner_user_id bigint,constituent_id text,remote_id text,state text,payload jsonb,updated_at timestamptz,kind text);
    CREATE TABLE pending_action_nxt_receipts(owner_user_id bigint,constituent_id text,blackbaud_action_id text,state text,request_payload jsonb,updated_at timestamptz);
    CREATE TABLE report_snapshots_cache(report_key text,payload jsonb);
    CREATE TABLE society_giving_sources(scope_key text,active_generation text,active_metadata jsonb);
    CREATE TABLE society_giving_source_pages(scope_key text,generation text,gifts jsonb);
  `));
  afterAll(()=>execute('DROP SCHEMA lifecycle_fixture CASCADE;'));
  beforeEach(async()=>{
    await schema(db);
    execute(`TRUNCATE prospect_pool,prospect_pool_assignment_audits,prospect_lifecycle_assignments,prospect_lifecycle_outcomes,
      nxt_create_receipts,pending_action_nxt_receipts,report_snapshots_cache,society_giving_sources,society_giving_source_pages;
      INSERT INTO prospect_pool(id,current_assignment_audit_id,assigned_user_id,blackbaud_constituent_id) VALUES(1,10,7,'100');
      INSERT INTO prospect_pool_assignment_audits VALUES(10,1,'100','Example Donor',7,'Alex','2026-08-01T14:00:00Z','2026-08-01','Identification/Re-Qualification','success','{"customFieldId":"500"}','2026-08-01T14:00:00Z');`);
  });
  it('captures assignment, outcome selection and retry without replacing the selected date',()=>{
    execute(`UPDATE prospect_pool SET mgogpt_disposition_value='Qualified - Major Gifts',mgogpt_disposition_updated_at='2026-08-05T14:00:00Z',mgogpt_disposition_sync_state='failed' WHERE id=1;
      UPDATE prospect_pool SET mgogpt_disposition_updated_at='2026-08-06T14:00:00Z',mgogpt_disposition_sync_state='success',mgogpt_disposition_sync_debug='{"customFieldId":"501"}' WHERE id=1;`);
    expect(execute('SELECT count(*) AS count FROM prospect_lifecycle_assignments')[0].count).toBe('1');
    expect(execute('SELECT value,selected_at::date AS date,sync_state,nxt_field_id FROM prospect_lifecycle_outcomes')).toEqual([
      {value:'Qualified - Major Gifts',date:'2026-08-05',sync_state:'success',nxt_field_id:'501'}]);
  });
  it('retains prior outcomes, clear events, and history after pool deletion',()=>{
    execute(`UPDATE prospect_pool SET mgogpt_disposition_value='Unable to Connect',mgogpt_disposition_updated_at='2026-08-05',mgogpt_disposition_sync_state='success' WHERE id=1;
      UPDATE prospect_pool SET mgogpt_disposition_value='Qualified - Major Gifts',mgogpt_disposition_updated_at='2026-08-10' WHERE id=1;
      UPDATE prospect_pool SET mgogpt_disposition_value=NULL WHERE id=1;
      DELETE FROM prospect_pool WHERE id=1;`);
    expect(execute('SELECT value FROM prospect_lifecycle_outcomes ORDER BY id').map(r=>r.value)).toEqual(['Unable to Connect','Qualified - Major Gifts','Outcome cleared']);
    expect(execute('SELECT ended_at IS NOT NULL AS ended FROM prospect_lifecycle_assignments')[0].ended).toBe('t');
    expect(execute('SELECT count(*) AS count FROM prospect_pool_assignment_audits')[0].count).toBe('0');
  });
  it('does not attach a previous assignment outcome to a newly assigned fundraiser',()=>{
    execute(`UPDATE prospect_pool SET mgogpt_disposition_value='Unable to Connect',mgogpt_disposition_updated_at='2026-08-05' WHERE id=1;
      INSERT INTO prospect_pool_assignment_audits VALUES(11,1,'100','Example Donor',8,'Jordan','2026-09-01','2026-09-01','Identification/Re-Qualification','success',NULL,NULL);
      UPDATE prospect_pool SET current_assignment_audit_id=11,assigned_user_id=8 WHERE id=1;`);
    expect(execute('SELECT assignment_id FROM prospect_lifecycle_outcomes')).toEqual([{assignment_id:'10'}]);
  });
  it('backfills only a saved historical snapshot once and updates assignment sync independently',async()=>{
    execute(`ALTER TABLE prospect_pool DISABLE TRIGGER capture_prospect_lifecycle_outcome;
      UPDATE prospect_pool SET mgogpt_disposition_value='Unable to Connect',mgogpt_disposition_updated_at='2026-08-05' WHERE id=1;
      ALTER TABLE prospect_pool ENABLE TRIGGER capture_prospect_lifecycle_outcome;`);
    await schema(db);await schema(db);
    expect(execute('SELECT historical_snapshot FROM prospect_lifecycle_outcomes')).toEqual([{historical_snapshot:'t'}]);
    execute(`UPDATE prospect_pool_assignment_audits SET nxt_sync_status='failed' WHERE id=10;`);
    expect(execute('SELECT sync_state FROM prospect_lifecycle_assignments')[0].sync_state).toBe('failed');
  });
  it('reads only published gifts and explicit NXT system identities with no private action notes',async()=>{
    execute(`INSERT INTO nxt_create_receipts VALUES(7,'100','201','complete','{"date":"2026-08-05","completed":true,"summary":"Call","description":"private notes"}','2026-09-01','action');
      INSERT INTO pending_action_nxt_receipts VALUES(7,'100','202','saved','{"createPayload":{"date":"2026-08-06","summary":"Meeting"},"metadata":{"completed":true},"notes":"private"}','2026-09-01');
      INSERT INTO report_snapshots_cache VALUES(${literal(EXECUTIVE_TEAM_STANDINGS_CACHE_KEY)},'${JSON.stringify({actionIdentityVersion:1,generatedAt:'2026-09-01T12:00:00Z',comparison:{current:{startsOn:'2026-07-01',endsOn:'2026-09-01'}},standings:[{userId:7,drilldown:{nxtActions:[{identityVersion:1,constituentSystemId:'100',actionId:'203',date:'2026-08-07',summary:'Visit'},{identityVersion:0,blackbaudConstituentId:'100',actionId:'bad'}]}}]})}');
      INSERT INTO society_giving_sources VALUES('scope','active','{"version":1,"startDate":"2026-01-01","endDate":"2026-09-01","checkedAt":"2026-09-01T12:00:00Z"}');
      INSERT INTO society_giving_source_pages VALUES('scope','active','[{"id":"301","constituent_id":"100","date":"2026-08-07","amount":{"value":500},"type":"Cash"},{"id":"302","constituent_id":"999"}]'),
        ('scope','pending','[{"id":"303","constituent_id":"100"}]');`);
    const data=await readProspectLifecycle({origin:'https://example.test',db,refreshUser:async()=>({id:1}),resolveScope:async()=> 'scope'});
    expect(data.assignments).toHaveLength(1);expect(data.actions).toHaveLength(3);expect(data.gifts).toHaveLength(1);
    expect(data.gifts[0].id).toBe('301');expect(JSON.stringify(data)).not.toContain('private');expect(data.nxtActionCoverage.endDate).toBe('2026-09-01');
    execute(`UPDATE report_snapshots_cache SET payload=payload-'actionIdentityVersion';`);
    const older=await readProspectLifecycle({origin:'https://example.test',db,refreshUser:async()=>null});
    expect(older.actions).toHaveLength(2);expect(older.nxtActionCoverage).toBeNull();expect(older.giftCoverage).toBeNull();
  });
});
