export const advancementOpsArticles = [
  {
    id: "advancement-services-responsibilities",
    categoryId: "advancement-ops",
    title: "Advancement Services Responsibilities",
    summary:
      "Advancement Services supports fundraising by processing donations, maintaining donor records, providing prospect research, managing Raiser's Edge, and handling all reporting.",
    tags: [
      "advancement services",
      "gift processing",
      "research",
      "database",
      "reporting",
    ],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "GIFT PROCESSING:",
        "Approval of gift account expenditures exceeding $5K.",
        "Gift account set-up and updates.",
        "Gift acknowledgments and gift agreements.",
        "Processing gifts through various streams: cash, check, stock, in-kind, credit card (NXT Giving, GiveCampus, JU Ticketing, Eventbrite, GiveSmart), ACH/wire.",
        "Reconciliations with Controller's Office.",
        "Society level letters.",
        "PROSPECT RESEARCH:",
        "Pipeline management.",
        "Prospect research.",
        "Wealth screenings.",
        "DATABASE MANAGEMENT:",
        "Configurations and constituent record management.",
        "Error reports and data integrity.",
        "Imports and global updates.",
        "Security and training.",
        "REPORTING:",
        "Ad-hoc requests for lists/reports (e-mailings, mailings, general information).",
        "Campaign reports and dashboards.",
        "Individual performance reports and dashboards.",
        "Routine reports and distribution.",
        "OTHER DUTIES:",
        "Event registrations, processing, and record-keeping.",
        "Management and implementation of software, subscriptions, and tools within UA.",
        "UA process and procedure documentation.",
      ],
      examples: [
        {
          title: "Gift Processing Flow",
          content:
            "A $10,000 check arrives. Advancement Services enters it into Raiser's Edge, applies it to the correct fund, generates an acknowledgment letter, and reconciles with the Controller's Office.",
        },
        {
          title: "Prospect Research Request",
          content:
            "An MGO is preparing for a major gift meeting. They request a prospect research brief from Advancement Services, who provides wealth screening data, giving history, and capacity rating.",
        },
      ],
      whyThisMatters:
        "Advancement Services is the operational backbone of University Advancement. Understanding their responsibilities helps MGOs and other staff know whom to contact, what support is available, and how to follow proper procedures.",
      commonMistakes: [
        "Processing gifts outside of Advancement Services channels",
        "Not requesting prospect research before major donor meetings",
        "Making database changes without consulting Advancement Services",
        "Not following up on gift acknowledgment status",
      ],
      relatedArticles: [
        "event-management",
        "requesting-information",
        "dev-data",
      ],
    },
  },
  {
    id: "dev-data",
    categoryId: "advancement-ops",
    title: "Development Data (DEV DATA)",
    summary:
      "The UA database is housed in Raiser's Edge. Data is dynamic and updates are sent to devdata@ju.edu, where the Advancement Services team processes them.",
    tags: ["DEV DATA", "Raiser's Edge", "database", "data updates", "devdata"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "The database for University Advancement is housed in Raiser's Edge.",
        "Data is dynamic — it changes as gifts, records, and constituent information are updated.",
        "Data update requests should be sent to devdata@ju.edu.",
        "These emails are received by ALL members of the Advancement Services team.",
        "All updates are made according to procedures in the database procedures manual.",
        "When data updates require a database change, a project may be created.",
        "Projects may be accomplished by any member of the Advancement Services team depending on the level of work involved.",
      ],
      examples: [
        {
          title: "Sending a Data Update",
          content:
            "An MGO learns that a donor has moved to a new address. They send an email to devdata@ju.edu with the constituent's name, old address, and new address. The Advancement Services team updates the record in Raiser's Edge.",
        },
        {
          title: "Large Data Project",
          content:
            "A batch of 200 alumni records needs employer updates from a LinkedIn import. The MGO sends the data to devdata@ju.edu. Advancement Services creates a project to process the bulk update.",
        },
      ],
      whyThisMatters:
        "Keeping data current in Raiser's Edge is essential for accurate reporting, effective communication, and donor stewardship. The devdata@ju.edu channel ensures all updates are tracked and processed consistently.",
      commonMistakes: [
        "Making database changes directly instead of going through devdata@ju.edu",
        "Sending data updates to individual team members instead of the shared email",
        "Not following the database procedures manual for updates",
        "Assuming data changes happen automatically without submitting a request",
      ],
      relatedArticles: [
        "advancement-services-responsibilities",
        "requesting-information",
      ],
    },
  },
  {
    id: "event-management",
    categoryId: "advancement-ops",
    title: "Event Management",
    summary:
      "Any campus event with online registration through NXT or a charitable component must involve Advancement Services for proper processing and compliance.",
    tags: [
      "events",
      "registration",
      "NXT",
      "charitable",
      "auction",
      "sponsorship",
    ],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Advancement Services must be contacted for any on-campus event where:",
        "1. The event will utilize online registration through NXT.",
        "2. The event will have a charitable component:",
        "   a. Ticket sales will exceed fair market value.",
        "   b. There will be free admission with an optional donation.",
        "   c. There will be a silent auction.",
        "   d. The event will have sponsors not receiving a substantial return benefit (per IRS Reg. 1.513-4(c)(1)).",
        "Event registrations, processing, and record-keeping are handled by Advancement Services.",
      ],
      examples: [
        {
          title: "Gala with Silent Auction",
          content:
            "A college plans a gala with $200 tickets (FMV $75), a silent auction, and corporate sponsors. Advancement Services must be involved for: NXT registration setup, tracking the charitable portion of tickets ($125), auction item documentation, and sponsor gift processing.",
        },
        {
          title: "Free Event with Optional Donation",
          content:
            "A department hosts a free lecture series and wants to offer attendees the option to donate. Advancement Services sets up NXT registration with an optional donation field to ensure proper gift processing.",
        },
      ],
      whyThisMatters:
        "Events with charitable components must comply with IRS regulations. Advancement Services ensures tax receipts are accurate, gifts are properly recorded, and donor information is captured for stewardship.",
      commonMistakes: [
        "Hosting an event with charitable components without involving Advancement Services",
        "Not using NXT for event registration when online registration is needed",
        "Failing to disclose the tax-deductible portion of ticket prices",
        "Not providing sponsor and auction donor information to Advancement Services",
      ],
      relatedArticles: [
        "ticket-sales-events",
        "auctions",
        "sponsorships",
        "advancement-services-responsibilities",
      ],
    },
  },
  {
    id: "requesting-information",
    categoryId: "advancement-ops",
    title: "Requesting Information & Confidentiality",
    summary:
      "All requests for mailing lists, donor data, and other information must go through Advancement Services. Strict confidentiality rules govern how data is shared and used.",
    tags: [
      "information request",
      "confidentiality",
      "mailing list",
      "data privacy",
      "volunteers",
    ],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "All mailing lists, donor lists, gift lists, and other data requests must go through Advancement Services.",
        "Requests from volunteers must be approved by the Senior Director of Advancement Services.",
        "Database information is held in strictest confidence and used only for university fundraising purposes.",
        "CONFIDENTIALITY AGREEMENT (ALL EMPLOYEES/VOLUNTEERS MUST SIGN):",
        "Data will not be shared unless authorized by the SVP or per Information Release Policy.",
        "Use of data for profit or personal purposes is strictly prohibited.",
        "Breach may result in disciplinary action, loss of employment, or dismissal.",
        "INFORMATION RELEASE POLICY:",
        "'Public information' may be released to:",
        "A. University staff or alumni groups for approved activities.",
        "B. Other universities seeking alumni with shared degrees (written request required).",
        "C. Law enforcement and student loan agencies.",
        "D. Agencies assisting with lost alumni location (TransUnion, Alumni Finder).",
        "PUBLIC INFORMATION IS LIMITED TO:",
        "Full name, address/phone, degree(s) and dates, employer info.",
        "No information released for records marked 'no contact.'",
        "All media requests must be referred to Marketing and Communications.",
        "Federal law restricts information on current students — all student requests go to the Registrar's Office.",
      ],
      examples: [
        {
          title: "Standard List Request",
          content:
            "An MGO needs a list of donors who gave $1,000+ in the last fiscal year for a stewardship mailing. They submit the request through Advancement Services, who pulls the data from Raiser's Edge.",
        },
        {
          title: "Volunteer Request (Requires Approval)",
          content:
            "A volunteer board member requests a list of alumni in their city for an event. The request must be approved by the Senior Director of Advancement Services before the data is shared.",
        },
        {
          title: "Media Inquiry",
          content:
            "A reporter calls asking about a donor. The call must be referred to Marketing and Communications — no donor information is shared by Advancement staff.",
        },
      ],
      whyThisMatters:
        "Donor data is sensitive and confidential. Proper handling protects donor privacy, maintains trust, ensures legal compliance (especially for student records under FERPA), and prevents misuse of institutional data.",
      commonMistakes: [
        "Sharing donor data directly with volunteers without approval",
        "Using advancement data for personal or non-fundraising purposes",
        "Responding to media inquiries instead of referring to Marketing and Communications",
        "Not checking 'no contact' flags before sharing information",
        "Releasing student information (must go through the Registrar)",
      ],
      relatedArticles: [
        "advancement-services-responsibilities",
        "donor-bill-of-rights",
        "ethics-statement",
      ],
    },
  },
  {
    id: "starting-a-campaign",
    categoryId: "advancement-ops",
    title: "Starting a Fundraising Campaign",
    summary:
      "Step-by-step guidance for departments wanting to launch a fundraising campaign, including approval process, solicitation planning, promotion, and UA support.",
    tags: [
      "campaign launch",
      "solicitation",
      "approval",
      "planning",
      "appeal code",
    ],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "BEFORE THE CAMPAIGN:",
        "1. Approach your University Advancement Liaison for planning assistance.",
        "2. Determine how much money is needed and how it fits the university's strategic plan.",
        "3. Conduct a feasibility study (with Advancement) to identify donors with inclination and capacity.",
        "4. Get approval from your Dean/VP, then from the Senior Vice President.",
        "5. No fundraising efforts or announcements can be made without SVP approval.",
        "WHAT NEEDS TO BE IN PLACE:",
        "A solicitation plan (mailing, personal solicitations, events — your UA Liaison helps coordinate).",
        "A timeline with start and end dates.",
        "A gift account (not a budgetary account) set up by the Controller's Office for deposits.",
        "PROMOTION:",
        "Print materials must be approved by Marketing and Communications.",
        "Mailings and emailings that solicit funds must be approved by UA.",
        "E-solicitations must be approved by UA.",
        "UA SUPPORT AVAILABLE:",
        "Mailing lists with alumni/donor addresses and demographics.",
        "Professional fundraising strategy, giving histories, and back-office support.",
        "Tax compliance guidance (see Fundraising Policies).",
        "Thank-you letters with proper IRS tax receipt language.",
        "Weekly gift reports tied to your campaign.",
        "WHAT UA NEEDS FROM YOU:",
        "An appeal code — coordinate with UA for every solicitation to track gifts properly.",
        "Notification of any gifts received — all gifts must come directly to the UA office. If gifts arrive at your department, create a deposit and bring checks/correspondence to UA.",
      ],
      examples: [
        {
          title: "Department Campaign Launch",
          content:
            "The College of Nursing wants to raise $200,000 for a simulation lab. They meet with their UA Liaison, conduct a feasibility study, get Dean and SVP approval. UA sets up an appeal code and gift account. Marketing approves the brochure. Weekly gift reports track progress.",
        },
        {
          title: "Gift Arrives at Department",
          content:
            "A $5,000 check arrives at the Biology department. The staff creates a deposit slip and brings the check plus any donor correspondence to the UA office for proper processing, acknowledgment, and recording.",
        },
      ],
      whyThisMatters:
        "Following the proper campaign launch process ensures fundraising efforts are coordinated, legally compliant, properly tracked, and aligned with JU's overall strategic plan. It also maximizes ROI by leveraging UA's professional expertise.",
      commonMistakes: [
        "Announcing a campaign before getting SVP approval",
        "Depositing gifts into a budgetary account instead of a gift account",
        "Sending solicitation mailings without UA approval",
        "Not establishing an appeal code to track campaign gifts",
        "Keeping gifts at the department instead of forwarding them to UA",
      ],
      relatedArticles: [
        "advancement-services-responsibilities",
        "acknowledgment-processes",
        "campaign-overview",
      ],
    },
  },
  {
    id: "acknowledgment-processes",
    categoryId: "advancement-ops",
    title: "Acknowledgment Processes",
    summary:
      "How JU acknowledges gifts with tax receipts — including different processes for online gifts (GiveCampus/NXT) versus checks, ACH, stock, and gifts-in-kind.",
    tags: ["acknowledgment", "thank you", "tax receipt", "GiveCampus", "NXT"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "When a donation is received, Advancement Services enters it into Raiser's Edge based on the method received.",
        "GIFTS RECEIVED THROUGH GIVECAMPUS OR NXT:",
        "An electronic acknowledgment with tax language is automatically generated and sent to the donor's email.",
        "GIFTS RECEIVED VIA CHECK, ACH, STOCK, OR GIFT-IN-KIND:",
        "A hard copy receipt is sent to the address on record via U.S. mail.",
        "An electronic receipt can additionally be sent by request if an email address is provided.",
        "All acknowledgment letters contain IRS-compliant tax receipt language.",
        "Thank-you letters are prepared by the University Advancement Office.",
      ],
      examples: [
        {
          title: "Online Gift (GiveCampus)",
          content:
            "A donor gives $500 online through GiveCampus. An electronic tax receipt is automatically sent to the email address provided during the donation. No additional action is needed by the MGO.",
        },
        {
          title: "Check Donation",
          content:
            "A donor mails a $10,000 check. Advancement Services enters it into Raiser's Edge and sends a hard copy tax receipt to the donor's address on file. If the MGO requests it, an electronic receipt can also be sent.",
        },
      ],
      whyThisMatters:
        "Timely and accurate acknowledgment is both an IRS requirement and a critical donor stewardship practice. Donors need proper tax receipts, and prompt thank-you communications build trust and encourage future giving.",
      commonMistakes: [
        "Not verifying that online acknowledgments were sent for GiveCampus/NXT gifts",
        "Failing to request an electronic receipt when a donor prefers email communication",
        "Delaying acknowledgment of check or stock gifts",
        "Not ensuring acknowledgment letters contain proper IRS tax language",
      ],
      relatedArticles: [
        "advancement-services-responsibilities",
        "gifts-in-kind",
        "starting-a-campaign",
      ],
    },
  },
  {
    id: "foundations-lists-invitations",
    categoryId: "advancement-ops",
    title: "Handling Foundations for Lists & Invitations",
    summary:
      "Guidelines for how to list and invite family foundations, other foundations, and donor-advised funds for donor recognition and event purposes.",
    tags: [
      "foundations",
      "family foundation",
      "donor list",
      "invitations",
      "DAF",
    ],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "FAMILY FOUNDATIONS:",
        "List the entity name on donor lists.",
        "Also list family members (they should already be soft credited).",
        "Send invitations directly to family members' homes (per gift officer guidance, based on home address availability).",
        "OTHER FOUNDATIONS:",
        "List only the entity name (like a corporation).",
        "Exception: Community Foundation gifts — list the donor's name, not the fund name.",
        "Donor Advised Funds are typically NOT invited to events and NOT included in listings.",
        "Check with the MGO for the correct contact(s) to invite to an event.",
        "Send invitations to the foundation address.",
      ],
      examples: [
        {
          title: "Family Foundation on Donor List",
          content:
            "The Johnson Family Foundation gave $100,000. On the donor list: list 'Johnson Family Foundation' AND 'Robert Johnson' and 'Mary Johnson' (the family members who are soft credited). Send event invitations to the Johnsons' home address.",
        },
        {
          title: "Community Foundation Gift",
          content:
            "A gift comes from the Community Foundation of Northeast Florida, directed by donor Jane Smith. On the donor list: list 'Jane Smith' (not the Community Foundation name). Do not invite the DAF to events.",
        },
        {
          title: "Corporate Foundation",
          content:
            "The ABC Corporation Foundation gives $50,000. On the donor list: list 'ABC Corporation Foundation' only. Check with the MGO for the correct contact person and send the event invitation to the foundation address.",
        },
      ],
      whyThisMatters:
        "Proper handling of foundation listings and invitations ensures donors feel appropriately recognized, family members are engaged, and DAF/foundation protocols are followed consistently.",
      commonMistakes: [
        "Listing only the foundation name without including family members for family foundations",
        "Inviting Donor Advised Funds to events",
        "Sending invitations to the foundation address instead of family members' homes for family foundations",
        "Listing the Community Foundation name instead of the donor's name",
      ],
      relatedArticles: [
        "requesting-information",
        "acknowledgment-processes",
        "recognition-vs-legal-credit",
      ],
    },
  },
  {
    id: "donor-bill-of-rights",
    categoryId: "advancement-ops",
    title: "Donor Bill of Rights",
    summary:
      "Per the Council for Advancement and Support of Education (CASE), all donors have fundamental rights that JU is committed to upholding.",
    tags: ["donor rights", "CASE", "transparency", "ethics", "philanthropy"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "1. To be informed of the organization's mission, intended use of resources, and capacity to use donations effectively.",
        "2. To be informed of the identity of those on the governing board and expect prudent stewardship.",
        "3. To have access to the organization's most recent financial statements.",
        "4. To be assured gifts will be used for the purposes for which they were given.",
        "5. To receive appropriate acknowledgment and recognition.",
        "6. To be assured donation information is handled with respect and confidentiality.",
        "7. To expect professional relationships with organizational representatives.",
        "8. To be informed whether solicitors are volunteers, employees, or hired solicitors.",
        "9. To have the opportunity to be removed from mailing lists the organization may share.",
        "10. To feel free to ask questions and receive prompt, truthful, and forthright answers.",
      ],
      examples: [
        {
          title: "Donor Requests Financial Statements",
          content:
            "A major donor asks to see JU's most recent financial statements before making a $100,000 gift. Per the Donor Bill of Rights (#3), JU should provide access to this information.",
        },
        {
          title: "Donor Requests Removal from Mailing List",
          content:
            "A donor asks to be removed from all solicitation mailings. Per the Donor Bill of Rights (#9), JU must honor this request and update their record accordingly.",
        },
      ],
      whyThisMatters:
        "The Donor Bill of Rights is a foundational commitment to transparency, trust, and ethical fundraising. Upholding these rights protects JU's reputation and encourages philanthropic support.",
      commonMistakes: [
        "Not providing financial information when a donor requests it",
        "Failing to honor donor requests to be removed from mailing lists",
        "Not disclosing whether solicitors are employees, volunteers, or hired",
        "Using gifts for purposes other than what the donor intended",
      ],
      relatedArticles: [
        "ethics-statement",
        "requesting-information",
        "confidentiality-agreement",
      ],
    },
  },
  {
    id: "ethics-statement",
    categoryId: "advancement-ops",
    title: "Statement of Ethics",
    summary:
      "JU advancement professionals have a special duty to exemplify the best qualities of the institution and observe the highest standards of personal and professional conduct.",
    tags: ["ethics", "conduct", "professionalism", "CASE", "confidentiality"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Promote the merits of JU without disparaging other colleges or schools.",
        "Embody respect for truth, fairness, free inquiry, and the opinions of others.",
        "Respect all individuals without regard to race, color, gender, sexual orientation, marital status, creed, ethnic or national identity, handicap, or age.",
        "Uphold the professional reputation of other advancement officers and give credit for ideas originated by others.",
        "Safeguard privacy rights and confidential donor and prospect information.",
        "Do not grant or accept favors for personal gain.",
        "Do not solicit or accept favors where a higher public interest would be violated.",
        "Avoid actual or apparent conflicts of interest; seek guidance from administrators if in doubt.",
        "Follow the letter and spirit of laws and regulations affecting advancement and JU.",
        "Respect volunteers and their wishes to be helpful in meaningful ways.",
        "Observe these standards and actively encourage colleagues to support the highest standards of conduct.",
      ],
      examples: [
        {
          title: "Conflict of Interest",
          content:
            "An MGO is asked by a vendor to accept a personal gift in exchange for recommending the vendor's services to JU. The MGO declines and reports the offer to their supervisor, per the ethics statement.",
        },
        {
          title: "Respecting Donor Privacy",
          content:
            "A colleague asks an MGO for details about a prospect's giving history to share at a social event. The MGO declines, citing the duty to safeguard confidential donor information.",
        },
      ],
      whyThisMatters:
        "Ethical conduct is the foundation of donor trust and institutional integrity. Advancement professionals represent JU to the broader community, and their behavior directly impacts the university's reputation and fundraising success.",
      commonMistakes: [
        "Disparaging other institutions during donor conversations",
        "Sharing confidential donor information outside of professional contexts",
        "Accepting personal gifts or favors from vendors or donors",
        "Not disclosing potential conflicts of interest",
      ],
      relatedArticles: ["donor-bill-of-rights", "requesting-information"],
    },
  },
  {
    id: "insurance-policy-process",
    categoryId: "advancement-ops",
    title: "Insurance Policy Process",
    summary:
      "Step-by-step procedure for handling life insurance policies donated to JU, including premium management, authorization, and payment processing.",
    tags: [
      "life insurance",
      "premium",
      "policy",
      "Heritage Society",
      "Controller",
    ],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Step 1: Donor makes JU the owner of a life insurance policy. All paperwork is completed including a Heritage Society form.",
        "Step 2: The donor gifts JU the annual premium amount each year. Either JU pays the premium to the insurance company, or the donor pays directly and provides documentation.",
        "Step 3: The donor must authorize JU to have permissions on the life insurance account for audit purposes and account statements (if JU is paying the premium).",
        "Step 4: Advancement Services sends the donor an invoice reminding them about the premium payment (if JU handles payment).",
        "Step 5: Advancement Services initiates the payment request via the Controller's Office.",
        "Step 6: Payment is made to the insurance company no less than 2 weeks before the premium is due, even if the donor's gift has not yet been received.",
        "Step 7: Once the donor's gift is received, Advancement Services applies the payment to UA Gifts and transfers funds to the operating budget (11-00-64110) for reimbursement.",
        "Step 8: All normal acknowledgment procedures are followed per standard operating procedures.",
      ],
      examples: [
        {
          title: "Annual Premium Cycle",
          content:
            "A donor's life insurance premium of $3,000 is due on June 1. Advancement Services sends an invoice reminder in April. The donor sends $3,000 in May. Advancement Services initiates payment to the insurance company by May 15 (2 weeks before due date). The gift is recorded and acknowledged.",
        },
        {
          title: "Premium Due Before Gift Received",
          content:
            "A premium of $5,000 is due April 1 but the donor's gift hasn't arrived yet. JU still pays the premium on time. When the donor's gift is received later, it is applied to UA Gifts and the operating budget is reimbursed.",
        },
      ],
      whyThisMatters:
        "Life insurance policies can represent significant planned gifts. Proper premium management ensures policies don't lapse, donor gifts are accurately recorded, and JU's financial records are reconciled correctly.",
      commonMistakes: [
        "Waiting for the donor's gift before paying the premium (risk of lapse)",
        "Not obtaining donor authorization for JU to access insurance account information",
        "Not sending premium payment reminders to donors",
        "Failing to transfer funds from UA Gifts to the operating budget for reimbursement",
      ],
      relatedArticles: [
        "planned-gifts-counting",
        "heritage-society",
        "advancement-services-responsibilities",
      ],
    },
  },
];
