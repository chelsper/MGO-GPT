import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./blackbaud", () => ({
  blackbaudApiFetch: vi.fn(),
  getBlackbaudFundraiserById: vi.fn(),
}));
import { blackbaudApiFetch, getBlackbaudFundraiserById } from "./blackbaud";
import {
  currentLeadAssignments,
  readCurrentLead,
} from "./listCurrentFundraiser";
const row = {
  id: "1",
  constituent_id: "100",
  fundraiser_id: "20",
  type: "Lead Solicitor",
};
const context = () => ({
  user: { id: 1 },
  origin: "https://example.test",
  constituentId: "100",
  types: ["Lead Solicitor"],
  asOf: "2026-09-19",
  names: {},
});
beforeEach(() => {
  vi.clearAllMocks();
  blackbaudApiFetch.mockResolvedValue({ count: 1, value: [row] });
  getBlackbaudFundraiserById.mockImplementation(async ({ fundraiserId }) => ({
    fundraiserId,
    name: `Fundraiser ${fundraiserId}`,
  }));
});
it("excludes historical, future, secondary and explicitly inactive assignments; includes date boundaries", () => {
  const rows = [
    row,
    { ...row, end: "2026-09-18" },
    { ...row, start: "2026-09-20" },
    { ...row, type: "Secondary Solicitor" },
    { ...row, inactive: true },
    { ...row, start: "2026-09-19T00:00:00Z", end: "2026-09-19T00:00:00Z" },
  ];
  expect(
    currentLeadAssignments(rows, ["lead solicitor"], "2026-09-19"),
  ).toEqual([rows[0], rows[5]]);
  expect(() =>
    currentLeadAssignments(
      [{ ...row, end: "bad" }],
      ["Lead Solicitor"],
      "2026-09-19",
    ),
  ).toThrow(/date/);
});
it("reads active assignments once per constituent and resolves each distinct fundraiser name once per job", async () => {
  blackbaudApiFetch.mockResolvedValue({
    count: 3,
    value: [row, row, { ...row, fundraiser_id: "21" }],
  });
  const args = context();
  expect(await readCurrentLead(args)).toBe("Fundraiser 20; Fundraiser 21");
  expect(await readCurrentLead(args)).toBe("Fundraiser 20; Fundraiser 21");
  expect(getBlackbaudFundraiserById).toHaveBeenCalledTimes(2);
  expect(blackbaudApiFetch).toHaveBeenCalledWith(
    "/constituent/v1/constituents/100/fundraiserassignments",
    expect.objectContaining({
      searchParams: { include_inactive: false },
      maxRetries: 0,
    }),
  );
});
it("returns blank only for a verified absence, not an incomplete response or failed lookup", async () => {
  blackbaudApiFetch.mockResolvedValueOnce({ count: 0, value: [] });
  expect(await readCurrentLead(context())).toBe("");
  for (const payload of [
    {},
    { count: 2, value: [row] },
    { value: [row], next_link: "more" },
    { value: [{ ...row, constituent_id: "999" }] },
  ]) {
    blackbaudApiFetch.mockResolvedValueOnce(payload);
    await expect(readCurrentLead(context())).rejects.toThrow();
  }
  getBlackbaudFundraiserById.mockResolvedValueOnce(null);
  await expect(readCurrentLead(context())).rejects.toThrow(/name/);
});
