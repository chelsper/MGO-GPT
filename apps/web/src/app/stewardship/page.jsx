"use client";
import WorkflowReturnLink from "@/components/WorkflowReturnLink";

export default function StewardshipPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-8">
      <WorkflowReturnLink href="/" />
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Advancement Services
        </p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">Stewardship</h1>
        <p className="mt-3 max-w-2xl text-gray-600">
          Recognize each household at the right level, and keep acknowledgment
          history together across giving periods.
        </p>
      </header>
      <a
        href="/stewardship/society-letters"
        className="block max-w-2xl rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-7 text-gray-900 no-underline hover:border-emerald-600 focus-visible:outline-2 focus-visible:outline-emerald-700"
      >
        <p className="text-sm font-semibold text-emerald-700">
          Household acknowledgments
        </p>
        <h2 className="mt-3 text-2xl font-bold">Society Letter Creation</h2>
        <p className="mt-3 text-gray-600">
          Review qualifying households, personalize society letters, and prepare
          email or postal batches. Previously acknowledged households stay out
          of the ready list unless they qualify for a higher letter or a new
          period.
        </p>
        <p className="mt-5 font-semibold text-emerald-800">
          Open society letters &rarr;
        </p>
      </a>
    </main>
  );
}
