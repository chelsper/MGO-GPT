// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn() }));
vi.mock("./reportRefresh", () => ({ getReportRefreshUser: vi.fn() }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: vi.fn(), getBlackbaudConnection: vi.fn() }));
vi.mock("./savedQueryExecution", () => ({ executeSavedQueryResults: vi.fn() }));
vi.mock("./givingSocietyConfigurations", () => ({ listGivingSocietyConfigurations: vi.fn() }));
import { inspectLifetimeQuery, publicLifetimeState, readLifetimeRules, refreshLifetimeHistory, lifetimeTransport, updateLifetimeGroup } from "./lifetimeSocieties";
import { listGivingSocietyConfigurations } from "./givingSocietyConfigurations";
import { getReportRefreshUser } from "./reportRefresh";
import { blackbaudApiFetch, getBlackbaudConnection } from "./blackbaud";
import { executeSavedQueryResults } from "./savedQueryExecution";
import { lifetimeQueryFixture, lifetimeRules, lifetimeCsvFixture } from "../../../../test/lifetimeQueryFixture";
beforeEach(() => vi.clearAllMocks());
it("adds recognition credit to the 1934 report rule without mutating shared configuration", async () => {
  const definitions = lifetimeRules.map(row => ({ ...row, active: true, basis: "lifetime", countSources: row.key === "1934_club" ? ["committed"] : [...row.countSources] }));
  listGivingSocietyConfigurations.mockResolvedValue(definitions);
  const rules = await readLifetimeRules(vi.fn());
  expect(rules[0].countSources).toEqual(["committed", "recognition_credit"]);
  expect(definitions[0].countSources).toEqual(["committed"]);
  expect(rules[1].countSources).toEqual(definitions[1].countSources);
});
it("enables full-gift recognition only for the explicitly supported source settings", () => {
  expect(inspectLifetimeQuery(lifetimeQueryFixture()).fullRecognition).toBe(true);
  for (const changes of [{ soft_credit_sub_option: "UseAmountInGrid" }, { soft_credit_option: "Donor" }, { soft_credit_sub_option: undefined }]) {
    const query = lifetimeQueryFixture(); Object.assign(query.gift_processing_options, changes);
    expect(inspectLifetimeQuery(query).fullRecognition).toBe(false);
  }
});
async function groupingState() {
  const args = setup();
  const rows = [{}, { id: "2", name: "Fictional B", credit: "Soft Credit Recipient" },
    { id: "2", name: "Fictional B", credit: "Soft Credit Recipient", giftId: "102" },
    { id: "3", name: "Fictional C", giftId: "102" }];
  args.transport.execute.mockResolvedValue({ body: new TextEncoder().encode(lifetimeCsvFixture(rows)), contentType: "text/csv", queryJobRowCount: rows.length });
  return { args, ...(await refreshLifetimeHistory(args)) };
}
it("confirms and undoes groups in app storage only, with private audit and stale/overlap protection", async () => {
  const { state } = await groupingState();
  const db = vi.fn().mockResolvedValueOnce([{ payload: state }]).mockResolvedValue([{ report_key: "saved" }]);
  const args = { db, rules: vi.fn().mockResolvedValue(lifetimeRules), revision: state.revision, user: { id: 10 }, groupId: state.snapshot.sharedGroups[0].id, operation: "confirm-group" };
  const confirmed = await updateLifetimeGroup(args);
  expect(confirmed.state.snapshot.confirmedGroupIds).toEqual([args.groupId]);
  expect(confirmed.state.groupAudit[0]).toMatchObject({ operation: "confirm-group", userId: 10 });
  expect(publicLifetimeState(confirmed.state, lifetimeRules)).not.toHaveProperty("groupAudit");
  expect(db.mock.calls[1][0].join()).toContain("payload->>'revision'");
  expect(blackbaudApiFetch).not.toHaveBeenCalled(); expect(executeSavedQueryResults).not.toHaveBeenCalled();
  db.mockReset().mockResolvedValue([{ payload: confirmed.state }]);
  await expect(updateLifetimeGroup(args)).rejects.toThrow(/changed/);
  await expect(updateLifetimeGroup({ ...args, revision: confirmed.state.revision, groupId: state.snapshot.sharedGroups[1].id })).rejects.toThrow(/already belongs/);
  await expect(updateLifetimeGroup({ ...args, revision: confirmed.state.revision, groupId: "unknown" })).rejects.toThrow(/suggestion/);
  db.mockReset().mockResolvedValueOnce([{ payload: confirmed.state }]).mockResolvedValue([{ report_key: "saved" }]);
  const removed = await updateLifetimeGroup({ ...args, revision: confirmed.state.revision, operation: "remove-group" });
  expect(removed.state.snapshot.confirmedGroupIds).toEqual([]);
});
it("retains confirmations only when source, rules, identity and shared evidence still match", async () => {
  const { state, args } = await groupingState(); state.snapshot.confirmedGroupIds = [state.snapshot.sharedGroups[0].id];
  args.revision = state.revision;
  args.db.mockReset().mockResolvedValueOnce([{ payload: state }]).mockResolvedValue([{ report_key: "saved" }]);
  expect((await refreshLifetimeHistory(args)).state.snapshot.confirmedGroupIds).toEqual(state.snapshot.confirmedGroupIds);
  args.db.mockReset().mockResolvedValueOnce([{ payload: state }]).mockResolvedValue([{ report_key: "saved" }]);
  args.transport.metadata.mockResolvedValue({ ...lifetimeQueryFixture(), name: "Changed source" });
  expect((await refreshLifetimeHistory(args)).state.snapshot).toMatchObject({ confirmedGroupIds: [], groupsToReconfirm: 1 });
});
it("does not save a confirmation when a concurrent change wins", async () => {
  const { state } = await groupingState();
  const db = vi.fn().mockResolvedValueOnce([{ payload: state }]).mockResolvedValue([]);
  await expect(updateLifetimeGroup({ db, rules: vi.fn().mockResolvedValue(lifetimeRules), revision: state.revision, user: { id: 1 },
    groupId: state.snapshot.sharedGroups[0].id, operation: "confirm-group" })).rejects.toThrow(/changed/);
});
it("matches the native Key Indicator path, never a similar alias or a spouse's type", () => {
  const query = lifetimeQueryFixture();
  const field = query.select_fields.find(entry => entry.query_field.selected_field_name === "Key Indicator");
  field.user_alias = "Person or organization";
  expect(inspectLifetimeQuery(query).columns.constituentType).toBe("Person or organization");
  field.query_field.node_path = [{ name: "Spouse" }];
  expect(inspectLifetimeQuery(query).columns.constituentType).toBe("");
  field.query_field.node_path = [{ name: "Constituent" }]; field.query_field.selected_field_name = "Name";
  field.user_alias = "Key Indicator";
  expect(inspectLifetimeQuery(query).columns.constituentType).toBe("");
});
it("allows missing type outputs with an actionable note but rejects ambiguous type outputs", () => {
  expect(inspectLifetimeQuery(lifetimeQueryFixture({ constituentType: false }))).toMatchObject({ ready: true, columns: { constituentType: "" }, warnings: expect.arrayContaining([expect.stringContaining("Key Indicator")]) });
  const query = lifetimeQueryFixture();
  query.select_fields.push({ ...query.select_fields.find(entry => entry.query_field.selected_field_name === "Key Indicator"), user_alias: "Other type" });
  expect(inspectLifetimeQuery(query).ready).toBe(false);
});
it("invalidates old calculations after the recognized-giving rule change", () => {
  expect(publicLifetimeState({ revision: "old", snapshot: { ruleVersion: 2 } }, lifetimeRules)).toMatchObject({ snapshot: null, staleRules: true });
});
it("respects constituent-only exclusions without treating them as truncated gift history", () => {
  const query = lifetimeQueryFixture();
  query.filter_fields.push({ query_field: { selected_field_name: "Constituency Code", node_path: [{ name: "Constituent" }, { name: "Constituency" }] },
    operator: "NotOneOf", filter_values: [{ description: "Estate" }, { description: "Donor Advised Fund" }, { description: "Consortia" }] });
  expect(inspectLifetimeQuery(query)).toMatchObject({ ready: true, restrictedHistory: false });
  query.filter_fields.push({ query_field: { selected_field_name: "Gift Date", node_path: [{ name: "Gift Information" }] } });
  expect(inspectLifetimeQuery(query).restrictedHistory).toBe(true);
});
function setup() {
  const db = vi.fn().mockResolvedValueOnce([]).mockResolvedValue([{ report_key: "saved" }]);
  const transport = { metadata: vi.fn().mockResolvedValue(lifetimeQueryFixture()), execute: vi.fn().mockResolvedValue({
    body: new TextEncoder().encode(lifetimeCsvFixture([{}])), contentType: "text/csv", queryJobRowCount: 1 }) };
  return { db, transport, rules: vi.fn().mockResolvedValue(lifetimeRules), revision: null, user: { id: 1 } };
}
it("accepts the existing Constituent ID without substituting integration/gift IDs for system IDs", () => {
  const result = inspectLifetimeQuery(lifetimeQueryFixture({ identity: false }));
  expect(result.ready).toBe(true); expect(result.identityMode).toBe("lookup");
  expect(result.columns.constituentId).toBe(""); expect(result.columns.giftId).toBe("System Record ID");
  expect(result.checks.find(check => check.key === "constituentId").required).toBe(false);
  expect(result.checks.find(check => check.key === "lookupId").required).toBe(true);
  expect(result.warnings.join()).toMatch(/deceased/); expect(result.warnings.join()).toMatch(/Full amount/);
  expect(result.warnings.join()).toMatch(/system IDs are not inferred/);
});
it("maps semantic paths even with aliases and rejects misleading related IDs", () => {
  const query = lifetimeQueryFixture(); query.select_fields.at(-1).user_alias = "Person key";
  expect(inspectLifetimeQuery(query).columns.constituentId).toBe("Person key");
  query.select_fields.at(-1).query_field.node_path = [{ name: "Spouse" }];
  expect(inspectLifetimeQuery(query)).toMatchObject({ ready: true, identityMode: "lookup", columns: { constituentId: "" } });
  query.select_fields[1].query_field.node_path = [{ name: "Spouse" }];
  expect(inspectLifetimeQuery(query).ready).toBe(false);
});
it("requires a genuine constituent identifier, not similarly named aliases or integration IDs", () => {
  const query = lifetimeQueryFixture({ identity: false });
  query.select_fields = query.select_fields.filter(entry => entry.query_field.selected_field_name !== "Constituent ID");
  query.select_fields[0].user_alias = "Constituent System Record ID";
  expect(inspectLifetimeQuery(query)).toMatchObject({ ready: false, identityMode: null });
});
it("rejects duplicate semantic identity outputs even with distinct aliases", () => {
  for (const key of ["Constituent ID", "Constituent System Record ID"]) {
    const query = lifetimeQueryFixture();
    query.select_fields.push({ ...query.select_fields.find(entry => entry.query_field.selected_field_name === key), user_alias: "Other identity" });
    expect(inspectLifetimeQuery(query).ready).toBe(false);
  }
});
it("rejects wrong query IDs, query types, prompts and duplicate aliases", () => {
  for (const changes of [{ id: 1 }, { type: "Constituent" }, { has_ask_fields: true }, { can_execute: false }])
    expect(() => inspectLifetimeQuery({ ...lifetimeQueryFixture(), ...changes })).toThrow();
  const query = lifetimeQueryFixture(); query.select_fields.push(query.select_fields[0]);
  expect(() => inspectLifetimeQuery(query)).toThrow(/aliases/);
});
it("publishes only a complete checked snapshot with compare-and-swap protection", async () => {
  const args = setup(), { state, societies } = await refreshLifetimeHistory(args);
  expect(args.transport.metadata).toHaveBeenCalledTimes(2); expect(args.rules).toHaveBeenCalledTimes(2);
  expect(state.snapshot).toMatchObject({ peopleCount: 1, rawRows: 1, provisionalCount: 1 });
  expect(args.db.mock.calls[1][0].join()).toContain("ON CONFLICT");
  expect(publicLifetimeState(state, societies)).not.toHaveProperty("updatedBy");
  expect(publicLifetimeState(state, [{ ...societies[0], minimumAmount: 999 }, societies[1]])).toMatchObject({ snapshot: null, staleRules: true });
});
it("does not execute an unready source", async () => {
  const args = setup(), query = lifetimeQueryFixture({ identity: false });
  query.select_fields = query.select_fields.filter(entry => entry.query_field.selected_field_name !== "Constituent ID");
  args.transport.metadata.mockResolvedValue(query);
  await expect(refreshLifetimeHistory(args)).rejects.toThrow(/missing query outputs/);
  expect(args.transport.execute).not.toHaveBeenCalled(); expect(args.db).toHaveBeenCalledTimes(1);
});
it("publishes a lookup-scoped snapshot using only the existing query, without per-person lookups", async () => {
  const args = setup(); args.transport.metadata.mockResolvedValue(lifetimeQueryFixture({ identity: false }));
  args.transport.execute.mockResolvedValue({ body: new TextEncoder().encode(lifetimeCsvFixture([{ lookupId: "00123" }], { identity: false })), contentType: "text/csv", queryJobRowCount: 1 });
  const { state } = await refreshLifetimeHistory(args);
  expect(state.snapshot).toMatchObject({ identityMode: "lookup", peopleCount: 1, provisionalCount: 1 });
  expect(state.snapshot.rows[0]).toMatchObject({ systemId: null, lookupId: "00123", id: '["lookup","00123"]' });
  expect(args.transport.execute).toHaveBeenCalledTimes(1);
  expect(blackbaudApiFetch).not.toHaveBeenCalled();
});
it("keeps saved results when lookup identities conflict", async () => {
  const args = setup(); args.transport.metadata.mockResolvedValue(lifetimeQueryFixture({ identity: false }));
  args.transport.execute.mockResolvedValue({ body: new TextEncoder().encode(lifetimeCsvFixture([{}, { name: "Conflicting Fictional Donor" }], { identity: false })), contentType: "text/csv", queryJobRowCount: 2 });
  await expect(refreshLifetimeHistory(args)).rejects.toThrow(/conflicting identity/);
  expect(args.db).toHaveBeenCalledTimes(1);
});
it("preserves saved results on stale revisions, source/rule races, failed reads and competing publishes", async () => {
  let args = setup(); args.revision = "old";
  await expect(refreshLifetimeHistory(args)).rejects.toThrow(/Saved results changed/); expect(args.transport.metadata).not.toHaveBeenCalled();
  args = setup(); args.transport.metadata.mockResolvedValueOnce(lifetimeQueryFixture()).mockResolvedValueOnce({ ...lifetimeQueryFixture(), name: "Changed" });
  await expect(refreshLifetimeHistory(args)).rejects.toThrow(/changed during/); expect(args.db).toHaveBeenCalledTimes(1);
  args = setup(); args.rules.mockResolvedValueOnce(lifetimeRules).mockResolvedValueOnce([]);
  await expect(refreshLifetimeHistory(args)).rejects.toThrow(/changed during/); expect(args.db).toHaveBeenCalledTimes(1);
  args = setup(); args.transport.execute.mockRejectedValue(new Error("offline"));
  await expect(refreshLifetimeHistory(args)).rejects.toThrow("offline"); expect(args.db).toHaveBeenCalledTimes(1);
  args = setup(); args.db.mockReset().mockResolvedValue([]);
  await expect(refreshLifetimeHistory(args)).rejects.toThrow(/Another refresh/);
});
it("uses only the shared connected authorized account and saved-query APIs", async () => {
  getReportRefreshUser.mockResolvedValue({ id: 7, role: "advancement_services", active: true }); getBlackbaudConnection.mockResolvedValue({ connected_at: "yes" });
  const transport = await lifetimeTransport("https://app.example"); await transport.metadata(); await transport.execute();
  expect(blackbaudApiFetch).toHaveBeenCalledWith("/query/queries/31118", expect.objectContaining({ userId: 7, maxRetries: 0 }));
  expect(executeSavedQueryResults).toHaveBeenCalledWith(expect.objectContaining({ queryId: "31118", user: expect.objectContaining({ id: 7 }) }));
  getReportRefreshUser.mockResolvedValue({ id: 8, role: "mgo", active: true });
  await expect(lifetimeTransport("https://app.example")).rejects.toThrow(/shared reporting/);
});
