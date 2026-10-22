"use client";
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import useUser from '@/utils/useUser';
import SharedReportHeader from '@/app/reports/SharedReportHeader';
import { PIPELINE_REPORT_KEY } from '@/utils/pipelineReport';
import { filterLifecycle, lifecycleTotals, lifecycleCsv } from '@/utils/prospectLifecycle';
import { OUTREACH_BUCKETS, outreachAgingTotals } from '@/utils/prospectOutreachAging';
import { formatCalendarDate } from '@/utils/prospectActivity';
import { buildBlackbaudConstituentProfileUrl } from '@/utils/blackbaudLinks';
import styles from '../pipeline.module.css';

const date = value => formatCalendarDate(value, {month:'short',day:'numeric',year:'numeric'}) || 'Not recorded';
const money = value => new Intl.NumberFormat('en-US', {style:'currency',currency:'USD'}).format(value);
const syncLabel = value => value === 'success' ? 'NXT sync recorded' : 'NXT sync not confirmed';
async function load({signal}) {
  const response = await fetch('/api/reports/prospect-lifecycle', {signal,cache:'no-store'});
  const payload = await response.json();
  if (!response.ok || !Array.isArray(payload.rows)) throw new Error(payload.error || 'Could not load the saved lifecycle report.');
  return payload;
}

