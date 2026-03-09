export const givingArticles = [
  {
    id: "lifetime-giving",
    categoryId: "giving",
    title: "Lifetime Giving",
    summary:
      "Lifetime Giving represents the total amount a constituent has donated over their entire relationship with the university. Campaign-specific totals may differ.",
    tags: ["giving", "lifetime", "campaign", "recognition"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Lifetime Giving includes all gifts, pledges, and pledge payments",
        "Comprehensive Campaign Dollars: Total given during the comprehensive campaign period",
        "Philanthropic Campaign Dollars: Subset that meets specific campaign counting rules",
        "Recognition credit may include matching gifts and donor-advised fund gifts",
        "Lifetime Giving is cumulative and never decreases unless a gift is voided",
      ],
      examples: [
        {
          title: "Lifetime Giving Calculation",
          content:
            "Constituent has given $10,000 in 2015, $5,000 in 2020, and $15,000 in 2025. Lifetime Giving = $30,000.",
        },
        {
          title: "Campaign vs Lifetime",
          content:
            "Lifetime Giving = $50,000. Gifts made during campaign period = $20,000. Campaign total = $20,000, not $50,000.",
        },
      ],
      whyThisMatters:
        "Lifetime Giving determines donor recognition levels, major gift thresholds, and cumulative impact. Campaign totals determine campaign goal progress and specific initiative credit.",
      commonMistakes: [
        "Confusing Lifetime Giving with campaign-specific totals",
        "Not accounting for pledge payments in campaign totals",
        "Assuming all Lifetime Giving counts toward current campaign goals",
      ],
      relatedArticles: [
        "last-gift-vs-last-payment",
        "recognition-vs-legal-credit",
      ],
    },
  },
  {
    id: "last-gift-vs-last-payment",
    categoryId: "giving",
    title: "Last Gift vs Last Payment",
    summary:
      "Understanding the difference between a gift, a pledge, and a pledge payment is essential for accurate donor engagement and reporting.",
    tags: ["gift", "pledge", "payment", "giving"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Gift: A completed, outright donation (cash, check, credit card)",
        "Pledge: A commitment to give a specific amount over time",
        "Pledge Payment: An installment payment toward a pledge balance",
        "Last Gift Date: The date of the most recent outright gift",
        "Last Payment Date: The date of the most recent pledge payment (may be more recent than Last Gift Date)",
      ],
      examples: [
        {
          title: "Outright Gift",
          content:
            "Donor writes a check for $1,000 on March 1, 2026. This is a gift. Last Gift Date = 03/01/2026.",
        },
        {
          title: "Pledge with Payments",
          content:
            "Donor pledges $10,000 on Jan 1, 2025, payable over 2 years. Pledge Date = 01/01/2025. Donor makes $5,000 payment on July 1, 2025. Last Payment Date = 07/01/2025. Last Gift Date may still reflect a previous outright gift.",
        },
      ],
      whyThisMatters:
        "Accurate classification ensures proper acknowledgment timing, pledge tracking, and campaign reporting. Misclassification can lead to premature recognition or missed stewardship opportunities.",
      commonMistakes: [
        "Recording a pledge as a gift",
        "Not updating pledge balance after payments",
        "Confusing Last Payment Date with Last Gift Date",
      ],
      relatedArticles: ["lifetime-giving", "recognition-vs-legal-credit"],
    },
  },
  {
    id: "recognition-vs-legal-credit",
    categoryId: "giving",
    title: "Recognition vs Legal Credit",
    summary:
      "Recognition credit and legal credit may differ. Matching gifts, donor-advised funds, and anonymous gifts require special handling.",
    tags: ["recognition", "legal", "credit", "matching gifts", "DAF"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Recognition Credit: Who receives public acknowledgment for the gift",
        "Legal Credit: Who receives the tax deduction",
        "Donor Advised Funds: Donor receives recognition; DAF entity receives legal credit",
        "Employer Matching Gifts: Employee receives recognition; employer receives legal credit",
        "Gift-in-Kind: Fair market value used for recognition; appraisal required for legal deduction",
      ],
      examples: [
        {
          title: "Donor Advised Fund Gift",
          content:
            "Jane Smith directs her DAF to grant $25,000. Recognition: Jane Smith. Legal Credit: Smith Family Donor Advised Fund.",
        },
        {
          title: "Matching Gift",
          content:
            "Employee gives $5,000; employer matches $5,000. Recognition: Employee receives credit for $10,000 total impact. Legal Credit: $5,000 to employee, $5,000 to employer.",
        },
      ],
      whyThisMatters:
        "Proper credit assignment ensures accurate tax receipting, IRS compliance, and appropriate donor recognition. Errors can result in audit issues and donor dissatisfaction.",
      commonMistakes: [
        "Not tracking soft credit for DAF gifts",
        "Crediting matching gifts only to the employer",
        "Not documenting gift-in-kind appraisals",
      ],
      relatedArticles: ["lifetime-giving", "last-gift-vs-last-payment"],
    },
  },
  {
    id: "fund-records",
    categoryId: "giving",
    title: "Fund Records",
    summary:
      "Fund records track designations for gifts and ensure proper allocation of donor contributions to specific purposes and initiatives.",
    tags: ["funds", "designations", "allocations", "giving"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Every gift must be assigned to a fund designation",
        "Fund codes are created and managed by Advancement Services",
        "Restricted gifts must be coded to the appropriate restricted fund",
        "Unrestricted gifts default to the Annual Fund or Greatest Need",
        "Endowment funds have specific spending and reporting requirements",
        "MGOs should verify fund coding before submitting gift records",
      ],
      examples: [
        {
          title: "Restricted Scholarship Gift",
          content:
            "Donor gives $50,000 for nursing scholarships. Code to: Fund 12345 - Nursing Scholarship Endowment. Mark as restricted. Include donor's scholarship criteria in notes.",
        },
        {
          title: "Unrestricted Annual Fund",
          content:
            "Donor gives $1,000 with no specific designation. Code to: Fund 10000 - Annual Fund. Mark as unrestricted.",
        },
      ],
      whyThisMatters:
        "Proper fund coding ensures legal compliance with donor intent, accurate financial reporting, and appropriate allocation of resources. Incorrect fund coding can result in audit findings and loss of donor trust.",
      commonMistakes: [
        "Coding restricted gifts to unrestricted funds",
        "Creating new fund codes without Advancement Services approval",
        "Not documenting donor intent in gift notes",
      ],
      relatedArticles: ["recognition-vs-legal-credit", "lifetime-giving"],
    },
  },
];
