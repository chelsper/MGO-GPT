import { useEffect, useId, useRef, useState } from "react";

export const savedTemplateUrl = (version) =>
  `/api/stewardship/society-letters?${new URLSearchParams({ templateVersion: version })}`;

// Isolate document styles and prohibit scripts, remote assets, and network access.
const previewShell = `<!doctype html><html><head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; connect-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>body{margin:0;background:#edf1ef}a{pointer-events:none}.docx-wrapper{padding:20px!important;width:max-content;min-width:100%;box-sizing:border-box;background:#edf1ef!important}</style>
</head><body></body></html>`;

export default function SavedLetterPreview({
  template,
  draft,
  sample = false,
  onReady,
  onClose,
  embedded = false,
}) {
  const id = useId();
  const dialogRef = useRef(null);
  const callbacks = useRef({ onClose, onReady });
  const [frame, setFrame] = useState(null);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    callbacks.current = { onClose, onReady };
  }, [onClose, onReady]);
  useEffect(() => {
    if (embedded) return;
    const dialog = dialogRef.current;
    dialog.showModal();
    return () => dialog.close();
  }, [embedded]);
  useEffect(() => {
    if (!frame) return;
    const controller = new AbortController();
    const doc = frame.contentDocument;
    const fitPage = () => {
      if (!embedded) return;
      const pages = [...doc.querySelectorAll("section.docx")];
      const width = Math.max(0, ...pages.map((page) => page.offsetWidth));
      if (width && frame.clientWidth)
        doc.body.style.zoom = String(
          Math.min(1, (frame.clientWidth - 4) / (width + 40)),
        );
    };
    const observer =
      embedded && typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(fitPage)
        : null;
    observer?.observe(frame);
    const closeOnEscape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        callbacks.current.onClose();
      }
    };
    doc.addEventListener("keydown", closeOnEscape);
    async function load() {
      setStatus("loading");
      setError("");
      try {
        const response = await fetch(
          draft || sample
            ? "/api/stewardship/society-letters"
            : savedTemplateUrl(template.version),
          {
            cache: "no-store",
            signal: controller.signal,
            ...(draft || sample
              ? {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(
                    sample
                      ? {
                          action: "preview_template_sample",
                          templateVersion: template.version,
                        }
                      : draft.request,
                  ),
                }
              : {}),
          },
        );
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(
            payload.error || "The letter preview could not be loaded.",
          );
        }
        const content = await response.arrayBuffer();
        const { renderAsync } = await import("docx-preview");
        if (controller.signal.aborted) return;
        const styles = doc.createElement("div");
        const body = doc.createElement("div");
        doc.body.replaceChildren(styles, body);
        if (template.mergeSettings?.fontReplacement === "carlito") {
          const { loadLetterPreviewFont } = await import("./letterPreviewFont");
          await loadLetterPreviewFont(frame, controller.signal);
          if (controller.signal.aborted) return;
        }
        await renderAsync(content, body, styles, {
          useBase64URL: true,
          renderAltChunks: false,
          renderComments: false,
          renderChanges: false,
          ignoreLastRenderedPageBreak: false,
        });
        if (controller.signal.aborted) return;
        fitPage();
        // Saved letters are previews, not an interactive document or web page.
        doc
          .querySelectorAll("a")
          .forEach((link) => link.removeAttribute("href"));
        setStatus("ready");
        callbacks.current.onReady?.(template.version);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(
          err.message ||
            "Preview unavailable. Your recipient edits have not changed.",
        );
        setStatus("error");
      }
    }
    load();
    return () => {
      controller.abort();
      observer?.disconnect();
      doc.removeEventListener("keydown", closeOnEscape);
      doc.body.replaceChildren();
    };
  }, [
    frame,
    template.version,
    template.mergeSettings?.fontReplacement,
    draft,
    sample,
    attempt,
    embedded,
  ]);
  const Container = embedded ? "section" : "dialog";
  return (
    <Container
      ref={dialogRef}
      aria-label={embedded ? "Personalized draft document" : undefined}
      aria-labelledby={embedded ? undefined : `${id}-title`}
      aria-describedby={embedded ? undefined : `${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className={
        embedded
          ? "min-w-0"
          : "m-auto max-h-[95dvh] w-[calc(100%-1rem)] max-w-5xl overflow-auto rounded-2xl border border-gray-200 bg-white p-4 text-gray-900 shadow-xl backdrop:bg-gray-900/40 sm:p-6"
      }
    >
      {!embedded && (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide text-emerald-800">
                {sample
                  ? "Sample only: fictional recipient"
                  : draft
                    ? "Personalized draft"
                    : "Saved template"}
              </p>
              <h2 id={`${id}-title`} className="mt-1 text-xl font-bold">
                {draft ? draft.name : template.societyName}
              </h2>
              <p className="mt-1 break-all text-sm text-gray-600">
                {draft
                  ? `${template.societyName} · ${template.filename}`
                  : template.filename}
              </p>
            </div>
            <button
              type="button"
              autoFocus
              onClick={onClose}
              className="min-h-11 rounded-xl border border-gray-300 px-4 py-2 font-semibold"
            >
              Close preview
            </button>
          </div>
          <p id={`${id}-description`} className="my-4 text-sm text-gray-600">
            {sample
              ? "Uses fictional names and addresses with the saved template and merge settings. Check formatting and field placement. This does not verify real recipient data, save a review, create a batch, or send anything."
              : draft
                ? "Draft only, using your current recipient edits and the saved template. Nothing is saved, sent, or marked complete. Delivery checks are still required."
                : "This is the saved Word file, not unsaved edits or a personalized letter. Merge-field tags remain visible. Nothing is sent or marked complete."}
          </p>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              Browser layout may differ from Word. On small screens, scroll
              across the page.
            </p>
            {!draft && !sample && (
              <a
                href={savedTemplateUrl(template.version)}
                download={template.filename}
                className="inline-flex min-h-11 items-center rounded-xl border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800"
              >
                Download saved Word file
              </a>
            )}
          </div>
        </>
      )}
      {embedded && (
        <p className="mb-3 text-xs text-gray-600">
          {template.filename} · Browser layout may differ from Word. This is a
          draft, not a sent letter.
        </p>
      )}
      {status === "loading" && (
        <p role="status" className="mb-3 text-sm text-gray-600">
          {sample
            ? "Loading sample letter..."
            : draft
              ? "Loading personalized draft..."
              : "Loading saved letter preview..."}
        </p>
      )}
      {status === "error" && (
        <div
          role="alert"
          className="mb-3 rounded-xl bg-amber-50 p-4 text-amber-900"
        >
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="mt-2 min-h-11 rounded-lg border border-amber-400 px-3 py-2 font-semibold"
          >
            Try preview again
          </button>
        </div>
      )}
      <iframe
        title={
          sample
            ? `${template.societyName} sample letter`
            : draft
              ? `${draft.name} personalized draft`
              : `${template.societyName} saved Word letter`
        }
        sandbox="allow-same-origin"
        srcDoc={previewShell}
        onLoad={(event) => setFrame(event.currentTarget)}
        className={
          embedded
            ? "h-[65dvh] min-h-80 w-full rounded-xl border border-gray-200 bg-gray-100"
            : "h-[60dvh] min-h-80 w-full rounded-xl border border-gray-200 bg-gray-100"
        }
        aria-busy={status === "loading"}
      />
    </Container>
  );
}
