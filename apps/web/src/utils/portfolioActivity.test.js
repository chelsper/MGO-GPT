import { expect, it } from "vitest";
import { savedPortfolioActivityDate } from "./portfolioActivity";

const now = new Date("2026-09-15T19:00:00Z");
const saved = { date: "2026-08-31", checkedAt: "2026-09-14T12:00:00Z" };

it("preserves saved calendar dates and original check times even when old", () => {
  expect(savedPortfolioActivityDate(saved, now)).toEqual({ ...saved, checkedAt: "2026-09-14T12:00:00.000Z" });
  expect(savedPortfolioActivityDate({ date: "2001-12-31", checkedAt: "2002-01-01T12:00:00Z" }, now)?.date).toBe("2001-12-31");
});

it.each([
  null, {}, { date: null }, { ...saved, date: "2026-02-30" },
  { ...saved, date: "not a date" }, { ...saved, checkedAt: null },
  { ...saved, checkedAt: "invalid" }, { ...saved, checkedAt: "2099-09-15T12:00:00Z" },
  { ...saved, checkedAt: "2026-02-30T12:00:00Z" },
  { ...saved, date: "2026-09-15" }, { ...saved, date: "2027-01-01" },
  { ...saved, date: "2026-09-14", checkedAt: "2026-09-14T02:00:00Z" },
])("does not label unavailable, malformed, or future activity as the latest: %j", (value) => {
  expect(savedPortfolioActivityDate(value, now)).toBeNull();
});
