import { useEffect, useRef, useState } from "react";
import SavedLetterPreview from "./SavedLetterPreview";

const button =
  "min-h-11 rounded-xl border border-emerald-700 bg-white px-4 py-2 text-sm font-semibold text-emerald-900 disabled:cursor-not-allowed disabled:opacity-50";

function PdfPreview({ request, onReady }) {
  const container = useRef(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    let task;
    async function load() {
      try {
        const response = await fetch("/api/stewardship/society-letters", {
          method: "POST",
          cache: "no-store",
          signal: controller.signal,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });
        if (!response.ok)
          throw new Error(
            (await response.json()).error || "Could not open this PDF.",
          );
        const bytes = await response.arrayBuffer();
        const pdfjs = await import("pdfjs-dist/build/pdf");
        const worker = await import("pdfjs-dist/build/pdf.worker.min.js?url");
        if (controller.signal.aborted) return;
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        task = pdfjs.getDocument({
          data: new Uint8Array(bytes),
          isEvalSupported: false,
        });
        const pdf = await task.promise;
        if (pdf.numPages > 20)
          throw new Error(
            "This PDF has too many pages for letter approval. Review the template.",
          );
        container.current.replaceChildren();
        for (let index = 1; index <= pdf.numPages; index++) {
          if (controller.signal.aborted) return;
          const page = await pdf.getPage(index);
          const viewport = page.getViewport({ scale: 1.5 });
          if (viewport.width * viewport.height > 16000000)
            throw new Error("This PDF page is too large to preview safely.");
          const canvas = document.createElement("canvas");
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.cssText =
            "display:block;width:100%;height:auto;margin:0 0 12px;background:white";
          canvas.setAttribute(
            "aria-label",
            `Letter page ${index} of ${pdf.numPages}`,
          );
          container.current.append(canvas);
          await page.render({
            canvasContext: canvas.getContext("2d"),
            viewport,
          }).promise;
        }
        if (!controller.signal.aborted) {
          setLoading(false);
          onReady();
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setError(error.message || "PDF preview unavailable.");
          setLoading(false);
        }
      }
    }
    load();
    return () => {
      controller.abort();
      task?.destroy();
    };
  }, [request]);
  return (
    <section aria-label="Saved PDF preview">
      {loading && <p role="status">Loading saved PDF pages...</p>}
      {error && <p role="alert">{error}</p>}
      <div
        ref={container}
        className="max-h-[65vh] overflow-auto rounded-xl border bg-gray-100 p-2"
      />
    </section>
  );
}

function DocumentReview({ draft, entry, revision, busy, act, onClose }) {
  const panel = useRef(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    panel.current?.focus();
    panel.current?.scrollIntoView?.({ block: "start" });
  }, []);
  const [request] = useState(() => ({
    action: "preview_postal_document",
    revision,
    draftId: draft.id,
    householdId: entry.householdId,
  }));
  const [wordDraft] = useState(() => ({ name: entry.row.name, request }));
  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-label={`Approve document for ${entry.row.name}`}
      className="mt-4 rounded-xl border border-emerald-200 bg-white p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold">{entry.row.name}</h3>
        <button className={button} disabled={busy} onClick={onClose}>
          Close document
        </button>
      </div>
      <p className="mb-3 text-sm">
        Check the complete letter, including names, address, spacing, and all
        pages. Approval here does not apply appeals or mark it mailed.
      </p>
      {draft.format === "pdf" ? (
        <PdfPreview request={request} onReady={() => setReady(true)} />
      ) : (
        <SavedLetterPreview
          embedded
          draft={wordDraft}
          template={{
            version: entry.row.templateVersion,
            filename: entry.row.templateFilename,
          }}
          onReady={() => setReady(true)}
          onClose={onClose}
        />
      )}
      <button
        className={`${button} mt-4`}
        disabled={busy || !ready}
        onClick={async () => {
          const result = await act({
            action: "review_postal_document",
            draftId: draft.id,
            householdId: entry.householdId,
            documentHash: entry.document.sha256,
            confirm: true,
          });
          if (result) onClose();
        }}
      >
        Approve this document
      </button>
    </section>
  );
}

