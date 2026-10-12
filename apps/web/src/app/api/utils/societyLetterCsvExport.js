import Papa from "papaparse";
import {
  letterError,
  MAX_COMBINED_LETTER_HOUSEHOLDS,
} from "@/utils/societyLetters";
import {
  societyLetterCsvPlan,
  societyLetterCsvFilename,
} from "@/utils/societyLetterCsvExport";

export function exportSocietyLetterCsv(workspace, body) {
  if (
    !Number.isInteger(body.revision) ||
    body.revision !== workspace.revision ||
    !body.periodKey ||
    body.periodKey !== workspace.period?.key
  )
    throw letterError(
      "The saved results changed. Reload Society Letters before exporting.",
      409,
    );
  const ids = body.householdIds;
  if (
    !Array.isArray(ids) ||
    !ids.length ||
    ids.length > MAX_COMBINED_LETTER_HOUSEHOLDS ||
    ids.some((id) => typeof id !== "string" || !id) ||
    new Set(ids).size !== ids.length
  )
    throw letterError(
      "Choose a society and export its reviewed recipients.",
      400,
    );
  const plan = societyLetterCsvPlan(
    workspace,
    body.societyKey,
    body.letterDate,
    body.csvFormat,
  );
  if (plan.issue) throw letterError(plan.issue, 409);
  const requested = new Set(ids);
  if (
    plan.entries.length !== ids.length ||
    plan.entries.some((entry) => !requested.has(entry.householdId))
  )
    throw letterError(
      "The eligible recipients changed. Reload Society Letters and review the export count before downloading.",
      409,
    );
  return {
    filename: societyLetterCsvFilename(body.societyKey, body.letterDate),
    count: plan.entries.length,
    // Quote all cells and preserve reviewed text exactly, including newlines and
    // leading zeros. Unsafe formula-like values are omitted by the shared plan.
    csv:
      "\uFEFF" +
      Papa.unparse(
        {
          fields: plan.columns.map((column) => column.name),
          data: plan.entries.map((entry) => entry.cells),
        },
        { quotes: true, newline: "\r\n" },
      ),
  };
}
