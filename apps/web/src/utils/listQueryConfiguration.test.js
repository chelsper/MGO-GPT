import { expect, it } from "vitest";
import query from "./futureMadeQueryTemplate.json";
import { normalizeListSource, validateListSource } from "./constituentLists";
import { orderedListColumns, parseListQuery } from "./listQueryConfiguration";
const source = {
  version: 1,
  source: "query_json",
  fieldCategory: "",
  fieldDescription: "",
  queryJson: JSON.stringify(query),
};
it("accepts the supplied six-field constituent definition without inferring field meanings or NXT writes", () => {
  expect(validateListSource(source)).toBe("");
  const definition = parseListQuery(source.queryJson);
  expect(definition.select_fields).toEqual(query.select_fields);
  expect(definition.filter_fields).toEqual(query.filter_fields);
  expect(definition).not.toHaveProperty("others_can_modify");
  expect(definition).not.toHaveProperty("others_can_execute");
  expect(normalizeListSource(source).queryJson).toBe(
    JSON.stringify(definition),
  );
});
it.each([
  null,
  "bad",
  "[]",
  JSON.stringify({ ...query, type_id: 1 }),
  JSON.stringify({ ...query, sql: "select *" }),
  JSON.stringify({ ...query, select_fields: [] }),
  JSON.stringify({ ...query, select_fields: [{ query_field_id: "597" }] }),
  JSON.stringify({
    ...query,
    filter_fields: [
      { query_field_id: 656, operator: "Equals", filter_values: [{}] },
    ],
  }),
  " ".repeat(64001),
])("rejects invalid query input %s", (queryJson) => {
  expect(validateListSource({ ...source, queryJson })).not.toBe("");
});
it("requires explicit system-ID mapping and lead roles, and validates display settings", () => {
  const leadFundraiser = {
    enabled: true,
    systemIdColumn: "",
    assignmentTypes: ["Lead Solicitor"],
  };
  expect(validateListSource({ ...source, leadFundraiser })).toMatch(
    /system record ID/,
  );
  expect(
    validateListSource({
      ...source,
      leadFundraiser: { ...leadFundraiser, systemIdColumn: "System record ID" },
    }),
  ).toBe("");
  expect(
    validateListSource({
      ...source,
      leadFundraiser: { ...leadFundraiser, assignmentTypes: [] },
    }),
  ).toMatch(/assignment type/);
  expect(validateListSource({ ...source, columns: [null] })).toMatch(/columns/);
  const { queryJson, ...base } = source;
  expect(
    validateListSource({ ...base, source: "saved_query", queryId: "1e3" }),
  ).toMatch(/query system/);
});
it("orders display columns without altering data, hides technical metadata and ignores obsolete settings", () => {
  const settings = [
    {
      header: "Amount",
      label: "Gift amount",
      visible: true,
      format: "currency",
    },
    { header: "Old", label: "Old", visible: false, format: "text" },
  ];
  expect(
    orderedListColumns(["QRECID", "Name", "Amount"], settings).map(
      (column) => column.header,
    ),
  ).toEqual(["Amount", "Name"]);
  expect(orderedListColumns(["Name", "Amount"], settings)[0].label).toBe(
    "Gift amount",
  );
});
