import { useEffect, useRef, useState } from "react";
import {
  LETTER_APPEAL_SELECTION_LIMIT,
  unfinishedPostalAppealLetter,
} from "@/utils/societyLetterBulkAppeals";

const button =
  "min-h-11 rounded-xl border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50";

export default function BulkLetterAppealUpdates({
  items,
  busy,
  act,
  onActiveChange,
}) {
  const [selected, setSelected] = useState([]);
  const [confirmation, setConfirmation] = useState(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState([]);
  const [notice, setNotice] = useState("");
  const mounted = useRef(false);
  const stopped = useRef(false);
  const starting = useRef(false);
  const active = !!confirmation || running;
  const candidates = items.filter(unfinishedPostalAppealLetter);
  const chosen = candidates.filter((item) => selected.includes(item.id));
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stopped.current = true;
    };
  }, []);
  useEffect(() => {
    onActiveChange(active);
    return () => onActiveChange(false);
  }, [active, onActiveChange]);

  async function finish() {
    if (busy || starting.current || !confirmation?.length) return;
    starting.current = true;
    stopped.current = false;
    setRunning(true);
    setProgress(0);
    setResults([]);
    setNotice("");
    const plan = confirmation;
    const outcomes = [];
    try {
      for (const item of plan) {
        if (stopped.current || !mounted.current) break;
        const payload = await act({
          action: "finish_selected_letter_appeals",
          deliveryIds: plan.map((entry) => entry.id),
          deliveryId: item.id,
          confirm: true,
        });
        if (!mounted.current) return;
        const result = payload?.bulkAppealUpdate;
        if (
          !result ||
          result.deliveryId !== item.id ||
          !["complete", "needs_review", "pending"].includes(result.status) ||
          typeof result.stop !== "boolean"
        ) {
          setNotice(
            "Updates paused. Reload Letter history before continuing; saved progress is kept and uncertain submissions will be checked, not repeated.",
          );
          return;
        }
        outcomes.push({ ...result, name: item.name });
        setResults([...outcomes]);
        setProgress(outcomes.length);
        if (result.stop) {
          setNotice(
            `Updates paused. ${result.message || "Check the NXT connection before continuing."} Your approved letters and completed updates are saved.`,
          );
          return;
        }
      }
      const complete = outcomes.filter(
        (item) => item.status === "complete",
      ).length;
      const attention = outcomes.length - complete;
      setNotice(
        `${complete} ${complete === 1 ? "letter is" : "letters are"} ready to download.${attention ? ` ${attention} need attention below.` : ""}${stopped.current ? " Stopped before the next household. Remaining letters are unchanged." : " Completed PDF batches can be downloaded below."}`,
      );
    } catch {
      if (mounted.current)
        setNotice(
          "Updates paused. Reload Letter history to check saved progress before continuing. No letter will be recreated.",
        );
    } finally {
      starting.current = false;
      if (mounted.current) {
        setRunning(false);
        setConfirmation(null);
        setSelected([]);
      }
    }
  }

  if (!candidates.length && !active && !notice) return null;
  return (
    <section
      aria-label="Finish saved letter updates"
      className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 sm:p-6"
    >
      <h2 className="text-lg font-bold text-emerald-950">
        Finish saved letters
      </h2>
      <p className="mt-1 text-sm text-gray-700">
        Check NXT and apply only missing appeals to the selected letters'
        household members. Your approved letters stay unchanged. Nothing is
        emailed or marked mailed.
      </p>
      {!active && candidates.length > 0 && (
        <>
          <div className="my-4 flex flex-wrap items-center gap-3">
            <button
              className={button}
              disabled={busy}
              onClick={() =>
                setSelected(
                  candidates
                    .slice(0, LETTER_APPEAL_SELECTION_LIMIT)
                    .map((item) => item.id),
                )
              }
            >
              Select up to 50 unfinished letters
            </button>
            <button
              className={button}
              disabled={busy || !selected.length}
              onClick={() => setSelected([])}
            >
              Clear selection
            </button>
            <span className="text-sm">{chosen.length} selected</span>
          </div>
          <ul className="max-h-72 space-y-2 overflow-auto rounded-xl border border-emerald-100 bg-white p-3">
            {candidates.map((item) => (
              <li key={item.id}>
                <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg p-2 hover:bg-emerald-50">
                  <input
                    type="checkbox"
                    className="mt-1 h-5 w-5 accent-emerald-700"
                    checked={chosen.some((entry) => entry.id === item.id)}
                    disabled={
                      busy ||
                      (chosen.length >= LETTER_APPEAL_SELECTION_LIMIT &&
                        !selected.includes(item.id))
                    }
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...chosen.map((entry) => entry.id), item.id]
                          : selected.filter((id) => id !== item.id),
                      )
                    }
                  />
                  <span>
                    <strong>{item.name}</strong>
                    <span className="block text-sm text-gray-600">
                      {item.societyName} · Letter date {item.letterAppeals.date}
                      {item.letterAppeals.status === "needs_review"
                        ? " · Needs attention"
                        : ""}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <button
            className={`${button} mt-4 !bg-emerald-700 !text-white`}
            disabled={busy || !chosen.length}
            onClick={() => {
              setConfirmation(chosen);
              setNotice("");
              setResults([]);
            }}
          >
            Finish updates for selected letters
          </button>
        </>
      )}
      {confirmation && (
        <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4">
          <h3 className="font-bold">
            Finish NXT updates for {confirmation.length}{" "}
            {confirmation.length === 1 ? "letter" : "letters"}?
          </h3>
          <p className="mt-2 text-sm text-gray-700">
            Use each letter's saved appeal, date, and comments. Existing
            submissions are checked first; uncertain or conflicting records are
            left for attention. No new letters are created.
          </p>
          <details className="mt-3 text-sm">
            <summary className="cursor-pointer font-semibold">
              Selected letters and appeal details
            </summary>
            <ul className="mt-2 max-h-64 space-y-3 overflow-auto">
              {confirmation.map((item) => (
                <li key={item.id}>
                  <strong>{item.name}</strong>
                  <p>
                    {item.letterAppeals.appeal.lookupId ||
                      item.letterAppeals.appeal.id}
                    : {item.letterAppeals.appeal.description}
                  </p>
                  <p>
                    Date: {item.letterAppeals.date}. Household record IDs:{" "}
                    {item.members.join(", ")}. Confirmed relationship-only
                    spouses do not receive a separate appeal.
                  </p>
                </li>
              ))}
            </ul>
          </details>
          {running ? (
            <div className="mt-4">
              <p role="status">
                Checked {progress} of {confirmation.length} letters. Keep this
                page open while updates finish.
              </p>
              <button
                className={`${button} mt-3`}
                onClick={() => {
                  stopped.current = true;
                  setNotice(
                    "Stopping after the current household. Saved updates will be kept.",
                  );
                }}
              >
                Stop after this household
              </button>
            </div>
          ) : (
            <div className="mt-4 flex flex-wrap gap-3">
              <button
                className={`${button} !bg-emerald-700 !text-white`}
                disabled={busy}
                onClick={finish}
              >
                Confirm and finish NXT updates
              </button>
              <button
                className={button}
                disabled={busy}
                onClick={() => setConfirmation(null)}
              >
                Back to selection
              </button>
            </div>
          )}
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="mt-4 text-sm font-semibold text-emerald-950"
        >
          {notice}
        </p>
      )}
      {!!results.filter((item) => item.status !== "complete").length && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-white p-4">
          <h3 className="font-bold">Needs attention</h3>
          <ul className="mt-2 space-y-3 text-sm">
            {results
              .filter((item) => item.status !== "complete")
              .map((item) => (
                <li key={item.deliveryId}>
                  <strong>{item.name}</strong>
                  <p>
                    {item.message ||
                      "Open this letter's saved appeal details below."}
                  </p>
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
