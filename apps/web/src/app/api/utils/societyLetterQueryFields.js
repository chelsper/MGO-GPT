import { getBlackbaudSavedQueryById } from "./blackbaud";
import {
  CONSTITUENT_LETTER_COLUMNS,
  letterError,
} from "@/utils/societyLetters";

export async function inspectLetterQueryFields(body, context) {
  const queryId = String(body.queryId || "").trim();
  if (!/^[1-9]\d{0,18}$/.test(queryId))
    throw letterError("Enter a saved NXT query ID first.");
  const query = await getBlackbaudSavedQueryById({
    queryId,
    userId: context.user.id,
    origin: context.origin,
  });
  const fields = (query?.select_fields || [])
    .map(({ query_field: field }) => ({
      name: field?.selected_field_name,
      meaning: field?.available_field_name,
      root: String(field?.node_path?.[0]?.id || ""),
    }))
    .filter(
      (field) =>
        typeof field.name === "string" &&
        field.name.length <= 150 &&
        field.name.trim(),
    );
  if (!fields.length || fields.length > 100)
    throw letterError(
      "No usable output fields were returned. Check this saved query in NXT.",
    );
  const unique = fields.filter(
    (field) => fields.filter((other) => other.name === field.name).length === 1,
  );
  const suggestedColumns = {};
  for (const [key, label] of Object.entries(CONSTITUENT_LETTER_COLUMNS)) {
    const root =
      key === "constituentId" ? "296" : key === "spouseId" ? "10516" : null;
    const matches = unique.filter((field) =>
      root
        ? field.meaning === "System Record ID" && field.root === root
        : label && field.name === label,
    );
    if (matches.length === 1) suggestedColumns[key] = matches[0].name;
  }
  return {
    queryId,
    fields: unique.map((field) => field.name),
    suggestedColumns,
  };
}
