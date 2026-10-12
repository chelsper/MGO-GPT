import { useState } from "react";
import { completedPostalLetter } from "@/utils/societyLetterDispatch";
import SocietyPdfDownloads from "./SocietyPdfDownloads";

const button =
  "min-h-11 rounded-xl border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";

export default function CompletedLetterActions({
  batch,
  busy,
  downloadBatch,
  setConfirmation,
}) {
  const ready = batch.items.filter(completedPostalLetter);
  const [selected, setSelected] = useState(() => ready.map((item) => item.id));
  const [downloading, setDownloading] = useState(false);
  const items = ready.filter((item) => selected.includes(item.id));
  const toMail = items.filter((item) => item.status === "prepared");
  const readyToMail = ready.filter((item) => item.status === "prepared");
  const omitted = batch.items.filter(
    (item) => !items.some((chosen) => chosen.id === item.id),
  );
  const blocked = batch.items.filter(
    (item) =>
      item.status !== "cancelled" &&
      item.status !== "mailed" &&
      !completedPostalLetter(item),
  );
  const mailed = batch.items.filter((item) => item.status === "mailed");
  if (
    batch.channel !== "post" ||
    !ready.length ||
    (!blocked.length && !mailed.length)
  )
    return null;
  const disabled = busy || downloading;
  async function download(format, ids = items.map((item) => item.id)) {
    setDownloading(true);
    try {
      await downloadBatch(batch.id, undefined, format, ids);
    } finally {
      setDownloading(false);
    }
  }
  return (
    <section
      aria-label="Completed letters"
      className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
    >
      <h3 className="font-bold text-emerald-950">
        Completed letters can move ahead
      </h3>
      <p className="mt-2 text-sm text-gray-700">
        {ready.length} available to download; {readyToMail.length} ready to
        mail; {blocked.length} still in progress; {mailed.length} marked mailed.
        Completed letters remain available to download after mailing. Blocked
        letters stay saved in this batch.
      </p>
      <div className="my-3 flex flex-wrap gap-2">
        <button
          className={button}
          disabled={disabled}
          onClick={() => setSelected(ready.map((item) => item.id))}
        >
          Select all completed
        </button>
        <button
          className={button}
          disabled={disabled || !items.length}
          onClick={() => setSelected([])}
        >
          Clear selection
        </button>
      </div>
      <ul className="space-y-2">
        {ready.map((item) => (
          <li key={item.id}>
            <label className="flex min-h-11 items-center gap-3 rounded-lg bg-white px-3 py-2 text-sm">
              <input
                type="checkbox"
                disabled={disabled}
                checked={items.includes(item)}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? [...selected, item.id]
                      : selected.filter((id) => id !== item.id),
                  )
                }
              />
              <span>
                <strong>{item.name}</strong> / {item.societyName}
                {item.status === "mailed" &&
                  " / Marked mailed; download available"}
              </span>
            </label>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm font-semibold" aria-live="polite">
        {items.length} selected; {omitted.length} not included.
      </p>
      {omitted.length > 0 && (
        <details className="mt-2 text-sm text-gray-700">
          <summary className="cursor-pointer">
            Not included in this selection
          </summary>
          <ul className="mt-2 list-disc pl-5">
            {omitted.map((item) => (
              <li key={item.id}>
                {item.name} /{" "}
                {item.status === "cancelled"
                  ? "Cancelled or returned to review"
                  : completedPostalLetter(item)
                    ? "Not selected"
                    : "Still in progress"}
              </li>
            ))}
          </ul>
        </details>
      )}
      <SocietyPdfDownloads
        items={items}
        disabled={disabled}
        onDownload={(ids) => download("combined-pdf", ids)}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className={button}
          disabled={disabled || !items.length}
          onClick={() => download("docx")}
        >
          Download selected letters (.zip)
        </button>
        <button
          className={button}
          disabled={disabled || !toMail.length}
          onClick={() =>
            setConfirmation({
              action: "mail_selected_letters",
              batchId: batch.id,
              deliveryIds: toMail.map((item) => item.id),
              recipientNames: toMail.map(
                (item) => `${item.name} / ${item.societyName}`,
              ),
              title: `Mark ${toMail.length} selected ${toMail.length === 1 ? "letter" : "letters"} mailed?`,
              description: `Confirm these letters have actually been dispatched by postal mail. Only the listed letters will be marked mailed. The other ${batch.items.length - toMail.length} letters stay unchanged, including letters already marked mailed. This does not create or download files, send anything, or change NXT.`,
            })
          }
        >
          Mark selected letters mailed
        </button>
      </div>
      <p className="mt-3 text-sm text-gray-600">
        Downloads use the saved approved documents and do not mark letters
        mailed. Record mailing only after dispatch.
      </p>
    </section>
  );
}
