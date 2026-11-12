import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseImportDate } from "./importDate";
import { validateNewRecordContacts } from "./newConstituentImport";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-12T12:00:00Z")); });
afterEach(() => vi.useRealTimers());
it.each(["7/1/2026", "07/01/26", "2026-07-01", "2026-7-1", " 07/01/2026 "])("accepts %s consistently without changing the saved input", (validFrom) => {
  expect(parseImportDate(validFrom)).toEqual({ y: 2026, m: 7, d: 1 });
  const input = { addressUpdates: [{ type: "Home", addressLine1: "1 Example St", validFrom }] };
  const original = structuredClone(input);
  expect(() => validateNewRecordContacts(input)).not.toThrow();
  expect(input).toEqual(original);
});
it.each(["2/29/2025", "2026-02-30", "13/01/2026", "7/0/2026", "2026-00-01", "2026-11", "tomorrow", "2026-01-01T00:00:00Z", "0000-01-01"])("rejects invalid or incomplete full date %s before automatic completion", (validFrom) => {
  expect(parseImportDate(validFrom)).toBeNull();
  expect(() => validateNewRecordContacts({ addressUpdates: [{ type: "Home", addressLine1: "1 Example St", validFrom }] })).toThrow(/Address Valid From/);
});
it("accepts leap dates and empty optional dates while preserving existing two-digit year rules", () => {
  expect(parseImportDate("02/29/2024")).toEqual({ y: 2024, m: 2, d: 29 });
  expect(parseImportDate("7/1/99")).toEqual({ y: 1999, m: 7, d: 1 });
  expect(() => validateNewRecordContacts({ addressUpdates: [{ type: "Home", addressLine1: "1 Example St", validFrom: "" }] })).not.toThrow();
});
