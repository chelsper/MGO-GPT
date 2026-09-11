import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  sql: vi.fn(), lookup: vi.fn(), email: vi.fn(), search: vi.fn(), fundraiser: vi.fn(),
}));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
vi.mock("@/app/api/utils/blackbaud", () => ({
  findBlackbaudConstituentByLookupId: mocks.lookup,
  findBlackbaudConstituentByEmail: mocks.email,
  searchBlackbaudConstituents: mocks.search,
  getBlackbaudFundraiserById: mocks.fundraiser,
}));
import { resolveActionFundraiserIds } from "./actionFundraisers";

const args = {
  currentUser: { id: 2, name: "Admin", blackbaud_constituent_id: "800" },
  primaryFundraiserUser: { id: 44, name: "MGO", blackbaud_constituent_id: "234684" },
  requirePrimaryFundraiser: true, apiUserId: 44, origin: "https://example.com",
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.sql.mockResolvedValue([]);
  mocks.search.mockResolvedValue([]);
  mocks.fundraiser.mockImplementation(async ({ fundraiserId }) => ({ fundraiserId }));
});
it("uses the Admin connection, but assigns the selected MGO and deduplicates an identical additional MGO", async () => {
  expect(await resolveActionFundraiserIds({ ...args, additionalFundraiserUserId: "44" })).toEqual(["234684"]);
  expect(mocks.fundraiser).toHaveBeenCalledWith(expect.objectContaining({
    userId: 44, authUserId: 2, fundraiserId: "234684",
  }));
  expect(mocks.sql).not.toHaveBeenCalled();
});
it("does not fall back to Admin credit when the MGO mapping is missing", async () => {
  await expect(resolveActionFundraiserIds({ ...args, primaryFundraiserUser: { id: 44, name: "MGO" } }))
    .rejects.toThrow("selected MGO");
  expect(mocks.fundraiser).not.toHaveBeenCalled();
});
it("requires verification of the MGO fundraiser for delegated entry", async () => {
  mocks.fundraiser.mockRejectedValue(new Error("NXT access unavailable"));
  await expect(resolveActionFundraiserIds(args)).rejects.toThrow("Blackbaud mapping");
});
it("preserves existing own-workspace behavior", async () => {
  mocks.fundraiser.mockRejectedValue(new Error("NXT access unavailable"));
  expect(await resolveActionFundraiserIds({ ...args, requirePrimaryFundraiser: false })).toEqual(["234684"]);
});
