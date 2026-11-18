"use client";
import { useEffect, useId, useRef, useState } from "react";
import { lifetimeDate, lifetimeMoney } from "@/utils/lifetimeSocieties";
import styles from "./lifetime.module.css";

function Amount({ value }) {
  return value.totalCents != null ? <strong>{lifetimeMoney(value.totalCents)}</strong> : <span>Needs reconciliation
    {value.supportedCents != null && <small>{lifetimeMoney(value.supportedCents)} supported so far; not a complete total</small>}</span>;
}

export default function LifetimeFamilyPreview({ revision, householdKey, recordKey, busy, onConfirm, onAccessDenied, onReload }) {
  const [result, setResult] = useState(null), [error, setError] = useState(null), [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0), [retry, setRetry] = useState(0), [confirmed, setConfirmed] = useState(false);
  const [sharedOpen, setSharedOpen] = useState(false);
  const sharedId = useId();
  const denied = useRef(onAccessDenied);
  denied.current = onAccessDenied;
  useEffect(() => {
    setLoading(true); setError(null);
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => {
      if (!active) return;
      controller.abort(); setLoading(false); setConfirmed(false);
      setError(new Error("The saved preview took too long to load. Nothing was changed. Retry the preview."));
    }, 20000);
    const params = new URLSearchParams({ preview: "family", revision, householdKey, recordKey, page: String(page) });
    fetch(`/api/reports/lifetime-giving-societies?${params}`, { cache: "no-store", signal: controller.signal })
      .then(async response => {
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok) throw Object.assign(new Error(body.error || "The saved preview is temporarily unavailable. Nothing was changed."), { status: response.status });
        if (body.revision !== revision || body.householdKey !== householdKey || body.recordKey !== recordKey || !body.societies?.length || !body.sharedGifts)
          throw new Error("The preview did not match this selection. Nothing was changed. Retry the preview.");
        if (active) setResult(body);
      }).catch(e => {
        if (active && !controller.signal.aborted) {
          setError(e); setConfirmed(false);
          if ([401, 403].includes(e.status)) { setResult(null); denied.current?.(e.message); }
        }
      }).finally(() => { clearTimeout(timeout); if (active && !controller.signal.aborted) setLoading(false); });
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [revision, householdKey, recordKey, page, retry]);
  const ready = !!result && !loading && !error;
  function changePage(next) { if (busy || loading) return; setLoading(true); setPage(next); }
  return <div aria-label="Family recognition preview">
    <h3>Preview combined recognition</h3>
    <p>This reads saved report evidence only. It does not refresh NXT, save a link, or confirm an entry date. Recognition is not cash received.</p>
    {loading && <p role="status">Calculating the proposed family from saved history...</p>}
    {error && <div className={styles.error} role="alert">{error.message} {error.status === 409
      ? <button disabled={busy} onClick={onReload}>Reload saved report</button>
      : <button disabled={busy} onClick={() => { setLoading(true); setRetry(value => value + 1); }}>Retry saved preview</button>}</div>}
    {ready && <>
      <p><strong>Current group:</strong> {result.currentName}<br /><strong>Adding:</strong> {result.organizationName}</p>
      {!!result.existingOrganizations.length && <p>Already linked and still included: {result.existingOrganizations.map(person => person.name).join("; ")}.</p>}
      <div className={styles.familyPreviewGrid}>{result.societies.map(society => <article className={styles.familyPreviewCard} key={society.societyKey}>
        <h4>{society.societyName}</h4>
        <dl>
          <div><dt>{result.existingOrganizations.length ? "Current family recognition" : "Household recognition"}</dt><dd><Amount value={society.current} /></dd></div>
          <div><dt>Selected organization recognition</dt><dd><Amount value={society.organization} /></dd></div>
          <div><dt>Overlap removed <small>Shared gifts and any verified linked commitments</small></dt><dd>{society.overlapCents == null ? "Not yet fully reconciled" : lifetimeMoney(society.overlapCents)}</dd></div>
          <div className={styles.familyPreviewTotal}><dt>Proposed combined recognition</dt><dd><Amount value={society.combined} /></dd></div>
        </dl>
        <p>{society.counts.counted} supported gifts; {society.counts.review} need reconciliation; {society.counts.excluded} excluded. Gifts with zero or negative net recognition may be included.</p>
        <p>Entry date: {society.combined.date ? `${lifetimeDate(society.combined.date)} (${society.combined.status === "confirmed" ? "already confirmed for this exact group" : "provisional, not confirmed"})` : "Not ready to confirm"}.</p>
        {!!society.combined.reasons.length && <details><summary>Why this date or total needs review</summary><ul>{society.combined.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></details>}
      </article>)}</div>
      <p>Each total uses that society's rules and the evidence saved for that exact group. Do not add these society totals together. Incomplete totals are not treated as zero, and a new group may need its own linked-pledge checks.</p>
      <div className={styles.reviewSteps}>
        <button aria-expanded={sharedOpen} aria-controls={sharedId} onClick={() => setSharedOpen(value => !value)}>Shared gift records: {result.sharedGifts.total}</button>
        <div id={sharedId} hidden={!sharedOpen}>
        <p>These gift IDs appear in both histories. Each contributes at most once to the proposed group, when eligible. This list does not include overlaps between different pledge and payment IDs; those are handled by verified linked-history checks.</p>
        {result.sharedGifts.total === 0 ? <p>No identical gift IDs appear in both histories.</p> : <>
          <ul>{result.sharedGifts.items.map(gift => <li key={gift.giftId}><strong>Gift {gift.giftId}</strong>{gift.recognition.map(credit => <span className={styles.sharedGiftCredit} key={credit.societyKey}>
            {result.societies.find(society => society.societyKey === credit.societyKey)?.societyName}: {credit.outcome === "counted" ? `${lifetimeMoney(credit.cents)} net recognition, counted once` : credit.outcome === "excluded" ? "Excluded by society rules" : "Needs reconciliation"}
          </span>)}</li>)}</ul>
          {result.sharedGifts.pages > 1 && <div className={styles.pagination}><p>Shared gifts page {result.sharedGifts.page + 1} of {result.sharedGifts.pages}</p><div className={styles.actions}>
            <button disabled={busy || !result.sharedGifts.page} onClick={() => changePage(result.sharedGifts.page - 1)}>Previous shared gifts</button>
            <button disabled={busy || result.sharedGifts.page + 1 >= result.sharedGifts.pages} onClick={() => changePage(result.sharedGifts.page + 1)}>Next shared gifts</button>
          </div></div>}
        </>}
        </div>
      </div>
    </>}
    <label className={styles.groupToggle}><input type="checkbox" checked={confirmed} disabled={busy || !ready} onChange={e => setConfirmed(e.target.checked)} />Include all imported qualifying gifts from this organization in this family's recognition</label>
    <button className={styles.primary} disabled={busy || !ready || !confirmed} onClick={() => { if (!busy && ready && confirmed) onConfirm(); }}>Confirm family link</button>
  </div>;
}
