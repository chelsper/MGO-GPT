import { expect, it } from "vitest";
import {
  buildProspectTimeline,
  getLinkedGiftTotal,
  getOpportunityDisplayAmount,
  getOpportunityDisplayStatus,
  hasOpportunityFundedAmount,
  getSubmissionTimelineDescription,
} from "./prospectDetailPresentation";

it("retains event identities and source-specific dates in newest-first timeline order", () => {
  const update = {
    id: 1,
    update_date: "2026-09-01",
    created_at: "2026-09-10",
    action_category: "Phone Call",
    action_type: "Cultivation",
  };
  const submission = {
    id: 1,
    submission_type: "opportunity_update",
    date_submitted: "2026-08-01",
    updated_at: "2026-09-01",
    reviewed_at: "2026-09-02",
    next_step: "Arrange visit",
    status: "Needs Clarification",
    reviewer_notes: "Confirm date",
    reviewer_name: "Reviewer",
  };
  const events = buildProspectTimeline([update], [submission]);
  expect(events.map(({ id }) => id)).toEqual(["submission-1", "progress-1"]);
  expect(events[0]).toMatchObject({
    occurredAt: "2026-09-02",
    title: "Opportunity update",
    description: "Arrange visit",
    reviewerNotes: "Confirm date",
    accent: "#B45309",
  });
  expect(events[0].raw).toBe(submission);
  expect(events[0].meta).toContain("Reviewer note from Reviewer");
  expect(events[1].meta).toContain("Phone Call");
  expect(events[1].raw).toBe(update);
});

it("retains submission text fallback rather than replacing saved content", () => {
  expect(
    getSubmissionTimelineDescription({
      submission_type: "donor_update",
      transcript: "Spoken notes",
    }),
  ).toBe("Spoken notes");
  expect(
    getSubmissionTimelineDescription({
      submission_type: "constituent_suggestion",
      organization: "Foundation",
    }),
  ).toBe("Foundation");
  expect(buildProspectTimeline([], [])).toEqual([]);
});

it("preserves linked-gift precedence and missing versus zero funded amounts", () => {
  const funded = {
    current_stage: "Funded",
    closed_amount: 500,
    estimated_amount: 1000,
  };
  expect(getOpportunityDisplayAmount(funded)).toBe(500);
  expect(
    getOpportunityDisplayAmount({
      ...funded,
      linked_gifts: [{ gift_amount: 0 }],
    }),
  ).toBe(0);
  expect(
    getOpportunityDisplayAmount({
      ...funded,
      linked_gifts: [
        { gift_amount: 100 },
        { gift_amount: "200" },
        { gift_amount: "invalid" },
      ],
    }),
  ).toBe(300);
  expect(
    getLinkedGiftTotal({ linked_gifts: [{ gift_amount: "invalid" }] }),
  ).toBeNull();
  expect(hasOpportunityFundedAmount({ closed_amount: 0 })).toBe(true);
  expect(hasOpportunityFundedAmount({})).toBe(false);
});

it("preserves active, funded, and declined classification", () => {
  expect(getOpportunityDisplayStatus({ current_stage: "Cultivation" })).toBe(
    "Cultivation",
  );
  expect(getOpportunityDisplayStatus({ current_stage: "Funded" })).toBe(
    "Funded",
  );
  expect(
    getOpportunityDisplayAmount({
      current_stage: "Declined",
      estimated_amount: 1000,
    }),
  ).toBe(0);
  expect(
    getOpportunityDisplayAmount({
      current_stage: "Solicitation",
      estimated_amount: 1000,
    }),
  ).toBe(1000);
});
