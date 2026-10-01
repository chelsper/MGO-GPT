"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Search } from "lucide-react";
import useUser from "@/utils/useUser";
import WorkflowReturnLink from "@/components/WorkflowReturnLink";
import { formatReceivedDate } from "@/utils/stewardshipReceipts";
import { getSafeInternalReturnPath } from "@/utils/workflowNavigation";

const endpoint = "/api/stewardship/received-items";
const button =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-50";
const input =
  "min-h-11 w-full min-w-0 rounded-xl border border-gray-300 bg-white px-3 py-2 text-base text-gray-900";

function CorrectReceipt({ item, viewerKey, onSaved }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const flight = useRef(false);
  async function submit(event) {
    event.preventDefault();
    if (flight.current || !reason.trim() || error) return;
    flight.current = true;
    setBusy(true);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "void",
          id: item.id,
          requestId: item.request_id,
          version: item.request_version,
          viewerKey,
          reason,
        }),
      });
      const data = await response.json();
      if (
        !response.ok ||
        data.viewerKey !== viewerKey ||
        data.receipt?.id !== item.id ||
        !data.receipt.voided_at
      )
        throw new Error(
          data.error ||
            "Saved status could not be confirmed. Reload received items.",
        );
      onSaved();
    } catch (failure) {
      setError(
        failure.message || "Reload received items to check saved status.",
      );
    } finally {
      flight.current = false;
      setBusy(false);
    }
  }
  return open ? (
    <form
      onSubmit={submit}
      className="mt-4 grid gap-3 rounded-xl bg-amber-50 p-4"
    >
      <p className="text-sm text-amber-950">
        Mark this receipt as entered in error? It will leave the received list,
        but remain in correction history. Then open the request to record the
        correct item or date.
      </p>
      <label className="grid gap-1 text-sm font-semibold">
        Correction reason
        <textarea
          required
          maxLength={1000}
          className={input}
          value={reason}
          disabled={busy || !!error}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-amber-950">
          {error} Reload this view before trying again.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button className={button} disabled={busy || !reason.trim() || !!error}>
          {busy ? "Saving..." : "Void receipt and keep history"}
        </button>
        <button
          type="button"
          disabled={busy}
          className={button}
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  ) : (
    <button
      className="min-h-11 text-sm font-semibold text-gray-600 underline"
      onClick={() => setOpen(true)}
    >
      Correct this entry
    </button>
  );
}

