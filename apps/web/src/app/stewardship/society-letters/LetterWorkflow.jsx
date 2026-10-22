const steps = [
  ["review", "Review recipients"],
  ["approve", "Approve documents"],
  ["create", "Create & update NXT"],
  ["download", "Download letters"],
];

export default function LetterWorkflow({ stage, children }) {
  const current = steps.findIndex(([key]) => key === stage);
  return (
    <section
      aria-label="Letter workflow"
      className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 sm:p-6"
    >
      <ol
        aria-label="Letter stages"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        {steps.map(([key, label], index) => (
          <li
            key={key}
            aria-current={key === stage ? "step" : undefined}
            className={`flex items-center gap-2 rounded-xl p-3 text-sm font-semibold ${key === stage ? "bg-emerald-800 text-white" : index < current ? "text-emerald-800" : "text-gray-500"}`}
          >
            <span
              aria-hidden="true"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-current"
            >
              {index + 1}
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 text-sm text-emerald-950">{children}</div>
    </section>
  );
}
