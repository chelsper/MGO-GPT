import {
  ArrowRight,
  Building2,
  Cable,
  Database,
  LayoutDashboard,
  RefreshCw,
  Settings2,
  Users,
} from "lucide-react";

const steps = [
  {
    id: "organization",
    title: "Organization & Terminology",
    icon: Building2,
    description:
      "Set your organization name, app branding, and preferred staff labels.",
    href: "/organization-configurations#institution-profile",
    action: "Edit organization settings",
    additional: [
      {
        href: "/organization-configurations#workspace-terminology",
        label: "Workspace terminology",
      },
      {
        href: "/organization-configurations#notification-delivery",
        label: "Notification delivery",
      },
    ],
  },
  {
    id: "connection",
    title: "NXT Connection",
    icon: Cable,
    description:
      "Review the saved connection used for scheduled work and find your own account settings.",
    href: "/settings#blackbaud-connection",
    action: "My account & connection",
    additional: [
      { href: "/access-management", label: "Review connected accounts" },
    ],
  },
  {
    id: "fundraisers",
    title: "Fundraiser Mapping",
    icon: Users,
    description:
      "Link each fundraising workspace to the right person in NXT, without changing their job title.",
    href: "/access-management#workspace-users",
    action: "Review fundraiser mappings",
    additional: [],
  },
  {
    id: "sources",
    title: "Data Sources",
    icon: Database,
    description:
      "Know which queries and reporting rules can be changed in the app, and which need technical help.",
    href: "/report-configurations",
    action: "Configure custom report queries",
    additional: [
      {
        href: "/organization-configurations#reporting-rules",
        label: "View active reporting rules",
      },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    icon: LayoutDashboard,
    description:
      "Create or edit a dashboard, preview its layout, and choose who can see it.",
    href: "/report-configurations",
    action: "Set up reports",
    additional: [{ href: "/reports", label: "Open my reports" }],
  },
];

const statusLabels = {
  ready: "Ready",
  needs_setup: "Needs setup",
  technical: "Requires technical configuration",
  unknown: "Unknown",
};
const tones = {
  ready: "border-emerald-200 bg-emerald-50 text-emerald-900",
  needs_setup: "border-amber-200 bg-amber-50 text-amber-900",
  technical: "border-slate-200 bg-slate-100 text-slate-700",
  unknown: "border-red-200 bg-red-50 text-red-900",
};
const link =
  "inline-flex min-h-11 items-center gap-2 rounded-lg px-1 text-sm font-semibold text-indigo-700 underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600";
const button =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50";

export function isSetupStatus(value) {
  return (
    value?.version === 1 &&
    typeof value.viewerId === "string" &&
    Boolean(value.viewerId) &&
    typeof value.isAdmin === "boolean" &&
    Number.isFinite(Date.parse(value.readAt || "")) &&
    steps.every(({ id }) => {
      const section = value.sections?.[id];
      return (
        section &&
        Object.hasOwn(statusLabels, section.state) &&
        typeof section.summary === "string" &&
        Array.isArray(section.details) &&
        section.details.every((detail) => typeof detail === "string")
      );
    })
  );
}

export default function SetupHub({ data, loading, error, onReload }) {
  return (
    <main className="mx-auto w-full max-w-[1600px] space-y-6 px-4 py-6 text-gray-900 sm:px-8">
      <header className="rounded-2xl border border-gray-200 bg-gradient-to-br from-white via-white to-emerald-50 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <p className="mb-2 flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-emerald-800">
              <Settings2 size={18} aria-hidden="true" />
              Workspace administration
            </p>
            <h1 className="text-3xl font-bold sm:text-4xl">Setup hub</h1>
            <p className="mt-3 leading-relaxed text-gray-600">
              One place to find organization settings, connect your team, and
              prepare reports. Start with an area below; existing settings stay
              in their original editors.
            </p>
          </div>
          <button
            type="button"
            className={button}
            disabled={loading}
            onClick={onReload}
          >
            <RefreshCw size={16} aria-hidden="true" />
            {loading ? "Reading saved setup..." : "Reload saved status"}
          </button>
        </div>
        <a href="/" className={`${link} mt-2`}>
          Return home
        </a>
      </header>
      <p className="rounded-xl border border-gray-200 bg-white p-4 text-sm leading-relaxed text-gray-600">
        <strong className="text-gray-900">
          Ready means saved setup is present, not a live NXT test.
        </strong>{" "}
        Opening or reloading this hub does not contact Blackbaud, renew
        connections, run queries, or save changes.
        {data && (
          <span className="mt-2 block">
            Saved status read{" "}
            <time dateTime={data.readAt}>
              {new Intl.DateTimeFormat("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              }).format(new Date(data.readAt))}
            </time>{" "}
            (your local time).
          </span>
        )}
      </p>
      {loading && <p role="status">Loading saved setup...</p>}
      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900"
        >
          {error}
        </div>
      )}
      {data && (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            {steps.map(
              (
                {
                  id,
                  title,
                  icon: Icon,
                  description,
                  href,
                  action,
                  additional,
                },
                index,
              ) => {
                const section = data.sections[id];
                return (
                  <section
                    key={id}
                    aria-labelledby={`setup-${id}`}
                    className="flex min-w-0 flex-col rounded-2xl border border-gray-200 bg-white p-5 sm:p-6"
                  >
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm font-bold text-gray-500">
                        <Icon size={20} aria-hidden="true" />
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span
                        className={`max-w-full rounded-full border px-3 py-1 text-xs font-bold ${tones[section.state]}`}
                      >
                        {statusLabels[section.state]}
                      </span>
                    </div>
                    <h2 id={`setup-${id}`} className="text-xl font-bold">
                      {title}
                    </h2>
                    <p className="mt-2 text-sm leading-relaxed text-gray-600">
                      {description}
                    </p>
                    <p className="my-4 break-words text-sm font-semibold leading-relaxed text-gray-800">
                      {section.summary}
                    </p>
                    {!!section.details.length && (
                      <details className="mb-3 rounded-lg bg-gray-50 px-3 text-sm text-gray-600">
                        <summary className="min-h-11 cursor-pointer content-center font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600">
                          Details & limitations
                          <span className="sr-only">: {title}</span>
                        </summary>
                        <ul className="list-disc space-y-2 pb-3 pl-5 leading-relaxed">
                          {section.details.map((detail) => (
                            <li className="break-words" key={detail}>
                              {detail}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    <div className="mt-auto border-t border-gray-100 pt-3">
                      <a href={href} className={link}>
                        {action}
                        <ArrowRight size={16} aria-hidden="true" />
                      </a>
                      {!!additional.length && (
                        <div className="flex flex-wrap gap-x-4">
                          {additional.map((item) => (
                            <a
                              key={item.href}
                              href={item.href}
                              className={link}
                            >
                              {item.label}
                            </a>
                          ))}
                        </div>
                      )}
                    </div>
                  </section>
                );
              },
            )}
          </div>
          <details className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
            <summary className="min-h-11 cursor-pointer content-center text-lg font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-600">
              Advanced settings & diagnostics
            </summary>
            <p className="mb-3 mt-2 text-sm leading-relaxed text-gray-600">
              These are existing tools, not extra setup steps. Changing a
              display label does not change permissions, NXT field values,
              attribution, or report calculations.
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <a href="/blackbaud-mapping" className={link}>
                Field Settings
              </a>
              <a
                href="/organization-configurations#giving-societies"
                className={link}
              >
                Giving societies
              </a>
              <a
                href="/organization-configurations#reporting-rules"
                className={link}
              >
                Protected reporting rules
              </a>
              {data.isAdmin && (
                <a href="/integration-health" className={link}>
                  Integration Health (Admin only)
                </a>
              )}
            </div>
            <p className="mt-3 text-sm leading-relaxed text-gray-600">
              Before copying the app, use a separate database and sandbox
              authorization. Do not copy production tokens, constituent
              snapshots, scheduled jobs, or viewer access lists. This hub does
              not certify that a deployment is sandbox-isolated.
            </p>
          </details>
        </>
      )}
    </main>
  );
}
