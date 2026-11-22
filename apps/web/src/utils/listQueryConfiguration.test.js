import { expect, it } from "vitest";
import query from "./futureMadeQueryTemplate.json";
import { normalizeListSource, validateListSource } from "./constituentLists";
import {
  listOutputSourceKey,
  orderedListColumns,
  parseListQuery,
} from "./listQueryConfiguration";
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
it("allows discovering output before choosing a system ID, requires lead roles and validates display settings", () => {
  const leadFundraiser = {
    enabled: true,
    systemIdColumn: "",
    assignmentTypes: ["Lead Solicitor"],
  };
  expect(validateListSource({ ...source, leadFundraiser })).toBe("");
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
it("scopes output headers to the query while allowing formatting, mapping and display edits", () => {
  const key = listOutputSourceKey(source);
  expect(
    listOutputSourceKey({
      ...source,
      queryJson: JSON.stringify(
        Object.fromEntries(Object.entries(query).reverse()),
        null,
        2,
      ),
      columns: [],
      leadFundraiser: { enabled: true, systemIdColumn: "Changed" },
    }),
  ).toBe(key);
  expect(
    listOutputSourceKey({
      ...source,
      queryJson: JSON.stringify({
        ...query,
        select_fields: [{ query_field_id: 597 }],
      }),
    }),
  ).not.toBe(key);
  expect(listOutputSourceKey({ ...source, queryJson: "bad" })).toBeNull();
  expect(listOutputSourceKey(undefined)).toBeNull();
  expect(listOutputSourceKey({ source: "saved_query", queryId: "1" })).not.toBe(
    listOutputSourceKey({ source: "saved_query", queryId: "2" }),
  );
});
it.each(["31110", "-672096"])("preserves the signed saved query ID %s without treating it as a constituent ID", queryId => {
  const saved = {version:1,source:"saved_query",fieldCategory:"",fieldDescription:"",queryId};
  expect(validateListSource(saved)).toBe("");
  expect(normalizeListSource(saved).queryId).toBe(queryId);
  expect(listOutputSourceKey(saved)).not.toBe(listOutputSourceKey({...saved,queryId:queryId.startsWith("-")?queryId.slice(1):`-${queryId}`}));
});
it.each(["0", "-0", "-01", "+12", "--12", " 12", "-1.5", "1e3", "-9007199254740992", "12/path", "-12?x=1"])("rejects noncanonical or unsafe saved query ID %s", queryId => {
  expect(validateListSource({version:1,source:"saved_query",fieldCategory:"",fieldDescription:"",queryId})).toMatch(/query system/);
});
it("allows bounded display configuration for wide lists and rejects excess columns", () => {
  const columns=Array.from({length:100},(_,i)=>({header:`Field ${i}`,label:`Field ${i}`,visible:true,format:"text"}));
  expect(validateListSource({...source,columns})).toBe("");
  expect(validateListSource({...source,columns:[...columns,{header:"Extra",label:"Extra",visible:true,format:"text"}]})).toMatch(/100 maximum/);
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
