import { expect, it } from "vitest";
import { portfolioFreshnessStatus } from "./portfolioFreshnessStatus";
const now = Date.parse("2026-10-01T12:00:00Z");
const row = (id, checked = "2026-10-01T10:00:00Z") => ({ constituent_id: id,
  summary_payload: {}, giving_payload: {}, giving_refreshed_at: checked, stale_after: "2026-10-05" });
it("uses the oldest successful giving check, not job completion or newest record", () => {
  expect(portfolioFreshnessStatus(["1", "2"], [row("1"), row("2", "2026-09-30T12:00:00Z")], now))
    .toEqual({ missing: 0, delayed: 0, givingUpdatedAt: "2026-09-30T12:00:00.000Z" });
});
it.each([null, "invalid", "2026-10-02T00:00:00Z"])("does not show a whole-portfolio timestamp for an unverified check: %s", checked => {
  expect(portfolioFreshnessStatus(["1", "2"], [row("1"), row("2", checked)], now))
    .toEqual({ missing: 1, delayed: 0, givingUpdatedAt: null });
});
it("counts missing records and missing payloads, independently of delayed saved data", () => {
  expect(portfolioFreshnessStatus(["1", "2", "3"], [row("1", "2026-09-28"), { ...row("2"), giving_payload: null }], now))
    .toEqual({ missing: 2, delayed: 1, givingUpdatedAt: null });
});
it("notices giving older than 48 hours or summaries over a day past their weekly deadline", () => {
  expect(portfolioFreshnessStatus(["1", "2"], [row("1", "2026-09-29T12:00:00Z"), { ...row("2"), stale_after: "2026-09-30T11:59:59Z" }], now).delayed).toBe(1);
});
