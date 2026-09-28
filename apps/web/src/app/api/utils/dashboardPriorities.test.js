import { describe, expect, it, vi } from "vitest";
import { addPriorityDays, applyPriorityPreferences, buildDashboardPriorities, priorityDay, readDashboardPriorities, readPriorityCandidates, savePriorityPreference } from "./dashboardPriorities";

const now = new Date("2026-09-27T14:00:00Z");
const action = { id: 1, owner_user_id: 10, title: "Call about the event", details: "A saved note", prospect_name: "Sample Donor", prospect_status: "Active", status: "Open", due_date: "2026-09-27" };
const opportunity = { id: 2, prospect_id: 3, user_id: 10, title: "Scholarships", prospect_name: "Sample Donor", prospect_status: "Active", current_stage: "Cultivation", opportunity_status: "Active", expected_date: "2026-10-27", estimated_amount: 25000, blackbaud_constituent_id: "100", blackbaud_opportunity_id: "200", updated_at: "2026-09-20T12:00:00Z" };
const build = (actions = [action], opportunities = [opportunity]) => buildDashboardPriorities({ actions, opportunities }, now);

it("applies configured inclusive windows, retains overdue items and existing dismissals", async () => {
  const policy = { followUpDays: 1, opportunityDays: 1 };
  const actions = [action, { ...action, id: 4, due_date: "2026-09-28" }, { ...action, id: 5, due_date: "2026-09-29" }, { ...action, id: 6, due_date: "2026-01-01" }];
  const opps = [{ ...opportunity, expected_date: "2026-09-28" }, { ...opportunity, id: 3, blackbaud_opportunity_id: "201", expected_date: "2026-09-29" }];
  const result = buildDashboardPriorities({ actions, opportunities: opps }, now, policy);
  expect(result).toHaveLength(4);
  expect(result.find(i => i.kind === "opportunity").timing).toBe("Expected within 1 day");
  const baseline = build([action], [opps[0]]);
  const preferences = baseline.map(i => ({ item_key: i.key, item_revision: i.revision, state: "dismissed" }));
  expect(applyPriorityPreferences(result, preferences, "2026-09-27").hidden).toHaveLength(2);
  const db = vi.fn().mockResolvedValue([]);
  await readPriorityCandidates(10, now, db, null, policy);
  expect(db.mock.calls[0]).toContain("2026-09-28");
  expect(db.mock.calls[0]).toContain(1001);
});
it("allows a wider configured window without including closed opportunities", () => {
  const data = { actions: [{ ...action, due_date: "2026-10-27" }], opportunities: [{ ...opportunity, expected_date: "2026-12-26" }, { ...opportunity, id: 3, blackbaud_opportunity_id: "201", opportunity_status: "Funded" }] };
  expect(buildDashboardPriorities(data, now, { followUpDays: 30, opportunityDays: 90 })).toHaveLength(2);
});

