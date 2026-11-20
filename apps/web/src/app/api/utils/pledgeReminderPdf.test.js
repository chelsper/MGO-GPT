// @vitest-environment node
import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderPledgeReminderPdf } from "./pledgeReminderPdf";
import { reminderDraft, reminderToday } from "../../../../test/fixtures/pledgeReminder";
const settings = { letterDate: reminderToday, today: reminderToday, view: "pastDue" };
describe("private pledge reminder PDF", () => {
  it.each(["pastDue", "upcoming"])("creates a readable Letter-size %s PDF without a converter", async view => {
    const bytes = await renderPledgeReminderPdf(reminderDraft, { ...settings, view });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(1); expect(pdf.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
    expect(pdf.getTitle()).toBe("Jacksonville University pledge reminder");
    expect(bytes.subarray(0, 5).toString()).toBe("%PDF-");
  });
  it("wraps long names, multiline addresses and long words across pages rather than clipping", async () => {
    const draft = structuredClone(reminderDraft);
    draft.fields.Addressee = "Fictional Long Organization ".repeat(15);
    draft.fields.Address_Line_2 = "Sample building\n".repeat(30);
    draft.pledge.fundDescriptions = ["LongFictionalFund".repeat(30)];
    const pdf = await PDFDocument.load(await renderPledgeReminderPdf(draft, settings));
    expect(pdf.getPageCount()).toBeGreaterThan(1); expect(pdf.getPageCount()).toBeLessThanOrEqual(6);
  });
  it("holds invalid amounts, missing fields, unsafe characters and dates", async () => {
    for (const draft of [
      { ...reminderDraft, pledge: { ...reminderDraft.pledge, amountDueCents: 9999999 } },
      { ...reminderDraft, fields: { ...reminderDraft.fields, Zip: "" } },
      { ...reminderDraft, fields: { ...reminderDraft.fields, Addressee: "\u4e00" } },
      { ...reminderDraft, blocked: "Review the deceased recipient" },
    ]) await expect(renderPledgeReminderPdf(draft, settings)).rejects.toMatchObject({ publicStatus: 400 });
    await expect(renderPledgeReminderPdf(reminderDraft, { ...settings, letterDate: "2026-02-30" })).rejects.toThrow(/valid/);
  });
});
