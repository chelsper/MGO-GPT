import { forwardRef } from "react";

const states = {
  app: { title: "Saved in app", tone: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  verified: { title: "Verified in NXT", tone: "border-emerald-200 bg-emerald-50 text-emerald-900" },
  imported: { title: "Sent to NXT", tone: "border-sky-200 bg-sky-50 text-sky-900" },
  verification: { title: "Needs verification", tone: "border-amber-200 bg-amber-50 text-amber-900" },
  processing: { title: "Submission pending", tone: "border-amber-200 bg-amber-50 text-amber-900" },
  info: { title: "Saved status", tone: "border-gray-200 bg-gray-50 text-gray-800" },
};

// Only the durable receipt's verified state may receive a success treatment.
export function actionNoticeKind(receipt) {
  return receipt?.state === "saved" ? "verified" : receipt?.state === "processing" ? "processing" : "verification";
}

export default forwardRef(function WorkflowNotice({ kind = "info", children, className = "", ...props }, ref) {
  const state = states[kind] || states.info;
  return <div ref={ref} role="status" {...props} className={`min-w-0 break-words rounded-xl border p-4 text-sm ${state.tone} ${className}`}>
    <p className="mb-2 font-bold">{state.title}</p>
    {children}
  </div>;
});
