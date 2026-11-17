// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("./sql", () => ({ default: vi.fn() }));
vi.mock("./reportRefresh", () => ({ getReportRefreshUser: vi.fn() }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: vi.fn(), getBlackbaudConnection: vi.fn() }));
vi.mock("./savedQueryExecution", () => ({ executeSavedQueryResults: vi.fn() }));
vi.mock("./givingSocietyConfigurations", () => ({ listGivingSocietyConfigurations: vi.fn() }));
import { publicLifetimeState, refreshLifetimeHistory, updateLifetimeGroup, updateLifetimeRecord, savedLifetimeGiftReview } from "./lifetimeSocieties";
import { materializeLifetimeFamilies, updateLifetimeFamily } from "./lifetimeFamilyGroups";
import { lifetimeCsv, lifetimeVisibleRows, filterLifetimeRows, lifetimeActiveGroupIds } from "@/utils/lifetimeSocieties";
import { lifetimeQueryFixture, lifetimeRules, lifetimeCsvFixture } from "../../../../test/lifetimeQueryFixture";
import { blackbaudApiFetch } from "./blackbaud";
import { checkLifetimeLinkedHistory } from "./lifetimeLinkedReports";

const options = { identity: false, spouses: true };
const a = { id: "1", name: "Morgan Example", spouseId: "DEMO-2", maritalStatus: "Married", amount: "60000", credit: "Soft Credit Recipient" };
const b = { id: "2", name: "Taylor Example", spouseId: "DEMO-1", maritalStatus: "Alum married to alum", amount: "60000", credit: "Soft Credit Recipient" };
const foundation = { id: "9", name: "Example Family Foundation", constituentType: "O", amount: "60000" };
const rows = [a, b, foundation, { ...foundation, giftId: "102", amount: "50000", date: "1/1/2021" },
  { ...a, giftId: "103", amount: "20000", credit: "Regular Gift" },
  { id: "10", name: "Unrelated Corporation", constituentType: "O", giftId: "104", amount: "9000000" }];

async function fixture(initial = rows) {
  let state = { revision: null, snapshot: null };
  const db = vi.fn(async (strings, ...values) => {
    if (strings.join().startsWith("SELECT")) return [{ payload: state }];
    state = JSON.parse(values.find(value => typeof value === "string" && value.startsWith('{"')));
    return [{ report_key: "saved" }];
  });
  const transport = { metadata: vi.fn().mockResolvedValue(lifetimeQueryFixture(options)), execute: vi.fn() };
  const rules = vi.fn().mockResolvedValue(lifetimeRules), user = { id: 81 };
  async function refresh(next = initial) {
    transport.execute.mockResolvedValue({ body: new TextEncoder().encode(lifetimeCsvFixture(next, options)), contentType: "text/csv", queryJobRowCount: next.length });
    return refreshLifetimeHistory({ revision: state.revision, user, db, rules, transport });
  }
  await refresh();
  const view = () => publicLifetimeState(state, lifetimeRules);
  const base = () => view().snapshot.sharedGroups.find(group => !group.family);
  const org = () => view().snapshot.rows.find(row => row.name === foundation.name);
  const command = (operation, values = {}) => updateLifetimeFamily({ revision: state.revision, user, db, rules, operation, householdKey: operation === "link-family" ? base()?.rows[0].recordKey : undefined,
    recordKey: operation === "link-family" ? org()?.recordKey : undefined, ...values });
  const record = (operation, values) => updateLifetimeRecord({ revision: state.revision, user, db, rules, operation, ...values });
  return { db, rules, transport, user, refresh, view, base, org, command, record, state: () => state, family: () => view().snapshot.sharedGroups.find(group => group.family) };
}