export default function PostalBatchApproval({
  draft,
  revision,
  busy,
  act,
  onApproved,
}) {
  const panel = useRef(null);
  const reviewButton = useRef(null);
  useEffect(() => {
    panel.current?.focus();
    panel.current?.scrollIntoView?.({ block: "start" });
  }, []);
  const [running, setRunning] = useState(false);
  const run = useRef(false);
  const [opened, setOpened] = useState(null);
  const [confirmed, setConfirmed] = useState(false);
  const [discard, setDiscard] = useState(false);
  useEffect(
    () => () => {
      run.current = false;
    },
    [],
  );
  const prepared = draft.entries.filter((e) => e.document).length;
  const approved = draft.entries.filter(
    (e) => e.document && e.reviewedHash === e.document.sha256,
  ).length;
  async function prepare() {
    if (run.current) return;
    run.current = true;
    setRunning(true);
    let current = draft;
    for (let count = 0; run.current && count < draft.entries.length; count++) {
      const next = current.entries.find((e) => !e.document);
      if (!next) break;
      const result = await act({
        action: "prepare_postal_document",
        draftId: current.id,
        householdId: next.householdId,
      });
      if (
        !result?.postalDraft?.entries.find(
          (e) => e.householdId === next.householdId,
        )?.document
      )
        break;
      current = result.postalDraft;
    }
    run.current = false;
    setRunning(false);
  }
  const entry = draft.entries.find((e) => e.householdId === opened);
  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-label="Approve saved letter batch"
      id="letter-saved-approval"
      className="my-5 rounded-2xl border-2 border-emerald-700 bg-emerald-50/40 p-5"
    >
      <h2 className="text-xl font-bold">
        Approve your {draft.format === "pdf" ? "PDF" : "Word"} letters
      </h2>
      <p className="mt-2 text-sm">
        Your saved recipient review is kept. Preview any letter if you want to;
        you do not need to open each letter again. One approval below covers the
        prepared documents and their NXT appeal updates.
      </p>
      <p className="mt-2 text-sm">
        {prepared} of {draft.entries.length} documents prepared; {approved}{" "}
        approved. This draft is saved so you can leave and return. No NXT
        appeals have been applied by this draft.
      </p>
      <p className="mt-2 text-sm">
        The highest qualifying appeal goes to each full constituent listed
        below. Spouse-only records remain in the joint letter and household
        history, without a separate appeal assignment. Lower-tier letters are
        covered in the app. Nothing is emailed, uploaded to NXT as an
        attachment, or marked mailed.
      </p>
      {prepared < draft.entries.length && (
        <button
          className={`${button} mt-4`}
          disabled={busy || running || !!opened}
          onClick={prepare}
        >
          Prepare {prepared ? "remaining " : ""}documents
        </button>
      )}
      {running && (
        <button
          className={`${button} ml-2 mt-4`}
          onClick={() => {
            run.current = false;
          }}
        >
          Pause after this document
        </button>
      )}
      <ul className="mt-4 space-y-3">
        {draft.entries.map((e) => (
          <li key={e.householdId} className="rounded-xl border bg-white p-4">
            <p className="font-semibold">
              {e.row.name} / {e.row.societyName}
            </p>
            <p className="text-sm">
              Appeal: {e.appeal.lookupId || e.appeal.id} /{" "}
              {e.appeal.description}
            </p>
            <p className="text-sm">
              Member record IDs: {e.row.members.join(", ")}. Letter date:{" "}
              {e.row.letterDate}.
            </p>
            <p className="mt-1 text-sm">
              {e.reviewedHash
                ? "Document approved"
                : e.document
                  ? "Ready for batch approval"
                  : "Document not prepared yet"}
            </p>
            <button
              className={`${button} mt-2`}
              disabled={busy || running || !e.document}
              onClick={(event) => {
                reviewButton.current = event.currentTarget;
                setOpened(e.householdId);
              }}
            >
              {e.reviewedHash
                ? "View approved document"
                : "Preview document (optional)"}
            </button>
          </li>
        ))}
      </ul>
      {entry?.document && (
        <DocumentReview
          key={`${draft.id}-${entry.householdId}-${entry.document.sha256}`}
          draft={draft}
          entry={entry}
          revision={revision}
          busy={busy}
          act={act}
          onClose={() => {
            setOpened(null);
            reviewButton.current?.focus();
          }}
        />
      )}
      <label className="mt-5 flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          checked={confirmed}
          disabled={busy || running || prepared !== draft.entries.length}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        I approve these documents and authorize the listed society appeal,
        letter date, and creation note for each full constituent. Spouse-only
        records remain included in the household. Current NXT restrictions and
        prior appeals will be checked automatically before updates.
      </label>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className={`${button} !bg-emerald-700 !text-white`}
          disabled={
            busy || running || !confirmed || prepared !== draft.entries.length
          }
          onClick={async () => {
            const result = await act({
              action: "approve_postal_draft",
              draftId: draft.id,
              confirm: true,
              approvePreparedDocuments: true,
            });
            setConfirmed(false);
            if (result) onApproved(result.batchId);
          }}
        >
          Approve letters and continue
        </button>
        <button
          className={button}
          disabled={busy || running}
          onClick={() => setDiscard(!discard)}
        >
          Discard draft
        </button>
      </div>
      {discard && (
        <div className="mt-3 text-sm">
          <p>
            Discard only this uncreated approval draft? Saved recipient choices
            and existing letters are kept. No NXT history is changed.
          </p>
          <button
            className={`${button} mt-2`}
            disabled={busy || running}
            onClick={() =>
              act({
                action: "discard_postal_draft",
                draftId: draft.id,
                confirm: true,
              })
            }
          >
            Confirm discard draft
          </button>
        </div>
      )}
    </section>
  );
}

