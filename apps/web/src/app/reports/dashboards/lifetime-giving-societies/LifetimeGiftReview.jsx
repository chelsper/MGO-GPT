"use client";
import { useEffect, useRef, useState } from "react";
import { lifetimeDate, lifetimeMoney, lifetimeReviewSteps } from "@/utils/lifetimeSocieties";
import styles from "./lifetime.module.css";

const labels = { all: "All gifts", counted: "Supported gifts", review: "Needs reconciliation", excluded: "Excluded credits" };
export default function LifetimeGiftReview({ row, revision, onClose, onReload, onAccessDenied, canManage, onConfirm, busy, onCheckLinked, checkingLinked, onPauseLinked, linkedCheck, pauseRequested }) {
  const [view, setView] = useState("all"), [page, setPage] = useState(0), [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null), [error, setError] = useState(null), [reading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false), [exportError, setExportError] = useState(null), [exported, setExported] = useState(false);
  const exportRequest = useRef(null);
  const panel = useRef(null), denied = useRef(onAccessDenied);
  const wasCheckingLinked = useRef(!!checkingLinked);
  const working = busy || checkingLinked;
  const loading = reading || !!checkingLinked;
  const savedCheck = checkingLinked ? linkedCheck || result?.linkedCheck : result?.linkedCheck;
  const linkedDisabled = working || loading || !!error || exporting || !canManage || row.archived;
  denied.current = onAccessDenied;
  useEffect(() => { panel.current?.focus(); panel.current?.scrollIntoView?.({ block: "start" }); }, []);
  useEffect(() => {
    if (wasCheckingLinked.current && !checkingLinked) {
      panel.current?.focus({ preventScroll: true });
      panel.current?.scrollIntoView?.({ block: "start" });
    }
    wasCheckingLinked.current = !!checkingLinked;
  }, [checkingLinked]);
  useEffect(() => {
    if (!checkingLinked) { setExporting(false); setExportError(null); setExported(false); }
    return () => { exportRequest.current?.abort(); exportRequest.current = null; };
  }, [row.milestoneKey, revision, checkingLinked]);
  useEffect(() => {
    // The next checkpoint can supersede this revision before a details GET ends.
    if (checkingLinked) return;
    setLoading(true); setError(null);
    const controller = new AbortController();
    const params = new URLSearchParams({ milestoneKey: row.milestoneKey, revision, view, page: String(page) });
    fetch(`/api/reports/lifetime-giving-societies?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw Object.assign(new Error(body.error || "Saved gift details are temporarily unavailable."), { status: response.status });
        if (!controller.signal.aborted) setResult(body);
      }).catch(e => {
        if (!controller.signal.aborted) {
          setError(e);
          if ([401, 403].includes(e.status)) denied.current(e.message);
        }
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [row.milestoneKey, revision, view, page, retry, checkingLinked]);
  function checkLinked(giftId, restart = false) {
    if (!linkedDisabled) onCheckLinked?.(giftId, restart);
  }
  async function exportReconciliation() {
    if (exportRequest.current || loading || error || working) return;
    const controller = new AbortController(); exportRequest.current = controller;
    setExporting(true); setExportError(null); setExported(false);
    try {
      const params = new URLSearchParams({ milestoneKey: row.milestoneKey, revision, format: "reconciliation-csv" });
      const response = await fetch(`/api/reports/lifetime-giving-societies?${params}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) {
        const body = await response.json();
        throw Object.assign(new Error(body.error || "The reconciliation export is temporarily unavailable."), { status: response.status });
      }
      if (!response.headers.get("content-type")?.startsWith("text/csv")) throw new Error("The export did not return a CSV. Please retry from the saved report.");
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const url = URL.createObjectURL(blob), link = document.createElement("a");
      link.href = url; link.download = "lifetime-gift-reconciliation.csv"; link.click();
      setTimeout(URL.revokeObjectURL.bind(URL), 1000, url);
      setExported(true);
    } catch (e) {
      if (!controller.signal.aborted) {
        setExportError(e);
        if ([401, 403].includes(e.status)) denied.current(e.message);
      }
    } finally {
      if (exportRequest.current === controller) exportRequest.current = null;
      if (!controller.signal.aborted) setExporting(false);
    }
  }
  return <section ref={panel} tabIndex={-1} className={styles.reviewPanel} aria-label="Gift history review">
    <div className={styles.tableHeader}><div><p className={styles.eyebrow}>SAVED GIFT EVIDENCE</p><h2>{row.name}</h2><p>{row.societyName} / {lifetimeMoney(row.thresholdCents)} threshold</p></div>
      <button disabled={!!working} onClick={() => { if (!working) onClose(); }}>Back to list</button></div>
    <p>{row.status === "confirmed" ? `Staff-confirmed entry date: ${lifetimeDate(row.date)}. This review does not change it.` : row.date ? `Provisional entry date: ${lifetimeDate(row.date)}. Not yet confirmed.` : "No supported entry date yet. Your history is saved; it needs reconciliation, not another approval step."}</p>
    <div className={styles.reviewSteps}><h3>What to check next</h3><ul>{lifetimeReviewSteps(row).map(step => <li key={step}>{step}</li>)}</ul>
      {row.householdNote && <p>{row.householdNote}</p>}
      {row.members && <p>{row.groupBasis === "family" ? "Staff-linked family" : "Household"}: {row.members.map(member => member.name).join("; ")}. {row.groupBasis === "family"
        ? "All imported qualifying gifts for these household members and explicitly linked organizations are included, even without a spouse's soft credit. Shared gifts count once. Other organizations remain separate; individual credit and NXT records are unchanged."
        : "Only gifts given by or explicitly credited to these members are included, once per gift. Organizations' unrelated gifts are not included."}</p>}
    </div>
    <p className={styles.typeNote}>These are saved query results and any verified linked-history checks, not a live NXT check on every view. Supported recognition includes verified dated reductions; it is not a complete lifetime total while other history is unresolved. Excluded credits are not additional gifts.</p>
    <p>Any unconfirmed crossing followed by giving below the threshold needs staff review, even if giving later recovers. Staff-confirmed dates stay locked.</p>
    {canManage && onCheckLinked && <div className={styles.reviewSteps}>
      <h3>Verify linked pledges</h3><p>Check linked history reads connected records in NXT without changing them. This app saves evidence after each checkpoint; the check does not refresh the gift query or confirm a date. Earlier credited payments keep their original dates; only the incremental commitment is added later.</p>
      {checkingLinked && <p role="status">{pauseRequested ? "Pause requested. Waiting for the current checkpoint to finish and save." : "Checking linked records; progress saves after each small group of reads."} <button disabled={!!pauseRequested || !onPauseLinked || row.archived} onClick={() => { if (checkingLinked && !pauseRequested && !row.archived) onPauseLinked?.(); }}>Pause after current step</button></p>}
      {savedCheck && <><p role="status">Gift {savedCheck.seed}: {savedCheck.message || `${savedCheck.reads} reads saved.`}{savedCheck.checkedAt && <> Verified {lifetimeDate(savedCheck.checkedAt.slice(0, 10))}.</>}</p>
        {!checkingLinked && ["running", "paused"].includes(savedCheck.status) && <><p>This saved check is not running. Continue explicitly to read more NXT records.</p><button disabled={!!linkedDisabled} onClick={() => checkLinked(savedCheck.seed)}>Continue saved check</button></>}
        {!checkingLinked && savedCheck.status === "attention" && <button disabled={!!linkedDisabled} onClick={() => checkLinked(savedCheck.seed, true)}>Start fresh linked check</button>}
        {!checkingLinked && savedCheck.status === "complete" && <button disabled={!!linkedDisabled} onClick={() => checkLinked(savedCheck.seed, true)}>Check again</button>}
      </>}
    </div>}
    {error && <div className={styles.error} role="alert">{error.message} {error.status === 409 ? <button disabled={!!working} onClick={() => { if (!working) onReload(); }}>Reload saved report</button> : <button disabled={!!working} onClick={() => { if (!working) setRetry(value => value + 1); }}>Retry saved details</button>}</div>}
    {loading && <p role="status">{checkingLinked ? "Saved gift details will reload when the check stops." : "Loading saved gift details..."}</p>}
    {result?.available === false && <p className={styles.notice}>{result.message}</p>}
    {result?.available && <>
      {!loading && !error && result.reconciliation?.length > 0 && <details className={styles.reviewSteps}>
        <summary>Reconciliation checklist / {result.counts.review} unresolved gifts</summary>
        <p>This is an evidence checklist, not a completed reconciliation. Counts cover this recipient's entire saved history, not just this page. One gift can need more than one check.</p>
        <ul>{result.reconciliation.map(need => <li key={need.code}><strong>{need.label}: {need.gifts} {need.gifts === 1 ? "gift" : "gifts"}.</strong> {need.evidence}</li>)}</ul>
        <p>Download all unresolved gift IDs, dates, source amounts and credited recipients for this society in one CSV. Amounts are not additive: linked pledges and payments may represent the same commitment. This file does not update NXT or confirm entry dates.</p>
        <button disabled={exporting || !!working} onClick={exportReconciliation}>{exporting ? "Preparing reconciliation CSV..." : "Export all unresolved gifts (CSV)"}</button>
        {exportError && <p role="alert">{exportError.message} {exportError.status === 409 && <button disabled={!!working} onClick={() => { if (!working) onReload(); }}>Reload saved report</button>}</p>}
        {exported && <p role="status">CSV download prepared. Saved dates and gift credit are unchanged.</p>}
      </details>}
      <div className={styles.reviewTabs} aria-label="Gift evidence filters">{Object.entries(labels).map(([value, label]) => <button key={value} aria-disabled={loading || !!working} aria-pressed={view === value} onClick={() => { if (!working && !loading && value !== view) { setLoading(true); setView(value); setPage(0); } }}>{label} <span>{result.counts[value]}</span></button>)}</div>
      {!loading && !error && <>
      <p className={styles.scope}>{result.total} distinct gifts in this view / evaluated as of {lifetimeDate(result.asOf)}. Repeated query rows and shared credits are not added again.</p>
      <ol className={styles.giftList}>{result.items.map(gift => <li key={gift.giftId}>
        <div className={styles.tableHeader}><h3>Gift {gift.giftId}</h3><strong>{gift.cents == null ? "Amount needs review" : lifetimeMoney(gift.cents)}</strong></div>
        <p>{gift.day ? lifetimeDate(gift.day) : "Date needs review"} / {gift.type || "Type not supplied"} / <strong>{labels[gift.outcome]}</strong></p>
        {gift.reconciledCents != null && <p><strong>Net recognition change on this date: {lifetimeMoney(gift.reconciledCents)}.</strong> The source amount above is not added again.</p>}
        {canManage && !row.archived && gift.canCheckLinked && onCheckLinked && <button disabled={!!linkedDisabled || !!(savedCheck && ["running", "paused"].includes(savedCheck.status))}
          onClick={() => { if (!["running", "paused"].includes(savedCheck?.status)) checkLinked(gift.giftId); }}>Check linked history</button>}
        {gift.crossingGift && <p className={styles.milestone}>{row.status === "confirmed" ? "Saved confirmed-date gift reference" : "Gift on the provisional threshold-crossing day"}</p>}
        {gift.reasons.length > 0 && <ul>{gift.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>}
        {gift.reconciliation?.length > 0 && <details><summary>Evidence needed for this gift</summary><ul>{gift.reconciliation.map(need => <li key={need.code}><strong>{need.label}:</strong> {need.evidence}</li>)}</ul></details>}
        <details><summary>Credit and counting explanation</summary>{gift.credits.map((credit, i) => <p key={i}><strong>{credit.kind}</strong>{credit.recipients.length > 0 && <> for {credit.recipients.join("; ")}</>}<br />{credit.treatment}<small>NXT flag: {credit.flag || "Not supplied"}</small></p>)}
          {gift.notes.filter(note => !gift.credits.some(credit => credit.treatment === note)).map(note => <p key={note}>{note}</p>)}</details>
      </li>)}</ol>
      {!result.items.length && <p>No gifts in this evidence category. Nothing has been removed.</p>}
      </>}
      <div className={styles.pagination}><p>{loading ? "Reading the selected gift page..." : error ? "Gift page unavailable; retry or choose a different category." : `Gift page ${result.page + 1} of ${result.pages}`}</p><div className={styles.actions}><button aria-disabled={!!working || loading || !!error || result.page === 0} onClick={() => { if (!working && !loading && !error && result.page > 0) { setLoading(true); setPage(result.page - 1); } }}>Previous gifts</button><button aria-disabled={!!working || loading || !!error || result.page + 1 >= result.pages} onClick={() => { if (!working && !loading && !error && result.page + 1 < result.pages) { setLoading(true); setPage(result.page + 1); } }}>Next gifts</button></div></div>
    </>}
    {canManage && !row.archived && row.status === "provisional" && !row.reasons.length && <button className={styles.primary} disabled={!!working || loading || !!error || exporting} onClick={() => { if (!working && !loading && !error && !exporting) onConfirm(); }}>Review entry-date confirmation</button>}
  </section>;
}
