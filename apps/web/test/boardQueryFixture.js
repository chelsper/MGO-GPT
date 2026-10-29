// Fictional metadata with the same aliased summary shape as a Constituent query.
export function boardQueryFixture(year = 2027) {
  return {
    id: 31092, name: "FY27 BoT Giving - MGOGPT", type: "Constituent", can_execute: true,
    select_fields: [
      { query_field: { id: 597, selected_field_name: "Name", value_type: "Text", one_to_many: false } },
      ...["Total Gifts FY27 (Cash)", "Total Pledges or Planned Gifts FY27"].map((alias, index) => ({
        query_field: { id: 71937, selected_field_name: "Total Amount of Gifts", value_type: "Summary" }, user_alias: alias, summary_instance: index + 1,
      })),
      ...["Constituency Code", "Constituency Date From", "Constituency Date To"].map((label, index) => ({
        query_field: { id: 800 + index, selected_field_name: label, value_type: index ? "FuzzyDate" : "TableEntry", one_to_many: true,
          node_path: [{ id: "303", name: "Constituency", node_type: "OneToMany" }] },
      })),
    ],
    filter_fields: [{ query_field: { selected_field_name: "Constituency Date To" }, operator: "Blank" }],
    summary_fields: [1, 2].map(instance => ({ query_field_id: 71937, summary_instance: instance,
      filter_fields: [{ query_field: { selected_field_name: "Gift Date" }, operator: "Between", compare_type: "None", filter_values: [`7/1/${year - 1}`, `6/30/${year}`] }] })),
    gift_processing_options: { soft_credit_option: "Both", matching_gift_credit_option: "Both" },
  };
}
