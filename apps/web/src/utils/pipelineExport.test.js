import { expect, it } from "vitest";
import Papa from "papaparse";
import { pipelineExportCsv } from "./pipelineExport";
import { buildPipelineReport, selectPipelineRows } from "./pipelineReport";

it("exports every filtered row, not the visible page, with safe CSV cells and explicit saved-data scope", () => {
  const report = buildPipelineReport(Array.from({ length: 30 }, (_, i) => ({ id: i + 1, title: i ? `Ask ${i}` : '=HYPERLINK("bad")', prospect_name: `Person ${i}`,
    estimated_amount: i, expected_date: "2027-01-01", user_id: 1, pipeline_change_id: i === 0 ? "pending" : null })));
  const csv = pipelineExportCsv(selectPipelineRows(report.opportunities, { year: 2027 }));
  const rows = Papa.parse(csv, { header: true }).data;
  expect(rows).toHaveLength(30);
  expect(rows.find(row => row.Opportunity.startsWith("'="))["Ask amount"]).toBe("0");
  expect(rows[0].Source).toMatch(/not an all-NXT inventory/);
  expect(csv).toContain("Awaiting NXT verification");
  expect(pipelineExportCsv(selectPipelineRows(report.opportunities, { year: 2028 })).split("\r\n")).toHaveLength(1);
});
