export const campaignCountingArticles = [
  {
    id: "campaign-overview",
    categoryId: "campaign-counting",
    title: "Campaign Counting Overview",
    summary:
      "Rules for counting gifts in the Comprehensive Campaign, including campaign period definitions, the silent phase, and what to include or exclude from campaign totals.",
    tags: [
      "campaign",
      "counting",
      "silent phase",
      "comprehensive",
      "reporting",
    ],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        'The "Campaign Period" is the total time encompassed by the active solicitation period, including the advance gifts phase.',
        "The Silent Phase is the period before the public announcement during which pace-setting gifts are sought from those closest to JU. It is part of the Campaign Period.",
        "Only gifts and pledges actually received or committed during the campaign period should be counted.",
        "Exceptions for pre-campaign gifts may be 'grandfathered' only if they meet one of three criteria:",
        "1. The gift/pledge was made with the understanding it would be counted in campaign totals.",
        "2. The gift/pledge was a challenge grant to be met during the campaign period.",
        "3. The gift/pledge supports a capital project that is a fundraising priority in the campaign.",
        "The value of canceled or unfulfilled pledges must be subtracted from campaign totals when it is determined they will not be realized.",
        "A comprehensive campaign includes philanthropic dollars, government investments, grants/research, in-kind capital, and other revenue streams.",
        "Each pillar is distinguishable from a reporting perspective for appropriate financial data delivery.",
      ],
      examples: [
        {
          title: "Grandfathered Gift",
          content:
            "A donor pledged $500,000 six months before the campaign officially started, specifically understanding it would count toward the campaign. This pledge is grandfathered into campaign totals.",
        },
        {
          title: "Canceled Pledge",
          content:
            "A $100,000 pledge was counted in the campaign. After 2 years with no payments, the donor confirms they cannot fulfill it. The $100,000 is subtracted from campaign totals.",
        },
      ],
      whyThisMatters:
        "Accurate campaign counting ensures credible reporting to stakeholders, compliance with CASE standards, and meaningful progress tracking toward campaign goals.",
      commonMistakes: [
        "Counting gifts made before the campaign period without meeting grandfathering criteria",
        "Not subtracting canceled or unfulfilled pledges from campaign totals",
        "Confusing comprehensive campaign totals with philanthropic-only totals",
        "Counting investment earnings on gifts in campaign totals (not allowed)",
      ],
      relatedArticles: [
        "campaign-gift-types",
        "campaign-exclusions",
        "campaign-funding-pillars",
      ],
    },
  },
  {
    id: "campaign-funding-pillars",
    categoryId: "campaign-counting",
    title: "Campaign Funding Pillars",
    summary:
      "JU's comprehensive campaign is organized into three pillars: Philanthropic, Community Partnerships, and Other Revenue Streams — each tracked separately in Raiser's Edge.",
    tags: [
      "pillars",
      "philanthropic",
      "community partnerships",
      "grants",
      "Raiser's Edge",
    ],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "PHILANTHROPIC PILLAR:",
        "Consists of charitable gifts modeled after CASE and IRS definitions.",
        "Only the philanthropic pillar is used for outside agency reporting (US News, CASE/VSE/AEM).",
        "Distinguished in Raiser's Edge by: gifts applied to NACs 17, 21, 30 (or unrestricted NAC 11).",
        "Gifts with the EMT (externally managed trust) prefix are considered philanthropic but not reconciled via batch to Finance.",
        "COMMUNITY PARTNERSHIPS PILLAR:",
        "Includes government funds (Palm Coast, Jacksonville, EPIC funds).",
        "Distinguished in Raiser's Edge by Fund ID prefix: CP and Fund Category: Community Partnership.",
        "OTHER REVENUE STREAMS:",
        "Grants & Research: Distinguished by Fund ID prefix: GR and Fund Category: Grants & Research.",
        "Capital Gifts-in-Kind: Where not accounted for in the Philanthropic pillar (e.g., construction discounts).",
        "Athletic Contracts & Sponsorships: Not currently counted but under consideration.",
      ],
      examples: [
        {
          title: "Philanthropic Gift",
          content:
            "A donor gives $50,000 to the Annual Fund. This is coded to NAC 11 (unrestricted) in Raiser's Edge. It counts in the Philanthropic pillar and is reported to outside agencies like US News.",
        },
        {
          title: "Community Partnership",
          content:
            "The City of Jacksonville provides $200,000 in government funding for a campus project. This is coded with the CP prefix and counts in the Community Partnerships pillar — not in philanthropic reporting.",
        },
        {
          title: "Grant Revenue",
          content:
            "JU receives a $150,000 research grant. It is coded with the GR prefix under Grants & Research. It counts in the comprehensive campaign total but not in the philanthropic pillar.",
        },
      ],
      whyThisMatters:
        "Separating funding pillars ensures JU can accurately report philanthropic giving to external agencies while also showing the full picture of revenue in the comprehensive campaign.",
      commonMistakes: [
        "Including community partnership or grant dollars in philanthropic reporting",
        "Not using the correct Fund ID prefix (CP, GR) for non-philanthropic revenue",
        "Confusing comprehensive campaign totals with philanthropic-only totals when reporting to external agencies",
      ],
      relatedArticles: [
        "campaign-overview",
        "campaign-gift-types",
        "campaign-exclusions",
      ],
    },
  },
  {
    id: "campaign-gift-types",
    categoryId: "campaign-counting",
    title: "Campaign Gift Types & Valuation",
    summary:
      "How different gift types — cash, matching gifts, pledges, gifts-in-kind, and securities — are valued and counted for campaign purposes.",
    tags: [
      "cash",
      "matching gifts",
      "pledges",
      "securities",
      "valuation",
      "campaign",
    ],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "CASH/CHECKS: Counted at full value as of the date received.",
        "MATCHING GIFTS: Counted as from the company with a soft credit to the initiating employee. Matching gifts are revocable and counted when received.",
        "PLEDGES OF CASH: Counted at full value as signed paperwork is received, within the fiscal year signed. Pledges should commit to a specific dollar amount on a fixed schedule. Payment period should not exceed 5 years.",
        "GIFTS-IN-KIND: Documentation of value must accompany the request. Counted at full fair market value as substantiated by a qualified appraisal and/or IRS Form 8283.",
        "MARKETABLE (PUBLICLY TRADED) SECURITIES: Counted at the average of the high and low quoted selling prices on the date the donor relinquished control.",
        "Stock transfer methods and valuation dates: Electronic transfer = date of transfer. Mailed stock = latest postmark date. Re-registered stock = date registered. Hand-delivered stock = date received.",
        "CLOSELY HELD STOCK: Gifts over $10,000 require a qualified independent appraiser. Gifts of $10,000 or less may use appraiser value or most recent bona fide transaction price (within 12 months). Must be approved by Gift Acceptance Committee with a pre-determined liquidation agreement.",
      ],
      examples: [
        {
          title: "Publicly Traded Stock",
          content:
            "A donor transfers 100 shares electronically on March 1. The stock's high that day is $52, low is $48. Valuation = average of $52 and $48 = $50/share × 100 shares = $5,000. Credited to the legal donor.",
        },
        {
          title: "Pledge Counted in Campaign",
          content:
            "A donor signs a pledge on the last day of the campaign for $50,000 over 5 years. The full $50,000 counts in campaign totals even though payments will extend beyond the campaign period.",
        },
        {
          title: "Matching Gift",
          content:
            "An employee gives $5,000 and their employer matches it. The $5,000 match is counted as a gift from the company. The employee receives soft credit for the match. The match is only counted when received.",
        },
      ],
      whyThisMatters:
        "Consistent valuation rules ensure campaign totals are accurate, auditable, and comparable to other institutions following CASE standards.",
      commonMistakes: [
        "Valuing securities on the wrong date (e.g., date received vs. date control was relinquished)",
        "Not documenting fair market value for gifts-in-kind",
        "Counting matching gifts before they are actually received",
        "Exceeding the 5-year payment period for pledge counting",
      ],
      relatedArticles: [
        "campaign-overview",
        "planned-gifts-counting",
        "gifts-in-kind",
      ],
    },
  },
  {
    id: "planned-gifts-counting",
    categoryId: "campaign-counting",
    title: "Planned Gifts & Life Insurance",
    summary:
      "Planned gifts are deferred until a future time and must be reported at present value. Life insurance, bequests, trusts, and annuities each have specific counting rules.",
    tags: [
      "planned giving",
      "life insurance",
      "bequest",
      "trust",
      "annuity",
      "present value",
    ],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "Planned gifts provide benefits deferred until a future time (usually donor's passing). They must be reported at present value.",
        "Present value is determined using IRS discount rates and life expectancy tables on the date the instrument is irrevocably established.",
        "Counting is discussed between Advancement Services and UA Senior Leadership case-by-case.",
        "IRREVOCABLE LIFE INCOME GIFTS (CRTS, POOLED INCOME, GIFT ANNUITIES):",
        "Counted at full market value if remainder value ≥ 25% per IRS tables.",
        "CRTs administered outside JU count if JU's interest is irrevocable and verifiable.",
        "BEQUESTS & TESTAMENTARY GIFTS:",
        "Counted at value received. If previously counted as an expectancy, only the excess above the previously credited amount is counted.",
        "Testamentary intentions by donors 65+ are counted at discounted present value when verifiable (written acknowledgment, copy of legal provisions).",
        "LIFE INSURANCE (JU MUST BE OWNER AND IRREVOCABLE BENEFICIARY):",
        "Paid-up policies: Counted at cash surrender value as a current outright gift.",
        "Existing not-fully-paid policies: Cash surrender value as outright gift + pledge of remaining premiums over 5 years.",
        "New policies: Pledge of premium payments over 5-year period at full value.",
        "Realized death benefits: Cash settlement minus any amounts previously counted.",
        "INSURANCE POLICY PROCESS:",
        "1. Donor makes JU the owner. Heritage Society form is completed.",
        "2. Donor gifts the annual premium amount to JU (or pays directly with documentation).",
        "3. Donor authorizes JU permissions on the insurance account for audit and statements.",
        "4. Advancement Services sends premium payment reminders.",
        "5. Advancement Services initiates payment via Controller's Office.",
        "6. Payment is made to the insurance company no less than 2 weeks before due date.",
        "7. Donor payment is applied to UA Gifts then transferred to operating budget for reimbursement.",
        "8. Standard acknowledgment procedures are followed.",
      ],
      examples: [
        {
          title: "Charitable Remainder Trust",
          content:
            "A donor establishes a $500,000 CRT with JU as irrevocable remainder beneficiary. The remainder value per IRS tables is 30% (≥ 25% threshold). The full $500,000 is counted in the campaign.",
        },
        {
          title: "Paid-Up Life Insurance",
          content:
            "A donor transfers ownership of a fully paid $250,000 life insurance policy to JU. Cash surrender value is $85,000. JU counts $85,000 as a current outright gift. The death benefit will be counted when realized, minus the $85,000 already credited.",
        },
        {
          title: "Realized Bequest",
          content:
            "JU receives $300,000 from a donor's estate. The donor's Heritage Society commitment was previously counted at $250,000 (discounted present value). Only the excess $50,000 is added to campaign totals.",
        },
      ],
      whyThisMatters:
        "Planned gifts often represent the largest individual gifts JU receives. Proper present-value reporting, insurance policy management, and bequest tracking ensure accurate campaign totals and long-term financial planning.",
      commonMistakes: [
        "Counting planned gifts at face value instead of present value",
        "Double-counting bequests that were previously counted as expectancies",
        "Not verifying JU is the owner AND irrevocable beneficiary of life insurance",
        "Missing premium payments on donor-gifted life insurance policies",
        "Not authorizing JU access to insurance accounts for audit purposes",
      ],
      relatedArticles: [
        "campaign-overview",
        "heritage-society",
        "campaign-gift-types",
      ],
    },
  },
  {
    id: "campaign-exclusions",
    categoryId: "campaign-counting",
    title: "Campaign Exclusions & Reporting Rules",
    summary:
      "Certain funds must be excluded from campaign totals, including gifts from prior campaigns, investment earnings, earned income, and contributed services.",
    tags: [
      "exclusions",
      "reporting",
      "investment earnings",
      "earned income",
      "CASE",
    ],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "The following must be EXCLUDED from campaign report totals:",
        "1. Gifts or pledges already counted in previous campaigns, even if realized during the current campaign.",
        "2. Investment earnings on gifts, even if accrued during the campaign period.",
        "   Exception: Investment earnings on gifts never counted in a previous campaign CAN be counted.",
        "3. Earned income, including transfer payments from medical or analogous practice plans.",
        "   Exception: The charitable portion from fundraising events/activities is NOT earned income.",
        "4. Contributed services, except those permitted as a charitable deduction by the IRS.",
        "REPORTING RULES:",
        "Outright gifts should be reported only when assets are irrevocably transferred to JU.",
        "Deferred gifts should be reported when assets are transferred or when a legally binding agreement is executed.",
        "Verbal pledges should NOT be reported unless the SVP provides written approval with high confidence of receipt.",
        "Pledges must commit to a specific dollar amount on a fixed schedule, not exceeding 5 years.",
        "A pledge received on the last day of the campaign counts and may be paid over 5 years.",
        "Prior approval by the Gift Acceptance Committee or senior staff is required for all gifts other than cash, publicly traded securities, or certain whole life insurance policies.",
      ],
      examples: [
        {
          title: "Prior Campaign Gift Excluded",
          content:
            "A $200,000 pledge was counted in the ASPIRE campaign. The final $50,000 payment is received during FUTURE.MADE. The $50,000 payment is NOT counted in FUTURE.MADE. because the pledge was already fully counted in ASPIRE.",
        },
        {
          title: "Investment Earnings Exception",
          content:
            "The Harold Ashley endowment was never counted in any previous campaign. Investment earnings from this endowment during the campaign period CAN be counted in campaign totals.",
        },
        {
          title: "Event Revenue — Not Earned Income",
          content:
            "JU's annual gala raises $75,000. The charitable portion above fair market value of the event is NOT earned income and IS countable in the campaign.",
        },
      ],
      whyThisMatters:
        "Strict exclusion rules prevent double-counting and inflated campaign totals. Compliance with CASE standards ensures JU's campaign results are credible and comparable to peer institutions.",
      commonMistakes: [
        "Counting gifts that were already counted in a prior campaign",
        "Including investment earnings on previously counted gifts",
        "Counting verbal pledges without SVP written approval",
        "Including contributed services that don't qualify for IRS charitable deduction",
      ],
      relatedArticles: [
        "campaign-overview",
        "campaign-gift-types",
        "campaign-funding-pillars",
      ],
    },
  },
  {
    id: "historical-campaigns",
    categoryId: "campaign-counting",
    title: "Historical Campaigns",
    summary:
      "A reference guide to JU's past and current fundraising campaigns, including FUTURE.MADE., ASPIRE, and PACE — with dates, goals, and leadership.",
    tags: ["FUTURE.MADE.", "ASPIRE", "PACE", "campaign history", "President"],
    lastUpdated: "2026-03-06",
    sections: {
      rulesStandards: [
        "FUTURE.MADE. — 07/01/2019 to Present. President Tim Cost.",
        "ASPIRE — 01/01/2009 to 06/30/2019. Goal: $120M. Raised: $121,439,861.",
        "ASPIRE Funding Priorities: Advancing Scholarships & Academics, Brooks Rehabilitation College of Healthcare Sciences, Campus & Student Life Enhancements, Athletics, Financial Vitality.",
        "ASPIRE Presidents: Kerry Romesburg (2004–2013), Tim Cost (2013–Present).",
        "PACE (Planned Action for a Center of Excellence) — 1969–1979. $26M campaign for capital improvements. President Spiro.",
        "Note: Campaign start/end dates should be verified — there is an internal discussion about whether ASPIRE ended 6/30/2018 and FUTURE.MADE. began 7/1/2018.",
      ],
      examples: [
        {
          title: "ASPIRE Campaign Results",
          content:
            "The ASPIRE campaign ran from 2009–2019 with a goal of $120M across 5 funding pillars. It exceeded its goal, raising $121,439,861. This is a reference point for campaign planning and donor stewardship conversations.",
        },
      ],
      whyThisMatters:
        "Understanding JU's campaign history provides context for current fundraising goals, helps prevent double-counting gifts across campaigns, and supports meaningful donor conversations about institutional progress.",
      commonMistakes: [
        "Counting a gift in the current campaign that was already credited to ASPIRE",
        "Using incorrect campaign dates when determining if a gift falls within the campaign period",
        "Not verifying campaign dates when gifts fall near campaign boundaries",
      ],
      relatedArticles: ["campaign-overview", "campaign-exclusions"],
    },
  },
];
