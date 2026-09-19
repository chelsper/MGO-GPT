import { ArrowRight, BarChart3, ClipboardList, Download, MessageSquare, Upload, Users } from "lucide-react";
import { getPrimaryNavigationItems } from "@/utils/appNavigation";
import WorkQueueAlertBadge from "./WorkQueueAlertBadge";

const icons = {
  "/my-top-prospects": Users,
  "/follow-ups": MessageSquare,
  "/reports": BarChart3,
  "/submissions": ClipboardList,
  "/constituency-import": Upload,
  "/prospect-exports": Download,
};

export default function WorkspaceStartPaths({ items, queueCounts, openDiscussionItems = 0 }) {
  const primaryItems = getPrimaryNavigationItems(items);
  if (!primaryItems.length) return null;

  return <section aria-labelledby="workspace-start-title">
    <h2 id="workspace-start-title" className="text-xl font-bold text-gray-900">Start here</h2>
    <p className="mb-4 mt-1 text-sm text-gray-600">Your main workspace tools, one click away.</p>
    <nav aria-label="Main workspace paths" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {primaryItems.map((item) => {
        const Icon = icons[item.href] || ClipboardList;
        const discussionCount = item.href === "/follow-ups" && Number.isSafeInteger(openDiscussionItems) && openDiscussionItems > 0 ? openDiscussionItems : 0;
        return <a key={item.href} href={item.href}
          className="group flex min-w-0 flex-col rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-white p-5 text-gray-900 no-underline transition-colors hover:border-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-emerald-700">
          <div className="mb-4 flex items-center justify-between gap-3">
            <span className="rounded-xl bg-white p-3 text-emerald-700"><Icon aria-hidden="true" size={24} /></span>
            <WorkQueueAlertBadge href={item.href} counts={queueCounts} />
            {discussionCount > 0 && <span
              aria-label={`${discussionCount} open team discussion ${discussionCount === 1 ? "item" : "items"}`}
              title={`${discussionCount} open team discussion ${discussionCount === 1 ? "item" : "items"}`}
              className="rounded-full border border-amber-300 bg-amber-100 px-2 py-1 text-xs font-bold text-amber-800">{discussionCount.toLocaleString()}</span>}
          </div>
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-lg font-bold leading-snug">{item.label}</h3>
            <ArrowRight aria-hidden="true" size={20} className="mt-0.5 shrink-0 text-emerald-700" />
          </div>
          <p className="mt-2 text-sm leading-relaxed text-gray-600">{item.description}</p>
        </a>;
      })}
    </nav>
  </section>;
}
