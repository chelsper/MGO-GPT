import { useEffect, useId, useState } from "react";
import { formatReceivedDate } from "@/utils/stewardshipReceipts";

export function GiftChoice({
  choices,
  value,
  current,
  onChange,
  disabled = false,
}) {
  const id = useId();
  const loaded = Array.isArray(choices);
  const currentId = current?.id ? String(current.id) : "";
  const selectedId = value == null ? "" : String(value);
  const missingDraft =
    selectedId &&
    selectedId !== currentId &&
    !choices?.some((item) => item.id === selectedId);
  const description =
    selectedId === currentId
      ? current?.description
      : choices?.find((item) => item.id === selectedId)?.description;
  return (
    <div className="grid min-w-0 gap-2">
      <label htmlFor={id} className="text-sm font-semibold">
        Gift preference (optional)
      </label>
      <select
        id={id}
        aria-describedby={`${id}-hint`}
        className="min-h-11 w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-base text-gray-900"
        value={selectedId}
        disabled={disabled || !loaded}
        onChange={(event) => onChange(event.target.value || null)}
      >
        <option value="">Help me choose / no item selected</option>
        {currentId && (
          <option value={currentId}>{current.name} (saved selection)</option>
        )}
        {missingDraft && (
          <option value={selectedId} disabled>
            No longer available - choose another item
          </option>
        )}
        {(choices || [])
          .filter((item) => item.id !== currentId)
          .map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
      </select>
      {description && (
        <p className="whitespace-pre-wrap break-words text-sm text-gray-700">
          {description}
        </p>
      )}
      <p id={`${id}-hint`} className="text-sm font-normal text-gray-600">
        {!loaded
          ? "Gift choices are unavailable right now. You can still ask for help without choosing an item."
          : !choices.length
            ? "No items are currently marked available. You can still ask for a suggestion."
            : "Choose an available catalog item, or leave this open for a suggestion."}{" "}
        This is a preference, not a reservation or delivery.
      </p>
      {currentId &&
        !choices?.some((item) => item.id === currentId) &&
        loaded && (
          <p className="text-sm text-gray-600">
            The saved selection is no longer offered as available. Its history
            is kept; choose another item if needed.
          </p>
        )}
    </div>
  );
}

export function StaffGiftChoice({
  viewerKey,
  value,
  current,
  onChange,
  disabled,
}) {
  const [result, setResult] = useState({ loading: true });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult({ loading: true });
    fetch(
      `/api/stewardship/assistance?viewerKey=${encodeURIComponent(viewerKey)}`,
      { cache: "no-store", signal: controller.signal },
    )
      .then(async (response) => {
        const data = await response.json();
        if (
          !response.ok ||
          data.viewerKey !== String(viewerKey) ||
          !Array.isArray(data.giftChoices)
        )
          throw new Error();
        if (!controller.signal.aborted)
          setResult({ choices: data.giftChoices });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ error: true });
      });
    return () => controller.abort();
  }, [viewerKey, reload]);
  return (
    <div className="grid gap-2">
      {result.loading ? (
        <p role="status">Loading available gift items...</p>
      ) : (
        <GiftChoice
          choices={result.choices}
          value={value}
          current={current}
          onChange={onChange}
          disabled={disabled}
        />
      )}
      <div className="flex flex-wrap gap-4 text-sm">
        <button
          type="button"
          className="min-h-11 font-semibold text-emerald-800 underline"
          disabled={disabled || result.loading}
          onClick={() => setReload((value) => value + 1)}
        >
          Reload gift choices
        </button>
        <a
          className="inline-flex min-h-11 items-center font-semibold text-emerald-800 underline"
          href="/stewardship/inventory"
        >
          Manage gift inventory
        </a>
      </div>
    </div>
  );
}

export function SavedGiftPreference({ request }) {
  const receipt = request?.stewardship_received_item;
  if (receipt) return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
      <p className="break-words"><strong>Received:</strong> {receipt.item_snapshot?.name}</p>
      <p className="mt-1">{formatReceivedDate(receipt.received_on)}</p>
      <p className="mt-1 text-xs">Recorded in the app by {receipt.recorded_by_name}. Not synced to NXT.</p>
    </div>
  );
  const gift = request?.stewardship_gift_item_snapshot;
  if (!gift?.name) return null;
  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3 text-sm text-emerald-900">
      <p className="break-words">
        <strong>Gift preference:</strong> {gift.name}
      </p>
      <p className="mt-1 text-xs">
        Saved on this request. Not a reservation or confirmation of delivery.
      </p>
    </div>
  );
}
