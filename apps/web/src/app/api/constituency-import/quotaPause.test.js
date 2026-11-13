import { expect, it } from "vitest";
import { normalizeQuotaPausedImportRow } from "./quotaPause";
it("preserves custom-field intent while paused and rebuilds held checks when quota resumes", () => {
  const input = { customField: { category: "Interest", value: "Science", date: "", comment: "" } };
  const row = { status: "Needs Review", matched_blackbaud_constituent_id: "123", preview: { input, nxtChecksPaused: true } };
  expect(normalizeQuotaPausedImportRow(row).preview.writePlan).toEqual([]);
  const resumed = normalizeQuotaPausedImportRow(row, { quotaPaused: false }).preview;
  expect(resumed.input).toEqual(input);
  expect(resumed.deferredHydration.customFields).toBe(true);
  expect(resumed.writePlan).toContainEqual(expect.objectContaining({ ...input.customField, type: "constituent_custom_field", requiresReview: true, action: "load_current" }));
});
