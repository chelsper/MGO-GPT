import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { prospectExportWorkbook } from "./prospectExportWorkbook";
import { buildProspectExport, DEFAULT_EXPORT_COLUMNS, validateExportOptions } from "@/utils/prospectExport";

describe("real Excel export", () => {
  it("round-trips typed currency/date, safe strings, sheets, filters and frozen headers", async () => {
    const options = validateExportOptions({ scope: "active", format: "xlsx", ownerIds: [1], columns: DEFAULT_EXPORT_COLUMNS });
    const model = buildProspectExport([{ id: 1, user_id: 1, prospect_name: "=HYPERLINK(\"https://invalid\")", status: "Active", portfolio_rank: 1,
      next_action_text: "Call", next_action_due_date: "2027-06-30", updated_at: "2026-09-09",
      opportunities: [{ id: 1, title: "+SUM(A1)", opportunity_status: "Active", estimated_amount: "1234.56", expected_date: "2027-06-30" }] }], options, [{ id: 1, name: "Example MGO" }]);
    const bytes = await prospectExportWorkbook(model);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    expect(workbook.worksheets.map((s) => s.name)).toEqual(["Prospect Summary", "Opportunity Detail", "Export Notes"]);
    const summary = workbook.getWorksheet("Prospect Summary");
    const column = (key) => options.columns.findIndex((c) => c.key === key) + 1;
    expect(summary.getCell(2, column("name")).value).toBe('=HYPERLINK("https://invalid")');
    expect(summary.getCell(2, column("name")).type).toBe(ExcelJS.ValueType.String);
    expect(summary.getCell(2, column("pipeline")).value).toBe(1234.56);
    expect(summary.getCell(2, column("due")).value.toISOString()).toBe("2027-06-30T00:00:00.000Z");
    expect(summary.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
    expect(summary.autoFilter).toBeTruthy();
    expect(workbook.getWorksheet("Opportunity Detail").getCell("C2").value).toBe("+SUM(A1)");
    expect(workbook.getWorksheet("Export Notes").rowCount).toBeGreaterThan(10);
  });
});
