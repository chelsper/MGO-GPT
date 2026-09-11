import { beforeEach, describe, expect, it, vi } from "vitest";
const sqlMock = vi.hoisted(() => vi.fn());
vi.mock("./sql", () => ({ default: sqlMock }));
import { claimImportRowForApply } from "./importRowApplyClaim";

describe("import row apply claim", () => {
  beforeEach(() => sqlMock.mockReset());
  it("claims only the exact reviewed target, preview, and writes", async () => {
    sqlMock.mockResolvedValue([{ id: 9 }]);
    expect(await claimImportRowForApply({ id: 9, run_id: 42, status: "Ready", preview: {}, requested_writes: [], matched_blackbaud_constituent_id: "123" })).toBe(true);
    const [strings, ...args] = sqlMock.mock.calls[0];
    expect(strings.join(" ")).toContain("status = 'Applying'");
    expect(strings.join(" ")).toContain("preview IS NOT DISTINCT FROM");
    expect(strings.join(" ")).toContain("matched_blackbaud_constituent_id IS NOT DISTINCT FROM");
    expect(strings.join(" ")).toContain("blackbaud_result IS NOT DISTINCT FROM");
    expect(strings.join(" ")).toContain("applied_at IS NOT DISTINCT FROM");
    expect(args).toEqual([9, 42, "Ready", "{}", "[]", "123", null, null]);
  });
  it("does not send a stale or concurrently claimed row", async () => {
    sqlMock.mockResolvedValue([]);
    expect(await claimImportRowForApply({ status: "Ready" })).toBe(false);
  });
  it("rejects a pending match decision even if another endpoint marked the row Ready", async () => {
    expect(await claimImportRowForApply({ status: "Ready", preview: { matchReview: { decision: "rejected" } } })).toBe(false);
    expect(sqlMock).not.toHaveBeenCalled();
  });
});
