import { expect, it } from "vitest";
import { portfolioActivityFields, portfolioActivityDetailsEnvelope, savedPortfolioActivity, savedPortfolioActivityDate } from "./portfolioActivity";

const now = new Date("2026-09-15T19:00:00Z");
const saved = { date: "2026-08-31", checkedAt: "2026-09-14T12:00:00Z" };

it("preserves a real zero but never coerces missing or malformed gift amounts", () => {
  expect(portfolioActivityFields({ amount: 0, summary: "not a gift field" }, "gift")).toEqual({ amount: 0 });
  for (const amount of [undefined, null, "0", "100", {}, NaN, Infinity]) {
    expect(portfolioActivityFields({ amount }, "gift")).toEqual({});
  }
});

it("keeps only a bounded plain-text action summary", () => {
  expect(portfolioActivityFields({ summary: "  Call\u0000 donor\nAbout pledge  ", notes: "private", amount: 200 }, "action"))
    .toEqual({ summary: "Call donor\nAbout pledge" });
  expect(portfolioActivityFields({ summary: "x".repeat(5000) }, "action").summary).toHaveLength(2000);
  for (const summary of [null, {}, 12, "   "]) expect(portfolioActivityFields({ summary }, "action")).toEqual({});
});

it("binds optional details to the exact kind, record, date and successful check", () => {
  const entry = { id: "g", ...saved, amount: 15.25, notes: "omit" };
  const details = portfolioActivityDetailsEnvelope(entry, "gift");
  expect(details).toEqual({ version: 1, kind: "gift", id: "g", ...saved, checkedAt: "2026-09-14T12:00:00.000Z", amount: 15.25 });
  const options = { now, requireBoundDetails: true };
  const dateOnly = savedPortfolioActivityDate(saved, now);
  expect(savedPortfolioActivity({ ...entry, details }, "gift", options)).toEqual({ ...dateOnly, amount: 15.25 });
  for (const override of [{ id: "old" }, { kind: "action" }, { version: 2 }, { date: "2020-01-01" },
    { checkedAt: "2026-09-13T12:00:00Z" }]) {
    expect(savedPortfolioActivity({ ...entry, details: { ...details, ...override } }, "gift", options)).toEqual(dateOnly);
  }
  expect(savedPortfolioActivity(entry, "gift", options)).toEqual(dateOnly);
  expect(savedPortfolioActivity(entry, "gift", { now })).toEqual({ ...dateOnly, amount: 15.25 });
  expect(portfolioActivityDetailsEnvelope({ id: null, date: null, checkedAt: saved.checkedAt, amount: 100 }, "gift")).toBeNull();
  expect(portfolioActivityDetailsEnvelope({ id: "g", ...saved }, "gift")).toBeNull();
});

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
