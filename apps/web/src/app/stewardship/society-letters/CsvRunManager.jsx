import { useEffect, useRef, useState } from "react";
import { letterAppealsFinished } from "@/utils/societyLetterBulkAppeals";
import { letterViewHref } from "@/utils/societyLetterNavigation";
import { societyLetterCsvPlan } from "@/utils/societyLetterCsvExport";

const button =
  "min-h-11 rounded-xl border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 disabled:opacity-50";
const progressText = (complete, attention) =>
  `${complete} ${complete === 1 ? "letter has" : "letters have"} confirmed appeals.${attention ? ` ${attention} ${attention === 1 ? "letter needs" : "letters need"} attention.` : ""}`;

export default function CsvRunManager({
  data,
  busy,
  act,
  loadRun,
  downloadRun,
  onActiveChange,
  onResolveBlocker,
  onReload,
}) {
  const [run, setRun] = useState(null);
  const [selected, setSelected] = useState([]);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [working, setWorking] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const active = useRef(false),
    stopped = useRef(false),
    mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopped.current = true;
    };
  }, []);
  useEffect(() => {
    onActiveChange(working);
    return () => onActiveChange(false);
  }, [working, onActiveChange]);
  const plan = run
    ? societyLetterCsvPlan(data, run.societyKey, run.letterDate, run.csvFormat)
    : null;
  const eligible = new Set(plan?.entries.map((entry) => entry.householdId));
  const omitted = new Map(
    plan?.omitted.map((entry) => [entry.householdId, entry.reason]),
  );
  const blocker = data.readiness?.blocker;
  const ownLetters = new Map(),
    returnedIds = new Set();
  for (const item of data.history || []) {
    if (!run || item.csvMailMerge?.runId !== run.id) continue;
    if (item.status === "cancelled") returnedIds.add(item.householdId);
    else ownLetters.set(item.householdId, item);
  }
  const entries = (run?.entries || []).map((entry) => {
    const own = ownLetters.get(entry.householdId);
    const returned = returnedIds.has(entry.householdId);
    const issue =
      entry.confirmationIssue ||
      plan?.issue ||
      omitted.get(entry.householdId) ||
      (!eligible.has(entry.householdId)
        ? "No longer eligible; review workspace."
        : "");
    const unavailable =
      returned ||
      (own
        ? own.status === "mailed" || letterAppealsFinished(own)
        : Boolean(issue || blocker));
    return {
      ...entry,
      unavailable,
      status:
        own?.status === "mailed"
          ? "Marked mailed"
          : own && letterAppealsFinished(own)
            ? "Appeals confirmed; ready to mail"
            : own
              ? "Created; finish appeals in Letter history"
              : returned
                ? "Returned to review; use a new tracked CSV"
                : unavailable
                  ? issue || blocker.message
                  : "Not yet confirmed created",
    };
  });
  const matches = entries.filter((entry) =>
    `${entry.name} ${entry.householdId}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const visible = matches.slice(page * 50, (page + 1) * 50);
  const chosen = entries.filter(
    (entry) => selected.includes(entry.householdId) && !entry.unavailable,
  );
  async function open(id) {
    if (active.current || busy) return;
    active.current = true;
    setWorking(true);
    setError("");
    setMessage("");
    setRun(null);
    setSelected([]);
    setConfirmed(false);
    setPage(0);
    setSearch("");
    try {
      if (id) {
        const result = await loadRun(id);
        if (mounted.current) setRun(result);
      }
    } catch (err) {
      if (mounted.current) setError(err.message || "Could not load this CSV.");
    } finally {
      active.current = false;
      if (mounted.current) setWorking(false);
    }
  }
  async function finish() {
    if (busy || active.current || !confirmed || !chosen.length) return;
    active.current = true;
    stopped.current = false;
    setWorking(true);
    setProcessing(true);
    setError("");
    setMessage("Saving your confirmation...");
    try {
      const payload = await act({
        action: "confirm_csv_letters",
        runId: run.id,
        sha256: run.sha256,
        householdIds: chosen.map((item) => item.householdId),
        confirm: true,
      });
      if (!payload || !Array.isArray(payload.csvDeliveryIds))
        throw new Error(
          "Confirmation could not finish. Reload saved results before trying again; no progress is lost.",
        );
      let complete = 0,
        attention = 0;
      for (const id of payload.csvDeliveryIds) {
        if (stopped.current || !mounted.current) break;
        const response = await act({
          action: "finish_selected_letter_appeals",
          deliveryIds: payload.csvDeliveryIds,
          deliveryId: id,
          confirm: true,
        });
        const result = response?.bulkAppealUpdate;
        if (
          !result ||
          result.deliveryId !== id ||
          !["complete", "pending", "needs_review"].includes(result.status) ||
          typeof result.stop !== "boolean"
        )
          throw new Error(
            "Updates paused. Continue in Letter history; saved progress and uncertain NXT submissions are protected.",
          );
        if (result.status === "complete") complete++;
        else attention++;
        if (!mounted.current) return;
        setMessage(
          `${progressText(complete, attention)} Nothing has been marked mailed.`,
        );
        if (result.stop) {
          stopped.current = true;
          break;
        }
      }
      if (mounted.current)
        setMessage(
          `${progressText(complete, attention)}${stopped.current ? " Paused before the next household; finish remaining updates in Letter history." : " Open Letter history to record mailing after physical dispatch."} Nothing has been marked mailed.`,
        );
    } catch (err) {
      if (mounted.current) {
        setMessage("");
        setError(err.message);
      }
    } finally {
      active.current = false;
      if (mounted.current) {
        setWorking(false);
        setProcessing(false);
        setConfirmed(false);
        setSelected([]);
      }
    }
  }
  if (!data.csvRuns?.length) return null;
  const disabled = busy || working;
  return (
    <section
      aria-label="Saved CSV exports"
      className="my-4 rounded-xl border border-emerald-200 bg-white p-4"
    >
      <h3 className="font-semibold text-emerald-950">Saved CSV exports</h3>
      <p className="mt-2 text-sm text-gray-700">
        After using Finish &amp; Merge in Word, select only the letters you
        actually created and checked. This records their creation and applies
        missing appeals to each household's constituent records. It does not
        print, email, or mark letters mailed.
      </p>
      <label className="mt-3 block text-sm font-semibold">
        Tracked export
        <select
          value={run?.id || ""}
          disabled={disabled}
          onChange={(event) => open(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3"
        >
          <option value="">Choose a saved CSV</option>
          {data.csvRuns.map((item) => (
            <option key={item.id} value={item.id}>
              {item.societyName} / Letter date {item.letterDate} / {item.count}{" "}
              households / Saved {new Date(item.createdAt).toLocaleString()}
            </option>
          ))}
        </select>
      </label>
      {run && (
        <>
          <button
            className={`${button} mt-3 mr-2`}
            disabled={disabled}
            onClick={async () => {
              if (onReload && !(await onReload())) return;
              await open(run.id);
            }}
          >
            Refresh saved CSV status
          </button>
          <button
            className={`${button} mt-3`}
            disabled={disabled}
            onClick={async () => {
              try {
                await downloadRun(run.id);
              } catch (err) {
                setError(err.message);
              }
            }}
          >
            Download original CSV again
          </button>
          <p className="mt-2 text-sm text-gray-600">
            The original CSV does not change as you work. It may include letters
            already created or mailed; use the statuses below to avoid repeat
            mailings.
          </p>
          {run.periodKey !== data.period?.key ? (
            <p className="mt-3 text-sm">
              This export is from another recognition period. Existing letters
              remain in Letter history.
            </p>
          ) : (
            <>
              {blocker && (
                <div
                  role="status"
                  className="my-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"
                >
                  <p>{blocker.message} Your original CSV stays saved.</p>
                  {onResolveBlocker && (
                    <button
                      className={`${button} mt-2`}
                      disabled={disabled}
                      onClick={() => onResolveBlocker(blocker)}
                    >
                      {blocker.label}
                    </button>
                  )}
                </div>
              )}
              <label className="mt-3 block text-sm">
                Find recipient{" "}
                <input
                  value={search}
                  disabled={disabled}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(0);
                  }}
                  className="ml-2 rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>
              <div className="my-3 flex flex-wrap gap-2">
                <button
                  className={button}
                  disabled={disabled}
                  onClick={() => {
                    setSelected(
                      visible
                        .filter((item) => !item.unavailable)
                        .map((item) => item.householdId),
                    );
                    setConfirmed(false);
                  }}
                >
                  Select eligible on this page
                </button>
                <button
                  className={button}
                  disabled={disabled || !selected.length}
                  onClick={() => {
                    setSelected([]);
                    setConfirmed(false);
                  }}
                >
                  Clear CSV selection
                </button>
              </div>
              <ul className="max-h-72 space-y-2 overflow-y-auto">
                {visible.map((entry) => (
                  <li key={entry.householdId}>
                    <label className="flex min-h-11 gap-3 rounded-lg bg-gray-50 p-3 text-sm">
                      <input
                        type="checkbox"
                        disabled={
                          disabled ||
                          entry.unavailable ||
                          (!selected.includes(entry.householdId) &&
                            chosen.length >= 50)
                        }
                        checked={
                          selected.includes(entry.householdId) &&
                          !entry.unavailable
                        }
                        onChange={(event) => {
                          setSelected(
                            event.target.checked
                              ? [...selected, entry.householdId]
                              : selected.filter(
                                  (id) => id !== entry.householdId,
                                ),
                          );
                          setConfirmed(false);
                        }}
                      />
                      <span>
                        <strong>{entry.name}</strong>
                        <br />
                        {entry.status}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="my-3 flex items-center gap-3">
                <button
                  className={button}
                  disabled={disabled || page === 0}
                  onClick={() => setPage(page - 1)}
                >
                  Previous CSV page
                </button>
                <span className="text-sm">
                  Page {page + 1} of{" "}
                  {Math.max(1, Math.ceil(matches.length / 50))}; {chosen.length}{" "}
                  selected (up to 50)
                </span>
                <button
                  className={button}
                  disabled={disabled || (page + 1) * 50 >= matches.length}
                  onClick={() => setPage(page + 1)}
                >
                  Next CSV page
                </button>
              </div>
              <label className="my-3 flex gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  disabled={disabled || !chosen.length}
                  onChange={(event) => setConfirmed(event.target.checked)}
                />
                I created and checked these {chosen.length} selected letters
                using this saved CSV. Apply their saved society appeals in NXT
                to all applicable household members. Do not mark them mailed.
              </label>
              <button
                className={button}
                disabled={disabled || !confirmed || !chosen.length}
                onClick={finish}
              >
                Confirm letters created &amp; apply appeals
              </button>
            </>
          )}
        </>
      )}
      {processing && (
        <button
          className={`${button} ml-2`}
          onClick={() => {
            stopped.current = true;
            setMessage(
              "Will stop before the next household. Current work will be saved.",
            );
          }}
        >
          Stop after current household
        </button>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-emerald-900">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <p className="mt-3 text-sm">
        <a
          className="font-semibold text-emerald-800 underline"
          href={letterViewHref("history")}
        >
          Open Letter history
        </a>{" "}
        to finish interrupted appeals or mark selected completed letters mailed
        after dispatch.
      </p>
    </section>
  );
}