export function LifecycleReport({report,reload,refreshing=false}) {
  const [year,setYear] = useState(String(report.currentYear));
  const [fundraiser,setFundraiser] = useState('all');
  const [stage,setStage] = useState('all');
  const [search,setSearch] = useState('');
  const [aging,setAging] = useState('all');
  const [sort,setSort] = useState('newest');
  const [page,setPage] = useState(1);
  const [message,setMessage] = useState('');
  const cohortRows = filterLifecycle(report.rows,{year,fundraiser,stage,search});
  const agingTotals = outreachAgingTotals(cohortRows);
  const rows = filterLifecycle(cohortRows,{aging,sort});
  const totals = lifecycleTotals(rows);
  const years = [...new Set([report.currentYear,...report.rows.map(r=>r.fiscalYear)])].sort((a,b)=>b-a);
  const owners = [...new Map(report.rows.map(r=>[r.fundraiserId,r.fundraiserName])).entries()].sort((a,b)=>a[1].localeCompare(b[1]));
  const pages = Math.max(1,Math.ceil(rows.length/25)), currentPage = Math.min(page,pages);
  const visible = rows.slice((currentPage-1)*25,currentPage*25);
  const filter = (setter,value) => { setter(value);setPage(1); };
  function download() {
    const url = URL.createObjectURL(new Blob([lifecycleCsv(rows)],{type:'text/csv;charset=utf-8'}));
    const link = document.createElement('a');link.href=url;link.download=`prospect-lifecycle-${year}.csv`;
    document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    setMessage(`Exported ${rows.length} assignment cycles across all pages.`);
  }
  return <>
    <SharedReportHeader activeReportKey={PIPELINE_REPORT_KEY} title="Prospect Lifecycle" eyebrow="From assignment to outcome"
      description="Follow prospect-pool assignments, recorded outreach, qualification outcomes, and giving in one place."
      backHref="/reports/opportunity-pipeline" backLabel="Back to Opportunity Pipeline"
      action={<div className={styles.actions}><button className={styles.button} disabled={!rows.length} onClick={download}>Export CSV</button><button className={styles.button} onClick={reload} disabled={refreshing}>{refreshing?'Reloading...':'Reload saved data'}</button></div>}/>
    <nav className={styles.actions} aria-label="Pipeline reports"><a className={styles.button} href="/reports/opportunity-pipeline">Opportunities</a><a className={styles.button} href="/reports/opportunity-pipeline/lifecycle" aria-current="page">Prospect Lifecycle</a></nav>
    {message && <p role="status">{message}</p>}
    <section className={styles.period}><div><p className={styles.eyebrow}>Assignment cohorts</p><h2>A clearer picture of prospect development</h2><p>Choose when prospects were assigned, then follow what happened afterward. Reassignments remain separate cycles.</p></div></section>
    <section className={styles.filters} aria-label="Filter lifecycle" style={{marginTop:20}}>
      <label>Assigned fiscal year<select value={year} onChange={e=>filter(setYear,e.target.value)}><option value="all">All years</option>{years.map(y=><option key={y} value={y}>FY{String(y).slice(-2)}</option>)}</select></label>
      <label>Fundraiser<select value={fundraiser} onChange={e=>filter(setFundraiser,e.target.value)}><option value="all">All fundraisers</option>{owners.map(([id,name])=><option key={id} value={id}>{name || 'Unassigned'}</option>)}</select></label>
      <label>Progress<select value={stage} onChange={e=>filter(setStage,e.target.value)}><option value="all">All progress</option>{['Assigned','Activity recorded','Qualified','Outcome recorded'].map(s=><option key={s}>{s}</option>)}</select></label>
      <label className={styles.search}>Search prospects<input type="search" value={search} placeholder="Name, constituent ID, or outcome" onChange={e=>filter(setSearch,e.target.value)}/></label>
      <label>Sort by<select value={sort} onChange={e=>filter(setSort,e.target.value)}><option value="newest">Newest assignment</option><option value="oldest-outreach">Longest without recorded outreach</option></select></label>
    </section>
    <section className={styles.aging} aria-label="Outreach review">
      <div className={styles.resultHeading}><div><h2>Who may need a follow-up?</h2><p>Current assignments still awaiting an outcome, as of {date(report.asOf)}.</p></div><button className={styles.button} aria-pressed={aging==='all'} onClick={()=>filter(setAging,'all')}>All assignments</button></div>
      <div className={styles.agingBuckets}>{OUTREACH_BUCKETS.map(bucket=><button key={bucket.key} type="button" aria-pressed={aging===bucket.key} onClick={()=>filter(setAging,aging===bucket.key?'all':bucket.key)}><span>{bucket.label}</span><strong>{agingTotals[bucket.key]}</strong><small>{agingTotals[bucket.key]===1?'assignment':'assignments'}</small></button>)}</div>
      <p className={styles.source}>Time since the last recorded completed outreach, or assignment if none is saved. Planned actions do not reset the clock. Review the record before following up; saved history may be incomplete.</p>
      {aging!=='all' && <p role="status">Showing {OUTREACH_BUCKETS.find(bucket=>bucket.key===aging)?.label.toLowerCase()} in this view. Select All assignments to return to the full list.</p>}
    </section>
    <section className={styles.metrics} aria-label="Lifecycle totals">
      <div><span>Assignments</span><strong>{totals.assigned}</strong><small>{new Set(rows.map(r=>r.constituentId).filter(Boolean)).size} linked constituents; repeat assignments count separately</small></div>
      <div><span>Recorded progress</span><strong>{totals.outcomes} {totals.outcomes===1?'outcome':'outcomes'}</strong><small>{totals.qualified} qualified · {totals.engaged} with recorded activity</small></div>
      <div><span>Known direct monetary receipts</span><strong>{report.giftCoverage?money(totals.received):'Not available'}</strong><small>Gift IDs count once across assignments. Not fundraiser credit or total committed revenue.</small></div>
    </section>
    <p className={styles.source}>{report.actionCoverage} A blank activity history is not proof that no outreach occurred.</p>
    {report.nxtActionCoverage && <p className={styles.source}>Saved NXT action window: {date(report.nxtActionCoverage.startDate)} through {date(report.nxtActionCoverage.endDate)}. Checked {date(report.nxtActionCoverage.checkedAt)}.</p>}
    <p className={styles.source}>{report.giftCoverage ? `Saved direct gifts cover ${date(report.giftCoverage.startDate)} through ${date(report.giftCoverage.endDate)}. Checked ${date(report.giftCoverage.checkedAt)}; earlier or later gifts may be missing.` : 'No published giving history is available for this report yet. Missing giving data is not a zero.'}</p>
    <section className={styles.results} aria-label="Prospect lifecycle results"><div className={styles.resultHeading}><h2>Assignment journeys</h2><span>{rows.length} matching cycles</span></div>
      {!visible.length ? <div className={styles.empty}><h3>No assignments in this view</h3><p>Try another assigned fiscal year or clear a filter.</p></div> : visible.map(row=><LifecycleRow key={row.id} row={row}/>)}
      {pages>1 && <div className={styles.pagination}><button className={styles.button} disabled={currentPage===1} onClick={()=>setPage(currentPage-1)}>Previous page</button><span>Page {currentPage} of {pages}</span><button className={styles.button} disabled={currentPage===pages} onClick={()=>setPage(currentPage+1)}>Next page</button></div>}
    </section>
    <details className={styles.method}><summary>How this report works</summary><p>Assignment dates come from the app audit, not an inferred NXT date. The requested MGOGPT date and recorded sync result are shown separately. Existing outcome snapshots cannot reconstruct earlier changes; new outcome selections are retained from this release onward.</p><p>Actions are attributed to the assigned fundraiser, not the staff member who entered them. Counts reflect saved action receipts and safely identified Team Standings actions, not a complete NXT history or a live check of completion status. Calendar dates determine the assignment window; activity on a reassignment day belongs to the new cycle.</p><p>Outreach review includes current assignment cycles with no selected outcome. Ended cycles and recorded outcomes are excluded even if NXT sync still needs attention. Buckets are separate, not cumulative, and follow the fiscal-year, fundraiser, progress, and search filters. Selecting a bucket filters the list and export. Gifts, planned actions, and actions with unknown completion do not reset the outreach clock. These are review prompts, not overdue tasks or performance scores.</p><p>Giving follows the constituent, not the fundraiser. Only direct gifts in the published date range are included; soft credits are excluded. Pledges and other gift types appear in the timeline but are not added to the monetary receipt total. Joint assignment rows can overlap; the report total counts each gift ID once.</p><p>Viewing, filtering, exporting, and reloading this report do not contact NXT or change its custom fields.</p></details>
  </>;
}

