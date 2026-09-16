import { expect, it } from "vitest";
import { validNextStepActionDate } from "./actionEntryOptions";

it.each([
  ["planned", "2026-09-18", true], ["planned", "2026-09-16", true], ["planned", "2026-09-15", false],
  ["completed", "2026-09-15", true], ["completed", "2026-09-16", true], ["completed", "2026-09-18", false],
  ["", "2026-09-16", false], [undefined, "2026-09-16", false], ["other", "2026-09-16", false],
  ["planned", "2026-02-30", false], ["completed", "2026-02-30", false], ["planned", "", false],
])("validates %s date %s against the Eastern calendar date", (intent, date, expected) => {
  expect(validNextStepActionDate(intent, date, "2026-09-16")).toBe(expected);
});
