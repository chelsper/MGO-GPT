import { OPPORTUNITY_EXPORT_COLUMNS } from "@/utils/prospectExport";

export async function prospectExportWorkbook(model) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "JUMGOGPT";
  workbook.created = new Date();
  function sheet(name, columns, rows) {
    const ws = workbook.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
    ws.columns = columns.map((c) => ({ header: c.label, key: c.key,
      width: c.key === "profile" ? 48 : ["nextStep", "latestAction", "value"].includes(c.key) ? 55 : 26 }));
    for (const row of rows) {
      ws.addRow(columns.map((c) => {
        const value = row[c.key];
        if (value == null || value === "") return null;
        if (c.type === "date") return new Date(`${value}T00:00:00.000Z`);
        // Only primitives reach ExcelJS; donor text cannot become formulas or hyperlinks.
        return typeof value === "number" ? value : String(value);
      }));
    }
    ws.eachRow((row, index) => {
      row.alignment = { vertical: "top", wrapText: true };
      if (index === 1) {
        row.font = { bold: true, color: { argb: "FFFFFFFF" } };
        row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF006B57" } };
        row.height = 32;
      }
    });
    columns.forEach((c, i) => {
      if (c.type === "currency") ws.getColumn(i + 1).numFmt = '"$"#,##0.00;[Red]("$"#,##0.00);"$"0.00';
      if (c.type === "date") ws.getColumn(i + 1).numFmt = "mmm d, yyyy";
      if (c.type === "number") ws.getColumn(i + 1).numFmt = "0";
    });
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
    return ws;
  }
  sheet("Prospect Summary", model.columns, model.summary);
  sheet("Opportunity Detail", OPPORTUNITY_EXPORT_COLUMNS, model.opportunities);
  sheet("Export Notes", [{ key: "label", label: "About this export" }, { key: "value", label: "Details" }],
    model.notes.map(([label, value]) => ({ label, value })));
  return workbook.xlsx.writeBuffer();
}
