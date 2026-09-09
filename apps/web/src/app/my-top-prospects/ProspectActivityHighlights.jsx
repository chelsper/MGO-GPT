import { useQuery } from "@tanstack/react-query";
import { calendarDate, formatCalendarDate, latestDatedAction } from "@/utils/prospectActivity";

export default function ProspectActivityHighlights({ prospectId, linked, updates = [] }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["prospect-recent-activity", prospectId],
    queryFn: async () => {
      const response = await fetch(`/api/prospects/${encodeURIComponent(prospectId)}/recent-activity`);
      if (!response.ok) throw new Error("Recent NXT activity unavailable");
      return response.json();
    },
    enabled: Boolean(linked), staleTime: 60 * 60 * 1000, retry: false,
  });
  const localAction = latestDatedAction(updates.filter((item) => item.action_category || item.action_type).map((item) => ({
    id: item.blackbaud_action_id || `local-${item.id}`, date: item.update_date,
    summary: item.update_title || "Logged action", category: item.action_category, type: item.action_type,
  })));
  const nxtAction = data?.action?.data;
  const useLocal = localAction && (!nxtAction || calendarDate(localAction.date) > calendarDate(nxtAction.date));
  const action = useLocal ? localAction : nxtAction;
  const gift = data?.gift?.data;
  function note(section, hasLocal = false) {
    if (!linked) return "No NXT record linked.";
    if (isLoading) return "Loading latest NXT activity...";
    if (isError || section?.unavailable) return "NXT activity unavailable; this is not confirmation of no activity.";
    if (section?.stale) return `NXT refresh unavailable. Showing the last successful snapshot${section.fetchedAt ? ` from ${formatCalendarDate(section.fetchedAt)}` : ""}.`;
    return hasLocal ? "Newer action logged in JUMGOGPT." : section?.fetchedAt ? `NXT checked ${new Date(section.fetchedAt).toLocaleString("en-US")}.` : "";
  }
  return <div className="mb-4 grid min-w-0 gap-3 md:grid-cols-2">
    <section aria-label="Latest action" className="min-w-0 rounded-xl border border-violet-200 bg-violet-50 p-4">
      <h4 className="text-xs font-bold uppercase tracking-wide text-violet-800">Latest action</h4>
      {action ? <><p className="mt-2 break-words font-semibold text-gray-900">{action.summary}</p><p className="mt-1 text-sm text-gray-700">{[formatCalendarDate(action.date), action.category, action.type, action.status].filter(Boolean).join(" · ")}</p></> : <p className="mt-2 text-sm">{linked && !isLoading && !isError && !data?.action?.stale ? "No dated actions through today." : "No action available to display."}</p>}
      <p role="status" className="mt-2 text-xs text-gray-600">{note(data?.action, useLocal)}</p>
    </section>
    <section aria-label="Latest gift" className="min-w-0 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <h4 className="text-xs font-bold uppercase tracking-wide text-emerald-800">Latest gift</h4>
      {gift ? <><p className="mt-2 font-semibold text-gray-900">{gift.amount.toLocaleString("en-US", { style: "currency", currency: "USD" })}</p><p className="mt-1 text-sm text-gray-700">{[formatCalendarDate(gift.date), gift.type].filter(Boolean).join(" · ")}</p>{gift.funds?.length ? <p className="mt-1 break-words text-sm text-gray-700">{gift.funds.join(", ")}</p> : null}</> : <p className="mt-2 text-sm">{linked && !isLoading && !isError && !data?.gift?.stale ? "No latest gift returned by NXT." : "No gift available to display."}</p>}
      <p role="status" className="mt-2 text-xs text-gray-600">{note(data?.gift)}</p>
    </section>
  </div>;
}
