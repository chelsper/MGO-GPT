import { useEffect, useId, useRef, useState } from "react";
import { STOCK_KINDS, STOCK_LIMIT, stockLabel } from "@/utils/stewardshipStock";

const button = "min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-50";
const input = "min-h-11 w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-base font-normal text-gray-900";
export function StockHistory({ events }) {
  return <div className="grid gap-3 text-sm">
    {!events.length && <p>No stock movements recorded.</p>}
    {events.map(event => <div key={event.id} className="rounded-xl border border-gray-200 p-3">
      <p className="font-semibold">{STOCK_KINDS[event.kind]}: {event.before_quantity ?? "Not counted"} to {event.after_quantity}</p>
      <p className="text-gray-600">{event.actor_name} · {new Date(event.created_at).toLocaleString()}</p>
      {event.reason && <p className="mt-1 whitespace-pre-wrap break-words">{event.reason}</p>}
      {event.receipt_id && <p>Receipt #{event.receipt_id}</p>}
    </div>)}
    {events.length === 50 && <p>Showing the latest 50 movements.</p>}
  </div>;
}

export default function StockDialog({ item, viewerKey, onSaved, onClose }) {
  const id = useId();
  const dialog = useRef(null);
  const token = useRef(null);
  const flight = useRef(false);
  const [kind, setKind] = useState(item.on_hand == null ? "opening" : "restock");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [discard, setDiscard] = useState(false);
  const [history, setHistory] = useState(null);
  const [historyError, setHistoryError] = useState(false);
  const count = Number(quantity);
  const setsCount = ["opening", "adjustment"].includes(kind);
  const balance = setsCount ? count : Number(item.on_hand) + count;
  const valid = quantity.trim() !== "" && Number.isSafeInteger(count) && count >= (setsCount ? 0 : 1) && balance <= STOCK_LIMIT &&
    (!["return", "adjustment"].includes(kind) || !!reason.trim());
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element.showModal();
    const controller = new AbortController();
    fetch(`/api/stewardship/inventory?id=${encodeURIComponent(item.id)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { const data = await response.json();
        if (!response.ok || data.viewerKey !== viewerKey || data.id !== item.id || !Array.isArray(data.stockEvents)) throw new Error();
        if (!controller.signal.aborted) setHistory(data.stockEvents);
      }).catch(() => { if (!controller.signal.aborted) setHistoryError(true); });
    return () => { controller.abort(); element.close(); previous?.focus?.(); };
  }, [item.id, viewerKey]);
  useEffect(() => {
    if (!quantity && !reason && !busy) return;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [quantity, reason, busy]);
  function close() {
    if (flight.current) return;
    if (!error && (quantity || reason)) setDiscard(true);
    else onClose(!!error);
  }
  async function submit(event) {
    event.preventDefault();
    if (flight.current || error || !valid || !confirmed) return;
    flight.current = true; setBusy(true); token.current ||= crypto.randomUUID();
    try {
      const response = await fetch("/api/stewardship/inventory", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ operation: "stock", id: item.id, stockVersion: Number(item.stock_version || 0), viewerKey,
          token: token.current, kind, quantity: count, reason, confirmed: true }) });
      const data = await response.json();
      if (!response.ok || data.viewerKey !== viewerKey || !Array.isArray(data.items) || data.items.length !== 1 || data.items[0].id !== item.id)
        throw new Error(data.error || "Saved stock could not be confirmed. Close and reload before continuing.");
      onSaved(data, "stock");
    } catch (failure) { setError(failure.message); }
    finally { flight.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} aria-labelledby={`${id}-title`} onCancel={event => { event.preventDefault(); close(); }} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 text-gray-900 shadow-xl backdrop:bg-gray-900/40 sm:p-7">
    <header className="flex items-start justify-between gap-3"><div><h2 id={`${id}-title`} className="text-xl font-bold">Manage stock</h2><p className="mt-1 break-words">{item.name}</p></div><button autoFocus type="button" className={button} disabled={busy} onClick={close}>{error ? "Close and reload" : "Close"}</button></header>
    <p className="my-5 rounded-xl bg-emerald-50 p-4 text-lg font-semibold text-emerald-900">{stockLabel(item)}</p>
    <form onSubmit={submit} className="grid gap-4"><fieldset disabled={busy || !!error || discard} className="grid min-w-0 gap-4">
      <label className="grid gap-2 text-sm font-semibold">Stock change<select className={input} value={kind} onChange={event => { setKind(event.target.value); setConfirmed(false); }}>
        {(item.on_hand == null ? ["opening"] : ["restock", "return", "adjustment"]).map(value => <option key={value} value={value}>{STOCK_KINDS[value]}</option>)}
      </select></label>
      <p className="text-sm text-gray-600">{kind === "opening" ? "Count the items physically on hand today. Earlier gifts do not reduce this opening count." : kind === "adjustment" ? "Enter the actual total after recounting, not the amount to add or subtract." : kind === "return" ? "Add only items physically returned to available stock. This does not erase the recipient's gift history." : "Add items newly received into inventory."}</p>
      <label className="grid gap-2 text-sm font-semibold">{setsCount ? "Total on hand" : "Quantity to add"}<input className={input} type="number" required min={setsCount ? 0 : 1} max={STOCK_LIMIT} step="1" value={quantity} onChange={event => { setQuantity(event.target.value); setConfirmed(false); }} /></label>
      <label className="grid gap-2 text-sm font-semibold">{["return", "adjustment"].includes(kind) ? "Reason" : "Note (optional)"}<textarea className={input} rows={2} maxLength={1000} required={["return", "adjustment"].includes(kind)} value={reason} onChange={event => { setReason(event.target.value); setConfirmed(false); }} /></label>
      {valid && <p className="font-semibold">After this change: {balance} on hand.</p>}
      <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I checked the physical stock and confirm this change.</label>
      <button className={`${button} !border-emerald-700 !bg-emerald-700 !text-white`} type="submit" disabled={!valid || !confirmed}>{busy ? "Saving..." : "Save stock change"}</button>
    </fieldset></form>
    <p className="mt-4 text-xs text-gray-600">Availability remains a separate staff choice. Zero-count items cannot be newly selected for gift requests. Historical imports and receipt corrections never change stock.</p>
    {error && <p role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">{error}</p>}
    {discard && <div role="alert" className="mt-4 grid gap-3 rounded-xl bg-amber-50 p-4"><p>Discard this unsaved stock change?</p><div className="flex flex-wrap gap-2"><button className={button} onClick={() => setDiscard(false)}>Keep editing</button><button className={button} onClick={() => onClose(false)}>Discard changes</button></div></div>}
    <details className="mt-6 border-t border-gray-200 pt-4"><summary className="cursor-pointer font-semibold text-emerald-800">Stock history</summary><div className="mt-3">{history ? <StockHistory events={history} /> : <p>{historyError ? "Stock history could not be loaded. Close and reopen to retry." : "Loading stock history..."}</p>}</div></details>
  </dialog>;
}