function LifecycleRow({row}) {
  const timeline = [
    {key:'assignment',date:row.assignedDate,title:'Assigned to '+row.fundraiserName,detail:`MGOGPT: ${row.fieldValue || 'Identification'} · ${syncLabel(row.assignmentSync)}${row.assignmentFieldId?' · Field '+row.assignmentFieldId:''}`},
    ...row.actions.map(a=>({key:'action:'+a.id,date:a.date,title:a.summary,detail:`${a.completed===null?'Completion not recorded':a.completed?'Completed in saved record':'Planned in saved record'} · ${a.category} · NXT action ${a.id}`})),
    ...row.outcomes.map(o=>({key:'outcome:'+o.id,date:o.date,title:o.value,detail:`${o.value==='Outcome cleared'?'Cleared in app; NXT history unchanged':syncLabel(o.syncState)}${o.nxtFieldId?' · MGOGPT field '+o.nxtFieldId:''}${o.historicalSnapshot?' · Historical saved snapshot':''}`})),
    ...row.gifts.map(g=>({key:'gift:'+g.id,date:g.date,title:`${money(g.amount)} ${g.type}`,detail:`NXT gift ${g.id}${g.funds?' · '+g.funds:''}`})),
  ].sort((a,b)=>(a.date||'').localeCompare(b.date||'')||a.key.localeCompare(b.key));
  return <details className={styles.journey}>
    <summary><div><strong>{row.constituentName}</strong><span className={styles.secondary}>{row.fundraiserName} · Assigned {date(row.assignedDate)}{row.endedDate?` · Ended ${date(row.endedDate)}`:''}</span><span className={styles.journeyHint}>View timeline</span></div><span className={styles.journeyStage}>{row.outcome?.value || row.stage}</span><span>{row.actionCount} recorded {row.actionCount===1?'action':'actions'}<span className={styles.secondary}>{row.givingCoverage==='unavailable'?'Giving unavailable':`${money(row.receivedAmount)} known receipts`}</span></span></summary>
    <div className={styles.journeyBody}>
    {row.outreach?.eligible && <div className={styles.outreachNote}><strong>{row.outreach.days} {row.outreach.days===1?'day':'days'} {row.outreach.baseline==='completed_action'?'since recorded completed outreach':'since assignment'}</strong><p>{row.outreach.baseline==='completed_action'?`Last recorded completed action: ${date(row.outreach.baselineDate)}.`:'No completed outreach is recorded in the available saved history.'} {row.outreach.nextPlannedDate?`Next recorded planned action: ${date(row.outreach.nextPlannedDate)}.`:'No upcoming planned action is recorded.'}</p><small>Check the timeline and NXT before deciding on another follow-up. This does not create or send anything.</small></div>}
    <dl className={styles.journeyStats}>
      <div><dt>First recorded completed action</dt><dd>{date(row.firstActionDate)}{row.daysToFirstRecordedAction!==null?` (${row.daysToFirstRecordedAction} days)`:''}</dd></div>
      <div><dt>Latest recorded completed action</dt><dd>{date(row.lastActionDate)}</dd></div>
      <div><dt>Outcome recorded</dt><dd>{date(row.outcome?.date)}{row.daysToOutcome!==null?` (${row.daysToOutcome} days)`:''}</dd></div>
      <div><dt>Requested MGOGPT identification date</dt><dd>{date(row.fieldDate)}</dd></div>
    </dl><ol className={styles.timeline}>{timeline.map(event=><li key={event.key}><time>{date(event.date)}</time><div><strong>{event.title}</strong><span className={styles.secondary}>{event.detail}</span></div></li>)}</ol>
    {row.constituentId && <a className={styles.button} href={buildBlackbaudConstituentProfileUrl(row.constituentId)} target="_blank" rel="noreferrer">Open constituent in NXT</a>}
    </div>
  </details>;
}

export default function ProspectLifecyclePage() {
  const {data:user,loading} = useUser();
  useEffect(()=>{if(!loading&&!user)window.location.href='/account/signin';},[loading,user]);
  const query = useQuery({queryKey:['prospect-lifecycle',user?.id,user?.email],queryFn:load,enabled:Boolean(user),staleTime:60000,refetchOnWindowFocus:false,retry:false});
  return <main className={styles.page}>{loading||!user||query.isPending?<p role="status">Loading saved prospect journeys...</p>:query.isError?<><SharedReportHeader activeReportKey={PIPELINE_REPORT_KEY} title="Prospect Lifecycle" backHref="/reports/opportunity-pipeline" backLabel="Back to Opportunity Pipeline"/><p role="alert">{query.error.message}</p><button className={styles.button} onClick={()=>query.refetch()}>Try again</button></>:<LifecycleReport key={`${user.id}:${user.email}`} report={query.data} reload={()=>query.refetch()} refreshing={query.isFetching}/>}</main>;
}
