import { describe, expect, it } from "vitest";

import {
  buildBlackbaudActionMetadataPayload,
  buildBlackbaudActionPayload,
  buildBlackbaudOpportunityPayload,
} from "./blackbaud";

describe("blackbaud action payload helpers", () => {
  it("uses an ISO timestamp for action creation and a date-only value for completion metadata", () => {
    const actionPayload = buildBlackbaudActionPayload({
      blackbaudConstituentId: "227949",
      actionDate: "2026-06-16",
      actionCategory: "Email",
      summary: "Shared campaign update",
      actionNotes: "Sent the spring campaign note.",
      nextStep: "Follow up next week",
      authorName: "Leslie M. Redd",
    });

    const metadataPayload = buildBlackbaudActionMetadataPayload({
      actionDate: "2026-06-16",
      interactionType: "Cultivation",
      fundraiserIds: ["800"],
    });

    expect(actionPayload.date).toBe("2026-06-16T00:00:00.000Z");
    expect(metadataPayload.completed_date).toBe("2026-06-16");
  });

  it("maps legacy mail actions to an active NXT action category", () => {
    const actionPayload = buildBlackbaudActionPayload({
      blackbaudConstituentId: "227949",
      actionDate: "2026-06-16",
      actionCategory: "Mail",
      summary: "Mailed campaign update",
    });

    expect(actionPayload.category).toBe("Task/Other");
  });

  it("maps closed declined opportunities to NXT declined status and completed-not-fulfilled purpose", () => {
    const opportunityPayload = buildBlackbaudOpportunityPayload({
      blackbaudConstituentId: "227949",
      title: "Leadership Ask",
      purpose: "Future. Made. Campaign",
      currentStage: "Solicitation",
      opportunityStatus: "Closed – Declined",
      estimatedAmount: 50000,
      closeDate: "2026-07-22",
    });

    expect(opportunityPayload).toMatchObject({
      constituent_id: "227949",
      name: "Leadership Ask",
      purpose: "Completed -- Not Fulfilled",
      status: "Declined",
      expected_amount: { value: 50000 },
    });
  });
});
