"use client";
import { useEffect, useId, useRef, useState } from "react";
import { Archive, Package, Plus, Search } from "lucide-react";
import WorkflowReturnLink from "@/components/WorkflowReturnLink";
import useUser from "@/utils/useUser";
import StockDialog, { StockHistory } from "./StockDialog";
import { stockLabel } from "@/utils/stewardshipStock";
import {
  GIFT_AVAILABILITY,
  inventoryNameKey,
  JU_GIFT_STARTERS,
} from "@/utils/stewardshipInventory";

const endpoint = "/api/stewardship/inventory";
const button =
  "min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:border-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:opacity-50";
const primary = `${button} !border-emerald-700 !bg-emerald-700 !text-white`;
const input =
  "min-h-11 w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-base font-normal text-gray-900";
const date = (value) =>
  new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

async function readResponse(response, viewerKey) {
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Inventory could not be loaded.");
  if (data.viewerKey !== viewerKey)
    throw new Error("Your sign-in changed. Reload this page.");
  return data;
}

function ItemHistory({ item, viewerKey }) {
  const [result, setResult] = useState({ loading: true });
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${endpoint}?id=${encodeURIComponent(item.id)}`, {
      cache: "no-store",
      signal: controller.signal,
    })
      .then((response) => readResponse(response, viewerKey))
      .then((data) => {
        if (data.id !== item.id || !Array.isArray(data.events))
          throw new Error("Item history could not be loaded.");
        if (!controller.signal.aborted) setResult({ events: data.events, stockEvents: data.stockEvents || [] });
      })
      .catch(() => {
        if (!controller.signal.aborted) setResult({ error: true });
      });
    return () => controller.abort();
  }, [item.id, viewerKey]);
  return (
    <div className="grid gap-3 text-sm">
      <p className="text-gray-600">
        Catalog and stock changes. Open Received Items for recipient history.
      </p>
      {result.loading && <p role="status">Loading item history...</p>}
      {result.error && (
        <p role="alert">
          Item history could not be loaded. Close and reopen to try again.
        </p>
      )}
      {result.events?.length === 0 && <p>No saved changes yet.</p>}
      {result.events?.map((event) => (
        <div
          key={event.version}
          className="rounded-xl border border-gray-200 p-4"
        >
          <p className="font-semibold">
            {
              {
                create: "Added",
                import: "Imported",
                update: "Updated",
                archive: "Archived",
                restore: "Restored",
              }[event.operation]
            }{" "}
            by {event.actor_name}
          </p>
          <p className="mt-1 text-gray-500">
            {date(event.created_at)} / Version {event.version}
          </p>
          <p className="mt-2 break-words">
            {event.snapshot.name} /{" "}
            {GIFT_AVAILABILITY[event.snapshot.availability]}
          </p>
          {event.snapshot.location && (
            <p className="break-words">Location: {event.snapshot.location}</p>
          )}
          {event.snapshot.description && (
            <p className="mt-1 whitespace-pre-wrap break-words">
              {event.snapshot.description}
            </p>
          )}
          {event.operation === "archive" && event.snapshot.archive_reason && (
            <p className="mt-2 whitespace-pre-wrap break-words">
              Reason: {event.snapshot.archive_reason}
            </p>
          )}
        </div>
      ))}
      {result.events?.length === 50 && (
        <p>Showing the most recent 50 changes.</p>
      )}
      {result.stockEvents && <><h3 className="font-semibold">Stock movements</h3><StockHistory events={result.stockEvents} /></>}
    </div>
  );
}

function InventoryDialog({ mode, item, items, viewerKey, onClose, onSaved }) {
  const id = useId();
  const dialog = useRef(null);
  const inFlight = useRef(false);
  const requestId = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [needsReload, setNeedsReload] = useState(false);
  const [discard, setDiscard] = useState(false);
  const [reason, setReason] = useState("");
  const initial = {
    name: item?.name || "",
    description: item?.description || "",
    location: item?.location || "",
    availability: item?.availability || "unknown",
  };
  const [draft, setDraft] = useState(initial);
  const candidates = JU_GIFT_STARTERS.filter(
    (starter) =>
      !items.some(
        (saved) =>
          saved.source_key === starter.key ||
          saved.name_key === inventoryNameKey(starter.name),
      ),
  );
  const [keys, setKeys] = useState(() =>
    candidates.map((starter) => starter.key),
  );
  const dirty =
    JSON.stringify(initial) !== JSON.stringify(draft) || Boolean(reason);
  useEffect(() => {
    const element = dialog.current;
    const previous = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      previous?.focus?.();
    };
  }, []);
  useEffect(() => {
    if (!dirty && !busy) return;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, busy]);
  function close() {
    if (inFlight.current) return;
    if (dirty && !needsReload) setDiscard(true);
    else onClose(needsReload);
  }
  async function submit(event) {
    event.preventDefault();
    if (inFlight.current || needsReload) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      if (mode === "create" && !requestId.current)
        requestId.current = crypto.randomUUID();
      const body = {
        operation: mode,
        viewerKey,
        ...(["archive", "restore", "update"].includes(mode)
          ? { id: item.id, version: item.version }
          : {}),
        ...(["create", "update"].includes(mode) ? draft : {}),
        ...(mode === "create" ? { requestId: requestId.current } : {}),
        ...(mode === "archive" ? { reason } : {}),
        ...(mode === "import" ? { keys } : {}),
      };
      const data = await readResponse(
        await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
        viewerKey,
      );
      if (!Array.isArray(data.items))
        throw new Error(
          "Saved status could not be confirmed. Close and reload inventory.",
        );
      onSaved(data, mode);
    } catch (failure) {
      setError(
        failure.message ||
          "Saved status could not be confirmed. Close and reload inventory.",
      );
      setNeedsReload(true);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }
  const title = {
    create: "Add gift item",
    update: "Edit gift item",
    archive: "Archive gift item",
    restore: "Restore gift item",
    import: "Start with existing JU gifts",
    history: "Item history",
  }[mode];
  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-gray-200 bg-white p-0 text-gray-900 shadow-xl backdrop:bg-gray-900/40"
    >
      <div className="grid gap-5 p-5 sm:p-7">
        <div className="flex items-start justify-between gap-3">
          <h2 id={`${id}-title`} className="text-xl font-bold">
            {title}
          </h2>
          <button
            autoFocus
            type="button"
            disabled={busy}
            className={button}
            onClick={close}
          >
            {needsReload ? "Close and reload" : "Close"}
          </button>
        </div>
        {mode === "history" ? (
          <ItemHistory item={item} viewerKey={viewerKey} />
        ) : (
          <form onSubmit={submit} className="grid gap-5">
            <fieldset
              disabled={busy || needsReload || discard}
              className="grid min-w-0 gap-5"
            >
              {["create", "update"].includes(mode) && (
                <>
                  <label className="grid gap-2 text-sm font-semibold">
                    Item name
                    <input
                      required
                      maxLength={160}
                      className={input}
                      value={draft.name}
                      onChange={(event) =>
                        setDraft({ ...draft, name: event.target.value })
                      }
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                Description (optional)
                    <textarea
                      rows={3}
                      maxLength={2000}
                      className={input}
                      value={draft.description}
                      onChange={(event) =>
                        setDraft({ ...draft, description: event.target.value })
                      }
                  placeholder="Sizes, colors, or helpful details"
                />
                <span className="text-sm font-normal text-gray-500">Names and descriptions are shared when choosing gifts for requests. Storage location stays staff-only.</span>
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Storage location (optional)
                    <input
                      maxLength={240}
                      className={input}
                      value={draft.location}
                      onChange={(event) =>
                        setDraft({ ...draft, location: event.target.value })
                      }
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-semibold">
                    Availability
                    <select
                      className={input}
                      value={draft.availability}
                      onChange={(event) =>
                        setDraft({ ...draft, availability: event.target.value })
                      }
                    >
                      {Object.entries(GIFT_AVAILABILITY).map(
                        ([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ),
                      )}
                    </select>
                    <span className="font-normal text-gray-500">
                      Choose Available only after checking. Use Manage stock for counts. Zero-count items are not offered for new requests.
                    </span>
                  </label>
                  {item?.source_key.startsWith("ju-action-field:") && (
                    <p className="text-sm text-gray-500">
                      Original NXT field name: {item.source_label}. Editing this
                      item does not rename the NXT field.
                    </p>
                  )}
                </>
              )}
              {mode === "archive" && (
                <>
                  <p>
                    Archive <strong>{item.name}</strong>? It will move out of
                    the active catalog. Existing requests and NXT history will
                    not change.
                  </p>
                  <label className="grid gap-2 text-sm font-semibold">
                    Reason (optional)
                    <textarea
                      rows={3}
                      maxLength={1000}
                      className={input}
                      value={reason}
                      onChange={(event) => setReason(event.target.value)}
                      placeholder="For example, discontinued or no longer available"
                    />
                  </label>
                  <p className="text-sm text-gray-500">
                    You can restore it later. Use Unavailable instead if it is
                    only temporarily out of stock.
                  </p>
                </>
              )}
              {mode === "restore" && (
                <p>
                  Return <strong>{item.name}</strong> to the active catalog?
                  Availability will reset to Not checked so it can be reviewed
                  before use.
                </p>
              )}
              {mode === "import" && (
                <>
                  <p>
                    These {JU_GIFT_STARTERS.length} gift names came from the NXT
                    custom-field list you shared. Choose the ones to add. This
                    does not check stock or connect the items to NXT.
                  </p>
                  <p className="text-sm text-gray-600">
                    Each starts as Not checked. Existing items, including
                    archived items, are skipped. Event and workflow fields are
                    not included.
                  </p>
                  {!candidates.length ? (
                    <p className="rounded-xl bg-emerald-50 p-4">
                      All starter items are already in the catalog.
                    </p>
                  ) : (
                    <>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          className={button}
                          onClick={() =>
                            setKeys(
                              candidates.map((candidate) => candidate.key),
                            )
                          }
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          className={button}
                          onClick={() => setKeys([])}
                        >
                          Clear selection
                        </button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {candidates.map((candidate) => (
                          <label
                            key={candidate.key}
                            className="flex min-h-11 items-start gap-3 rounded-lg border border-gray-200 p-3 text-sm"
                          >
                            <input
                              type="checkbox"
                              className="mt-0.5 h-4 w-4 shrink-0 accent-emerald-700"
                              checked={keys.includes(candidate.key)}
                              onChange={(event) =>
                                setKeys((current) =>
                                  event.target.checked
                                    ? [...current, candidate.key]
                                    : current.filter(
                                        (key) => key !== candidate.key,
                                      ),
                                )
                              }
                            />
                            {candidate.name}
                          </label>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
              <button
                type="submit"
                className={primary}
                disabled={
                  mode === "import"
                    ? !keys.length
                    : ["create", "update"].includes(mode) && !draft.name.trim()
                }
              >
                {busy
                  ? "Saving..."
                  : {
                      create: "Add item",
                      update: "Save changes",
                      archive: "Archive item",
                      restore: "Restore item",
                      import: `Add ${keys.length} selected items`,
                    }[mode]}
              </button>
            </fieldset>
            <p className="text-xs text-gray-500">
              Catalog only. No NXT records, requests, or delivery history are
              changed.
            </p>
          </form>
        )}
        {error && (
          <p
            role="alert"
            className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900"
          >
            {error}
          </p>
        )}
        {discard && (
          <div role="alert" className="grid gap-3 rounded-xl bg-amber-50 p-4">
            <p>Discard your unsaved changes?</p>
            <div className="flex flex-wrap gap-2">
              <button className={button} onClick={() => setDiscard(false)}>
                Keep editing
              </button>
              <button className={button} onClick={() => onClose(false)}>
                Discard changes
              </button>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}

export function GiftInventory({ viewerKey }) {
  const [result, setResult] = useState({ loading: true });
  const [reload, setReload] = useState(0);
  const [view, setView] = useState("active");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [editor, setEditor] = useState(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setResult({ loading: true });
    fetch(endpoint, { cache: "no-store", signal: controller.signal })
      .then((response) => readResponse(response, viewerKey))
      .then((data) => {
        if (!Array.isArray(data.items))
          throw new Error("Gift inventory could not be loaded.");
        if (!controller.signal.aborted) setResult({ items: data.items });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ error: error.message });
      });
    return () => controller.abort();
  }, [viewerKey, reload]);
  const items = result.items || [];
  const active = items.filter((item) => !item.archived_at);
  const shown = items
    .filter(
      (item) =>
        Boolean(item.archived_at) === (view === "archived") &&
        (!filter || item.availability === filter) &&
        `${item.name} ${item.description} ${item.location}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  function saved(data, mode) {
    setResult((current) => ({
      items: [
        ...current.items.filter(
          (item) => !data.items.some((savedItem) => savedItem.id === item.id),
        ),
        ...data.items,
      ],
    }));
    setEditor(null);
    setNotice(
      mode === "stock" ? "Stock updated. This change is recorded in stock history." : mode === "import"
        ? `${data.added} ${data.added === 1 ? "item" : "items"} added. Availability starts as Not checked.`
        : {
            create: "Gift item added.",
            update: "Changes saved.",
            archive: "Item moved to Archived. History is preserved.",
            restore: "Item restored. Check its availability before use.",
          }[mode],
    );
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-600">
          Keep available gifts easy to find. Archive items you no longer offer.
        </p>
        <div className="flex flex-wrap gap-2">
          <a className={button} href="/stewardship/inventory/recipients">Received Items</a>
          <button
            className={button}
            disabled={result.loading || !!editor}
            onClick={() => {
              setNotice("");
              setReload((value) => value + 1);
            }}
          >
            Reload inventory
          </button>
          {result.items && (
            <button
              className={primary}
              onClick={() => setEditor({ mode: "create" })}
            >
              <Plus size={16} className="mr-2 inline" aria-hidden="true" />
              Add item
            </button>
          )}
        </div>
      </div>
      {result.loading && <p role="status">Loading gift inventory...</p>}
      {result.error && (
        <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">
          {result.error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
        >
          {notice}
        </p>
      )}
      {result.items && (
        <>
          <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-2xl border border-emerald-100 bg-gradient-to-r from-emerald-50 to-white p-5 text-sm text-gray-600">
            <span>
              <strong className="text-lg text-emerald-900">
                {active.length}
              </strong>{" "}
              active items
            </span>
            <span>
              <strong className="text-lg text-emerald-900">
                {
                  active.filter((item) => item.availability === "available")
                    .length
                }
              </strong>{" "}
              marked available
            </span>
            <span>
              <strong className="text-lg text-gray-900">
                {
                  active.filter((item) => item.availability === "unknown")
                    .length
                }
              </strong>{" "}
              not checked
            </span>
            <span className="basis-full text-xs">
              Item types, not quantities. Availability is staff-maintained; no
              live NXT checks run here.
            </span>
          </div>
          <div className="flex flex-wrap gap-2" aria-label="Inventory views">
            {["active", "archived"].map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={view === value}
                className={view === value ? primary : button}
                onClick={() => {
                  setView(value);
                  setFilter("");
                }}
              >
                {value === "active"
                  ? `Active (${active.length})`
                  : `Archived (${items.length - active.length})`}
              </button>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-[1fr_15rem]">
            <label className="grid gap-2 text-sm font-semibold">
              <span>
                <Search className="mr-2 inline" size={16} aria-hidden="true" />
                Search inventory
              </span>
              <input
                type="search"
                className={input}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Item, description, or location"
              />
            </label>
            <label className="grid gap-2 text-sm font-semibold">
              Availability
              <select
                className={input}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
              >
                <option value="">All availability</option>
                {Object.entries(GIFT_AVAILABILITY).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {shown.length ? (
            <ul className="grid gap-4 md:grid-cols-2">
              {shown.map((item) => (
                <li
                  key={item.id}
                  className="flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <h2 className="min-w-0 break-words text-lg font-bold text-gray-900">
                      {item.name}
                    </h2>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${item.archived_at ? "bg-gray-100 text-gray-600" : item.availability === "available" ? "bg-emerald-50 text-emerald-800" : item.availability === "unavailable" ? "bg-amber-50 text-amber-900" : "bg-gray-100 text-gray-600"}`}
                    >
                      {item.archived_at
                        ? "Archived"
                        : GIFT_AVAILABILITY[item.availability]}
                    </span>
                  </div>
                  {item.description && (
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-600">
                      {item.description}
                    </p>
                  )}
                  <p className="mt-3 text-lg font-semibold text-emerald-900">{stockLabel(item)}</p>
                  <p className="mt-3 break-words text-sm text-gray-500">
                    {item.location
                      ? `Stored at: ${item.location}`
                      : "Storage location not set"}
                  </p>
                  {item.archived_at && (
                    <p className="mt-3 whitespace-pre-wrap break-words text-sm text-gray-600">
                      Archived {date(item.archived_at)}
                      {item.archive_reason ? `: ${item.archive_reason}` : ""}
                    </p>
                  )}
                  <div className="mt-auto flex flex-wrap gap-2 pt-5">
                    <a className={button} href={`/stewardship/inventory/recipients?itemId=${encodeURIComponent(item.id)}`} aria-label={`Who received ${item.name}?`}>Who received this?</a>
                    {item.archived_at ? (
                      <button
                        className={button}
                        onClick={() => setEditor({ mode: "restore", item })}
                        aria-label={`Restore ${item.name}`}
                      >
                        Restore
                      </button>
                    ) : (
                      <>
                        <button className={button} aria-label={`Manage stock for ${item.name}`} onClick={() => setEditor({ mode: "stock", item })}>Manage stock</button>
                        <button
                          className={button}
                          onClick={() => setEditor({ mode: "update", item })}
                          aria-label={`Edit ${item.name}`}
                        >
                          Edit item
                        </button>
                        <button
                          className={button}
                          onClick={() => setEditor({ mode: "archive", item })}
                          aria-label={`Archive ${item.name}`}
                        >
                          <Archive
                            size={14}
                            className="mr-2 inline"
                            aria-hidden="true"
                          />
                          Archive
                        </button>
                      </>
                    )}
                    <button
                      className="min-h-11 px-2 text-sm font-semibold text-emerald-800 hover:underline"
                      aria-label={`History for ${item.name}`}
                      onClick={() => setEditor({ mode: "history", item })}
                    >
                      History
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
              <Package
                className="mx-auto text-emerald-700"
                aria-hidden="true"
              />
              <h2 className="mt-3 font-bold">
                {items.length === 0
                  ? "Build your gift catalog"
                  : view === "archived" && !search && !filter
                    ? "No archived items"
                    : "No matching items"}
              </h2>
              <p className="mt-2 text-sm text-gray-600">
                {items.length === 0
                  ? "Start with your existing gift names below, or add an item."
                  : "Try another view, search, or availability filter."}
              </p>
            </div>
          )}
          <details
            className="rounded-2xl border border-gray-200 bg-white p-5"
            open={items.length === 0}
          >
            <summary className="cursor-pointer font-semibold text-emerald-800">
              Existing JU gift names
            </summary>
            <p className="mt-3 max-w-2xl text-sm text-gray-600">
              Add the gift items from the NXT field list you shared, without
              re-entering their names. Nothing is imported until you choose it,
              and archived items stay archived.
            </p>
            <button
              className={`${button} mt-4`}
              onClick={() => setEditor({ mode: "import" })}
            >
              Review starter items
            </button>
          </details>
          <p className="text-xs text-gray-500">
            Available items can be selected on personal-gift assistance requests.
            Received Items includes app receipts and reviewed historical imports. Set an opening count to track stock; historical imports never deduct it.
          </p>
        </>
      )}
      {editor?.mode === "stock" ? <StockDialog item={editor.item} viewerKey={viewerKey} onSaved={saved} onClose={reloadNeeded => { setEditor(null); if (reloadNeeded) setReload(value => value + 1); }} /> : editor && (
        <InventoryDialog
          {...editor}
          items={items}
          viewerKey={viewerKey}
          onSaved={saved}
          onClose={(reloadNeeded) => {
            setEditor(null);
            if (reloadNeeded) setReload((value) => value + 1);
          }}
        />
      )}
    </div>
  );
}

export default function GiftInventoryPage() {
  const { data: user, loading } = useUser();
  const viewerKey = user ? String(user.id || user.email) : null;
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-8">
      <WorkflowReturnLink href="/stewardship" />
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Stewardship
        </p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">
          Gift Inventory
        </h1>
      </header>
      {loading ? (
        <p role="status">Loading workspace...</p>
      ) : viewerKey ? (
        <GiftInventory key={viewerKey} viewerKey={viewerKey} />
      ) : (
        <a href="/account/signin" className="text-emerald-800 underline">
          Sign in to view gift inventory
        </a>
      )}
    </main>
  );
}
