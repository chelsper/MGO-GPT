import { useState } from "react";
import { revenueMoney } from "@/utils/fyRevenueGoals";
import { installmentDateLabel } from "@/utils/fyBudgetPledges";
import styles from "./revenue.module.css";

const API = "/api/reports/fy-revenue-goals/manual-cash";
const blank = () => ({ key: null, label: "", amount: "", receivedDate: "", reason: "", confirmed: false });
export default function ManualCashPanel({ config, canManage, onChange }) {
  const [draft, setDraft] = useState(null), [operation, setOperation] = useState("save");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const manual = config?.manual;
  if (!manual) return null;
  const active = manual.entries.filter(item => !item.archived), archived = manual.entries.filter(item => item.archived);
  const begin = (item, mode = "save") => { setOperation(mode); setError(""); setNotice(""); setDraft(item ? { ...item, amount: (item.cents / 100).toFixed(2), receivedDate: item.receivedDate || "", reason: "", confirmed: false } : blank()); };
  const update = (key, value) => setDraft({ ...draft, [key]: value, ...(key !== "confirmed" ? { confirmed: false } : {}) });
  async function submit(reload = false) {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(API, { cache: "no-store", ...(!reload ? { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation, revision: manual.revision, input: { key: draft.key, label: draft.label, amount: draft.amount,
          receivedDate: draft.receivedDate, reason: draft.reason, confirmed: draft.confirmed } }) } : {}) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The entry could not be saved.");
      onChange(result.goal);
      if (!reload) { setDraft(null); setNotice("Saved. The cash total and goal projection now include this change. Nothing changed in NXT."); }
      else setNotice("Saved entries reloaded. Your unsaved form is still here; check it before saving.");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const rows = entries => entries.map(item => <tr key={item.key}><th scope="row">{item.label}<small>{item.origin === "initial" ? "Original cash entry" : "Added manually"}</small></th>
    <td>{item.receivedDate ? installmentDateLabel(item.receivedDate) : `${config.label} (previously confirmed)`}</td><td>{revenueMoney(item.cents)}</td>
    <td>{item.reason}{item.updatedAt && <small>{item.updatedBy} · {new Date(item.updatedAt).toLocaleString()}</small>}</td>
    {canManage && <td><div className={styles.cashActions}>{!item.archived && <button aria-label={`Edit ${item.label}`} disabled={busy || Boolean(draft)} onClick={() => begin(item)}>Edit</button>}
      <button aria-label={`${item.archived ? "Restore" : "Archive"} ${item.label}`} disabled={busy || Boolean(draft)} onClick={() => begin(item, item.archived ? "restore" : "archive")}>{item.archived ? "Restore" : "Archive"}</button></div></td>}</tr>);
  const table = entries => <div className={styles.cashTableScroll} role="region" aria-label="Manual cash entries" tabIndex={0}><table className={`${styles.cashTable} ${styles.editableTable}`}>
    <thead><tr><th scope="col">Description</th><th scope="col">Received</th><th scope="col">Amount</th><th scope="col">Notes</th>{canManage && <th scope="col">Actions</th>}</tr></thead>
    <tbody>{rows(entries)}</tbody></table></div>;
  return <section className={styles.cashPanel} aria-labelledby="manual-cash-heading"><header className={styles.cashHeader}><div>
    <p className={styles.eyebrow}>CASH RECEIVED · {config.label}</p><h2 id="manual-cash-heading">Manual cash contributions</h2>
    <p className={styles.help}>The original cash entries and any additional receipts, in one place. Included in cash received and the goal roll-up, not in either NXT query.</p></div>
    {canManage && <button className={styles.primary} disabled={busy || Boolean(draft)} onClick={() => begin(null)}>Add cash received</button>}</header>
    {error && <div className={styles.error} role="alert">{error} <button disabled={busy} onClick={() => submit(true)}>Reload manual entries</button></div>}
    {notice && <p role="status">{notice}</p>}
    <p><strong>{revenueMoney(active.reduce((sum, item) => sum + item.cents, 0))}</strong> from {active.length} active entries</p>
    {canManage && draft && <form className={styles.setup} aria-label="Manual cash entry" onSubmit={e => { e.preventDefault(); submit(); }}><fieldset disabled={busy}>
      <legend>{operation === "archive" ? `Archive ${draft.label}` : operation === "restore" ? `Restore ${draft.label}` : draft.key ? `Edit ${draft.label}` : "Add received cash"}</legend>
      {operation === "save" ? <div className={styles.formGrid}>
        <label>Description or receipt reference<input required maxLength={150} value={draft.label} onChange={e => update("label", e.target.value)} /></label>
        <label>Cash received amount<input required inputMode="decimal" pattern="[0-9]+([.][0-9]{1,2})?" value={draft.amount} onChange={e => update("amount", e.target.value)} /></label>
        <label>Receipt date{draft.origin === "initial" && " (optional for original entries)"}<input type="date" required={draft.origin !== "initial"} min={config.startsOn} max={config.endsOn} value={draft.receivedDate} onChange={e => update("receivedDate", e.target.value)} /></label>
      </div> : <p>{revenueMoney(Number(draft.amount) * 100)} will be {operation === "archive" ? "removed from" : "added back to"} the cash total. The entry and its history are kept.</p>}
      <label>Reason or source note<input required maxLength={500} value={draft.reason} onChange={e => update("reason", e.target.value)} /></label>
      {operation !== "archive" && <label className={styles.check}><input type="checkbox" checked={draft.confirmed} onChange={e => update("confirmed", e.target.checked)} />
        This cash has been received and is not already counted in budget-relieving cash, the 10% re-investment amount, or another manual entry. I have checked the receipt against those sources.</label>}
      <div className={styles.cashActions}><button className={styles.primary} disabled={!draft.reason.trim() || (operation !== "archive" && !draft.confirmed)}>{operation === "archive" ? "Archive entry" : operation === "restore" ? "Restore entry" : "Save cash entry"}</button>
        <button type="button" onClick={() => setDraft(null)}>Cancel</button></div>
    </fieldset></form>}
    {table(active)}
    {archived.length > 0 && <details className={styles.details}><summary>Archived entries ({archived.length})</summary>{table(archived)}</details>}
    <details className={styles.details}><summary>Recent changes ({manual.historyCount})</summary>
      {manual.history.length ? <><p>Most recent 25 changes. The full change history is retained in the app.</p><ol>{manual.history.map((event, index) => <li key={`${event.at}:${index}`}>
        <strong>{event.after?.label || event.before?.label}</strong>: {event.operation} · {event.by} · {new Date(event.at).toLocaleString()}<br />
        {event.before ? revenueMoney(event.before.cents) : "New entry"} to {event.after.archived ? "Archived (not counted)" : revenueMoney(event.after.cents)}. {event.reason}
      </li>)}</ol></> : <p>No changes yet. The original entries have been preserved.</p>}
    </details>
  </section>;
}
