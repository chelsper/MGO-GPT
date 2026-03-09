export const constituenciesArticles = [
  {
    id: "standard-constituency-hierarchy",
    categoryId: "constituencies",
    title: "Standard Constituency Hierarchy",
    summary:
      "The official order of constituencies in Raiser's Edge NXT determines how constituents are categorized and reported. This hierarchy is standardized across all advancement operations.",
    tags: [
      "constituency",
      "hierarchy",
      "trustee",
      "alumni",
      "parent",
      "employee",
    ],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "1. Trustee (current trustees always first)",
        "2. Alumni Bachelor's Degree",
        "3. Alumni Graduate Degree",
        "4. Parent – Current",
        "5. Employee",
        "6. Alumni Non-Graduate",
        "7. Trustee – Former",
        "8. Parent – Former",
        "9. Employee – Former",
        "10. Parent Non-Graduate",
        "Special Rule: Trustee always appears at the top if the constituency is current",
        "Alumni Bachelor's Degree always ranks above Alumni Graduate Degree",
        "Hierarchy impacts reporting, segmentation, and campaign analytics",
      ],
      examples: [
        {
          title: "Multiple Constituencies",
          content:
            "Constituent is a current Trustee, Alumni Bachelor's 2005, and Parent - Current. Correct order: 1) Trustee, 2) Alumni Bachelor's Degree, 3) Parent - Current.",
        },
        {
          title: "Former Trustee",
          content:
            "Constituent served as Trustee until 2022 and is Alumni Graduate 2010. Correct order: 1) Alumni Graduate Degree, 2) Trustee - Former (note: former trustee ranks lower).",
        },
      ],
      whyThisMatters:
        "Hierarchy determines how constituents are counted in reports, which constituency appears in mailings, and how they are segmented for campaigns. Incorrect hierarchy leads to inaccurate campaign reporting and donor recognition errors.",
      commonMistakes: [
        "Placing Alumni Graduate Degree above Alumni Bachelor's Degree",
        "Not moving Trustee to the top when adding current trustee status",
        "Confusing Parent - Former with Parent Non-Graduate",
      ],
      relatedArticles: [
        "trustee-records",
        "alumni-constituencies",
        "parent-constituencies",
        "employee-records",
      ],
    },
  },
  {
    id: "trustee-records",
    categoryId: "constituencies",
    title: "Trustee Records",
    summary:
      "Trustee constituencies require specific date management and hierarchy placement. Current and former trustees are managed differently.",
    tags: ["trustee", "constituency", "governance"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        'Current Trustee: Use constituent code "Trustee"',
        "Current Trustee: Start date is required",
        "Current Trustee: No end date should be entered",
        'Former Trustee: Use constituent code "Trustee – Former"',
        "Former Trustee: Both start and end dates are required",
        'Rejoining Trustees: Add new "Trustee" constituency with new start date; previous service remains as "Trustee - Former"',
      ],
      examples: [
        {
          title: "Adding a New Trustee",
          content:
            "Board member elected June 1, 2025. Add constituency: Trustee, Date From: 06/01/2025, Date To: blank.",
        },
        {
          title: "Trustee Term Ends",
          content:
            'Trustee term ends May 31, 2026. Change constituency to "Trustee – Former", Date From: original start date, Date To: 05/31/2026.',
        },
        {
          title: "Rejoining Trustee",
          content:
            'Former trustee (2015-2020) rejoins board in 2026. Keep "Trustee - Former" (2015-2020). Add new "Trustee" constituency with Date From: 06/01/2026.',
        },
      ],
      whyThisMatters:
        "Accurate trustee records ensure proper governance reporting, board communications, and recognition. Trustee status impacts priority ratings and campaign involvement.",
      commonMistakes: [
        "Leaving Date To blank on former trustees",
        "Deleting former trustee record when someone rejoins",
        "Not updating hierarchy when trustee status changes",
      ],
      relatedArticles: [
        "standard-constituency-hierarchy",
        "understanding-profile-header",
      ],
    },
  },
  {
    id: "alumni-constituencies",
    categoryId: "constituencies",
    title: "Alumni Constituencies",
    summary:
      "Alumni constituencies are determined by degree status and graduation date. Proper classification impacts alumni engagement and reporting.",
    tags: ["alumni", "constituency", "graduation", "degree"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Alumni Bachelor's Degree: Used for undergraduate degree recipients",
        "Alumni Graduate Degree: Used for master's, doctoral, or professional degree recipients",
        "Alumni Non-Graduate: Used for attendees who did not complete a degree",
        "Date From: Always the graduation date (or last attendance date for non-graduates)",
        "Date To: Only used if the constituent is deceased",
        "When multiple degrees exist: Alumni Bachelor's Degree always appears above Alumni Graduate Degree in hierarchy",
      ],
      examples: [
        {
          title: "Bachelor's Degree Alumnus",
          content:
            "Graduated May 15, 2018 with BA in History. Constituency: Alumni Bachelor's Degree, Date From: 05/15/2018, Date To: blank.",
        },
        {
          title: "Multiple Degrees",
          content:
            "Bachelor's 2015, MBA 2020. Both constituencies present. Order: 1) Alumni Bachelor's Degree (05/2015), 2) Alumni Graduate Degree (05/2020).",
        },
        {
          title: "Non-Graduate",
          content:
            "Attended 2010-2012, did not complete degree. Constituency: Alumni Non-Graduate, Date From: 05/2012 (last attendance).",
        },
      ],
      whyThisMatters:
        "Alumni classification determines reunion year groupings, class giving campaigns, and alumni segmentation for events and communications. Incorrect classification skews participation metrics and campaign results.",
      commonMistakes: [
        "Using Alumni Graduate Degree for bachelor's recipients",
        "Leaving Date From blank",
        "Not adding Alumni Non-Graduate for attendees without degrees",
      ],
      relatedArticles: [
        "standard-constituency-hierarchy",
        "parent-constituencies",
      ],
    },
  },
  {
    id: "parent-constituencies",
    categoryId: "constituencies",
    title: "Parent Constituencies",
    summary:
      "Parent constituencies change based on student status and graduation. Understanding the difference between Parent - Current, Parent - Former, and Parent Non-Graduate is critical.",
    tags: ["parent", "constituency", "student", "graduation"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Parent – Current: Used while student is enrolled",
        "Parent – Current: Date To = expected graduation year (e.g., 2027)",
        "Parent – Current: Date From typically blank",
        "Parent – Current: Subject to change if student graduation is delayed or accelerated",
        "Parent – Former: Used when student graduates with a degree",
        "Parent – Former: Replaces Parent - Current upon graduation",
        "Parent Non-Graduate: Used when student does not complete a degree",
        "Parent Non-Graduate: Different from Parent - Former (which implies degree completion)",
      ],
      examples: [
        {
          title: "Current Parent",
          content:
            "Student enrolled, expected graduation 2027. Constituency: Parent - Current, Date From: blank, Date To: 2027.",
        },
        {
          title: "Student Graduates",
          content:
            'Student graduates May 2026. Change constituency to "Parent – Former", Date From: blank, Date To: 2026.',
        },
        {
          title: "Student Withdraws",
          content:
            'Student withdraws without degree in 2025. Change constituency to "Parent Non-Graduate", Date From: blank, Date To: blank.',
        },
      ],
      whyThisMatters:
        "Parent constituency accuracy ensures proper parent campaign segmentation, family giving credit, and communication targeting. Misclassification impacts family engagement strategies and donor retention.",
      commonMistakes: [
        "Not updating Date To when graduation year changes",
        "Using Parent - Former for parents of non-graduates",
        "Leaving Parent - Current status after student graduates",
      ],
      relatedArticles: [
        "standard-constituency-hierarchy",
        "alumni-constituencies",
      ],
    },
  },
  {
    id: "employee-records",
    categoryId: "constituencies",
    title: "Employee Records",
    summary:
      "Employee constituencies indicate current and former employment status. Employment history is also tracked in the Relationships section.",
    tags: ["employee", "constituency", "employment", "relationships"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Employee: Used for current employees only",
        "Employee: Removed and replaced with Employee - Former upon separation",
        "Employee – Former: Date From = date employee left the university",
        "Employee – Former: Appears after Parent - Former in constituency hierarchy",
        'Employment history: Also stored in Relationships section as "Jacksonville University – Employer" with employment dates',
      ],
      examples: [
        {
          title: "Current Employee",
          content:
            "Hired January 10, 2020, still employed. Constituency: Employee, Date From: 01/10/2020, Date To: blank. Relationship: Jacksonville University - Employer (01/10/2020 - present).",
        },
        {
          title: "Former Employee",
          content:
            'Left university June 30, 2024. Change constituency to "Employee – Former", Date From: 06/30/2024. Update Relationship end date to 06/30/2024.',
        },
      ],
      whyThisMatters:
        "Employee records ensure accurate internal communications, employee giving campaigns, and benefits eligibility. Employment dates impact giving credit and recognition.",
      commonMistakes: [
        "Leaving Employee status after separation",
        "Not updating Relationships section when employment ends",
        "Using incorrect Date From on Employee - Former (should be separation date, not hire date)",
      ],
      relatedArticles: [
        "standard-constituency-hierarchy",
        "relationship-records",
      ],
    },
  },
  {
    id: "non-hierarchy-constituencies",
    categoryId: "constituencies",
    title: "Constituencies Not Requiring Hierarchy",
    summary:
      "Some constituencies represent entity type or affiliation and do not follow standard hierarchy rules. Only one should exist per constituent.",
    tags: ["constituency", "friend", "business", "foundation"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Friend: Individual with no other specific affiliation",
        "Family: Family member of a constituent (not spouse)",
        "Business: Corporate entity",
        "Foundation: Private or community foundation",
        "Donor Advised Fund: DAF entity record",
        "Only one of these constituencies should exist per constituent",
        "Hierarchy order does not apply to these constituencies",
        "Represents entity type or general affiliation, not a time-based relationship",
      ],
      examples: [
        {
          title: "Friend Constituency",
          content:
            "Community member who attends events but has no alumni, parent, or employee connection. Constituency: Friend.",
        },
        {
          title: "Business Entity",
          content:
            "Local corporation that sponsors events. Constituency: Business.",
        },
        {
          title: "Foundation Record",
          content:
            "Smith Family Foundation makes grants. Constituency: Foundation.",
        },
      ],
      whyThisMatters:
        "These constituencies allow for proper categorization of non-traditional constituents and ensure accurate segmentation for corporate, foundation, and community engagement.",
      commonMistakes: [
        "Adding multiple non-hierarchy constituencies to one record",
        "Using Friend when Alumni Non-Graduate is more appropriate",
        "Creating individual records for foundation contacts instead of relationship records",
      ],
      relatedArticles: [
        "standard-constituency-hierarchy",
        "relationship-records",
      ],
    },
  },
  {
    id: "relationship-records",
    categoryId: "constituencies",
    title: "Relationship Records",
    summary:
      "Relationship records document connections between constituents, including employment, board service, foundation affiliations, and family relationships.",
    tags: ["relationships", "connections", "employer", "foundation"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Use Relationships section to document employer, foundation, and organizational connections",
        "Include start and end dates for all relationships",
        "Foundation contacts should be related to the foundation entity record, not created as separate constituents",
        "Board service at external organizations should be documented in Relationships",
        'Employment history at Jacksonville University stored as "Jacksonville University – Employer"',
      ],
      examples: [
        {
          title: "Foundation Relationship",
          content:
            'John Smith is a trustee of the Smith Family Foundation. Create entity record for "Smith Family Foundation" (constituency: Foundation). Add relationship to John Smith\'s record: Relationship Type: Trustee, Organization: Smith Family Foundation.',
        },
        {
          title: "Corporate Employment",
          content:
            "Donor works at ABC Corporation. Add relationship: Relationship Type: Employee, Organization: ABC Corporation, Start Date: hire date.",
        },
      ],
      whyThisMatters:
        "Relationship records enable tracking of influential connections, corporate giving opportunities, and foundation grant prospects. Accurate relationships support strategic engagement and influence mapping.",
      commonMistakes: [
        "Creating separate constituent records for foundation contacts instead of using relationships",
        "Not documenting end dates when relationships terminate",
        "Failing to update Jacksonville University employment relationships when staff separate",
      ],
      relatedArticles: ["employee-records", "non-hierarchy-constituencies"],
    },
  },
];
