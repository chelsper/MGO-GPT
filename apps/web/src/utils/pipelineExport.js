import { prospectExportCsv } from "./prospectExport";

export const PIPELINE_EXPORT_COLUMNS = [
  ["constituentName", "Constituent"], ["constituentId", "NXT constituent ID"], ["title", "Opportunity"],
  ["nxtOpportunityId", "NXT opportunity ID"], ["fundraisers", "Fundraisers"], ["fiscalYear", "Fiscal year"],
  ["yearBasis", "Fiscal year basis"], ["status", "Outcome"], ["stage", "Stage"], ["amount", "Ask amount"],
  ["expectedDate", "Expected date"], ["fundedAmount", "Funded amount"], ["closedDate", "Close date"],
  ["nxtCheckedAt", "NXT last checked"], ["pendingChange", "Sync status"], ["source", "Source"],
].map(([key, label]) => ({ key, label }));

export function pipelineExportCsv(rows) {
  return prospectExportCsv({ columns: PIPELINE_EXPORT_COLUMNS, summary: rows.map(row => ({ ...row,
    fundraisers: row.fundraisers.map(user => user.name).join("; "),
    pendingChange: row.pendingChange ? "Awaiting NXT verification; last verified values shown" : "Saved values",
    source: "Saved app opportunities; not an all-NXT inventory",
  })) });
}
