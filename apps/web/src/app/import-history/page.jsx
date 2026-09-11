"use client";

import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileText, RefreshCw } from 'lucide-react';
import styles from './page.module.css';

const TABS = [['successful', 'Successfully Imported Records'], ['failed', 'Failed Imports']];
const dateLabel = (value) => {
  const date = new Date(value);
  return value && !Number.isNaN(date.getTime()) ? date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }) : 'Date unavailable';
};

export default function ImportHistoryPage() {
  const [outcome, setOutcome] = useState('successful');
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [refresh, setRefresh] = useState(0);
  const [state, setState] = useState({ loading: true, data: null, error: '' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true, data: null, error: '' });
    const params = new URLSearchParams({ outcome, type, q: query, page: String(page) });
    async function load() {
      try {
        const response = await fetch(`/api/import-history?${params}`, { signal: controller.signal, cache: 'no-store' });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || 'Import history could not be loaded.');
        if (!Array.isArray(data?.records) || !Number.isSafeInteger(data?.counts?.successful) || !Number.isSafeInteger(data?.counts?.failed)) {
          throw new Error('Import history returned an incomplete response.');
        }
        if (!controller.signal.aborted) setState({ loading: false, data, error: '' });
      } catch (error) {
        if (!controller.signal.aborted) setState({ loading: false, data: null, error: error.message });
      }
    }
    load();
    return () => controller.abort();
  }, [outcome, type, query, page, refresh]);

  const { loading, data, error } = state;
  const total = data?.counts[outcome];
  return <main className={styles.page}>
    <a className={styles.back} href="/"><ArrowLeft size={16} aria-hidden="true" />Back to dashboard</a>
    <header className={styles.heading}>
      <div><p className={styles.eyebrow}>Imports</p><h1>Import History</h1>
        <p>Saved import results, separate from the Work Queue.</p></div>
      <button className={styles.button} disabled={loading} onClick={() => setRefresh((n) => n + 1)}>
        <RefreshCw size={17} aria-hidden="true" />{loading ? 'Loading history...' : 'Refresh history'}
      </button>
    </header>
    <p className={styles.notice}><CheckCircle2 size={20} aria-hidden="true" /><span><strong>Read-only history. Nothing to approve.</strong> Viewing or refreshing this page does not change records or run an import.</span></p>
    <section className={styles.workspace} aria-label="Saved import results">
      <nav className={styles.tabs} aria-label="Import outcomes">
        {TABS.map(([key, label]) => <button key={key} aria-pressed={key === outcome} onClick={() => { setOutcome(key); setPage(1); }}>
          {label}<span>{data ? data.counts[key].toLocaleString() : '...'}</span>
        </button>)}
      </nav>
      <div className={styles.filters}>
        <form onSubmit={(event) => { event.preventDefault(); setQuery(search.trim()); setPage(1); }}>
          <label htmlFor="history-search">Find a record, file, or import run</label>
          <div><input id="history-search" value={search} maxLength={160} onChange={(event) => setSearch(event.target.value)} placeholder="Name, lookup ID, filename, or run number" /><button className={styles.button}>Search</button></div>
        </form>
        <label>Import type<select value={type} onChange={(event) => { setType(event.target.value); setPage(1); }}>
          <option value="all">All imports</option><option value="constituency">Constituency imports</option><option value="family">Family imports</option>
        </select></label>
      </div>
      <div className={styles.resultHeading}>
        <h2>{TABS.find(([key]) => key === outcome)[1]}</h2>
        {data && <span>{total.toLocaleString()} {total === 1 ? 'result' : 'results'}{query || type !== 'all' ? ' matching these filters' : ''}</span>}
      </div>
      <p className={styles.explanation}>{outcome === 'successful'
        ? 'Completed imports and confirmed new records. A "Record created" result does not mean additional staged changes were applied.'
        : 'Unsuccessful or incomplete import attempts, including partial imports and unconfirmed creates. These are results, not approval requests.'}</p>
      {loading && <p role="status" className={styles.empty}>Loading saved results...</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {data && !data.records.length && <div className={styles.empty}><FileText size={26} aria-hidden="true" />
        <h3>No {outcome === 'successful' ? 'successful imports' : 'failed imports'}{query || type !== 'all' || page > 1 ? ' match this view' : ' recorded yet'}.</h3>
        {(query || type !== 'all' || page > 1) && <button className={styles.button} onClick={() => { setQuery(''); setSearch(''); setType('all'); setPage(1); }}>Clear filters and return to first page</button>}
      </div>}
      {data?.records.length > 0 && <ul className={styles.records}>
        {data.records.map((record) => <li key={record.key} className={styles.record}>
          <div><h3>{record.name}</h3><p>{record.source === 'family' ? 'Family import' : 'Constituency import'}{record.lookupId ? ` / Lookup ID ${record.lookupId}` : ''}</p></div>
          <div><span className={`${styles.badge} ${outcome === 'failed' ? styles.failed : styles.successful}`}>{record.label}</span><p>{record.note}</p></div>
          <div><strong>{record.filename}</strong><p>Run #{record.runId} / Row {record.rowNumber}</p>{record.submittedBy && <p>Submitted by {record.submittedBy}</p>}</div>
          <div><span className={styles.dateLabel}>Last saved</span><p>{dateLabel(record.updatedAt)}</p></div>
        </li>)}
      </ul>}
      {data && <nav className={styles.pagination} aria-label="Import history pages">
        <button className={styles.button} disabled={page === 1} onClick={() => setPage((n) => n - 1)}>Previous</button>
        <span>Page {page} of {Math.max(page, Math.ceil(total / data.pageSize), 1)}</span>
        <button className={styles.button} disabled={!data.hasMore} onClick={() => setPage((n) => n + 1)}>Next</button>
      </nav>}
    </section>
    <p className={styles.footer}>One entry per source row, showing its latest saved outcome. Family rows may include multiple people. Unsent previews and imports still running are not listed as completed or failed. Import matching and confirmation safeguards remain in the import workspace.</p>
  </main>;
}