it("explicitly includes all selected foundation gifts, deduplicates shared gifts and keeps unrelated companies and individual totals unchanged", async () => {
  const f = await fixture(), before = structuredClone(f.view());
  f.transport.metadata.mockClear(); f.transport.execute.mockClear();
  expect(f.family()).toBeUndefined();
  await f.command("link-family");
  expect(f.family().rows[0]).toMatchObject({ totalCents: 13000000, date: "2021-01-01", status: "provisional", constituentType: "mixed", groupBasis: "family", giftCount: 3 });
  expect(f.view().snapshot.rows).toEqual(before.snapshot.rows);
  expect(f.base().rows).toEqual(before.snapshot.sharedGroups[0].rows);
  const visible = lifetimeVisibleRows(f.view().snapshot);
  expect(visible).toHaveLength(4);
  expect(visible.filter(row => row.groupBasis === "family")).toHaveLength(2);
  expect(visible.some(row => row.name === foundation.name)).toBe(false);
  expect(visible.some(row => row.name === "Unrelated Corporation")).toBe(true);
  expect(lifetimeVisibleRows(f.view().snapshot, false)).toHaveLength(before.snapshot.rows.length);
  expect(filterLifetimeRows(visible, { constituentType: "mixed" })).toHaveLength(2);
  expect(lifetimeCsv(visible)).toContain("Staff-linked family giving group; all imported qualifying member gifts");
  expect(f.transport.metadata).not.toHaveBeenCalled(); expect(f.transport.execute).not.toHaveBeenCalled(); expect(blackbaudApiFetch).not.toHaveBeenCalled();
  expect(JSON.stringify(f.view())).not.toMatch(/userId|familyAudit|giftReview\":/);
});

it("uses all exact family members in saved gift details without duplicate gift claims or unrelated gifts", async () => {
  const f = await fixture(); await f.command("link-family");
  const detail = savedLifetimeGiftReview(f.state(), lifetimeRules, { revision: f.state().revision, milestoneKey: f.family().rows[0].milestoneKey });
  expect(detail.counts).toEqual({ all: 3, counted: 3, review: 0, excluded: 0 });
  expect(detail.items.find(item => item.giftId === "101").credits.flatMap(credit => credit.recipients).sort()).toEqual([a.name, b.name, foundation.name].sort());
  expect(detail.items.some(item => item.giftId === "104")).toBe(false);
});

it("keeps foundations out of every household unless staff explicitly selects that organization", async () => {
  const f = await fixture();
  expect(f.base().rows[0]).toMatchObject({ totalCents: 8000000, date: null });
  await expect(f.command("link-family", { recordKey: f.view().snapshot.rows.find(row => row.constituentType === "individual").recordKey })).rejects.toThrow(/household and an organization/);
  await expect(f.command("link-family", { householdKey: f.org().recordKey })).rejects.toThrow(/household and an organization/);
  await expect(f.command("link-family", { householdKey: "0".repeat(64) })).rejects.toThrow(/household and an organization/);
  expect(f.state().familyLinks).toBeUndefined();
});

it("supports an additional explicit foundation but never transfers an old family confirmation to the expanded group", async () => {
  const f = await fixture(); await f.command("link-family");
  const first = f.family().rows[0]; await f.record("confirm-date", { milestoneKey: first.milestoneKey });
  const other = f.view().snapshot.rows.find(row => row.name === "Unrelated Corporation");
  await f.command("link-family", { recordKey: other.recordKey });
  expect(f.family().members).toHaveLength(4);
  expect(f.family().rows[0].status).toBe("provisional");
  expect(f.family().rows[0].milestoneKey).not.toBe(first.milestoneKey);
  expect(f.view().savedDecisions.milestones[0]).toMatchObject({ key: first.milestoneKey, matched: false });
  await f.command("unlink-family", { familyLinkKey: f.view().familyLinks.find(link => link.organizationKey === other.recordKey).key });
  expect(f.family().rows[0]).toMatchObject({ milestoneKey: first.milestoneKey, status: "confirmed", date: first.date });
});

it("preserves household and foundation confirmations without copying them to a new family scope; unlink restores the household", async () => {
  const f = await fixture([...rows, { ...b, giftId: "105", credit: "Regular Gift", amount: "100000", date: "1/1/2022" }]);
  const base = f.base().rows[0], org = f.org();
  await f.record("confirm-date", { milestoneKey: base.milestoneKey }); await f.record("confirm-date", { milestoneKey: org.milestoneKey });
  await f.command("link-family");
  expect(f.family().rows[0].status).toBe("provisional");
  expect(f.base().rows[0]).toMatchObject({ status: "confirmed", date: base.date });
  expect(f.org()).toMatchObject({ status: "confirmed", date: org.date });
  await f.command("unlink-family", { familyLinkKey: f.view().familyLinks[0].key });
  expect(f.family()).toBeUndefined();
  expect(lifetimeVisibleRows(f.view().snapshot).find(row => row.milestoneKey === base.milestoneKey).status).toBe("confirmed");
});

it("retains links and confirmed family dates across refresh while new gifts update totals without recalculating the date", async () => {
  const f = await fixture(); await f.command("link-family");
  const row = f.family().rows[0]; await f.record("confirm-date", { milestoneKey: row.milestoneKey });
  await f.refresh([...rows, { ...foundation, giftId: "106", amount: "1000000", date: "1/1/2010" }]);
  expect(f.family().rows[0]).toMatchObject({ status: "confirmed", date: "2021-01-01", calculationSkipped: true, totalCents: 113000000 });
  expect(f.family().rows[1]).toMatchObject({ status: "provisional", date: "2010-01-01" });
  expect(f.view().familyLinks[0].matched).toBe(true);
});

it("retains archived organization credit in the family and allows restoration without touching the group", async () => {
  const f = await fixture(); const key = f.org().recordKey; await f.record("archive-record", { recordKey: key });
  await f.command("link-family");
  expect(f.family().rows[0]).toMatchObject({ archived: false, totalCents: 13000000 });
  expect(f.family().rows[0].members.find(person => person.name === foundation.name).archived).toBe(true);
  await f.refresh(); expect(f.family().rows[0].totalCents).toBe(13000000);
  expect(lifetimeVisibleRows(f.view().snapshot, true, "archived").every(row => row.name === foundation.name)).toBe(true);
  await f.record("restore-record", { recordKey: key }); expect(f.family().rows[0].totalCents).toBe(13000000);
});

it.each(["missing foundation", "renamed foundation", "different spouse", "unknown organization", "missing member ledger"])("fails closed on %s instead of silently shrinking or reassigning the family", async scenario => {
  const f = await fixture(); await f.command("link-family");
  const changed = rows.map(row => ({ ...row }));
  if (scenario === "missing foundation") await f.refresh(changed.filter(row => row.id !== "9"));
  if (scenario === "renamed foundation") await f.refresh(changed.map(row => row.id === "9" ? { ...row, name: "Other identity" } : row));
  if (scenario === "different spouse") await f.refresh(changed.map(row => row.id === "1" ? { ...row, spouseId: "DEMO-3" } : row));
  if (scenario === "unknown organization") await f.refresh(changed.map(row => row.id === "9" ? { ...row, constituentType: "" } : row));
  if (scenario === "missing member ledger") { delete f.state().snapshot.giftReview.histories[f.org().id]; materializeLifetimeFamilies(f.state()); }
  expect(f.family()).toBeUndefined(); expect(f.view().familyLinks[0].matched).toBe(false);
  expect(f.state().familyLinks).toHaveLength(1);
  await f.command("unlink-family", { familyLinkKey: f.view().familyLinks[0].key }); expect(f.view().familyLinks).toHaveLength(0);
});

it("does not partially combine a family if one of several linked foundations disappears", async () => {
  const f = await fixture(); await f.command("link-family");
  await f.command("link-family", { recordKey: f.view().snapshot.rows.find(row => row.name === "Unrelated Corporation").recordKey });
  await f.refresh(rows.filter(row => row.id !== "10"));
  expect(f.family()).toBeUndefined(); expect(f.view().familyLinks.every(link => !link.matched)).toBe(true);
});

it("keeps conflicting gifts and unresolved pledges in review instead of making a family date confirmable", async () => {
  const f = await fixture([...rows, { ...foundation, giftId: "107", type: "Pledge", amount: "1000000" }]);
  await f.command("link-family");
  expect(f.family().rows[0]).toMatchObject({ totalCents: null, date: null, status: "review", supportedCents: 13000000 });
  await expect(f.record("confirm-date", { milestoneKey: f.family().rows[0].milestoneKey })).rejects.toThrow(/supported provisional/);
  await f.refresh(rows.map(row => row.id === "9" && row.giftId === undefined ? { ...row, amount: "70000" } : row));
  expect(f.family().rows[0]).toMatchObject({ totalCents: null, date: null, supportedCents: null });
});

it("rejects duplicate assignments, stale revisions, unsupported actions and changes to a linked base household", async () => {
  const f = await fixture(); await f.command("link-family"); const original = structuredClone(f.state());
  await expect(f.command("link-family")).rejects.toThrow(/already has a saved family link/);
  await expect(f.command("unlink-family", { revision: "stale", familyLinkKey: f.view().familyLinks[0].key })).rejects.toThrow(/Saved history changed/);
  await expect(f.command("unlink-family", { familyLinkKey: "0".repeat(64) })).rejects.toThrow(/no longer saved/);
  await expect(f.command("invented")).rejects.toThrow(/Unknown family/);
  await expect(updateLifetimeGroup({ operation: "remove-group", groupId: f.base().id, revision: f.state().revision, db: f.db, rules: f.rules, user: f.user })).rejects.toThrow(/Unlink/);
  await expect(updateLifetimeGroup({ operation: "confirm-group", groupId: f.family().id, revision: f.state().revision, db: f.db, rules: f.rules, user: f.user })).rejects.toThrow(/Unlink/);
  expect(f.state()).toEqual(original);
});

it("refuses missing evidence and fully archived households, without a provider request", async () => {
  const f = await fixture();
  for (const person of f.base().rows[0].members) await f.record("archive-record", { recordKey: person.recordKey });
  await expect(f.command("link-family")).rejects.toThrow(/current active household/);
  await f.record("restore-record", { recordKey: f.base().rows[0].members[0].recordKey });
  delete f.state().snapshot.giftReview;
  await expect(f.command("link-family")).rejects.toThrow(/Refresh gift history once/);
});

it("allows an unmatched family link to be removed while rules are stale and does not revive it when rules return", async () => {
  const f = await fixture(); await f.command("link-family"); const key = f.view().familyLinks[0].key;
  f.rules.mockResolvedValue(lifetimeRules.map(rule => ({ ...rule, minimumAmount: rule.minimumAmount + 1 })));
  await f.command("unlink-family", { familyLinkKey: key });
  f.rules.mockResolvedValue(lifetimeRules);
  expect(f.view().familyLinks).toEqual([]); expect(f.family()).toBeUndefined();
  expect(lifetimeActiveGroupIds(f.view().snapshot).has(f.base().id)).toBe(true);
});

it("requires compare-and-swap and a second rule check before publishing a family", async () => {
  const f = await fixture(), before = structuredClone(f.state());
  const db = vi.fn().mockResolvedValueOnce([{ payload: f.state() }]).mockResolvedValue([]);
  await expect(f.command("link-family", { db })).rejects.toThrow(/Saved history changed/);
  expect(db.mock.calls[1][0].join()).toContain("payload->>'revision'"); expect(f.state()).toEqual(before);
  f.rules.mockResolvedValueOnce(lifetimeRules).mockResolvedValueOnce(lifetimeRules.map(rule => ({ ...rule, minimumAmount: 1 })));
  await expect(f.command("link-family")).rejects.toThrow(/Society rules changed/); expect(f.state()).toEqual(before);
});

it.each([false, true])("reconciles foundation-only pledge evidence in the exact family scope, respecting later reductions (%s)", async writtenOff => {
  const f = await fixture([...rows, { ...foundation, giftId: "106", type: "Pledge", amount: "100000", date: "1/1/2018" }]);
  await f.command("link-family");
  const before = structuredClone(f.view().snapshot.rows), base = structuredClone(f.base().rows), milestoneKey = f.family().rows[0].milestoneKey;
  const raw = {
    "/gift/v1/gifts/106": { id: "106", type: "Pledge", amount: { value: 100000 }, balance: { value: writtenOff ? 0 : 100000 }, date: "2018-01-01", constituent_id: "9", soft_credits: [], linked_gifts: [] },
    "/constituent/v1/constituents/9": { id: "9", lookup_id: "DEMO-9" },
    "/gft-gifts/v2/gifts/106/installments": { pledge_id: "106", installments: [{ id: "806", amount: { value: 100000 }, balance: writtenOff ? 0 : 100000, date: "2018-01-01" }] },
    "/gft-gifts/v2/gifts/106/pledgepayments": { pledge_id: "106", pledge_payments: writtenOff ? [{ installment_id: "806", payment_gift_id: "107", amount_applied: { value: 100000 } }] : [] },
    "/gift/v1/gifts/107": { id: "107", type: "PledgeWriteOff", amount: { value: 100000 }, date: "2019-01-01", constituent_id: "9", soft_credits: [], linked_gifts: ["106"] },
  };
  const read = vi.fn(async path => structuredClone(raw[path]));
  const scope = f.family().rows[0].recordKey;
  for (let turn = 0; turn < 5 && f.state().snapshot.giftReview.linkedScopes?.[scope]?.job.status !== "complete"; turn++) {
    await checkLifetimeLinkedHistory({ revision: f.state().revision, milestoneKey, giftId: "106", operation: "check-linked", user: f.user, db: f.db, rules: f.rules, transport: async () => ({ read }) });
  }
  expect(f.state().snapshot.giftReview.linkedScopes[scope].job.status).toBe("complete");
  expect(f.family().rows[0]).toMatchObject(writtenOff ? { totalCents: 13000000, date: null, status: "review" } : { totalCents: 23000000, date: "2018-01-01", status: "provisional" });
  if (writtenOff) expect(f.family().rows[0].reasons).toContainEqual(expect.stringContaining("later reduction"));
  expect(f.view().snapshot.rows).toEqual(before); expect(f.base().rows).toEqual(base);
  materializeLifetimeFamilies(f.state());
  expect(f.family().rows[0].totalCents).toBe(writtenOff ? 13000000 : 23000000);
  expect(read.mock.calls.flat().every(path => !path.includes("query"))).toBe(true);
});
