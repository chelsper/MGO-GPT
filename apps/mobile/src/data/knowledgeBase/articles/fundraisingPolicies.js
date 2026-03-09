export const fundraisingPoliciesArticles = [
  {
    id: "ticket-sales-events",
    categoryId: "fundraising-policies",
    title: "Ticket Sales to University Events",
    summary:
      "Ticket sales are generally not considered a gift. However, when tickets are priced above Fair Market Value, the excess amount is tax-deductible and countable as a gift.",
    tags: [
      "tickets",
      "events",
      "fair market value",
      "tax deduction",
      "quid pro quo",
    ],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Ticket sales are generally NOT considered a gift by University Advancement.",
        "If tickets are sold to raise funds and priced above Fair Market Value (FMV), the amount above FMV is considered a gift.",
        "The tax-deductible donation amount must be stated on the ticket and/or event promotion.",
        "Fair Market Value is NOT the cost to the organizer — it is the amount a willing buyer would pay a willing seller to attend.",
        "JU may host free events that request an optional donation at registration.",
      ],
      examples: [
        {
          title: "Event Ticket Above FMV",
          content:
            "A gala dinner has a Fair Market Value of $75 per ticket. JU sells tickets at $200 each. The tax-deductible gift portion is $125 ($200 - $75). This must be disclosed on the ticket.",
        },
        {
          title: "Free Event with Optional Donation",
          content:
            "JU hosts a campus open house that is free to attend. At registration, attendees are given the option to make a donation. Any donation received is fully tax-deductible.",
        },
      ],
      whyThisMatters:
        "Proper classification of ticket sales protects both JU and its donors under IRS regulations. Misclassifying ticket sales as gifts — or failing to disclose the deductible portion — can result in IRS compliance issues and donor trust erosion.",
      commonMistakes: [
        "Counting the entire ticket price as a gift when it includes FMV for the event",
        "Using the cost to the organizer as Fair Market Value instead of what a willing buyer would pay",
        "Failing to disclose the tax-deductible portion on ticket materials",
        "Not coordinating event-related gifts with University Advancement",
      ],
      relatedArticles: ["quid-pro-quo", "auctions", "event-management"],
    },
  },
  {
    id: "auctions",
    categoryId: "fundraising-policies",
    title: "Auctions",
    summary:
      "Auctions involve two potential donors: the donor of the item (gift-in-kind) and the winning bidder who may claim a deduction for any amount paid above fair market value.",
    tags: ["auction", "gift-in-kind", "fair market value", "bidding", "events"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Two donors may be involved: (1) the donor of the auctioned item and (2) the winning bidder.",
        "If the auctioned item sells, the item donor has made a countable gift-in-kind.",
        "The fair market value of each auctioned item must be publicly disclosed to all bidders.",
        "If the winning bid exceeds the fair market value, the excess is a tax-deductible gift for the bidder.",
        "Information on BOTH donors must be provided to University Advancement for proper recording and acknowledgment.",
      ],
      examples: [
        {
          title: "Auction Item Sold Above FMV",
          content:
            "A local business donates a vacation package valued at $2,000 (gift-in-kind). A bidder wins it for $3,500. The business receives credit for a $2,000 gift-in-kind. The bidder can claim a $1,500 tax-deductible gift ($3,500 - $2,000).",
        },
        {
          title: "Auction Item Sold At or Below FMV",
          content:
            "An art piece valued at $500 is auctioned and sold for $450. The item donor receives credit for a $500 gift-in-kind. The winning bidder has NO tax-deductible gift since the bid did not exceed FMV.",
        },
      ],
      whyThisMatters:
        "Proper auction handling ensures IRS compliance, protects donor tax deductions, and accurately captures all giving for recognition and campaign counting purposes.",
      commonMistakes: [
        "Not publicly disclosing the fair market value of auctioned items",
        "Failing to report auction donor information to University Advancement",
        "Counting the winning bid as a full gift instead of only the amount above FMV",
        "Not providing the item donor with a gift-in-kind acknowledgment",
      ],
      relatedArticles: ["quid-pro-quo", "gifts-in-kind", "ticket-sales-events"],
    },
  },
  {
    id: "drawings-raffles",
    categoryId: "fundraising-policies",
    title: "Drawings & Raffles",
    summary:
      "Per IRS regulations, no portion of a payment for a chance to win a prize (raffles, door prizes, drawings) may be considered a tax-deductible gift.",
    tags: ["raffle", "drawing", "door prize", "IRS", "tax rules"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "No portion of a raffle ticket purchase or drawing entry payment is tax-deductible per IRS regulations.",
        "A gift may be counted ONLY if the drawing allows anyone to enter without a purchase or donation.",
        "Free-entry drawings must be widely and publicly promoted, and the outcome must be implemented.",
        'The wording "raffle ticket" must NOT be used if you want the donation to be counted as a gift.',
        "The winner cannot claim their payment as a donation due to quid pro quo rules.",
        "If the prize is cash and the winner donates it back to JU, it is a gift only if the winner first claims it as income.",
      ],
      examples: [
        {
          title: "Non-Deductible Raffle",
          content:
            "JU sells $50 raffle tickets for a chance to win a $5,000 travel package. None of the $50 payments are tax-deductible, regardless of whether the buyer wins or loses.",
        },
        {
          title: "Deductible Free-Entry Drawing",
          content:
            "JU runs a free-entry drawing widely promoted to the public. A donor also makes a $100 contribution. Since entry was free and not tied to the donation, the $100 is a countable, tax-deductible gift.",
        },
      ],
      whyThisMatters:
        "Incorrectly classifying raffle proceeds as tax-deductible gifts exposes JU and its donors to IRS penalties. Understanding these rules protects the university's tax-exempt status.",
      commonMistakes: [
        'Using the term "raffle ticket" when the intent is to allow a deductible gift',
        "Telling donors their raffle purchase is tax-deductible",
        "Not publicly promoting free-entry drawings as required",
        "Not advising cash prize winners about income tax implications before re-donating",
      ],
      relatedArticles: ["quid-pro-quo", "ticket-sales-events"],
    },
  },
  {
    id: "memberships",
    categoryId: "fundraising-policies",
    title: "Memberships",
    summary:
      "Annual membership fees can be considered a gift only if the fee is $75 or less and the benefits of membership are insubstantial as defined by IRS guidelines.",
    tags: [
      "membership",
      "annual fee",
      "insubstantial benefits",
      "IRS",
      "deduction",
    ],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Annual membership fees can be considered a gift only if the fee is $75 or less.",
        "The benefits of membership must be insubstantial to qualify as a deductible gift.",
        "Insubstantial benefits include: free or discounted admission to JU facilities or events.",
        "Discounts on JU gift shop purchases are considered insubstantial.",
        "Free or discounted parking is considered insubstantial.",
        "Free or discounted member-only events where per-person cost is within the low-cost articles limit ($11.70 as of 2022).",
        "Token items bearing JU's name or logo (mugs, calendars, etc.) are considered insubstantial.",
      ],
      examples: [
        {
          title: "Deductible Membership",
          content:
            "A $50 annual membership to the JU Alumni Association that includes a JU mug, discounted event admission, and free parking at campus events. All benefits are insubstantial, so the full $50 is a deductible gift.",
        },
        {
          title: "Non-Deductible Membership",
          content:
            "A $200 annual membership that includes reserved seats at all athletic events (fair market value of $150). The substantial benefit of $150 must be subtracted, making only $50 potentially deductible.",
        },
      ],
      whyThisMatters:
        "Properly classifying membership fees ensures compliance with IRS regulations and protects donors' ability to claim accurate tax deductions.",
      commonMistakes: [
        "Treating all membership fees as fully deductible gifts",
        "Not evaluating whether membership benefits are substantial or insubstantial",
        "Exceeding the $75 threshold without adjusting for benefits",
      ],
      relatedArticles: ["quid-pro-quo", "sponsorships"],
    },
  },
  {
    id: "sponsorships",
    categoryId: "fundraising-policies",
    title: "Sponsorships",
    summary:
      "Most corporate sponsorship dollars are fully deductible and countable as gifts, unless the recognition constitutes advertising as defined by the IRS.",
    tags: ["sponsorship", "corporate", "advertising", "recognition", "IRS"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Most corporate sponsorship dollars are fully deductible and countable as gifts.",
        "The determining factor is whether the recognition constitutes advertising.",
        "IRS defines advertising as competitive pricing or product information displayed because of the donation.",
        "Simple name or logo placement is NOT considered advertising.",
        "If a donor's name is placed on a brick, chair, building, or program that remains part of JU, this does NOT reduce the gift value.",
        "For a sponsorship to qualify as a contribution (per IRS Treas. Reg. 1.513-4(c)(2)(v)), ALL of the following must exist:",
        "The contribution must be made by a person or corporation engaged in a trade or business.",
        "The sponsor should not expect nor receive a substantial return benefit (2% of contribution) other than name acknowledgment.",
        "Promotional information should be limited to: location, phone, internet address, value-neutral product descriptions, brand/trade names.",
        "No qualitative or comparative advertising of sponsor's products or services.",
        "Sponsorships should not be contingent on event attendance, ratings, or public exposure.",
      ],
      examples: [
        {
          title: "Qualifying Sponsorship",
          content:
            "ABC Corp sponsors JU's annual gala for $25,000. In return, ABC Corp's logo appears on event signage and the program booklet. No product pricing or comparative advertising is included. The full $25,000 is a deductible gift.",
        },
        {
          title: "Non-Qualifying Sponsorship (Advertising)",
          content:
            'XYZ Inc. pays $10,000 to sponsor a JU event. In return, XYZ receives a full-page ad in the program stating "XYZ offers the best rates in town — call today for 20% off!" This is advertising, not a sponsorship gift. The $10,000 is an exchange transaction.',
        },
      ],
      whyThisMatters:
        "The line between sponsorship gifts and advertising exchange transactions has significant tax implications. Proper classification protects both JU's reporting integrity and the sponsor's tax position.",
      commonMistakes: [
        "Including competitive pricing or product promotions in sponsor recognition materials",
        "Not distinguishing between name/logo placement and advertising",
        "Making sponsorship benefits contingent on attendance or exposure metrics",
        "Failing to evaluate the 2% substantial return benefit threshold",
      ],
      relatedArticles: ["quid-pro-quo", "memberships", "ticket-sales-events"],
    },
  },
  {
    id: "quid-pro-quo",
    categoryId: "fundraising-policies",
    title: "Quid Pro Quo",
    summary:
      "The IRS defines a quid pro quo gift as a payment made partly as a contribution and partly in consideration for goods or services. Understanding the safe harbor rules is essential.",
    tags: ["quid pro quo", "IRS", "safe harbor", "tax deduction", "benefits"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        'A quid pro quo gift is a "payment made partly as a contribution and partly in consideration for goods or services provided to the payer."',
        "The value of benefits the donor receives determines the actual gift amount.",
        'Items must have "substantial" value to be subtracted from the contribution for tax and counting purposes.',
        "IRS Safe Harbor Rule 1: Gifts/benefits valued at $10.60 or less may be given with a donation of $53.00+ and be considered insubstantial (must bear JU name/logo). Entire donation is tax-deductible.",
        "IRS Safe Harbor Rule 2: Benefits must not exceed $106.00 or 2% of FMV of the contribution, whichever is less.",
        "IRS Safe Harbor Rule 3: Benefits offered to members for $75 or less annual payments, consisting of frequently exercisable rights/privileges, are considered insubstantial.",
        "These values are adjusted annually — contact University Advancement for current amounts.",
      ],
      examples: [
        {
          title: "Insubstantial Benefit (Safe Harbor)",
          content:
            "A donor gives $100 and receives a JU-branded coffee mug worth $8. Since the mug is under $10.60 and bears the JU logo, it is insubstantial. The full $100 is tax-deductible.",
        },
        {
          title: "Substantial Benefit (Quid Pro Quo)",
          content:
            "A donor gives $1,000 and receives a benefit worth $110. The $106 maximum is exceeded, so the benefit is substantial. The tax-deductible gift amount is $890 ($1,000 - $110).",
        },
        {
          title: "2% Rule Applied",
          content:
            "A donor gives $1,000. Maximum insubstantial benefit = 2% × $1,000 = $20 (less than the $106 cap). A benefit worth $20 or less keeps the full $1,000 deductible.",
        },
      ],
      whyThisMatters:
        "Quid pro quo rules directly impact how much of a donor's contribution is tax-deductible. Incorrect application exposes JU to IRS penalties and can damage donor relationships when tax receipts are inaccurate.",
      commonMistakes: [
        "Not disclosing the value of benefits on tax receipts when quid pro quo applies",
        "Assuming all gifts with small thank-you items require quid pro quo adjustments",
        "Not tracking the current IRS thresholds (they adjust annually)",
        "Forgetting that the 2% rule uses whichever is LESS — 2% of FMV or the dollar cap",
      ],
      relatedArticles: [
        "ticket-sales-events",
        "auctions",
        "drawings-raffles",
        "memberships",
      ],
    },
  },
  {
    id: "indirect-cost-reinvestment",
    categoryId: "fundraising-policies",
    title: "Indirect Cost Reinvestment Policy",
    summary:
      "Effective January 15, 2025, Jacksonville University reinvests 10% of all non-endowed restricted gifts toward advancement efforts and university priorities. Donors receive full credit for their gifts. This practice aligns JU with established norms at leading universities and nonprofits nationwide.",
    tags: [
      "indirect cost",
      "gift tax",
      "reinvestment",
      "restricted gifts",
      "non-endowed",
      "advancement",
      "reallocation",
    ],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "POLICY GUIDELINES:",
        "Donors receive credit for the full amount of their gifts.",
        "Ten percent of all restricted non-endowed gifts will be reinvested toward advancement expenses and institutional priorities.",
        "For a single gift, the reinvestment will only apply to the first $2.5 million, with a maximum fee of $250,000.",
        "Pledges made before Jan. 15, 2025 — and their subsequent pledge payments — will not be subject to reallocation.",
        "Gift agreements and/or stewardship reports will inform the donor that a portion of the gift received has been reallocated.",
        "Deferred gifts, such as charitable gift annuities, trusts and bequests, will be assessed only at the time they are realized.",
        "The reinvestment will be applied to all awards received from foundations and other private not-for-profit sponsors, except where there are pre-existing published guidelines that prohibit it.",
        "REINVESTMENT FOR INDIRECT COSTS WILL NOT BE MADE TO:",
        "Documented gift agreements, including documented pledges, executed prior to Jan. 15, 2025.",
        "Non-cash gifts (gifts-in-kind) made to the University that are to become inventoried usable assets of the University.",
        "Governmental grants or subgrants where the prime source of funds is governmental or to any contracts.",
        "All endowed gifts.",
        "Scholarships — the reinvestment does not apply to scholarship gifts.",
        "EXEMPTIONS FOR FOUNDATIONS, ORGANIZATIONS & CAPITAL PROJECTS:",
        "Exemptions may be applied to gifts from foundations or organizations when a specific amount is requested for a project.",
        "Capital projects may also qualify for an exemption; however, MGOs should ask for 10% more than the cost of the capital project to account for the reinvestment.",
        "All exemptions must be formally approved — MGOs should not assume an exemption applies without confirmation.",
        "HOW THE REALLOCATION OCCURS:",
        "Upon receipt of a gift, the University will deduct 10% from the restricted amount gifted. The reallocation will have a minor effect on individual funds while its collective impact will encourage sustained growth in private support across the University.",
        "BUDGET TIMING:",
        "The reallocation will occur simultaneously with the gift credit. Your NAC 17 or NAC 21 will be balanced at the same time, ensuring funds will not be drawn for reallocation at a later date.",
      ],
      examples: [
        {
          title: "Standard Restricted Gift",
          content:
            "A donor makes a $50,000 restricted gift to the College of Arts & Sciences. The donor receives full credit for $50,000. The university reinvests $5,000 (10%) toward advancement and institutional priorities, with $45,000 going directly to the restricted fund.",
        },
        {
          title: "Large Gift — Cap Applied",
          content:
            "A donor makes a single $5,000,000 restricted, non-endowed gift. The 10% reinvestment applies only to the first $2.5 million, resulting in a maximum reinvestment of $250,000. The remaining $4,750,000 goes to the restricted fund.",
        },
        {
          title: "Pre-Existing Pledge — Exempt",
          content:
            "A donor made a $100,000 pledge in December 2024, before the Jan. 15, 2025 effective date. All subsequent payments on this pledge are exempt from the reinvestment — no reallocation applies.",
        },
        {
          title: "Endowed Gift — Exempt",
          content:
            "A donor makes a $200,000 endowed gift to establish a scholarship. Since all endowed gifts are exempt, the full $200,000 goes to the endowment with no reinvestment deduction.",
        },
        {
          title: "Scholarship Gift — Exempt",
          content:
            "A donor makes a $25,000 gift to fund student scholarships. Since scholarships are exempt from the reinvestment policy, the full $25,000 goes directly to the scholarship fund.",
        },
        {
          title: "Capital Project — Ask for 10% More",
          content:
            "A building renovation costs $1,000,000. The MGO should ask the donor for $1,100,000 to account for the 10% reinvestment. This ensures the full $1,000,000 reaches the capital project after the $100,000 reallocation. An exemption may be granted but must be formally approved.",
        },
        {
          title: "Foundation Grant — Exemption Applied",
          content:
            "A foundation awards $500,000 for a specific research project. Because the foundation has requested a specific amount for a defined project, an exemption is applied and the full $500,000 goes to the project without reinvestment.",
        },
      ],
      whyThisMatters:
        "Jacksonville University is a premier institution dedicated to a standard of excellence. Indirect cost support is essential to maintaining that standard. For students and their families, this means JU can continue delivering the high-quality education and experiences they expect, while addressing rising operational costs and enhancing campus resources. From improving facilities to funding student programs and scholarships, these funds empower JU to invest in what matters most. Leading universities and nonprofits across the country have embraced this practice for years as a standard way to support operational expenses and position themselves for the future.",
      commonMistakes: [
        "Assuming the reinvestment applies to endowed gifts — all endowed gifts are exempt",
        "Applying the reinvestment to scholarships — scholarship gifts are exempt",
        "Applying the reinvestment to pledges made before January 15, 2025 — pre-existing pledges and their payments are exempt",
        "Forgetting the $2.5 million cap — for single gifts, the reinvestment only applies to the first $2.5 million (max $250,000)",
        "Not informing donors — gift agreements and stewardship reports must disclose that a portion has been reallocated",
        "Applying the reinvestment to gifts-in-kind that become inventoried university assets — these are exempt",
        "Applying the reinvestment to governmental grants or subgrants — these are exempt",
        "Asking for the exact cost of a capital project instead of 10% more — MGOs should request 10% above the project cost to cover the reinvestment",
        "Assuming a foundation or organization gift is automatically exempt — exemptions must be formally approved",
      ],
      relatedArticles: ["sponsorships", "gifts-in-kind", "quid-pro-quo"],
    },
  },
];
