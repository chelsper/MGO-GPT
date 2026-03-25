export const NXT_TERMINOLOGY_MAP = [
  {
    nxtTerm: "Constituent",
    appLabel: "Constituent",
    syncStatus: "Synced to NXT when linked",
    explanation: "Primary donor/person record. The app should not create a competing person object.",
  },
  {
    nxtTerm: "Action",
    appLabel: "Constituent Action / Log Action",
    syncStatus: "Synced to NXT when the constituent is linked",
    explanation: "Use NXT-style action language for visits, calls, emails, and events.",
  },
  {
    nxtTerm: "Opportunity",
    appLabel: "Opportunity",
    syncStatus: "Companion workspace field set with NXT-aligned labels",
    explanation: "Use NXT terms like Status, Ask Date, Date Expected, and Ask Amount.",
  },
  {
    nxtTerm: "Next Step",
    appLabel: "Next Step",
    syncStatus: "Internal companion workflow field",
    explanation: "Action-oriented reminder layer used to keep momentum moving between NXT updates.",
  },
  {
    nxtTerm: "Fundraiser Assignment / Team coordination",
    appLabel: "Team Discussion",
    syncStatus: "Internal only",
    explanation: "Internal collaboration and discussion tied to a constituent, teammate, or opportunity.",
  },
  {
    nxtTerm: "Review queue",
    appLabel: "Submissions",
    syncStatus: "Internal only",
    explanation: "Advancement Services review workflow for app-originated changes and requests.",
  },
];

export function getSyncBadge(direction) {
  switch (direction) {
    case "nxt":
      return { label: "Synced to NXT", bg: "#DBEAFE", text: "#1D4ED8", border: "#BFDBFE" };
    case "internal":
      return { label: "Internal only", bg: "#F3F4F6", text: "#4B5563", border: "#E5E7EB" };
    case "suggested":
      return { label: "Suggested by app", bg: "#FEF3C7", text: "#92400E", border: "#FCD34D" };
    default:
      return { label: "Companion layer", bg: "#EDE9FE", text: "#5B21B6", border: "#DDD6FE" };
  }
}