export function ReceivedItems({
  sessionKey,
  initialFilters = {},
  returnTo = "",
}) {
  const [searchDraft, setSearchDraft] = useState("");
  const [filters, setFilters] = useState({
    search: "",
    includeVoided: false,
    ...initialFilters,
  });
  const [pages, setPages] = useState([null]);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState({ loading: true });
  const [notice, setNotice] = useState("");
  const before = pages.at(-1);
  useEffect(() => {
    const controller = new AbortController();
    setResult({ loading: true });
    const params = new URLSearchParams();
    Object.entries({ ...filters, before }).forEach(([key, value]) => {
      if (value) params.set(key, String(value));
    });
    fetch(`${endpoint}?${params}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error || "Received items could not be loaded.");
        if (data.sessionKey !== sessionKey || !Array.isArray(data.items))
          throw new Error("Your sign-in changed. Reload this page.");
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((error) => {
        if (!controller.signal.aborted) setResult({ error: error.message });
      });
    return () => controller.abort();
  }, [filters, before, reload, sessionKey]);
  function changeFilters(next) {
    setFilters(next);
    setPages([null]);
    setNotice("");
  }
  const destination =
    getSafeInternalReturnPath(returnTo) ||
    (result.canManage ? "/stewardship/inventory" : "/follow-ups");
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-8">
      <WorkflowReturnLink href={destination} />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Stewardship
          </p>
          <h1 className="mt-2 text-3xl font-bold text-gray-900">
            Received Items
          </h1>
          <p className="mt-2 max-w-2xl text-gray-600">
            See who received a stewardship gift, what they received, and when.
          </p>
        </div>
        <button
          className={button}
          disabled={result.loading}
          onClick={() => setReload((value) => value + 1)}
        >
          Reload received items
        </button>
      </header>
      <p className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-950">
        Confirmed receipts recorded in this app. Requests and completed tasks
        are not counted as deliveries. Earlier NXT gift-item history has not
        been imported.
      </p>
      {result.items && !result.canManage && (
        <p className="text-sm text-gray-600">
          Showing receipts linked to your fundraiser workspace.
        </p>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          changeFilters({ ...filters, search: searchDraft.trim() });
        }}
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-gray-200 bg-white p-4"
      >
        <label className="grid min-w-0 flex-1 basis-64 gap-2 text-sm font-semibold">
          <span>
            <Search size={16} className="mr-2 inline" aria-hidden="true" />
            Search received items
          </span>
          <input
            type="search"
            className={input}
            placeholder="Recipient, constituent ID, item, or fundraiser"
            maxLength={160}
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
          />
        </label>
        <button className={button}>Search</button>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={filters.includeVoided}
            onChange={(event) =>
              changeFilters({ ...filters, includeVoided: event.target.checked })
            }
          />
          Include corrections
        </label>
      </form>
      {(filters.itemId || filters.constituentId || filters.search) && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-600">
          <p>
            {filters.itemId ? `Filtered to item #${filters.itemId}. ` : ""}
            {filters.constituentId
              ? `Filtered to constituent #${filters.constituentId}. `
              : ""}
            {filters.search ? `Search: ${filters.search}` : ""}
          </p>
          <button
            className={button}
            onClick={() => {
              setSearchDraft("");
              changeFilters({
                search: "",
                includeVoided: filters.includeVoided,
              });
            }}
          >
            Clear filters
          </button>
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-4 text-emerald-900"
        >
          {notice}
        </p>
      )}
      {result.loading && <p role="status">Loading recorded receipts...</p>}
      {result.error && (
        <p role="alert" className="rounded-xl bg-amber-50 p-4 text-amber-900">
          {result.error}
        </p>
      )}
      {result.items?.length === 0 && (
        <section className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center">
          <h2 className="text-lg font-bold">
            No recorded receipts in this view
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-gray-600">
            This does not mean the person has never received a gift. Confirmed
            receipts will appear here when staff records them from a
            personal-gift assistance request.
          </p>
          {result.canManage && (
            <a className={`${button} mt-4`} href="/stewardship/requests">
              Open Assistance Requests
            </a>
          )}
        </section>
      )}
      {!!result.items?.length && (
        <>
          <p className="text-sm text-gray-500">
            {result.items.length}{" "}
            {result.items.length === 1 ? "record" : "records"} on this page.
            Most recently recorded first.
          </p>
          <ul className="grid gap-4">
            {result.items.map((item) => (
              <li
                key={item.id}
                className="min-w-0 rounded-2xl border border-gray-200 bg-white p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h2 className="break-words text-lg font-bold text-gray-900">
                      {item.constituent_name}
                    </h2>
                    <p className="mt-1 text-xs text-gray-500">
                      Constituent #{item.constituent_id}
                    </p>
                    <p className="mt-1 break-words text-base text-emerald-900">
                      {item.item_snapshot.name}
                    </p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${item.voided_at ? "bg-gray-100 text-gray-600" : "bg-emerald-50 text-emerald-800"}`}
                  >
                    {!item.voided_at && (
                      <CheckCircle2 size={16} aria-hidden="true" />
                    )}
                    {item.voided_at ? "Voided / not counted" : "Received"}
                  </span>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-gray-500">Date received</dt>
                    <dd className="mt-1 font-semibold">
                      {formatReceivedDate(item.received_on)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Fundraiser</dt>
                    <dd className="mt-1 break-words">{item.owner_name}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Recorded by</dt>
                    <dd className="mt-1 break-words">
                      {item.recorded_by_name}
                    </dd>
                  </div>
                </dl>
                {item.note && (
                  <p className="mt-4 whitespace-pre-wrap break-words text-sm text-gray-700">
                    {item.note}
                  </p>
                )}
                {item.voided_at && (
                  <p className="mt-4 whitespace-pre-wrap break-words text-sm text-amber-950">
                    Correction by {item.voided_by_name}: {item.void_reason}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  <button
                    className="min-h-11 font-semibold text-emerald-800 underline"
                    onClick={() => {
                      setSearchDraft("");
                      changeFilters({
                        search: "",
                        includeVoided: false,
                        constituentId: item.constituent_id,
                      });
                    }}
                  >
                    More for this recipient
                  </button>
                  <button
                    className="min-h-11 font-semibold text-emerald-800 underline"
                    onClick={() => {
                      setSearchDraft("");
                      changeFilters({
                        search: "",
                        includeVoided: false,
                        itemId: item.item_id,
                      });
                    }}
                  >
                    More recipients of this item
                  </button>
                  {result.canManage && (
                    <a
                      className="inline-flex min-h-11 items-center font-semibold text-emerald-800 underline"
                      href={`/stewardship/requests?requestId=${encodeURIComponent(item.request_id)}`}
                    >
                      Open request #{item.request_id}
                    </a>
                  )}
                </div>
                {result.canManage && !item.voided_at && (
                  <CorrectReceipt
                    key={`${item.id}:${reload}`}
                    item={item}
                    viewerKey={result.viewerKey}
                    onSaved={() => {
                      setNotice(
                        "Receipt voided. The original entry remains in correction history.",
                      );
                      setReload((value) => value + 1);
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      {result.items && (pages.length > 1 || result.items.length > 0) && (
        <nav aria-label="Received items pages" className="flex flex-wrap gap-3">
          <button
            className={button}
            disabled={pages.length === 1}
            onClick={() => setPages((value) => value.slice(0, -1))}
          >
            Previous page
          </button>
          <button
            className={button}
            disabled={!result.next}
            onClick={() => setPages((value) => [...value, result.next])}
          >
            Next page
          </button>
        </nav>
      )}
    </main>
  );
}

export default function ReceivedItemsPage() {
  const { data: user, loading } = useUser();
  const [params] = useState(
    () =>
      new URLSearchParams(
        typeof window === "undefined" ? "" : window.location.search,
      ),
  );
  const initialFilters = Object.fromEntries(
    ["itemId", "constituentId"]
      .filter((key) => params.has(key))
      .map((key) => [key, params.get(key)]),
  );
  const sessionKey = user ? String(user.id || user.email) : null;
  if (loading)
    return (
      <p role="status" className="p-8">
        Loading workspace...
      </p>
    );
  if (!sessionKey)
    return (
      <a href="/account/signin" className="p-8 text-emerald-800 underline">
        Sign in to view received items
      </a>
    );
  return (
    <ReceivedItems
      key={sessionKey}
      sessionKey={sessionKey}
      initialFilters={initialFilters}
      returnTo={params.get("returnTo")}
    />
  );
}
