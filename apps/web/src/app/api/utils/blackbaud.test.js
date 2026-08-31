import { describe, expect, it } from "vitest";

import {
  BlackbaudQuotaExceededError,
  buildBlackbaudQueryAvailableFieldsUrl,
  buildBlackbaudActionMetadataPayload,
  buildBlackbaudActionPayload,
  buildBlackbaudOpportunityPayload,
  isBlackbaudQuotaExceededError,
  normalizeBlackbaudActionType,
} from "./blackbaud";

describe("blackbaud action payload helpers", () => {
  it("uses the dedicated root metadata endpoint instead of a synthetic node zero", () => {
    expect(buildBlackbaudQueryAvailableFieldsUrl({ queryTypeId: 18 })).toBe(
      "https://api.sky.blackbaud.com/query/v2/querytypes/18/availablefields",
    );
    expect(buildBlackbaudQueryAvailableFieldsUrl({ queryTypeId: 18, nodeId: 4123 })).toBe(
      "https://api.sky.blackbaud.com/query/v2/querytypes/18/nodes/4123/availablefields",
    );
  });

  it("identifies a call-volume quota error without treating it as a retryable request", () => {
    const quotaError = new BlackbaudQuotaExceededError({
      message: "Blackbaud call-volume quota is temporarily unavailable.",
      retryAfterMs: 60_000,
    });

    expect(isBlackbaudQuotaExceededError(quotaError)).toBe(true);
    expect(isBlackbaudQuotaExceededError(new Error("Blackbaud request timed out"))).toBe(false);
    expect(quotaError.retryAfterMs).toBe(60_000);
  });

  it("uses an ISO timestamp for action creation and a date-only value for completion metadata", () => {
    const actionPayload = buildBlackbaudActionPayload({
      blackbaudConstituentId: "227949",
      actionDate: "2026-06-16",
      actionCategory: "Email",
      summary: "Shared campaign update",
      actionNotes: "Sent the spring campaign note.",
      nextStep: "Follow up next week",
      authorName: "Leslie M. Redd",
      fundraiserIds: ["800", " 172263 ", "", null],
    });

    const metadataPayload = buildBlackbaudActionMetadataPayload({
      actionDate: "2026-06-16",
      interactionType: "Cultivation",
      fundraiserIds: ["800"],
    });

    expect(actionPayload.date).toBe("2026-06-16T00:00:00.000Z");
    expect(actionPayload.completed).toBe(true);
    expect(actionPayload.completed_date).toBe("2026-06-16");
    expect(actionPayload.status).toBe("Completed");
    expect(actionPayload.fundraisers).toEqual(["800", "172263"]);
    expect(metadataPayload.completed).toBe(true);
    expect(metadataPayload.completed_date).toBe("2026-06-16");
    expect(metadataPayload.status).toBe("Completed");
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

  it("maps slash-delimited action types to NXT Actions table spacing", () => {
    const metadataPayload = buildBlackbaudActionMetadataPayload({
      actionDate: "2026-06-16",
      interactionType: "Qualification/Re-engagement",
      fundraiserIds: ["800"],
    });

    expect(normalizeBlackbaudActionType("Qualification/Re-engagement")).toBe(
      "Qualification / Re-engagement",
    );
    expect(normalizeBlackbaudActionType("Identification / Discovery")).toBe(
      "Identification / Discovery",
    );
    expect(metadataPayload.type).toBe("Qualification / Re-engagement");
    expect(metadataPayload.completed).toBe(true);
    expect(metadataPayload.status).toBe("Completed");
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

  it("maps funded opportunities to NXT funded status and funded fields", () => {
    const opportunityPayload = buildBlackbaudOpportunityPayload({
      blackbaudConstituentId: "227949",
      title: "Leadership Ask",
      purpose: "Future. Made. Campaign",
      currentStage: "Funded",
      opportunityStatus: "Closed – Gift Secured",
      estimatedAmount: 50000,
      closedAmount: 55000,
      closeDate: "2026-07-22",
    });

    expect(opportunityPayload).toMatchObject({
      constituent_id: "227949",
      name: "Leadership Ask",
      purpose: "Future. Made. Campaign",
      status: "Funded",
      expected_amount: { value: 50000 },
      funded_amount: { value: 55000 },
      funded_date: "2026-07-22T00:00:00Z",
    });
  });
});
