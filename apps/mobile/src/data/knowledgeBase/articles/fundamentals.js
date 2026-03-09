export const fundamentalsArticles = [
  {
    id: "accessing-constituent-profile",
    categoryId: "fundamentals",
    title: "Accessing a Constituent Profile",
    summary:
      "Learn how to search for and access constituent records in Raiser's Edge NXT using best practices for accurate results.",
    tags: ["profile", "search", "navigation", "fundamentals"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Always use the top search bar to locate constituent records",
        "Best practice: search by last name if you are unsure of the exact spelling",
        "Review all matching results carefully before selecting a profile",
        "Verify constituency information in the profile header before proceeding",
      ],
      examples: [
        {
          title: "Standard Search",
          content:
            'To find "John Smith," enter "Smith" in the top search bar. Review the list of results and verify the correct John Smith by checking graduation year, city, or spouse name.',
        },
        {
          title: "Profile Header Review",
          content:
            "Once opened, check the profile header for: photo (top left), preferred name, head of household indicator, spouse name, and constituency listing (top right).",
        },
      ],
      whyThisMatters:
        "Accurate profile selection prevents data entry errors, duplicate records, and ensures you are working with the correct constituent. Incorrect profile selection can result in gift misattribution and reporting inaccuracies.",
      commonMistakes: [
        "Selecting the first result without verifying identity",
        "Ignoring constituency indicators that may signal a different person",
        "Not checking for duplicate records before creating a new constituent",
      ],
      relatedArticles: [
        "understanding-profile-header",
        "standard-constituency-hierarchy",
      ],
    },
  },
  {
    id: "understanding-profile-header",
    categoryId: "fundamentals",
    title: "Understanding the Profile Header",
    summary:
      "The profile header displays critical constituent information including head of household status, preferred name, spouse information, and constituency dates.",
    tags: ["profile", "header", "constituencies", "fundamentals"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Head of Household indicator appears as a house icon in the profile header",
        "Preferred Name is displayed prominently and should be used in all communications",
        "Spouse name displays when household relationship exists",
        "Constituency listing appears on the top right with date ranges",
        '"Date From" indicates the start date of a constituency relationship',
        '"Date To" indicates the end date (used for former constituencies or expected graduation)',
      ],
      examples: [
        {
          title: "Head of Household Example",
          content:
            "Profile shows: Sarah Johnson with house icon. Spouse: Michael Johnson. Sarah is the Head of Household and primary contact for mailing purposes.",
        },
        {
          title: "Date From Interpretation",
          content:
            "Alumni Bachelor's Degree with Date From: 05/15/2015 means the constituent graduated on that date. Employee with Date From: 01/10/2020 means employment started on that date.",
        },
        {
          title: "Date To Interpretation",
          content:
            "Parent - Current with Date To: 2027 indicates expected student graduation year. Trustee - Former with Date To: 06/30/2023 indicates when trusteeship ended.",
        },
      ],
      whyThisMatters:
        "The profile header provides immediate context for constituent relationships, communication preferences, and mailing logistics. Misinterpreting header information can lead to improper segmentation and communication errors.",
      commonMistakes: [
        "Ignoring the Head of Household indicator when pulling mailing lists",
        "Using legal name instead of preferred name in communications",
        "Misinterpreting Date To as a termination date when it represents expected graduation",
      ],
      relatedArticles: [
        "accessing-constituent-profile",
        "head-of-household",
        "standard-constituency-hierarchy",
      ],
    },
  },
];
