"use client";
import { useState } from "react";
import styles from "./relationshipOriginator.module.css";

export default function RelationshipOriginator({ constituentId }) {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState(null);
  const [ownerUserId, setOwnerUserId] = useState("");
  const [originDate, setOriginDate] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [needsCheck, setNeedsCheck] = useState(false);
  const url = `/api/blackbaud/constituents/${encodeURIComponent(constituentId)}/relationship-originator`;
  async function check() {
    setBusy(true); setError("");
    try {
      const response = await fetch(url, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not check the originator.");
      setReview(data); setNeedsCheck(false);
      setOwnerUserId(data.fields.length ? "" : data.fundraisers.some(person => person.id === data.selfUserId) ? data.selfUserId : "");
      setOriginDate(data.fields[0]?.date || data.today); setReason("");
    } catch (failure) { setError(failure.message); setNeedsCheck(true); }
    finally { setBusy(false); }
  }
  async function save(event) {
    event.preventDefault();
    if (busy || needsCheck) return;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerUserId, originDate, reason, fingerprint: review.fingerprint }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The save could not be confirmed. Check NXT before trying again.");
      setMessage(result.message); setReview(null); setNeedsCheck(true);
    } catch (failure) { setError(failure.message); setNeedsCheck(true); }
    finally { setBusy(false); }
  }
  return <section className={styles.originator} aria-label="Relationship originator">
    <button className={styles.toggle} type="button" aria-expanded={open} onClick={() => {
      setOpen(!open); if (!open && !review && !message && !busy) check();
    }}>Relationship originator <span aria-hidden="true">{open ? "-" : "+"}</span></button>
    {open && <div className={styles.content}>
      <p>Recognize the fundraiser who introduced this constituent to the organization. This does not change their portfolio assignment.</p>
      {message && <p role="status" className={styles.success}>{message}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {busy && <p role="status">Checking and saving with NXT...</p>}
      {review?.fields.map(field => <p key={field.id || field.value}><strong>{field.value || "Originator needs attention"}</strong>
        {field.date ? ` · Introduced ${field.date}` : " · Introduction date needed"}</p>)}
      {review?.unresolved && <p>An earlier update still needs confirmation. Check NXT below; this will not submit another update.</p>}
      {review && !review.canClaim && !review.canCorrect && !review.unresolved && <p>Ask an Admin to correct an existing originator.</p>}
      {review && (review.canClaim || review.canCorrect) && <form onSubmit={save}>
        {review.admin ? <label>Originator
          <select required value={ownerUserId} onChange={event => setOwnerUserId(event.target.value)} disabled={busy}>
            <option value="">Choose a fundraiser</option>
            {review.fundraisers.map(person => <option key={person.id} value={person.id}>{person.name}</option>)}
          </select>
        </label> : <p><strong>Record me as the relationship originator</strong></p>}
        <label>When did the relationship begin?
          <input type="date" required max={review.today} value={originDate} onChange={event => setOriginDate(event.target.value)} disabled={busy} />
        </label>
        <p className={styles.hint}>Use the introduction date, even if you are recording it later. Only giving from that date forward will count.</p>
        {review.canCorrect && <label>Reason for correction
          <input required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} disabled={busy} />
        </label>}
        <p className={styles.hint}>Saving updates the Relationship Originator custom field and its date in NXT. Admin corrections are recorded in the app's audit history.</p>
        <button type="submit" className={styles.primary} disabled={busy || needsCheck || !ownerUserId}>
          {review.admin ? "Save originator in NXT" : "Record me as originator"}
        </button>
      </form>}
      <button type="button" className={styles.button} disabled={busy} onClick={check}>Check NXT</button>
    </div>}
  </section>;
}
