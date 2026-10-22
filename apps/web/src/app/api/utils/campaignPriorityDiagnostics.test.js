import { describe, expect, it, vi } from "vitest";
import { campaignImportIssue, describeLegacyCampaignFailure, LEGACY_CAMPAIGN_IMPORT_ERROR } from "./campaignPriorityDiagnostics";

describe("campaign import diagnostics", () => {
  it("distinguishes conflicting gifts from the unrelated fund limit", () => {
    const message = campaignImportIssue({ total: 100, conflicts: 2, funds: 476 }, ["123", "456"], "gift", 102);
    expect(message).toContain("2 gifts have conflicting query rows");
    expect(message).toContain("123, 456"); expect(message).toContain("476 funds were found, below");
    expect(message).toContain("No new totals were published");
  });
  it("bounds and sanitizes examples without exposing donor values", () => {
    const message = campaignImportIssue({ total: 10, conflicts: 10, funds: 3 }, ["1", "1", "2", "3", "4", "5", "6", "<script>"]);
    expect(message).toContain("10 gift allocations"); expect(message).toContain("1, 2, 3, 4, 5.");
    expect(message).not.toContain("6,"); expect(message).not.toContain("<script>");
  });
  it("reports fund and row-count limits separately and accepts exactly 2,000 funds", () => {
    expect(campaignImportIssue({ conflicts: 0, total: 2001, funds: 2001 }, [], "gift", 2001)).toContain("contains 2,001 funds");
    expect(campaignImportIssue({ conflicts: 0, total: 3, funds: 1 }, [], "gift", 2)).toContain("more unique allocations");
    expect(campaignImportIssue({ conflicts: 0, total: 2000, funds: 2000 }, [], "gift", 2000)).toBeNull();
  });
  it("explains both problems when conflicts and too many funds occur together", () => {
    expect(campaignImportIssue({ conflicts: 1, funds: 2001 }, ["1"], "gift")).toMatch(/1 gift has.*also above/);
  });
  it("diagnoses a saved legacy failure with SELECT-only queries and no rerun", async () => {
    const db = vi.fn().mockResolvedValueOnce([{ total: 100, conflicts: 1, funds: 20 }]).mockResolvedValueOnce([{ gift_id: "123" }]);
    const job = { stage: "failed", runId: "00000000-0000-4000-8000-000000000001", error: LEGACY_CAMPAIGN_IMPORT_ERROR };
    expect(await describeLegacyCampaignFailure(job, "gift", db)).toContain("1 gift has conflicting query rows");
    expect(job.error).toBe(LEGACY_CAMPAIGN_IMPORT_ERROR);
    for (const [strings] of db.mock.calls) expect(strings.join("").trim()).toMatch(/^SELECT /);
  });
  it("does not inspect active, current, invalid, or removed runs", async () => {
    const db = vi.fn().mockResolvedValue([{ total: 0, conflicts: 0, funds: 0 }]);
    for (const job of [{ stage: "waiting", error: LEGACY_CAMPAIGN_IMPORT_ERROR }, { stage: "failed", error: "Specific problem" }, { stage: "failed", error: LEGACY_CAMPAIGN_IMPORT_ERROR, runId: "invalid" }]) {
      expect(await describeLegacyCampaignFailure(job, "gift", db)).toBe(job.error);
    }
    expect(db).not.toHaveBeenCalled();
    expect(await describeLegacyCampaignFailure({ stage: "failed", runId: "00000000-0000-4000-8000-000000000001", error: LEGACY_CAMPAIGN_IMPORT_ERROR }, "gift", db)).toBe(LEGACY_CAMPAIGN_IMPORT_ERROR);
    expect(db).toHaveBeenCalledTimes(1);
  });
});
