"use client";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ClipboardList,
  FileCheck2,
  Mail,
  MessageSquare,
} from "lucide-react";
import WorkflowReturnLink from "@/components/WorkflowReturnLink";
import useUser from "@/utils/useUser";

const letters = "/stewardship/society-letters";
const button =
  "min-h-11 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:border-emerald-600 disabled:opacity-50";

export function StewardshipOverview({ viewerKey }) {
  const [result, setResult] = useState({ loading: true });
  const [reload, setReload] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setResult({ loading: true });
    async function load() {
      try {
        const response = await fetch("/api/stewardship/overview", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok)
          throw Object.assign(new Error(), { status: response.status });
        const data = await response.json();
        if (data.viewerKey !== viewerKey)
          throw Object.assign(new Error(), { status: 409 });
        if (
          !data.requests ||
          ![
            data.inProgress,
            data.readyToMail,
            data.requests.open,
            data.requests.inProgress,
            data.requests.overdue,
          ].every((n) => Number.isSafeInteger(n) && n >= 0) ||
          (data.holding !== null &&
            (!Number.isSafeInteger(data.holding) || data.holding < 0))
        )
          throw new Error();
        if (!controller.signal.aborted) setResult({ data });
      } catch (error) {
        if (!controller.signal.aborted)
          setResult({
            error: [401, 403, 409].includes(error.status)
              ? "Your access changed. Sign in with an authorized account to view saved counts."
              : "Saved counts are unavailable. You can still open your work below.",
          });
      }
    }
    load();
    return () => controller.abort();
  }, [viewerKey, reload]);
  const data = result.data;
  const cards = [
    {
      title: "Letters to review",
      icon: ClipboardList,
      count: data?.holding,
      unit: "households in the holding list",
      description:
        data?.holding === null
          ? "Open society letters to set up or refresh this period's membership."
          : "Review names, addresses, and checks before approval.",
      href: letters,
      action: "Review letters",
    },
    {
      title: "Batches in progress",
      icon: FileCheck2,
      count: data?.inProgress,
      unit: "drafts or unfinished batches",
      description: "Continue saved approvals or check an interrupted batch.",
      href: data?.hasDraft
        ? letters
        : `${letters}?view=history&history=in_progress`,
      action: data?.hasDraft ? "Resume draft" : "View batches",
    },
    {
      title: "Ready to mail",
      icon: Mail,
      count: data?.readyToMail,
      unit: "letters prepared, not mailed",
      description:
        "Download finished letters. Record mailing only after dispatch.",
      href: `${letters}?view=history&history=ready_to_mail`,
      action: "View ready letters",
    },
    {
      title: "Assistance Requests",
      icon: MessageSquare,
      count: data ? data.requests.open + data.requests.inProgress : undefined,
      unit: "open requests",
      description: data
        ? `${data.requests.open} new, ${data.requests.inProgress} in progress${data.requests.overdue ? `; ${data.requests.overdue} overdue` : ""}. Updates stay linked to the fundraiser's follow-up.`
        : "Help fundraisers with letters, personal gifts, and recognition.",
      href: "/stewardship/requests",
      action: "Open requests",
    },
  ];
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-gray-900">
            Pick up where you left off
          </h2>
          <p className="mt-1 text-sm text-gray-600">
            Saved progress only. Opening this page does not check NXT or start a
            batch.
          </p>
        </div>
        <button
          className={button}
          disabled={result.loading}
          onClick={() => {
            setResult({ loading: true });
            setReload((value) => value + 1);
          }}
        >
          Reload counts
        </button>
      </div>
      {result.loading && (
        <p role="status" className="text-sm text-gray-500">
          Loading saved counts...
        </p>
      )}
      {result.error && (
        <p role="alert" className="text-sm text-gray-600">
          {result.error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map(
          ({ title, icon: Icon, count, unit, description, href, action }) => (
            <a
              key={title}
              href={href}
              className="group flex min-w-0 flex-col rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-white p-5 text-gray-900 no-underline transition-colors hover:border-emerald-600 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 sm:p-6"
            >
              <div className="flex items-center gap-3">
                <Icon
                  size={20}
                  aria-hidden="true"
                  className="shrink-0 text-emerald-700"
                />
                <h3 className="font-bold">{title}</h3>
              </div>
              <div className="mt-4 flex items-baseline gap-3">
                <span className="text-3xl font-bold tabular-nums text-emerald-900">
                  {count ?? (result.loading ? "..." : "Not available")}
                </span>
                {count != null && (
                  <span className="text-sm text-gray-600">{unit}</span>
                )}
              </div>
              <p className="mt-3 text-sm leading-relaxed text-gray-600">
                {description}
              </p>
              <span className="mt-auto flex items-center justify-between gap-2 pt-5 text-sm font-semibold text-emerald-800">
                {action}
                <ArrowRight size={18} aria-hidden="true" />
              </span>
            </a>
          ),
        )}
      </div>
    </>
  );
}

export default function StewardshipPage() {
  const { data: user, loading } = useUser();
  const viewerKey = user ? String(user.id || user.email) : null;
  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-8">
      <WorkflowReturnLink href="/" />
      <header>
        <p className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
          Advancement Services
        </p>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">Stewardship</h1>
        <p className="mt-3 max-w-2xl text-gray-600">
          Review letters, continue batches, and help fundraisers from one place.
        </p>
      </header>
      {loading ? (
        <p role="status">Loading workspace...</p>
      ) : viewerKey ? (
        <StewardshipOverview key={viewerKey} viewerKey={viewerKey} />
      ) : (
        <a href="/account/signin" className="text-emerald-800 underline">
          Sign in to view stewardship
        </a>
      )}
      <nav
        aria-label="Stewardship tools"
        className="flex flex-wrap gap-x-6 gap-y-3 border-t border-gray-200 pt-5 text-sm font-semibold text-emerald-800"
      >
        <a href={letters} className="py-2 hover:underline">
          Society Letter Creation
        </a>
        <a href={`${letters}?view=setup`} className="py-2 hover:underline">
          Letter setup
        </a>
        <a href="/stewardship/gift-follow-ups" className="py-2 hover:underline">
          Gift Follow-ups
        </a>
        <a href="/stewardship/inventory" className="py-2 hover:underline">
          Gift Inventory
        </a>
      </nav>
    </main>
  );
}
