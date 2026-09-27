import { describe, expect, it } from "vitest";
import { buildDonorBriefing } from "./donorBriefing";

const now = new Date("2026-09-27T16:00:00Z");
const checkedAt = "2026-09-26T12:00:00Z";
const summary = {
  constituentId: "100", summaryRefreshedAt: "2026-09-20T12:00:00Z", givingRefreshedAt: checkedAt,
  mapped: {
    constituent: { id: "100", name: "Alex Donor" },
    jacksonvilleUniversityEducation: [{ school: "Jacksonville University", classOf: "2008" }],
    lifetimeGiving: { totalGiving: 125000 },
    prospectSummaryNarrative: "Invented donor intent and outdated giving figures.",
    proposalSummary: [{ estimated_amount: 9999999 }],
  },
};
const build = props => buildDonorBriefing({ constituentId: "100", now, ...props });
const section = (props, key) => build(props).find(item => item.key === key);

describe("saved donor briefing", () => {
  it("uses natural factual language and separate check dates, not old prose", () => {
    const result = build({ summary, activity: {
      gift: { date: "2026-09-24", checkedAt, amount: 1200 },
      action: { date: "2026-09-22", checkedAt, summary: "Discussed the campus visit" },
    } });
    expect(result.map(item => item.text)).toEqual([
      "Alex Donor's saved education record lists Jacksonville University, class of 2008.",
      "Recorded lifetime giving is $125,000.00.",
      "The latest saved gift was $1,200.00, dated Sep 24, 2026.",
      "The latest saved action is dated Sep 22, 2026: Discussed the campus visit.",
    ]);
    expect(result[0].source).toBe("NXT summary · Checked Sep 20, 2026");
    expect(result[1].source).toBe("NXT giving summary · Checked Sep 26, 2026");
    expect(JSON.stringify(result)).not.toMatch(/Invented|9999999|interested|recommend/);
  });

  it("does not manufacture unknown history, amounts, or dates", () => {
    expect(build({ summary: { mapped: { prospectSummaryNarrative: "No action in years" } } })).toEqual([]);
    const result = build({ summary: { mapped: { lifetimeGiving: { totalGiving: null } } }, activity: {
      gift: { date: "2026-09-24", checkedAt, amount: null },
      action: { date: "2026-09-24", checkedAt },
    } });
    expect(result.map(item => item.text)).toEqual([
      "The latest saved gift is dated Sep 24, 2026.",
      "The latest saved action is dated Sep 24, 2026.",
    ]);
  });

  it.each([null, "", "not a number", -1, Infinity, true])("omits invalid giving amounts: %s", value => {
    expect(build({ summary: { mapped: { lifetimeGiving: { totalGiving: value } } } })).toEqual([]);
  });
  it("keeps a verified zero distinct from missing giving", () => {
    expect(section({ summary: { mapped: { lifetimeGiving: { totalGiving: 0 } } } }, "giving").text).toBe("Recorded lifetime giving is $0.00.");
  });
  it.each([
    { ...summary, constituentId: "other" },
    { ...summary, mapped: { ...summary.mapped, constituent: { id: "other" } } },
  ])("rejects background for another constituent", invalid => expect(build({ summary: invalid })).toEqual([]));
  it("omits failed summary sections while keeping other saved facts", () => {
    expect(build({ summary: { ...summary, warnings: { education: "Unavailable", lifetimeGiving: "Unavailable" } } })).toEqual([]);
  });
  it.each([
    { date: "2026-09-28", checkedAt },
    { date: "2026-02-30", checkedAt },
    { date: "2026-09-20", checkedAt: "2026-09-28T12:00:00Z" },
    { date: "2026-09-20", checkedAt: null },
  ])("does not describe invalid or future actions as past interactions", action => {
    expect(build({ activity: { action } })).toEqual([]);
  });
  it("uses the later activity check without borrowing a prior gift amount", () => {
    const gift = section({ activity: { gift: { date: "2026-09-24", checkedAt, amount: 5000 } },
      recentActivity: { gift: { data: { date: "2026-09-23", amount: null }, fetchedAt: now.toISOString() } },
    }, "gift");
    expect(gift.text).toBe("The latest saved gift is dated Sep 23, 2026.");
  });
  it("uses newer local actions but not notes, opportunities, or planned future actions", () => {
    const props = { activity: { action: { date: "2026-09-20", checkedAt, summary: "Older NXT call" } }, localActions: [
      { id: 1, update_date: "2026-09-22", action_category: "Phone call", update_title: "Thank-you call" },
      { id: 2, update_date: "2026-09-25", update_title: "Opportunity edited" },
      { id: 3, update_date: "2026-09-28", action_category: "Phone call", update_title: "Future call" },
    ] };
    expect(section(props, "action")).toMatchObject({ text: "The latest action saved in the app is dated Sep 22, 2026: Thank-you call.", source: "Saved app activity" });
  });
  it("uses loaded opportunities instead of the limited saved proposal sample", () => {
    const open = { id: 1, blackbaud_opportunity_id: "nxt-1", current_stage: "Cultivation", estimated_amount: "25000", title: "Scholarship", expected_date: "2026-10-15" };
    const result = section({ summary, opportunities: [open, { ...open, id: 2 },
      ...["Funded", "Declined", "Withdrawn", "Archived", "Inactive"].map((current_stage, index) => ({ id: index + 3, current_stage, estimated_amount: 9999 })),
    ] }, "opportunities");
    expect(result.text).toBe("There is 1 open opportunity in the saved app records, totaling $25,000.00. Scholarship is in Cultivation, with an expected date of Oct 15, 2026.");
    expect(section({ summary, opportunities: [] }, "opportunities")).toBeUndefined();
  });
  it("does not total partially priced opportunities", () => {
    const result = section({ opportunities: [{ id: 1, current_stage: "Cultivation", estimated_amount: null }, { id: 2, current_stage: "Solicitation", estimated_amount: 1000 }] }, "opportunities");
    expect(result.text).toBe("There are 2 open opportunities in the saved app records.");
  });
  it("uses portfolio signals without inventing missing totals or counts", () => {
    expect(section({ signal: { hasOpen: true, openCount: null, amount: null } }, "opportunities").text).toBe("The saved app records include open opportunities.");
  });
  it("qualifies stale or incomplete pledge reports and preserves cents", () => {
    const result = section({ pledgeStatus: { count: 2, balanceCents: 123456, nextPaymentDueDate: "2026-10-01", verifiedAt: checkedAt }, pledgeIncomplete: true }, "pledges");
    expect(result.text).toBe("The saved pledge report lists 2 active pledges with $1,234.56 remaining. The next payment date listed is Oct 1, 2026. Confirm the current pledge details before outreach.");
  });
  it("shows only an explicitly open next step, never a generated recommendation", () => {
    const nextStep = { status: "Open", title: "Call about the visit", due_date: "2026-10-02" };
    expect(section({ nextStep }, "next-step").text).toBe("Call about the visit. Due Oct 2, 2026.");
    expect(build({ nextStep: { ...nextStep, status: "Completed" } })).toEqual([]);
    expect(build({ nextStep: { ...nextStep, completed_at: checkedAt } })).toEqual([]);
    expect(build({ nextStep: null, signal: { nextStep: "Old step" } })).toEqual([]);
  });
});