describe("saved dashboard priorities", () => {
  it("uses natural, factual prompts and existing review links without suggesting automatic changes", () => {
    const [followUp, expected] = build();
    expect(followUp).toMatchObject({ timing: "Due today", href: "/follow-ups?tab=next-steps&nextStepId=1&status=Open" });
    expect(expected).toMatchObject({ key: "opportunity:nxt:200", href: "/my-top-prospects?prospectId=3" });
    expect(expected.message).toBe("The saved stage is Cultivation, and the expected date is Oct 27, 2026. Does the timing still look right?");
    expect(JSON.stringify(build())).not.toMatch(/move to solicitation|AI|live NXT/i);
  });
  it("includes overdue and inclusive 7/30-day boundaries but not undated, invalid, or distant records", () => {
    expect(build([action, { ...action, id: 4, due_date: "2026-10-04" }, { ...action, id: 5, due_date: "2026-10-05" }, { ...action, id: 6, due_date: null }, { ...action, id: 7, due_date: "2026-02-30" }], [opportunity, { ...opportunity, id: 8, blackbaud_opportunity_id: "201", expected_date: "2026-10-28" }])).toHaveLength(3);
    expect(build([{ ...action, due_date: "2026-01-01" }], [{ ...opportunity, expected_date: "2026-01-02" }]).map(item => item.timing)).toEqual(["Overdue follow-up", "Expected date has passed"]);
  });
  it.each(["Funded", "Declined", "Withdrawn", "Archived", "Inactive", "Closed - Gift Secured", "Closed", "Canceled"])("excludes %s opportunities", stage => {
    expect(build([], [{ ...opportunity, current_stage: stage }])).toEqual([]);
  });
  it("excludes completed follow-ups, archived prospects, pending changes, funded amounts, and identity conflicts", () => {
    expect(build([{ ...action, status: "Done" }], [{ ...opportunity, prospect_status: "Archived" }])).toEqual([]);
    expect(build([{ ...action, prospect_status: "Inactive" }], [{ ...opportunity, pipeline_change_id: "pending" }])).toEqual([]);
    expect(build([], [{ ...opportunity, closed_amount: "1.00" }])).toEqual([]);
    expect(build([], [opportunity, { ...opportunity, id: 20, blackbaud_constituent_id: "900" }])).toEqual([]);
  });
  it("collapses explicit identities before filtering so old open copies cannot revive closed ones", () => {
    const duplicate = { ...opportunity, id: 9, shared_opportunity_key: "shared", updated_at: "2026-09-22T12:00:00Z" };
    const local = { ...opportunity, id: 11, blackbaud_opportunity_id: null, shared_opportunity_key: "shared" };
    expect(build([], [opportunity, duplicate, local])).toHaveLength(1);
    expect(build([], [opportunity, { ...duplicate, opportunity_status: "Funded" }, local])).toHaveLength(0);
    expect(build([], [opportunity, { ...duplicate, expected_date: "2027-01-01" }, local])).toHaveLength(0);
  });
  it("does not combine independent follow-ups for the same prospect or similarly named opportunities", () => {
    expect(build([action, { ...action, id: 2 }], [opportunity, { ...opportunity, id: 8, blackbaud_opportunity_id: null }])).toHaveLength(4);
  });
  it("uses the Eastern calendar, including midnight and DST, not server UTC", () => {
    expect(priorityDay(new Date("2026-09-28T02:00:00Z"))).toBe("2026-09-27");
    expect(addPriorityDays("2026-10-31", 7)).toBe("2026-11-07");
    expect(addPriorityDays("2026-03-07", 1)).toBe("2026-03-08");
  });
  it("retains hides through incidental refreshes but resurfaces changes to actionable facts", () => {
    const items = build();
    const pref = items.map(item => ({ item_key: item.key, item_revision: item.revision, state: "dismissed" }));
    expect(applyPriorityPreferences(build([{ ...action, updated_at: "new" }], [{ ...opportunity, updated_at: "2026-09-25" }]), pref, "2026-09-27").items).toEqual([]);
    expect(applyPriorityPreferences(build([{ ...action, details: "Updated" }], [{ ...opportunity, current_stage: "Solicitation" }]), pref, "2026-09-27").items).toHaveLength(2);
  });
  it("expires snoozes on their calendar day and ignores missing or stale revisions", () => {
    const items = build();
    const pref = [{ item_key: items[0].key, item_revision: items[0].revision, state: "snoozed", snooze_until: "2026-09-28" }];
    expect(applyPriorityPreferences(items, pref, "2026-09-27").hidden).toHaveLength(1);
    expect(applyPriorityPreferences(items, pref, "2026-09-28").hidden).toHaveLength(0);
    expect(applyPriorityPreferences(items, [{ ...pref[0], item_revision: "old" }], "2026-09-27").hidden).toHaveLength(0);
  });
  it("reads bounded, workspace-owned saved rows and explicitly reports truncation", async () => {
    const sql = vi.fn().mockResolvedValueOnce(Array.from({ length: 1001 }, (_, i) => ({ ...action, id: i + 1 }))).mockResolvedValueOnce([opportunity]);
    const result = await readPriorityCandidates(10, now, sql);
    expect(result.truncated).toBe(true);
    expect(result.candidates).toHaveLength(1001);
    expect(sql.mock.calls[0][0].join("")).toContain("pa.owner_user_id =");
    expect(sql.mock.calls[1][0].join("")).toContain("p.user_id =");
    for (const call of sql.mock.calls) { expect(call).toContain(10); expect(call).toContain(1001); }
  });
  it("scopes preference reads and writes by both viewer and workspace, and never touches source tables", async () => {
    const sql = vi.fn().mockResolvedValueOnce([action]).mockResolvedValueOnce([opportunity]).mockResolvedValue([]);
    await readDashboardPriorities(7, 10, now, sql);
    expect(sql.mock.calls[2]).toContain(7); expect(sql.mock.calls[2]).toContain(10);
    sql.mockClear();
    await savePriorityPreference({ viewerId: 7, workspaceId: 10, item: build()[0], action: "snooze", days: 7, now, sqlClient: sql });
    expect(sql.mock.calls[0]).toContain("2026-10-04");
    expect(sql.mock.calls[0][0].join("")).toContain("ON CONFLICT (viewer_user_id, workspace_user_id, item_key)");
    await savePriorityPreference({ viewerId: 7, workspaceId: 10, item: build()[0], action: "restore", now, sqlClient: sql });
    expect(sql.mock.calls[1][0].join("")).toMatch(/DELETE FROM dashboard_priority_preferences/);
    expect(sql.mock.calls.flat().join(" ")).not.toMatch(/UPDATE prospects|UPDATE pending_actions|DELETE FROM prospect_opportunities/);
  });
  it("adds saved progress without changing a gift revision, snooze, dismissal, or unrelated reminder", async () => {
    const gift = { key: "gift:900", revision: "a".repeat(64), kind: "gift", giftId: "900", constituentId: "100" };
    const preference = { item_key: gift.key, item_revision: gift.revision, state: "dismissed" };
    const db = vi.fn().mockResolvedValueOnce([action]).mockResolvedValueOnce([]).mockResolvedValueOnce([preference])
      .mockResolvedValueOnce([{ id: 50, owner_user_id: 10, owner_name: "Officer", source_gift_id: "900", title: "Call donor", status: "Done", due_date: null }]);
    const result = await readDashboardPriorities(7, 10, now, db, { items: [gift], coverage: { status: "ready" } });
    expect(result.items).toEqual(build([action], []));
    expect(result.hidden).toEqual([expect.objectContaining({ ...gift, hiddenReason: "dismissed", followUp: {
      id: "50", ownerId: "10", ownerName: "Officer", title: "Call donor", status: "Done", dueDate: null,
    } })]);
    expect(db).toHaveBeenCalledTimes(4);
  });
  it("does not misrepresent failed progress reads as permission to create a new follow-up", async () => {
    const db = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("Database unavailable"));
    await expect(readDashboardPriorities(7, 10, now, db, { items: [{ key: "gift:900", kind: "gift", giftId: "900", constituentId: "100" }] }))
      .rejects.toThrow("Database unavailable");
  });
});
