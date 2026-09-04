import { it, expect, vi } from "vitest";
vi.mock("./blackbaud", () => ({ listBlackbaudOpportunities: vi.fn() }));
import { listBlackbaudOpportunities } from "./blackbaud";
import { getReportGiftOpportunities, isOpenNxtOpportunity, giftBelongsToConstituent } from "./reportGiftOpportunities";

it.each(["Funded", "Closed - Gift Secured", "Closed – Declined", "Declined", "Cancelled", "Lost", "Completed", ""])("excludes %s opportunities", (status) => {
  expect(isOpenNxtOpportunity({ id: "1", status })).toBe(false);
});
it("excludes inactive and funded records but includes open stewardship and qualification", () => {
  expect(isOpenNxtOpportunity({ id: "1", status: "Stewardship" })).toBe(true);
  expect(isOpenNxtOpportunity({ id: "1", status: "Qualification" })).toBe(true);
  expect(isOpenNxtOpportunity({ id: "1", status: "Solicitation", inactive: true })).toBe(false);
  expect(isOpenNxtOpportunity({ id: "1", status: "Solicitation", funded_amount: { value: 500 } })).toBe(false);
});
it("filters, de-duplicates, batches and caches only the requested constituents", async () => {
  listBlackbaudOpportunities.mockResolvedValue([
    { id: "1", constituent_id: "100", status: "Solicitation", name: "Test" },
    { id: "1", constituent_id: "100", status: "Solicitation", name: "Test" },
    { id: "2", constituent_id: "200", status: "Funded" },
    { id: "3", constituent_id: "999", status: "Cultivation" },
  ]);
  const result = await getReportGiftOpportunities(["100", "200"], { userId: 20, authUserId: 20 });
  expect(result["100"]).toHaveLength(1);
  expect(result["200"]).toEqual([]);
  expect(result["999"]).toBeUndefined();
  await getReportGiftOpportunities(["200", "100"], { userId: 20, authUserId: 20 });
  expect(listBlackbaudOpportunities).toHaveBeenCalledTimes(1);
  expect(listBlackbaudOpportunities).toHaveBeenCalledWith(expect.objectContaining({ searchParams: { constituent_id: ["100", "200"] }, strictResponse: true }));
});
it("does not cache a failed check as an empty opportunity list", async () => {
  listBlackbaudOpportunities.mockRejectedValueOnce(new Error("429")).mockResolvedValueOnce([]);
  await expect(getReportGiftOpportunities(["300"], { userId: 21 })).rejects.toThrow("429");
  expect(await getReportGiftOpportunities(["300"], { userId: 21 })).toEqual({ "300": [] });
});
it("associates the same gift with the hard donor and soft recipient, never another constituent", () => {
  const gift = { constituent_id: "100", soft_credits: [{ constituent_id: "200" }] };
  expect(giftBelongsToConstituent(gift, "100")).toBe(true);
  expect(giftBelongsToConstituent(gift, "200")).toBe(true);
  expect(giftBelongsToConstituent(gift, "300")).toBe(false);
});
