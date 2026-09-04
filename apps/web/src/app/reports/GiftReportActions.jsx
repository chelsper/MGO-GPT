"use client";

import { createContext, useContext, useEffect, useState } from "react";
import OpportunityGiftLinkModal from "@/app/components/OpportunityGiftLinkModal";

const Context = createContext(null);
const buttonStyle = {
  display: "inline-flex", padding: "8px 10px", border: "1px solid #BFDBFE",
  borderRadius: "9px", color: "#1D4ED8", background: "white", fontSize: "13px",
  fontWeight: 700, textDecoration: "none", cursor: "pointer", textAlign: "left",
};

export function stewardshipActionHref(constituent) {
  const params = new URLSearchParams({ mode: "action", actionType: "Stewardship",
    blackbaudConstituentId: constituent.constituentId, donor: constituent.name || "", returnTo: "/reports" });
  return `/action-opportunity-update?${params}`;
}

export function GiftRowActions({ constituent, group }) {
  const context = useContext(Context);
  if (!context?.enabled || !constituent?.constituentId) return null;
  const opportunities = context.opportunities[constituent.constituentId] || [];
  return <div style={{ display: "grid", gap: "6px", marginTop: "8px" }}>
    <a href={stewardshipActionHref(constituent)} style={buttonStyle}>Log Stewardship Action</a>
    {opportunities.length > 0 && group.giftId ? (
      <button type="button" style={buttonStyle} onClick={() => context.open({ constituent, group, opportunities })}>
        Link to Opportunity
      </button>
    ) : null}
  </div>;
}

export default function GiftReportActions({ groups, enabled, ready, children }) {
  const [opportunities, setOpportunities] = useState({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selection, setSelection] = useState(null);
  const [feedback, setFeedback] = useState("");
  const idsKey = [...new Set(groups.flatMap((group) => [group.hardCreditDonor, ...group.softCreditRecipients])
    .map((person) => person?.constituentId).filter(Boolean))].sort().join(",");

  useEffect(() => {
    const controller = new AbortController();
    setOpportunities({});
    setError("");
    setSelection(null);
    if (!enabled || !ready || !idsKey) { setLoading(false); return; }
    setLoading(true);
    const ids = idsKey.split(",");
    async function load() {
      try {
        for (let index = 0; index < ids.length; index += 50) {
          const response = await fetch(`/api/reports/gift-opportunities?constituentIds=${encodeURIComponent(ids.slice(index, index + 50).join(","))}`, { signal: controller.signal });
          const payload = await response.json();
          if (!response.ok || !payload.byConstituentId) throw new Error("Could not check open opportunities.");
          if (!controller.signal.aborted) setOpportunities((current) => ({ ...current, ...payload.byConstituentId }));
        }
      } catch {
        if (!controller.signal.aborted) setError("Some open opportunities could not be checked. Gift actions are still available.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [enabled, ready, idsKey, retry]);

  return <Context.Provider value={{ enabled, opportunities, open: (value) => {
    setSelection({ ...value, gift: {
      id: value.group.giftId, date: value.group.date,
      amount: value.group.receivedAmount || value.group.committedAmount,
      type: value.group.giftType, fund: value.group.fundDescriptions.join("; "),
    } });
  } }}>
    {loading ? <p role="status">Checking open opportunities...</p> : null}
    {error ? <p role="alert">{error} <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry opportunity check</button></p> : null}
    {feedback ? <p role="status" style={{ color: "#166534" }}>{feedback}</p> : null}
    {children}
    {selection && enabled ? <OpportunityGiftLinkModal
      constituentId={selection.constituent.constituentId}
      reportGift={selection.gift} openOpportunities={selection.opportunities}
      onClose={() => setSelection(null)} onSaved={(result) => {
        setFeedback(result.nxtSync.message); setSelection(null);
      }} /> : null}
  </Context.Provider>;
}
