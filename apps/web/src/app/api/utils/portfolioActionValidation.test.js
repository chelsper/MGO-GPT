import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { validatePortfolioAction } from "./portfolioActionValidation";
const context = { sessionUser: { id: 2 }, workspaceUser: { id: 44 } };
const valid = () => ({ portfolioContext: { viewerId: 2, workspaceId: 44, constituentId: "100" },
  actionDate: "2026-01-12", actionCategory: "Meeting", interactionType: "Cultivation", summary: "Discussed scholarships" });
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-27T12:00:00Z")); });
afterEach(() => vi.useRealTimers());
it("leaves legacy callers unchanged", () => expect(validatePortfolioAction({}, context, "100")).toBeNull());
it("accepts the pinned workspace, recipient and a completed action", () => expect(validatePortfolioAction(valid(), context, "100")).toBeNull());
it.each([
  ["viewerId", 3], ["workspaceId", 45], ["constituentId", "101"], ["constituentId", "lookup-code"],
])("rejects a changed %s before writing", async (key, value) => {
  const body = valid(); body.portfolioContext[key] = value;
  const result = validatePortfolioAction(body, context, "100");
  expect(result.status).toBe(409);
  expect(await result.json()).toMatchObject({ notSubmitted: true });
});
it.each([
  ["actionDate", "2026-02-30"], ["actionDate", "2026-10-28"], ["actionDate", ""],
  ["actionCategory", "Invalid"], ["interactionType", "Invalid"], ["summary", "  "],
  ["summary", "a".repeat(256)], ["notes", "x".repeat(10001)], ["notes", {}],
])("rejects invalid %s", (key, value) => expect(validatePortfolioAction({ ...valid(), [key]: value }, context, "100").status).toBe(400));
