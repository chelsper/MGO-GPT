export function lifetimeFamilyPreviewFixture(keys = {}) {
  return {
    revision: keys.revision || "one", householdKey: keys.householdKey || "h".repeat(64), recordKey: keys.recordKey || "o".repeat(64),
    currentName: "Morgan & Taylor Example", organizationName: "Example Family Foundation", existingOrganizations: [],
    societies: [{ societyKey: "1934_club", societyName: "1934 Club", thresholdCents: 10000000,
      current: { totalCents: 8000000, supportedCents: 8000000, giftCount: 2 },
      organization: { totalCents: 11000000, supportedCents: 11000000, giftCount: 2 },
      combined: { totalCents: 13000000, supportedCents: 13000000, giftCount: 3, date: "2021-01-01", status: "provisional", reasons: [] },
      overlapCents: 6000000, counts: { all: 3, counted: 3, review: 0, excluded: 0 } }],
    sharedGifts: { total: 1, page: 0, pages: 1, pageSize: 20, items: [{ giftId: "101", recognition: [{ societyKey: "1934_club", outcome: "counted", cents: 6000000 }] }] },
  };
}
