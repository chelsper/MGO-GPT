export const prospectArticles = [
  {
    id: "prospect-ratings",
    categoryId: "prospect",
    title: "Prospect Ratings",
    summary:
      "Prospect ratings indicate capacity and likelihood to give. Ratings are informed by wealth screening, giving history, and MGO assessment.",
    tags: ["prospect", "rating", "capacity", "wealth screening"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Capacity Rating: Estimated ability to give based on wealth indicators",
        "Wealth Screening Notes: Data from third-party sources (real estate, business holdings, stock ownership)",
        "Ratings are confidential and for internal use only",
        "MGOs may adjust ratings based on personal knowledge and conversations",
        "Ratings inform portfolio assignment and solicitation strategy",
      ],
      examples: [
        {
          title: "High Capacity Prospect",
          content:
            "Wealth screening shows $10M+ in assets. Capacity Rating: $500K - $1M. Assigned to senior MGO for cultivation.",
        },
        {
          title: "Rating Adjustment",
          content:
            "Initial rating: $100K. After visit, MGO learns of recent business sale. Rating adjusted to $500K.",
        },
      ],
      whyThisMatters:
        "Accurate ratings ensure appropriate resource allocation, realistic goal setting, and strategic pipeline management. Overestimating or underestimating capacity leads to missed opportunities or wasted effort.",
      commonMistakes: [
        "Not updating ratings after significant life events",
        "Relying solely on wealth screening without MGO input",
        "Sharing ratings with external parties or donors",
      ],
      relatedArticles: ["contact-reports"],
    },
  },
  {
    id: "contact-reports",
    categoryId: "prospect",
    title: "Contact Reports",
    summary:
      "Contact reports document all meaningful interactions with prospects and donors. Standardized reporting ensures continuity and strategy alignment.",
    tags: ["contact report", "prospect", "documentation", "next steps"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "All visits, calls, and substantive emails must be documented",
        "Summary must include: purpose of contact, key discussion points, donor sentiment",
        "Next step must be specific and actionable",
        "Tone should be professional, factual, and objective",
        "Include date, interaction type, and participants",
      ],
      examples: [
        {
          title: "Visit Contact Report",
          content:
            "Date: 03/05/2026. Type: In-person visit. Summary: Discussed new scholarship fund for first-generation students. Donor expressed strong interest and requested proposal. Next Step: Send proposal by 03/15/2026.",
        },
        {
          title: "Call Contact Report",
          content:
            "Date: 03/06/2026. Type: Phone call. Summary: Follow-up on previous visit. Donor has questions about endowment structure. Next Step: Schedule meeting with gift planning officer for 03/20/2026.",
        },
      ],
      whyThisMatters:
        "Contact reports ensure continuity when MGOs transition, inform leadership of pipeline progress, and document donor intent for gift agreements. Incomplete or vague reports hinder strategic planning.",
      commonMistakes: [
        "Not including a specific next step",
        "Using overly casual or opinionated language",
        "Failing to document calls and emails (only documenting visits)",
      ],
      relatedArticles: ["prospect-ratings"],
    },
  },
];
