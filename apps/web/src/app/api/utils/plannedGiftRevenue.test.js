import { describe, expect, it, vi } from "vitest";

vi.mock("./blackbaud.js", () => ({
  listBlackbaudRealizedPlannedGiftRevenueGifts: vi.fn(),
}));

vi.mock("./reportCache.js", () => ({
  getCachedReportSnapshot: vi.fn(),
  saveReportSnapshot: vi.fn(),
}));

import {
  getBlackbaudGiftId,
  getEmbeddedRealizedPlannedGiftIds,
  getRealizedPlannedGiftIds,
} from "./plannedGiftRevenue.js";
import { listBlackbaudRealizedPlannedGiftRevenueGifts } from "./blackbaud.js";

describe("planned gift revenue reconciliation", () => {
  it("uses only explicit relationships already present in a gift response", () => {
    const realizedPlannedGiftIds = getEmbeddedRealizedPlannedGiftIds([
      {
        id: "planned-1",
        gift_type: "Planned Gift",
        realized_revenue_gifts: [{ id: "revenue-1" }],
      },
      {
        id: "revenue-2",
        gift_type: "Realized Planned Gift Revenue",
        planned_gift_id: "planned-2",
      },
      {
        id: "unrelated-planned-gift",
        gift_type: "Planned Gift",
        amount: { value: 2500000 },
      },
      {
        id: "non-revenue-related-gift",
        gift_type: "Pledge payment",
        planned_gift_id: "must-not-be-excluded",
      },
    ]);

    expect([...realizedPlannedGiftIds].sort()).toEqual([
      "planned-1",
      "planned-2",
    ]);
  });

  it("does not turn a missing identifier into a valid gift ID", () => {
    expect(getBlackbaudGiftId({ gift_type: "Planned Gift" })).toBe("");
  });

  it.each([429, 403])("propagates HTTP %i rather than persisting incomplete nightly giving", async (httpStatus) => {
    const error = Object.assign(new Error("Provider pause"), { httpStatus, retryAfterMs: 30000 });
    listBlackbaudRealizedPlannedGiftRevenueGifts.mockRejectedValue(error);
    await expect(getRealizedPlannedGiftIds({
      gifts: [{ id: `strict-${httpStatus}`, gift_type: "Planned Gift" }],
      userId: 7, origin: "https://example.com", strict: true,
    })).rejects.toBe(error);
  });

  it("flags an incomplete bounded relationship pass in strict nightly mode", async () => {
    await expect(getRealizedPlannedGiftIds({
      gifts: [{ id: "strict-limit", gift_type: "Planned Gift" }],
      userId: 7, origin: "https://example.com", strict: true, maxNetworkLookups: 0,
    })).rejects.toThrow("lookup limit");
  });
});
