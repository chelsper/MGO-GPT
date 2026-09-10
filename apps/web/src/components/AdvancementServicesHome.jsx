import { ArrowRight, BookOpen, CalendarDays, ChevronDown, ClipboardList, Download, FileText, MessageSquare, Search, Settings, ShieldCheck, SlidersHorizontal, Upload, Users } from "lucide-react";
import { getNavigationItems, groupNavigationItems } from "@/utils/appNavigation";
import WorkQueueAlertBadge from "./WorkQueueAlertBadge";

const icons = {
  "/submissions": ClipboardList,
  "/prospect-pool": Users,
  "/team-discussion": MessageSquare,
  "/pledge-payments": CalendarDays,
  "/prospect-exports": Download,
  "/report-configurations": SlidersHorizontal,
  "/list-requests": FileText,
  "/data-requests": ClipboardList,
  "/constituency-import": Upload,
  "/family-import": Users,
  "/constituent-lookup": Search,
  "/knowledge-base": BookOpen,
  "/knowledge-base/manage": BookOpen,
  "/blackbaud-mapping": SlidersHorizontal,
  "/access-management": ShieldCheck,
  "/organization-configurations": Settings,
};

const sectionDescriptions = {
  "Daily Work": "Review outstanding work, assign prospects, and coordinate with the team.",
  "Reports & Exports": "Open the saved pledge worklist, export top prospects, or configure reports.",
  "Requests & Imports": "Go directly to a specific queue or start an import. These reviews also appear in Work Queue.",
  "Tools & Guidance": "Look up a record or find the guidance you need.",
};

function ActionCards({ items, queueCounts, openDiscussionItems, featured }) {
  return <div className={`grid grid-cols-1 gap-3 sm:grid-cols-2 ${items.length === 4 ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
    {items.map((item) => {
      const Icon = icons[item.href] || FileText;
      const discussionCount = item.href === "/team-discussion" && Number.isSafeInteger(openDiscussionItems) && openDiscussionItems > 0 ? openDiscussionItems : 0;
      return <a key={item.href} href={item.href}
        className={`group flex min-w-0 flex-col rounded-2xl border p-5 text-gray-900 no-underline transition-colors hover:border-emerald-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700 ${featured ? "border-emerald-200 bg-gradient-to-br from-emerald-50 to-white" : "border-gray-200 bg-white hover:bg-gray-50"}`}>
        <div className="mb-4 flex min-h-7 items-center justify-between gap-3">
          <Icon aria-hidden="true" size={22} className={featured ? "text-emerald-700" : "text-gray-500"} />
          <WorkQueueAlertBadge href={item.href} counts={queueCounts} compact />
          {discussionCount > 0 && <span
            aria-label={`${discussionCount} open team discussion ${discussionCount === 1 ? "item" : "items"}`}
            title={`${discussionCount} open team discussion ${discussionCount === 1 ? "item" : "items"}`}
            className="rounded-full border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">{discussionCount.toLocaleString()}</span>}
        </div>
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-bold leading-snug">{item.label}</h3>
          <ArrowRight aria-hidden="true" size={18} className="shrink-0 text-gray-400 group-hover:text-emerald-700" />
        </div>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.description}</p>
      </a>;
    })}
  </div>;
}

export default function AdvancementServicesHome({ canManageWorkspace, queueCounts, openDiscussionItems = 0, worklistFailed = false }) {
  // The home page and persistent menu share destinations, grouping, and permissions.
  const groups = groupNavigationItems(getNavigationItems({ isReviewer: true, canManageWorkspace }));
  return <div className="space-y-7">
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
      {worklistFailed && <p role="status" className="mb-2 font-medium text-amber-800">Queue alerts could not refresh. Any displayed counts are from the last successful check; open a queue to verify its current work.</p>}
      <details>
        <summary className="min-h-11 cursor-pointer content-center font-medium text-gray-700 focus-visible:outline-2 focus-visible:outline-emerald-700">About queue counts</summary>
        <p className="mt-2 max-w-4xl leading-relaxed">Badges show outstanding work, not unread messages. Import alerts count batches, not rows. Work Queue includes the requests and imports below; do not add the badges together. Completed work and successful direct-to-NXT updates do not trigger alerts. Counts refresh every minute while this page is open.</p>
      </details>
    </div>
    {groups.map(({ section, items }) => {
      if (section === "Admin & Workspace") return <details key={section} className="group rounded-2xl border border-gray-200 bg-gray-50 p-5">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-md focus-visible:outline-2 focus-visible:outline-emerald-700 [&::-webkit-details-marker]:hidden">
          <span><span className="block text-lg font-bold text-gray-900">Admin & Workspace</span><span className="mt-1 block text-sm text-gray-600">Occasional setup: access, field mapping, and organization settings.</span></span>
          <ChevronDown aria-hidden="true" size={20} className="shrink-0 text-gray-500 group-open:rotate-180" />
        </summary>
        <div className="mt-4"><ActionCards items={items} /></div>
      </details>;
      const headingId = `workspace-${section.toLowerCase().replace(/[^a-z]+/g, "-")}`;
      return <section key={section} aria-labelledby={headingId}>
        <h2 id={headingId} className="text-xl font-bold text-gray-900">{section}</h2>
        <p className="mb-3 mt-1 text-sm text-gray-600">{sectionDescriptions[section]}</p>
        <ActionCards items={items} queueCounts={queueCounts} openDiscussionItems={openDiscussionItems} featured={section === "Reports & Exports"} />
      </section>;
    })}
  </div>;
}
