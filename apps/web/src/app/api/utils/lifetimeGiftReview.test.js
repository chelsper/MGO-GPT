// @vitest-environment node
import { createHash } from "node:crypto";
import { expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn() }));
vi.mock("./reportRefresh", () => ({ getReportRefreshUser: vi.fn() }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: vi.fn(), getBlackbaudConnection: vi.fn() }));
vi.mock("./savedQueryExecution", () => ({ executeSavedQueryResults: vi.fn() }));
vi.mock("./givingSocietyConfigurations", () => ({ listGivingSocietyConfigurations: vi.fn() }));
import { inspectLifetimeQuery, publicLifetimeState, savedLifetimeGiftReview, savedLifetimeReconciliationCsv, readLifetimeState } from "./lifetimeSocieties";
import { aggregateLifetimeHistory, LIFETIME_LIMITS } from "./lifetimeSocietyHistory";
import { lifetimeQueryFixture, lifetimeCsvFixture, lifetimeRules } from "../../../../test/lifetimeQueryFixture";

function fixture(rows, options = {}, change = {}) {
  const source = { ...inspectLifetimeQuery(lifetimeQueryFixture(options)), ...change };
  const snapshot = { ...aggregateLifetimeHistory(lifetimeCsvFixture(rows, options), source, lifetimeRules, rows.length, new Date("2026-11-17T12:00:00Z")),
    source, societies: lifetimeRules, rulesFingerprint: createHash("sha256").update(JSON.stringify(lifetimeRules)).digest("hex") };
  const state = { revision: "a".repeat(36), snapshot };
  const view = () => publicLifetimeState(state, lifetimeRules);
  const detail = (row = view().snapshot.rows[0], changes = {}) => savedLifetimeGiftReview(state, lifetimeRules, { revision: state.revision, milestoneKey: row.milestoneKey, ...changes });
  return { state, view, detail };
}
it("saves a private gift ledger, omits it from summary payloads and supports SQL projection for fast summary reads", async () => {
  const f = fixture([{}]);
  expect(f.state.snapshot.giftReview.histories).toBeTruthy();
  expect(Object.values(f.state.snapshot.giftReview.histories)[0][0]).not.toHaveProperty("recipientIds");
  expect(f.view().snapshot.giftReviewAvailable).toBe(true);
  expect(f.view().snapshot).not.toHaveProperty("giftReview");
  const db = vi.fn().mockResolvedValue([]); await readLifetimeState(db, false);
  expect(db.mock.calls[0][0].join()).toContain("payload #- '{snapshot,giftReview}'");
});
it("explains direct and soft credit without multiplying duplicate query rows or a donor's own soft credit", () => {
  const f = fixture([{}, {}, { credit: "Soft Credit Recipient" }]);
  const detail = f.detail();
  expect(detail.counts).toEqual({ all: 1, counted: 1, excluded: 0, review: 0 });
  expect(detail.items[0]).toMatchObject({ giftId: "101", cents: 10000000, outcome: "counted", crossingGift: true });
  expect(detail.items[0].credits.map(item => item.kind)).toEqual(["Direct gift", "Soft credit"]);
  expect(detail.items[0].credits[1].treatment).toMatch(/Not added again/);
  expect(detail.items[0].credits[0]).not.toHaveProperty("recipientIds");
});
it("explains company-sourced household credit once, retains archived sources and excludes unrelated company gifts", () => {
  const rows = [{ id: "9", name: "Example Matching Company", constituentType: "O" },
    { id: "9", name: "Example Matching Company", constituentType: "O", giftId: "102", amount: "500000" },
    { name: "Fictional Spouse A", credit: "Soft Credit Recipient", spouseId: "DEMO-2", maritalStatus: "Married" },
    { id: "2", name: "Fictional Spouse B", credit: "Soft Credit Recipient", spouseId: "DEMO-1", maritalStatus: "Married" }];
  const f = fixture(rows, { identity: false, spouses: true });
  const company = f.view().snapshot.rows.find(row => row.constituentType === "organization");
  f.state.recordDecisions = { archives: [{ key: company.recordKey, name: company.name }] };
  const detail = f.detail(f.view().snapshot.sharedGroups[0].rows[0]);
  expect(detail.counts.all).toBe(1); expect(detail.items[0].cents).toBe(10000000);
  expect(detail.items[0].credits[0].recipients.sort()).toEqual(["Fictional Spouse A", "Fictional Spouse B"]);
  expect(JSON.stringify(detail)).not.toContain("Example Matching Company");
  expect(detail.items[0].notes.join()).toMatch(/at most once/);
});
it("separates unsupported complex transactions and matching-only exclusions from supported gifts", () => {
  const f = fixture([{}, { giftId: "102", type: "Pledge" }, { giftId: "103", type: "Pledge Payment" },
    { giftId: "104", credit: "Constituent MG-Payment" }]);
  expect(f.detail().counts).toEqual({ all: 4, counted: 1, review: 2, excluded: 1 });
  expect(f.view().snapshot.rows[0]).toMatchObject({ totalCents: null, supportedCents: 10000000, date: null });
  expect(f.detail(undefined, { view: "review" }).items.every(item => item.reasons.join().includes("linked history"))).toBe(true);
  expect(f.detail(undefined, { view: "excluded" }).items[0].notes.join()).toMatch(/employee matching/);
});
it("shows unsupported recognition as review, and explicitly excludes soft credit when a society omits it", () => {
  const f = fixture([{ credit: "Soft Credit Recipient" }], {}, { fullRecognition: false });
  expect(f.detail().items[0]).toMatchObject({ outcome: "review", reasons: [expect.stringContaining("allocation")] });
  f.state.snapshot.societies = lifetimeRules.map(rule => ({ ...rule, countSources: ["committed"] }));
  expect(f.detail().items[0].outcome).toBe("excluded");
});
it("withholds conflicting values even when a later duplicate matches another recipient", () => {
  const f = fixture([{ amount: "999" }, {}, { id: "2", name: "Fictional Credit Recipient", credit: "Soft Credit Recipient" }]);
  const recipient = f.view().snapshot.rows.find(row => row.name === "Fictional Credit Recipient");
  expect(recipient.supportedCents).toBeNull();
  expect(f.detail(recipient).items[0]).toMatchObject({ cents: null, day: null, outcome: "review", type: "Conflicting gift records" });
});
it.each([{ date: "invalid" }, { date: "1/1/2030" }, { amount: "-1" }, { amount: "invalid" }, { credit: "Unrecognized" }])("explains malformed gift evidence without guessing: %j", changes => {
  const f = fixture([{ ...changes }]); expect(f.detail().items[0].outcome).toBe("review"); expect(f.view().snapshot.rows[0].date).toBeNull();
});
it("pages gift details deterministically, keeps full counts and never returns the entire ledger", () => {
  const f = fixture(Array.from({ length: 61 }, (_, i) => ({ giftId: String(100 + i), amount: "100", type: i === 60 ? "Pledge" : "Cash" })));
  expect(f.detail()).toMatchObject({ total: 61, pages: 3, page: 0, pageSize: 25 });
  expect(f.detail().items).toHaveLength(25);
  expect(f.detail(undefined, { page: 2 }).items).toHaveLength(11);
  expect(f.detail(undefined, { view: "review", page: 2 })).toMatchObject({ page: 0, pages: 1, total: 1 });
  expect(f.detail(undefined, { view: "excluded" })).toMatchObject({ total: 0, items: [] });
});
it("handles older snapshots without discarding dates and rejects stale or invented targets", () => {
  const f = fixture([{}]); delete f.state.snapshot.giftReview;
  expect(f.detail()).toMatchObject({ available: false, items: [], message: expect.stringContaining("older import") });
  expect(f.view().snapshot.rows[0].date).toBe("2020-01-01");
  expect(() => f.detail(undefined, { revision: "old" })).toThrow(/Saved history changed/);
  expect(() => f.detail(undefined, { milestoneKey: "0".repeat(64) })).toThrow(/no longer/);
  f.state.snapshot.ruleVersion = -1;
  expect(() => savedLifetimeGiftReview(f.state, lifetimeRules, { revision: f.state.revision, milestoneKey: "0".repeat(64) })).toThrow(/no longer/);
});
it("does not expose an unconfirmed suggestion's combined history as an active household", () => {
  const f = fixture([{}, { id: "2", name: "Fictional Credit Recipient", credit: "Soft Credit Recipient" }]);
  const group = f.view().snapshot.sharedGroups[0];
  expect(() => f.detail(group.rows[0])).toThrow(/no longer/);
  f.state.snapshot.confirmedGroupIds = [group.id]; expect(f.detail(group.rows[0]).items).toHaveLength(1);
});
it("fails before publication rather than truncating oversized saved explanations", () => {
  const limit = LIFETIME_LIMITS.bytes;
  try { LIFETIME_LIMITS.bytes = 10; expect(() => fixture([{}])).toThrow(/explanations exceed/); }
  finally { LIFETIME_LIMITS.bytes = limit; }
});
it("rejects oversized type/flag fields and incomplete saved ledgers instead of returning partial evidence", () => {
  expect(() => fixture([{ credit: "x".repeat(201) }])).toThrow(/too long/);
  expect(() => fixture([{ type: "x".repeat(201) }])).toThrow(/too long/);
  const f = fixture([{}]); f.state.snapshot.giftReview.histories = {};
  expect(() => f.detail()).toThrow(/incomplete/);
});
it("exports all unresolved gifts beyond the current page and never changes saved dates or decisions", () => {
  const f = fixture(Array.from({ length: 61 }, (_, i) => ({ giftId: String(100 + i), type: i === 60 ? "Cash" : i % 2 ? "Pledge Payment" : "Pledge" })));
  const before = JSON.stringify(f.state), row = f.view().snapshot.rows[0];
  const result = f.detail(undefined, { page: 2 });
  expect(result.reconciliation).toEqual(expect.arrayContaining([expect.objectContaining({ code: "pledge", gifts: 30 }), expect.objectContaining({ code: "payment", gifts: 30 })]));
  expect(result.items[0].reconciliation[0].code).toBe("pledge");
  const csv = savedLifetimeReconciliationCsv(f.state, lifetimeRules, { revision: f.state.revision, milestoneKey: row.milestoneKey });
  expect(csv.startsWith("\uFEFF")).toBe(true); expect(csv.split("\r\n")).toHaveLength(61);
  expect(csv).toContain('"100"'); expect(csv).toContain('"159"'); expect(csv).not.toContain('"160"');
  expect(csv).not.toContain("recipientIds"); expect(csv).not.toContain(row.milestoneKey);
  expect(JSON.stringify(f.state)).toBe(before);
});
it("exports household gifts once and never pulls in unrelated company history or excluded employee credit", () => {
  const f = fixture([
    { id: "9", name: "Fictional Corporation", constituentType: "O", type: "Matching Gift Pledge Payment" },
    { id: "9", name: "Fictional Corporation", constituentType: "O", giftId: "999", type: "Pledge" },
    { name: "Spouse One", credit: "Soft Credit Recipient", type: "Matching Gift Pledge Payment", spouseId: "DEMO-2", maritalStatus: "Married" },
    { id: "2", name: "Spouse Two", credit: "Soft Credit Recipient", type: "Matching Gift Pledge Payment", spouseId: "DEMO-1", maritalStatus: "Married" },
    { name: "Spouse One", giftId: "888", credit: "Constituent MG-Payment", type: "Matching Gift Pledge Payment", spouseId: "DEMO-2", maritalStatus: "Married" },
  ], { identity: false, spouses: true });
  const company = f.view().snapshot.rows.find(row => row.constituentType === "organization");
  f.state.recordDecisions = { archives: [{ key: company.recordKey, name: company.name }] };
  const row = f.view().snapshot.sharedGroups[0].rows[0];
  const csv = savedLifetimeReconciliationCsv(f.state, lifetimeRules, { revision: f.state.revision, milestoneKey: row.milestoneKey });
  expect(csv.split("\r\n")).toHaveLength(2); expect(csv).toContain('"101"'); expect(csv).toContain("Spouse One; Spouse Two");
  expect(csv).not.toContain('"999"'); expect(csv).not.toContain('"888"'); expect(csv).not.toContain("Fictional Corporation");
});
it("fails closed on stale, incomplete, legacy, empty or oversized reconciliation exports", () => {
  const f = fixture([{ type: "Pledge" }]), options = { revision: f.state.revision, milestoneKey: f.view().snapshot.rows[0].milestoneKey };
  const output = changes => savedLifetimeReconciliationCsv(f.state, lifetimeRules, { ...options, ...changes });
  expect(() => output({ revision: "old" })).toThrow(/Saved history changed/);
  expect(() => output({ milestoneKey: "0".repeat(64) })).toThrow(/no longer/);
  const limit = LIFETIME_LIMITS.bytes;
  try { LIFETIME_LIMITS.bytes = 10; expect(() => output()).toThrow(/Nothing was truncated/); }
  finally { LIFETIME_LIMITS.bytes = limit; }
  const ledger = f.state.snapshot.giftReview;
  delete f.state.snapshot.giftReview; expect(() => output()).toThrow(/older import/);
  f.state.snapshot.giftReview = { ...ledger, histories: {} }; expect(() => output()).toThrow(/incomplete/);
  const clean = fixture([{}]);
  expect(() => savedLifetimeReconciliationCsv(clean.state, lifetimeRules, { revision: clean.state.revision, milestoneKey: clean.view().snapshot.rows[0].milestoneKey })).toThrow(/no unresolved/);
});
