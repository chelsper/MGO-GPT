// Knowledge base articles data - same data as the mobile app
const articles = [
  // Fundamentals
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
    },
  },
  // Constituencies
  {
    id: "standard-constituency-hierarchy",
    categoryId: "constituencies",
    title: "Standard Constituency Hierarchy",
    summary:
      "The standard constituency order determines how constituents are classified and prioritized in the system.",
    tags: ["constituencies", "hierarchy", "classification"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Constituencies follow a standard hierarchy order for classification",
        "A constituent may have multiple constituencies but one is primary",
        "The primary constituency determines default segmentation and reporting",
        "Changes to constituency require proper documentation and approval",
      ],
      examples: [
        {
          title: "Multi-constituency Example",
          content:
            "Jane Doe is both an Alumna (BS 2010) and a Parent (current). Her primary constituency is Alumni because it ranks higher in the hierarchy.",
        },
      ],
      whyThisMatters:
        "Correct constituency assignment ensures accurate reporting, proper solicitation strategies, and compliance with donor communication preferences.",
      commonMistakes: [
        "Assigning constituency without checking existing records",
        "Not updating constituency when status changes (e.g., student graduates to alumni)",
      ],
    },
  },
  // Household
  {
    id: "head-of-household",
    categoryId: "household",
    title: "Head of Household Rules",
    summary:
      "Guidelines for determining and managing head of household status for mailing and communication purposes.",
    tags: ["household", "mailing", "head of household"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Each household must have exactly one Head of Household",
        "Head of Household determines the primary mailing address",
        "Spouse records are linked but maintain separate constituency data",
        "Gift credit and recognition follow household rules",
      ],
      examples: [
        {
          title: "Standard Household",
          content:
            "John and Mary Smith are married. John is the Head of Household. All mailings go to John's preferred address unless Mary has a specific override.",
        },
      ],
      whyThisMatters:
        "Proper head of household designation prevents duplicate mailings, ensures correct salutation, and maintains data integrity across household records.",
      commonMistakes: [
        "Creating separate households for married couples",
        "Not updating head of household when circumstances change",
      ],
    },
  },
  // Giving
  {
    id: "lifetime-giving-definitions",
    categoryId: "giving",
    title: "Lifetime Giving Definitions",
    summary:
      "Understanding how lifetime giving totals are calculated, including what counts toward recognition and legal credit.",
    tags: ["giving", "lifetime", "recognition", "credit"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Lifetime giving includes all outright gifts and pledge payments",
        "Recognition credit may differ from legal credit",
        "Matching gifts count toward recognition but follow separate rules",
        "Planned gifts are tracked separately until realized",
      ],
      examples: [
        {
          title: "Recognition vs Legal Credit",
          content:
            "A $100,000 gift from the Smith Family Foundation receives legal credit to the foundation. John Smith, who recommended the gift, receives recognition credit on his individual record.",
        },
      ],
      whyThisMatters:
        "Accurate giving calculations are essential for donor stewardship, recognition societies, campaign counting, and IRS compliance.",
      commonMistakes: [
        "Conflating recognition credit with tax-deductible amounts",
        "Not recording soft credits for spouse or family members",
      ],
    },
  },
  // Prospect
  {
    id: "prospect-ratings-overview",
    categoryId: "prospect",
    title: "Prospect Ratings Overview",
    summary:
      "How prospect ratings work, including wealth screening results, capacity ratings, and propensity scores.",
    tags: ["prospect", "ratings", "wealth", "capacity"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Wealth ratings come from external screening services",
        "Capacity ratings reflect estimated giving ability",
        "Propensity scores indicate likelihood of making a gift",
        "Ratings should be reviewed and updated annually",
      ],
      examples: [
        {
          title: "Using Ratings",
          content:
            "A prospect with a high capacity rating ($1M+) and high propensity score should be prioritized for personal visits and major gift solicitation.",
        },
      ],
      whyThisMatters:
        "Prospect ratings help prioritize officer time and resources, ensuring the most promising prospects receive appropriate attention and cultivation.",
      commonMistakes: [
        "Relying solely on wealth ratings without considering affinity",
        "Not updating ratings after significant life events",
      ],
    },
  },
  // Reporting
  {
    id: "list-request-guidelines",
    categoryId: "reporting",
    title: "List Request Guidelines",
    summary:
      "How to properly submit list requests to DevData for accurate and timely delivery.",
    tags: ["list", "request", "reporting", "devdata"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "All list requests must be submitted through the official request form",
        "Allow 3-5 business days for normal priority requests",
        "Urgent requests (1-2 days) should be used sparingly",
        "Clearly specify all criteria including exclusions",
      ],
      examples: [
        {
          title: "Standard Request",
          content:
            "Submit a list request for all alumni in Florida with $1,000+ lifetime giving for an upcoming regional event. Include name, email, phone, and last gift date.",
        },
      ],
      whyThisMatters:
        "Proper list requests ensure accurate data delivery, reduce back-and-forth with DevData, and help maintain data privacy compliance.",
      commonMistakes: [
        "Submitting vague criteria that require follow-up",
        "Not specifying exclusions, resulting in inappropriate contacts being included",
      ],
    },
  },
  // Governance
  {
    id: "data-governance-basics",
    categoryId: "governance",
    title: "Data Governance Basics",
    summary:
      "Why data standards matter and how to maintain compliance with institutional data governance policies.",
    tags: ["governance", "compliance", "standards", "data quality"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "All data entry must follow established naming conventions",
        "Constituent data is confidential and subject to FERPA/privacy regulations",
        "Changes to core records require appropriate authorization",
        "Regular data audits ensure ongoing quality",
      ],
      examples: [
        {
          title: "Naming Convention",
          content:
            "Enter names as: Last, First Middle. Use preferred name field for nicknames. Example: 'Smith, Jonathan Robert' with preferred name 'John'.",
        },
      ],
      whyThisMatters:
        "Data governance protects constituent privacy, ensures regulatory compliance, and maintains the integrity of institutional advancement data.",
      commonMistakes: [
        "Entering data in inconsistent formats",
        "Sharing constituent data outside approved channels",
      ],
    },
  },
  // Fundraising Policies
  {
    id: "fundraising-event-policies",
    categoryId: "fundraising-policies",
    title: "Fundraising Event Policies",
    summary:
      "Policies for tickets, auctions, raffles, sponsorships, and quid pro quo considerations at fundraising events.",
    tags: ["fundraising", "events", "tickets", "auctions", "policies"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Event ticket purchases must distinguish between fair market value and charitable contribution",
        "Auction items require proper valuation and documentation",
        "Raffle regulations vary by state and must be reviewed before implementation",
        "Sponsorship benefits must be clearly documented for IRS compliance",
      ],
      examples: [
        {
          title: "Ticket Quid Pro Quo",
          content:
            "A $500 gala ticket with $150 fair market value (dinner, entertainment) results in a $350 charitable deduction. The acknowledgment letter must disclose the FMV.",
        },
      ],
      whyThisMatters:
        "Proper handling of fundraising events ensures IRS compliance, accurate gift recording, and donor confidence in the institution's financial practices.",
      commonMistakes: [
        "Not calculating fair market value for event tickets",
        "Failing to issue proper quid pro quo disclosures",
      ],
    },
  },
  // Gift Acceptance
  {
    id: "gift-acceptance-overview",
    categoryId: "gift-acceptance",
    title: "Gift Acceptance Overview",
    summary:
      "Overview of gift acceptance policies including gifts-in-kind, pledges, endowments, and scholarships.",
    tags: ["gift", "acceptance", "pledge", "endowment"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "All gifts must be reviewed against the gift acceptance policy before acceptance",
        "Gifts-in-kind require independent appraisal for items valued over $5,000",
        "Pledges must have written documentation including payment schedule",
        "Endowment gifts must meet minimum funding thresholds",
      ],
      examples: [
        {
          title: "Gift-in-Kind",
          content:
            "A donor offers a painting valued at $25,000. An independent appraiser must verify the value. The institution may decline if the gift creates undue burden (storage, insurance, etc.).",
        },
      ],
      whyThisMatters:
        "A clear gift acceptance policy protects the institution from liability, ensures compliance with IRS regulations, and maintains donor trust.",
      commonMistakes: [
        "Accepting gifts without proper review",
        "Not documenting pledge payment schedules",
      ],
    },
  },
  // Gift Agreements
  {
    id: "gift-agreement-types",
    categoryId: "gift-agreements",
    title: "Gift Agreement Types",
    summary:
      "Understanding different agreement types including MOUs, naming rights, and Heritage Society commitments.",
    tags: ["agreement", "MOU", "naming", "heritage"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "All major gifts should have a written gift agreement",
        "MOUs outline mutual expectations between donor and institution",
        "Naming rights follow institutional naming policy",
        "Heritage Society commitments document planned giving intentions",
      ],
      examples: [
        {
          title: "Standard Gift Agreement",
          content:
            "A $500,000 endowed scholarship requires a gift agreement specifying: fund name, selection criteria, reporting requirements, and what happens if criteria cannot be met.",
        },
      ],
      whyThisMatters:
        "Gift agreements protect both the donor and institution, ensuring that gift intent is honored and that both parties understand their obligations.",
      commonMistakes: [
        "Not having agreements reviewed by legal counsel",
        "Omitting contingency clauses for changed circumstances",
      ],
    },
  },
  // Campaign Counting
  {
    id: "campaign-counting-rules",
    categoryId: "campaign-counting",
    title: "Campaign Counting Rules",
    summary:
      "Rules for counting gifts toward campaign totals, including pillars, exclusions, and planned gift handling.",
    tags: ["campaign", "counting", "rules", "planned gifts"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Campaign counting follows CASE guidelines",
        "Only gifts received during the campaign period are counted",
        "Planned gifts may be counted at face value or present value depending on policy",
        "Government grants and contracts are typically excluded",
      ],
      examples: [
        {
          title: "Planned Gift Counting",
          content:
            "A bequest intention of $1M is documented. Per campaign policy, it is counted at face value in the planned giving pillar. Realized bequests during the campaign count in the outright giving pillar.",
        },
      ],
      whyThisMatters:
        "Consistent campaign counting ensures accurate reporting to stakeholders, compliance with CASE standards, and credibility of campaign totals.",
      commonMistakes: [
        "Double-counting gifts that span campaign periods",
        "Inconsistent treatment of planned gifts",
      ],
    },
  },
  // Advancement Operations
  {
    id: "advancement-ops-overview",
    categoryId: "advancement-ops",
    title: "Advancement Operations Overview",
    summary:
      "Overview of advancement operations services including events, data management, acknowledgments, ethics, and campaigns.",
    tags: ["operations", "services", "events", "acknowledgments"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Advancement Operations supports all fundraising units with data and reporting",
        "Gift acknowledgments must be sent within 48 hours of gift receipt",
        "All donor interactions must comply with AFP ethical standards",
        "Event support includes invitation lists, RSVPs, and follow-up reporting",
      ],
      examples: [
        {
          title: "Acknowledgment Timeline",
          content:
            "A $10,000 gift received on Monday must have an acknowledgment letter generated and sent by Wednesday. Tax receipts for year-end gifts must be mailed by January 31.",
        },
      ],
      whyThisMatters:
        "Advancement Operations is the backbone of institutional fundraising, ensuring that all processes run smoothly, compliantly, and efficiently.",
      commonMistakes: [
        "Delaying gift acknowledgments beyond the 48-hour window",
        "Not coordinating event lists with development officers",
      ],
    },
  },
];

export async function GET() {
  return Response.json(articles);
}
