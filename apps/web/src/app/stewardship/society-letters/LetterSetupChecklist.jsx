import { useState } from "react";
import SavedLetterPreview from "./SavedLetterPreview";

const button =
  "inline-flex min-h-11 items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:border-emerald-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-50";

export function letterSetupProgress(data, viewed = []) {
  const keys = data.settings?.societyKeys || [];
  const templates = keys.map((key) =>
    data.templates.find((item) => item.societyKey === key),
  );
  const source = data.setup?.sourceConfigured === true;
  const mappings = source && data.setup?.membershipCurrent === true;
  const letters =
    keys.length > 0 && templates.every((template) => template?.version);
  const sampleKey = (template) =>
    `${data.setup?.key || ""}/${template?.societyKey || ""}/${template?.version || ""}`;
  const samples =
    letters &&
    templates.every((template) => viewed.includes(sampleKey(template)));
  const steps = [
    {
      key: "source",
      title: "Source & period",
      done: source,
      action: "Choose source & period",
      description: source
        ? "Query, annual societies, and qualification dates are saved for this period."
        : "Choose your annual societies, their queries, and the qualification period.",
    },
    {
      key: "fields",
      title: "Query-field mappings",
      done: mappings,
      action: "Review field mappings",
      description: mappings
        ? "Saved mappings have a completed membership result for these settings."
        : "Map IDs, names, addresses, and optional contacts, then load membership to check the output.",
    },
    {
      key: "templates",
      title: "Saved letters",
      done: letters,
      action: "Set up saved letters",
      description: letters
        ? "Each selected society has a saved Word letter. You can replace it or edit its merge settings anytime."
        : "Save a reusable Word letter and its merge settings for each selected society.",
    },
    {
      key: "samples",
      title: "Sample preview",
      done: samples,
      action: "Preview sample letters",
      description: samples
        ? "Samples opened successfully for every selected letter during this visit."
        : "Check each saved letter with fictional names and addresses. Nothing is sent or added to letter history.",
    },
  ];
  return {
    steps,
    next: steps.find((step) => !step.done),
    completed: steps.filter((step) => step.done).length,
    templates,
    sampleKey,
  };
}

export default function LetterSetupChecklist({
  data,
  viewed,
  onViewed,
  onNavigate,
  busy,
  compact = false,
}) {
  const [sample, setSample] = useState(null);
  const progress = letterSetupProgress(data, viewed);
  const next = progress.next;
  const savedSteps = progress.steps
    .slice(0, 3)
    .filter((step) => step.done).length;
  if (compact)
    return (
      <section
        aria-label="Letter setup status"
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50/50 px-4 py-3"
      >
        <div>
          <p className="text-sm font-semibold text-emerald-950">
            {savedSteps === 3
              ? "Letter setup saved"
              : `Letter setup: ${savedSteps} of 3 saved steps complete`}
          </p>
          <p className="mt-1 text-sm text-gray-600">
            {savedSteps === 3
              ? "Query settings and letters are saved. Preview samples or make changes in Setup."
              : `Next: ${next.title.toLowerCase()}.`}
          </p>
        </div>
        <button
          className={button}
          onClick={() => onNavigate("setup")}
          disabled={busy}
        >
          Open setup checklist
        </button>
      </section>
    );
  return (
    <section
      aria-labelledby="letter-setup-title"
      className="space-y-5 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50/70 via-white to-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-800">
            Set up once, reuse your letters
          </p>
          <h2 id="letter-setup-title" className="mt-2 text-2xl font-bold">
            Your letter setup checklist
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Progress uses saved settings, not unsaved edits. Setup never
            approves recipients or enables delivery.
          </p>
        </div>
        <p className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-sm font-semibold text-emerald-900">
          {progress.completed} of 4 steps complete
        </p>
      </div>
      <ol className="grid gap-3 sm:grid-cols-2">
        {progress.steps.map((step, index) => (
          <li
            key={step.key}
            aria-current={step.key === next?.key ? "step" : undefined}
            className={`min-w-0 rounded-xl border p-4 ${step.key === next?.key ? "border-emerald-600 bg-white" : "border-gray-200 bg-white/70"}`}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="font-bold">
                {index + 1}. {step.title}
              </h3>
              <span
                className={`shrink-0 text-xs font-semibold ${step.done ? "text-emerald-800" : "text-gray-500"}`}
              >
                {step.done
                  ? step.key === "samples"
                    ? "Viewed this visit"
                    : "Saved"
                  : step.key === next?.key
                    ? "Next"
                    : "To do"}
              </span>
            </div>
            <p className="mt-2 text-sm text-gray-600">{step.description}</p>
            {step.key !== "samples" && (
              <button
                className="mt-2 min-h-11 text-sm font-semibold text-emerald-800 underline underline-offset-4 disabled:opacity-50"
                disabled={busy}
                onClick={() => onNavigate(step.key)}
              >
                {step.key === "source"
                  ? "Edit source & period"
                  : step.key === "fields"
                    ? "Edit query-field mappings"
                    : "Edit letters & merge fields"}
              </button>
            )}
          </li>
        ))}
      </ol>
      {next && next.key !== "samples" && (
        <div className="flex flex-wrap items-center gap-3 border-t border-emerald-100 pt-4">
          <span className="text-sm font-semibold">Next action</span>
          <button
            className={`${button} !border-emerald-700 !bg-emerald-700 !text-white`}
            disabled={busy}
            onClick={() => onNavigate(next.key)}
          >
            {next.action}
          </button>
        </div>
      )}
      <section
        aria-label="Sample letters"
        className="border-t border-emerald-100 pt-4"
      >
        <h3 className="font-bold">Preview a sample letter</h3>
        <p className="mt-1 text-sm text-gray-600">
          Use fictional data to check merge fields and layout. Saved mappings
          and templates remain available across visits; sample-view indicators
          reset when you leave or change setup. Check actual recipients in the
          holding list before delivery.
        </p>
        {!progress.templates.length && (
          <p className="mt-3 text-sm text-gray-600">
            Select your societies in Source & period to begin.
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-3">
          {progress.templates.map((template, index) => {
            const key = data.settings.societyKeys[index];
            const name =
              template?.societyName ||
              data.definitions.find((item) => item.key === key)?.name ||
              key;
            return (
              <div className="min-w-0" key={key}>
                <button
                  className={button}
                  disabled={
                    busy || !template?.version || !data.setup?.sourceConfigured
                  }
                  onClick={() =>
                    setSample({ template, key: progress.sampleKey(template) })
                  }
                >
                  Preview {name} sample
                </button>
                <p className="mt-1 text-xs text-gray-600">
                  {!template?.version
                    ? "Save this society's letter first."
                    : !data.setup?.sourceConfigured
                      ? "Save the source and current period first."
                      : viewed.includes(progress.sampleKey(template))
                        ? "Sample viewed this visit"
                        : "Uses the saved Word letter"}
                </p>
              </div>
            );
          })}
        </div>
      </section>
      {!next && (
        <p role="status" className="text-sm font-semibold text-emerald-900">
          Setup checked. Continue with recipient review; no letters have been
          created or sent.
        </p>
      )}
      <button
        className={button}
        onClick={() => onNavigate("ready")}
        disabled={busy}
      >
        Return to holding list
      </button>
      {sample && (
        <SavedLetterPreview
          template={sample.template}
          sample
          onReady={() => onViewed(sample.key)}
          onClose={() => setSample(null)}
        />
      )}
    </section>
  );
}
