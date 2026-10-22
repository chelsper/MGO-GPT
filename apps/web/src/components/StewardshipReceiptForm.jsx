import { useRef, useState } from "react";

const button =
  "min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-50";
const input =
  "min-h-11 w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-base text-gray-900";
export default function StewardshipReceiptForm({ request, disabled, onSaved }) {
  const [open, setOpen] = useState(false);
  const [receivedOn, setDate] = useState(() =>
    new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" }),
  );
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [deductStock, setDeductStock] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const flight = useRef(false);
  const token = useRef(null);
  if (request.stewardship_received_item)
    return (
      <p className="text-sm text-gray-600">
        Receipt is recorded. Correct an entry from Received Items; history is
        preserved.
      </p>
    );
  if (!request.stewardship_gift_item_id)
    return (
      <p className="text-sm text-gray-600">
        Save a gift preference first. Once the recipient has received it, record
        it here.
      </p>
    );
  if (request.status === "Declined")
    return (
      <p className="text-sm text-gray-600">
        Reopen this request before recording receipt.
      </p>
    );
  async function submit(event) {
    event.preventDefault();
    if (flight.current || disabled || error || !confirmed || !receivedOn)
      return;
    flight.current = true;
    setBusy(true);
    token.current ||= crypto.randomUUID();
    try {
      const response = await fetch("/api/stewardship/received-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "record",
          requestId: String(request.id),
          version: request.request_version,
          viewerKey: request.request_viewer_id,
          itemId: String(request.stewardship_gift_item_id),
          token: token.current,
          receivedOn,
          note,
          confirmed,
          stockQuantity: deductStock ? Number(quantity) : 0,
        }),
      });
      const data = await response.json();
      if (
        !response.ok ||
        data.viewerKey !== request.request_viewer_id ||
        String(data.receipt?.request_id) !== String(request.id) ||
        data.receipt.voided_at
      )
        throw new Error(
          data.error ||
            "Saved status could not be confirmed. Reload the queue before continuing.",
        );
      onSaved(data.receipt);
      setOpen(false);
    } catch (failure) {
      setError(
        failure.message ||
          "Reload the queue to check saved receipt before trying again.",
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="grid gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 p-4"
      aria-label="Record received item"
    >
      <div>
        <h3 className="font-semibold">Has the recipient received this item?</h3>
        <p className="mt-1 text-sm text-gray-600">
          Record actual receipt, not a request or a shipment still on its way.
          This does not complete the request or change NXT.
        </p>
      </div>
      {!open ? (
        <button
          type="button"
          className={button}
          disabled={disabled}
          onClick={() => setOpen(true)}
        >
          Record received item
        </button>
      ) : (
        <form onSubmit={submit} className="grid gap-3">
          <p className="text-sm">
            <strong>{request.constituent_name}</strong> will be recorded as
            receiving{" "}
            <strong>{request.stewardship_gift_item_snapshot?.name}</strong>.
          </p>
          <fieldset
            disabled={disabled || busy || !!error}
            className="grid min-w-0 gap-3"
          >
            <label className="grid gap-1 text-sm font-semibold">
              Date received
              <input
                required
                type="date"
                min="1900-01-01"
                max={new Date().toLocaleDateString("en-CA", {
                  timeZone: "America/New_York",
                })}
                className={input}
                value={receivedOn}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm font-semibold">
              Delivery note (optional)
              <textarea
                maxLength={2000}
                rows={2}
                className={input}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="For example, handed to the recipient at their visit"
              />
            </label>
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={deductStock} onChange={event => setDeductStock(event.target.checked)} className="mt-1" />
              Deduct this newly delivered gift from counted inventory.
            </label>
            <p className="text-xs text-gray-600">Leave unchecked for historical gifts or items already removed from stock. An opening count and enough stock are required. Correcting a receipt later does not automatically return items to stock.</p>
            {deductStock && <label className="grid gap-1 text-sm font-semibold">Quantity delivered<input className={input} type="number" min="1" max="1000000" step="1" required value={quantity} onChange={event => setQuantity(event.target.value)} /></label>}
            <label className="flex items-start gap-2 text-sm">
              <input
                required
                type="checkbox"
                className="mt-1"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              I confirm this recipient received this item.
            </label>
            <button
              type="submit"
              className={`${button} !bg-emerald-700 !text-white`}
              disabled={!receivedOn || !confirmed}
            >
              {busy ? "Saving..." : "Save received item"}
            </button>
          </fieldset>
          {error && (
            <p role="alert" className="text-sm text-amber-900">
              {error} Use Refresh queues to check saved details.
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            className={button}
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </form>
      )}
      {disabled && (
        <p className="text-sm text-gray-600">
          Save your request changes before recording receipt.
        </p>
      )}
    </section>
  );
}
