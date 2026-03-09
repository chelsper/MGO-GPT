export const reportingArticles = [
  {
    id: "list-request-guidelines",
    categoryId: "reporting",
    title: "List Request Guidelines",
    summary:
      "List requests must include specific filters and output preferences to ensure accurate, timely delivery. Follow standard request protocols.",
    tags: ["list request", "reporting", "filters", "output"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Output Selection: Choose NXT only, Excel only, or Both",
        "Required Filters: Constituency, giving threshold, geography, MGO assignment",
        "Giving Thresholds: Specify Lifetime Giving, Last Gift Date, or Campaign Total",
        "Geography Filters: State, city, ZIP code, or radius from address",
        "MGO Assignment Filters: Assigned MGO, portfolio status, or unassigned",
        "Timeline Expectations: Standard requests fulfilled within 3 business days; urgent requests within 1 business day",
      ],
      examples: [
        {
          title: "Alumni Mailing List",
          content:
            "Request: Alumni Bachelor's + Alumni Graduate, Lifetime Giving $1,000+, Florida residents, Head of Household, Output: Excel with name, address, class year, lifetime giving.",
        },
        {
          title: "Prospect Pool Review",
          content:
            "Request: Unassigned, Capacity Rating $100K+, Last Gift Date within 2 years, Output: NXT list for portfolio assignment review.",
        },
      ],
      whyThisMatters:
        "Clear list requests reduce back-and-forth, ensure accurate segmentation, and enable timely campaign execution. Vague requests delay projects and increase errors.",
      commonMistakes: [
        "Not specifying output format",
        "Requesting lists without clear constituency filters",
        "Not indicating Head of Household for mailing purposes",
        "Submitting urgent requests without justification",
      ],
      relatedArticles: ["mailing-list-best-practices", "head-of-household"],
    },
  },
];
