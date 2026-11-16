// @vitest-environment node
import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn() }));
vi.mock("./reportRefresh", () => ({ getReportRefreshUser: vi.fn() }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: vi.fn(), getBlackbaudConnection: vi.fn() }));
vi.mock("./savedQueryExecution", () => ({ executeSavedQueryResults: vi.fn() }));
import { inspectLifetimeQuery, publicLifetimeState, refreshLifetimeHistory, lifetimeTransport } from "./lifetimeSocieties";
import { getReportRefreshUser } from "./reportRefresh";
import { blackbaudApiFetch, getBlackbaudConnection } from "./blackbaud";
import { executeSavedQueryResults } from "./savedQueryExecution";
import { lifetimeQueryFixture, lifetimeRules, lifetimeCsvFixture } from "../../../../test/lifetimeQueryFixture";
beforeEach(() => vi.clearAllMocks());
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
