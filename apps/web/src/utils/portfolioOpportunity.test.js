import { afterEach, expect, it, vi } from "vitest";
import { portfolioOpportunityValidation, PORTFOLIO_OPPORTUNITY_STAGES, DEFAULT_OPPORTUNITY_PURPOSE } from "./portfolioOpportunity";
import { submitOpportunityUpdate } from "./submitOpportunityUpdate";

const valid = { opportunityTitle: "Scholarship gift", purpose: DEFAULT_OPPORTUNITY_PURPOSE,
  opportunityStage: "Cultivation", askAmount: 25000.29, expectedDate: "2028-02-29" };
afterEach(() => vi.unstubAllGlobals());
it.each(PORTFOLIO_OPPORTUNITY_STAGES)("accepts open stage %s", opportunityStage => {
  expect(portfolioOpportunityValidation({ ...valid, opportunityStage })).toBeNull();
});
it.each([0, 0.01, 0.29, 999999999999.99])("accepts amount %s without floating-point rounding errors", askAmount => {
  expect(portfolioOpportunityValidation({ ...valid, askAmount })).toBeNull();
});
it.each([
  { opportunityTitle: " " }, { opportunityTitle: "x".repeat(256) }, { purpose: "" },
  { opportunityStage: "Funded" }, { opportunityStage: "Declined" },
  { askAmount: null }, { askAmount: "10" }, { askAmount: -1 }, { askAmount: 1.00001 },
  { askAmount: NaN }, { askAmount: Infinity }, { askAmount: 1e12 },
  { expectedDate: "2026-02-29" }, { expectedDate: "2026-13-01" }, { expectedDate: "2026-01-01T12:00:00Z" },
  { askDate: "2026-02-30" }, { notes: {} }, { notes: "x".repeat(10001) },
])("rejects invalid form values %j", change => expect(portfolioOpportunityValidation({ ...valid, ...change })).toEqual(expect.any(String)));

it("uses the existing writer without dropping advanced full-form fields", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 9 }) }));
  const body = { ...valid, linkedOpportunityId: 4, jointMgoUserIds: [5], attachments: [{ url: "fictional" }] };
  expect(await submitOpportunityUpdate(body)).toEqual({ id: 9 });
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/submissions/opportunity-update", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
});
it.each([true, false])("preserves the server's explicit not-submitted flag (%s) and recovery receipt", async notSubmitted => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Hold", notSubmitted, writeReceipt: { id: "900" } }) }));
  await expect(submitOpportunityUpdate(valid)).rejects.toMatchObject({ message: "Hold", notSubmitted, writeReceipt: { id: "900" } });
});
