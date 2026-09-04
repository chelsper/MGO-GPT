import Papa from "papaparse";
import { executeSavedQueryCount } from "@/app/api/utils/savedQueryExecution";
import { validateDashboardQueryId } from "@/app/api/utils/dashboardConfiguration";
import { getBlackbaudConfigIssues } from "@/app/api/utils/blackbaud";

export const DASHBOARD_COUNT_SOURCE = "strict-csv-row-count-v1";

// New dashboards fail closed on malformed CSV. Alumni's legacy parser is unchanged.
export function validateDashboardResultCsv(content) {
  if (
    typeof content !== "string" ||
    !content.trim() ||
    /^[\s\uFEFF]*[<{\[]/.test(content)
  )
    throw new Error("Expected completed CSV query results.");
  const parsed = Papa.parse(content.replace(/^\uFEFF/, ""), {
    delimiter: ",",
    skipEmptyLines: "greedy",
  });
  if (
    parsed.errors.length ||
    !parsed.data.length ||
    parsed.data.some((row) => row.length !== parsed.data[0].length)
  )
    throw new Error("Malformed query result CSV.");
}

export async function runDashboardQueryCount({ user, origin, queryId }) {
  const error = validateDashboardQueryId(queryId);
  if (error) throw Object.assign(new Error(error), { status: 400 });
  if (getBlackbaudConfigIssues(origin).length)
    throw new Error("Blackbaud query configuration is incomplete.");
  const result = await executeSavedQueryCount({
    user,
    origin,
    queryId: String(queryId),
    label: "dashboard query",
    validateResultCsv: validateDashboardResultCsv,
  });
  return {
    value: result.total,
    countSource: DASHBOARD_COUNT_SOURCE,
    queryJobRowCount: result.queryJobRowCount,
  };
}
