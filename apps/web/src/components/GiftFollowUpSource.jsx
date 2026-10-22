import { formatCalendarDate } from "@/utils/prospectActivity";

export default function GiftFollowUpSource({ snapshot }) {
  if (!snapshot) return null;
  const amount = typeof snapshot.amount === "number" && Number.isFinite(snapshot.amount)
    ? new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(snapshot.amount) : "Saved";
  return <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-sm text-gray-700">
    <p className="font-semibold">{snapshot.constituentName}</p>
    <p>{amount} gift{snapshot.date ? ` on ${formatCalendarDate(snapshot.date)}` : ""}.</p>
    <p className="mt-1 text-xs text-gray-500">Saved gift context, not a live NXT check. This does not confirm whether a thank-you has already been sent.</p>
  </div>;
}
