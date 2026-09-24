import { CONSTITUENT_LETTER_COLUMNS } from "../src/utils/societyLetters";

export const societyQuerySettings = () => ({
  sourceMode: "society_queries",
  periodBasis: "calendar_year",
  societyKeys: ["presidents_society", "order_of_the_dolphin"],
  societySources: ["presidents_society", "order_of_the_dolphin"].map(
    (societyKey, index) => ({
      societyKey,
      queryId: String(100 + index),
      columns: { ...CONSTITUENT_LETTER_COLUMNS },
      queryPeriodStart: "2026-01-01",
      queryPeriodEnd: "2026-12-31",
    }),
  ),
  confirmSource: true,
});

export function constituentQueryOutput(
  records = [{ constituentId: "10", spouseId: "11" }],
) {
  const entries = Object.entries(CONSTITUENT_LETTER_COLUMNS).filter(
    ([, name]) => name,
  );
  return {
    generatedAt: "2026-09-24T12:00:00.000Z",
    headers: entries.map(([, name]) => name),
    tableRows: records.map((record) => {
      const row = {
        addressee: `Example ${record.constituentId}`,
        salutation: `Example ${record.constituentId}`,
        address1: "123 Example Street",
        city: "Jacksonville",
        state: "FL",
        postalCode: "32211",
        ...record,
      };
      return entries.map(([key]) => row[key] || "");
    }),
  };
}

export function constituentQueryDefinition(
  columns = CONSTITUENT_LETTER_COLUMNS,
) {
  return {
    select_fields: [
      ["constituentId", "296"],
      ["spouseId", "10516"],
    ].map(([key, root]) => ({
      query_field: {
        available_field_name: "System Record ID",
        selected_field_name: columns[key],
        node_path: [{ id: root }],
      },
    })),
  };
}
