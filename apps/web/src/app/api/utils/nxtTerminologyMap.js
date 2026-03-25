export const NXT_TERMINOLOGY_MAP = [
  {
    currentLabel: "Person / donor record",
    nxtTerm: "Constituent",
    recommendedLabel: "Constituent",
    appLabel: "Constituent",
    syncStatus: "NXT-aligned",
    explanation: "Primary donor/person record. The companion app should not create a competing person object.",
  },
  {
    currentLabel: "Donor update / progress update",
    nxtTerm: "Action",
    recommendedLabel: "Action / Log Action",
    appLabel: "Constituent Action / Log Action",
    syncStatus: "NXT-aligned",
    explanation: "Use NXT-style Action language for visits, calls, emails, and events.",
  },
  {
    currentLabel: "Opportunity stage / proposal details",
    nxtTerm: "Opportunity",
    recommendedLabel: "Opportunity",
    appLabel: "Opportunity",
    syncStatus: "NXT-aligned",
    explanation: "Use NXT terms like Status, Ask Date, Date Expected, and Ask Amount.",
  },
  {
    currentLabel: "Reminder / follow-up",
    nxtTerm: "Next Step",
    recommendedLabel: "Next Step",
    appLabel: "Next Step",
    syncStatus: "Internal only",
    explanation: "Action-oriented reminder layer used to keep momentum moving between NXT updates.",
  },
  {
    currentLabel: "Internal notes / teammate handoff",
    nxtTerm: "No direct NXT object",
    recommendedLabel: "Team Discussion",
    appLabel: "Team Discussion",
    syncStatus: "Internal only",
    explanation: "Internal collaboration and discussion tied to a constituent, teammate, or opportunity.",
  },
  {
    currentLabel: "Submission / tracker",
    nxtTerm: "No direct NXT object",
    recommendedLabel: "Submission Tracker",
    appLabel: "Submissions",
    syncStatus: "Internal only",
    explanation: "Advancement Services support workflow for app-originated changes and requests. Keep this secondary to daily MGO work.",
  },
  {
    currentLabel: "Prospect name / top prospect",
    nxtTerm: "Prospect / assigned portfolio work",
    recommendedLabel: "My Prospects",
    appLabel: "My Top Prospects",
    syncStatus: "Companion layer with NXT-linked context",
    explanation: "Use this as the core execution screen for next steps, Actions, Opportunities, and internal discussion.",
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
