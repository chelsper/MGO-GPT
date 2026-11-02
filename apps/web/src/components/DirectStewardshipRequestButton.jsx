import { useEffect, useRef, useState } from "react";
import StewardshipAssistanceDialog from "./StewardshipAssistanceDialog";

export default function DirectStewardshipRequestButton({ constituentId, opportunityId, viewerId, workspaceId }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef(null);
  const restoreFocus = useRef(false);
  useEffect(() => {
    if (!open && restoreFocus.current) { trigger.current?.focus(); restoreFocus.current = false; }
  }, [open]);
  if (!constituentId || !viewerId || !workspaceId) return null;
  return <>
    <button ref={trigger} type="button" className="mt-3 rounded-xl border border-emerald-300 bg-white px-4 py-2 text-sm font-semibold text-emerald-800" onClick={() => setOpen(true)}>Request stewardship assistance</button>
    {open && <StewardshipAssistanceDialog source={{ constituentId: String(constituentId), opportunityId: opportunityId ? String(opportunityId) : undefined }} viewerId={viewerId} workspaceId={workspaceId} onClose={() => { restoreFocus.current = true; setOpen(false); }} />}
  </>;
}
