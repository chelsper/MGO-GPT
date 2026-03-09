export const householdArticles = [
  {
    id: "head-of-household",
    categoryId: "household",
    title: "Head of Household",
    summary:
      "The Head of Household designation determines which constituent receives mailings when multiple people share an address. Proper assignment prevents duplicate mailings.",
    tags: ["household", "mailing", "spouse", "address"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Head of Household is indicated by a house icon in the profile header",
        "Only one person per household should be designated Head of Household",
        "Mailing lists should be pulled by Head of Household to avoid duplicates",
        "Spousal relationships automatically link household addresses",
        "Both spouses maintain their own constituent records but share one primary address",
      ],
      examples: [
        {
          title: "Married Couple",
          content:
            "Sarah Johnson (Alumni '05) and Michael Johnson (Parent - Current) live at the same address. Sarah is designated Head of Household. Mailings go to \"Mr. and Mrs. Johnson\" at Sarah's record.",
        },
        {
          title: "Avoiding Duplicate Mailings",
          content:
            "When pulling a list for annual fund appeals, filter by Head of Household = Yes. This ensures only one mailing per household address.",
        },
      ],
      whyThisMatters:
        "Head of Household designation eliminates duplicate mailings, reduces printing and postage costs, and prevents constituent annoyance from receiving multiple identical solicitations.",
      commonMistakes: [
        "Not filtering by Head of Household when pulling mailing lists",
        "Designating both spouses as Head of Household",
        "Sending separate mailings to each spouse instead of a joint mailing",
      ],
      relatedArticles: [
        "mailing-list-best-practices",
        "understanding-profile-header",
      ],
    },
  },
  {
    id: "mailing-list-best-practices",
    categoryId: "household",
    title: "Mailing List Best Practices",
    summary:
      "Pulling accurate mailing lists requires proper filtering by Head of Household, deceased status, preferred names, and household address rules.",
    tags: ["mailing", "lists", "household", "deceased", "preferred name"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Always filter by Head of Household = Yes",
        "Always exclude deceased constituents",
        "Use Preferred Name field for salutations",
        "Apply household address rules for joint mailings",
        "Use spousal recognition formatting (e.g., Mr. and Mrs., Dr. and Mr.)",
        "Verify constituency filters match campaign objectives",
      ],
      examples: [
        {
          title: "Alumni Annual Fund Mailing",
          content:
            "Filters: Alumni Bachelor's or Alumni Graduate, Head of Household = Yes, Deceased = No, Lifetime Giving > $0. Salutation: Use Preferred Name.",
        },
        {
          title: "Spousal Recognition",
          content:
            "Dr. Emily Carter (Alumni '00) and Mr. James Carter (Friend). Mailing: Dr. and Mr. James and Emily Carter.",
        },
      ],
      whyThisMatters:
        "Proper list generation ensures cost-effective mailings, respectful communication, and accurate campaign targeting. Errors result in wasted resources and constituent dissatisfaction.",
      commonMistakes: [
        "Not excluding deceased constituents",
        "Pulling lists without Head of Household filter",
        "Using legal name instead of preferred name",
        "Ignoring spousal titles and recognition",
      ],
      relatedArticles: ["head-of-household", "understanding-profile-header"],
    },
  },
];