export function PostalBatchRunner({
  batch,
  busy,
  act,
  autoStart = false,
  onAutoStartConsumed,
}) {
  const run = useRef(false);
  const startedFromApproval = useRef(false);
  const [running, setRunning] = useState(false);
  const [stopped, setStopped] = useState(false);
  useEffect(
    () => () => {
      run.current = false;
    },
    [],
  );
  const completed = batch.items.filter(
    (i) => i.letterAppeals?.status === "complete",
  ).length;
  const uncertain = batch.items.some((i) =>
    i.letterAppeals?.members.some((m) => m.status === "uncertain"),
  );
  const paused = batch.items.some(
    (i) => i.letterAppeals?.status === "needs_review",
  );
  useEffect(() => {
    // Only an approval click in this page session starts processing. Reloading
    // saved history never writes to NXT, and a consumed approval never retries.
    if (autoStart && !busy && !startedFromApproval.current) {
      startedFromApproval.current = true;
      onAutoStartConsumed?.();
      if (!uncertain && !paused && completed < batch.items.length) start();
    }
  }, [autoStart, busy]);
  async function start() {
    if (run.current) return;
    run.current = true;
    setRunning(true);
    setStopped(false);
    for (let count = 0; run.current && count < batch.items.length; count++) {
      const result = await act({
        action: "continue_postal_batch",
        batchId: batch.id,
        confirm: true,
      });
      if (!result) {
        setStopped(true);
        break;
      }
      const items = result.history.filter((i) => i.batchId === batch.id);
      if (
        !items.length ||
        items.every((i) => i.letterAppeals?.status === "complete") ||
        items.some((i) => i.letterAppeals?.status === "needs_review")
      ) {
        setStopped(
          items.some((i) => i.letterAppeals?.status === "needs_review"),
        );
        break;
      }
    }
    run.current = false;
    setRunning(false);
  }
  return (
    <section
      aria-label="Approved batch progress"
      className="my-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
    >
      <p role="status" className="font-semibold">
        {completed} of {batch.items.length} letters created with appeals
        confirmed
      </p>
      <p className="mt-1 text-sm">
        Saved documents are fixed. Each household is checked and updated
        separately. Leaving pauses after the current request; resume this same
        batch here, not a new copy.
      </p>
      {completed < batch.items.length && (
        <>
          {stopped && (
            <p role="status" className="mt-2 text-sm">
              Processing stopped. Reload saved status before continuing; your
              approved letters are kept.
            </p>
          )}
          {(uncertain || paused) && (
            <p className="mt-2 text-sm text-amber-900">
              This batch needs attention. Review the member receipts below; use
              Verify NXT status for an uncertain result. No duplicate will be
              sent.
            </p>
          )}
          <p className="mt-3 text-sm">
            Your approval is saved. Continue this same batch without reviewing
            the letters again.
          </p>
          <button
            className={`${button} mt-3`}
            disabled={busy || running || uncertain || stopped}
            onClick={start}
          >
            {running
              ? "Creating one household at a time..."
              : "Create approved letters and apply appeals"}
          </button>
          {running && (
            <button
              className={`${button} ml-2 mt-3`}
              onClick={() => {
                run.current = false;
              }}
            >
              Pause after this household
            </button>
          )}
        </>
      )}
    </section>
  );
}
