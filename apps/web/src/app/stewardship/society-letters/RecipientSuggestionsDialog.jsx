import { useEffect, useRef, useState } from "react";

const button =
  "min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 font-semibold disabled:opacity-50";
const pageSize = 50;

export default function RecipientSuggestionsDialog({
  suggestions,
  revision,
  busy,
  onSave,
  onClose,
}) {
  const dialog = useRef(null);
  const [selected, setSelected] = useState(
    () => new Set(suggestions.map(({ row }) => row.householdId)),
  );
  const [page, setPage] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    dialog.current.showModal();
    const element = dialog.current;
    return () => element.close();
  }, []);
  async function save(event) {
    event.preventDefault();
    if (!confirmed || !selected.size || busy) return;
    setError("");
    try {
      await onSave({
        action: "confirm_recipient_suggestions",
        suggestionsRevision: revision,
        confirm: true,
        recipients: suggestions
          .filter(({ row }) => selected.has(row.householdId))
          .map(({ row }) => ({
            householdId: row.householdId,
            reviewToken: row.recipientReview.token,
          })),
      });
    } catch (err) {
      setError(
        err.message ||
          "The suggestions could not be saved. Close this window and reload saved results before trying again.",
      );
      setConfirmed(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      aria-labelledby="recipient-suggestions-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-6xl rounded-2xl border border-gray-200 bg-white p-5 text-gray-900 shadow-xl backdrop:bg-gray-900/40 sm:p-6"
    >
      <form onSubmit={save}>
        <h2 id="recipient-suggestions-title" className="text-xl font-bold">
          Confirm straightforward recipients
        </h2>
        <p className="mt-3 text-sm text-gray-600">
          These unreviewed recipients have no detected issues in the saved data.
          Preferred names fall back to first names; household wording includes
          both people and keeps different last names. Organizations use their
          sole returned contact and retain the organization name. Uncheck anyone
          you want to review individually. Saved CSV formatting still applies
          when exporting.
        </p>
        <p className="mt-2 text-sm font-semibold text-emerald-900">
          This saves recipient review only. Nothing is sent, marked mailed, or
          added to NXT.
        </p>
        <div className="my-4 flex flex-wrap items-center gap-3 text-sm">
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() => {
              setSelected(
                new Set(suggestions.map(({ row }) => row.householdId)),
              );
              setConfirmed(false);
            }}
          >
            Select all suggestions
          </button>
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={() => {
              setSelected(new Set());
              setConfirmed(false);
            }}
          >
            Clear selection
          </button>
          <p role="status">
            {selected.size} of {suggestions.length} selected
          </p>
        </div>
        <div className="max-h-[45dvh] overflow-auto rounded-xl border border-gray-200">
          <table
            className="w-full min-w-[650px] text-left text-sm"
            aria-label="Suggested recipient wording"
          >
            <thead className="sticky top-0 bg-gray-50">
              <tr>
                {[
                  "Select",
                  "Recipient",
                  "Addressee",
                  "Salutation",
                  "Mailing address",
                ].map((title) => (
                  <th key={title} scope="col" className="p-3">
                    {title}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {suggestions
                .slice(page * pageSize, (page + 1) * pageSize)
                .map(({ row, values }) => (
                  <tr
                    key={row.householdId}
                    className="border-t border-gray-100 align-top"
                  >
                    <td className="p-3">
                      <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
                        <input
                          type="checkbox"
                          aria-label={`Confirm ${row.name}`}
                          checked={selected.has(row.householdId)}
                          disabled={busy}
                          onChange={(event) => {
                            setSelected((current) => {
                              const next = new Set(current);
                              if (event.target.checked)
                                next.add(row.householdId);
                              else next.delete(row.householdId);
                              return next;
                            });
                            setConfirmed(false);
                          }}
                        />
                      </label>
                    </td>
                    <td className="p-3 font-semibold">
                      {row.name}
                      <p className="mt-1 text-xs font-normal text-gray-600">
                        {row.societyName}
                      </p>
                    </td>
                    <td className="whitespace-pre-line p-3">
                      {values.addressee}
                    </td>
                    <td className="p-3">{values.salutation}</td>
                    <td className="whitespace-pre-line p-3">
                      {values.address}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {suggestions.length > pageSize && (
          <nav
            aria-label="Suggestion pages"
            className="mt-3 flex items-center gap-3 text-sm"
          >
            <button
              type="button"
              className={button}
              disabled={busy || !page}
              onClick={() => setPage(page - 1)}
            >
              Previous suggestions
            </button>
            <span>
              Page {page + 1} of {Math.ceil(suggestions.length / pageSize)}
            </span>
            <button
              type="button"
              className={button}
              disabled={busy || (page + 1) * pageSize >= suggestions.length}
              onClick={() => setPage(page + 1)}
            >
              Next suggestions
            </button>
          </nav>
        )}
        <label className="my-5 flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={confirmed}
            disabled={busy}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          I accept the suggested names and addresses for the selected
          recipients.
        </label>
        {error && (
          <p role="alert" className="mb-4 text-sm text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            className={button}
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className={`${button} !border-emerald-700 !bg-emerald-700 !text-white`}
            disabled={busy || !confirmed || !selected.size}
          >
            Save {selected.size} recipient{" "}
            {selected.size === 1 ? "review" : "reviews"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
