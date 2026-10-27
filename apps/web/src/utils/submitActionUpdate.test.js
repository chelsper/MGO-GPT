import { afterEach, expect, it, vi } from "vitest";
import { submitActionUpdate } from "./submitActionUpdate";
afterEach(() => vi.unstubAllGlobals());
it("retains the full form's prospect fields and opportunity override", async () => {
  const body = { summary: "Call", notes: "Details", nextStep: "Visit", nextActionDueDate: "2026-11-01", additionalFundraiserUserId: 8 };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ update: { id: 9 } }) }));
  const result = await submitActionUpdate(body, { prospectId: 7, linkedOpportunityIdOverride: 12 });
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ ...body, linkedOpportunityId: 12 });
  expect(result).toMatchObject({ actionEndpoint: "/api/prospects/7/actions", actionResolvedProspectId: 7, action: { update: { id: 9 } } });
});
it("passes donor update data unchanged", async () => {
  const body = { donorName: "Fictional", blackbaudConstituentId: "100", transcript: "Transcript", attachments: [] };
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: 9 }) }));
  await submitActionUpdate(body);
  expect(fetch.mock.calls[0][0]).toBe("/api/submissions/donor-update");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual(body);
});
it("propagates durable receipts without retrying", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ error: "Protected", writeReceipt: { id: "12" } }) }));
  await expect(submitActionUpdate({})).rejects.toMatchObject({ message: "Protected", writeReceipt: { id: "12" }, notSubmitted: false });
  expect(fetch).toHaveBeenCalledTimes(1);
});
