export const lifetimeRules = [
  { key: "1934_club", name: "1934 Club", minimumAmount: 100000, countSources: ["committed", "recognition_credit"] },
  { key: "frances_bartlett_kinne_society", name: "Frances Bartlett Kinne Society", minimumAmount: 1000000, countSources: ["recognition_credit", "committed"] },
];
export function lifetimeQueryFixture({ identity = true, constituentType = true } = {}) {
  const fields = [
    ["Constituent Integration ID", "Constituent"], ["Constituent ID", "Constituent"], ["Name", "Constituent"],
    ["System Record ID", "Gift Information"], ["Gift Date", "Gift Information"], ["Gift Amount", "Gift Information"],
    ["Gift Type", "Gift Information"], ["Soft Credit/Matching Gift Flag", "Gift Information", true],
    ["Fund Description", "Funds", true], ["Installment Date Due", "Installments", true],
    ...(constituentType ? [["Key Indicator", "Constituent"]] : []),
    ...(identity ? [["Constituent System Record ID", "Constituent"]] : []),
  ];
  return { id: 31118, name: "Lifetime Giving - JUMGOGPT", type: "Gift", can_execute: true, has_ask_fields: false,
    select_fields: fields.map(([name, path, many]) => ({ query_field: { selected_field_name: name, one_to_many: !!many, node_path: [{ name: path }] } })),
    filter_fields: [{ query_field: { selected_field_name: "Constituent Specific Custom Fields Donor Recognition Description", node_path: [{ name: "Constituent" }] } }],
    gift_processing_options: { soft_credit_option: "Both", soft_credit_sub_option: "FullAmountToAll", matching_gift_credit_option: "Both" },
    constituent_filters: { include_deceased: false } };
}
export function lifetimeCsvFixture(rows = [], { identity = true, constituentType = true } = {}) {
  const headers = ["Constituent System Record ID", "Constituent ID", "Name", "System Record ID", "Gift Date", "Gift Amount", "Gift Type", "Soft Credit/Matching Gift Flag", "Fund Description", ...(constituentType ? ["Key Indicator"] : [])];
  const defaults = { id: "1", lookupId: "DEMO-1", name: "Fictional Donor", giftId: "101", date: "1/1/2020", amount: "100000", type: "One-Time Gift", credit: "Regular Gift", fund: "Example Fund", constituentType: "I" };
  const keys = ["id", "lookupId", "name", "giftId", "date", "amount", "type", "credit", "fund", ...(constituentType ? ["constituentType"] : [])];
  const escape = value => `"${String(value).replaceAll('"', '""')}"`;
  return [headers, ...rows.map(row => { const record = { ...defaults, lookupId: `DEMO-${row.id ?? "1"}`, ...row }; return keys.map(key => record[key]); })]
    .map(row => (identity ? row : row.slice(1)).map(escape).join(",")).join("\r\n");
}
