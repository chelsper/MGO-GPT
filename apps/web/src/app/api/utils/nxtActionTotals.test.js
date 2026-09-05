import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeBlackbaudListQueryMock, listBlackbaudActionsMock, identityLookupMock } = vi.hoisted(() => ({
  executeBlackbaudListQueryMock: vi.fn(),
  listBlackbaudActionsMock: vi.fn(),
  identityLookupMock: vi.fn(),
}));
vi.mock("@/app/api/utils/blackbaud", () => ({
  executeBlackbaudListQuery: executeBlackbaudListQueryMock,
  listBlackbaudActions: listBlackbaudActionsMock,
  getBlackbaudFundraiserById: identityLookupMock,
  getBlackbaudConstituentById: identityLookupMock,
}));
import { getNxtActionSummaryByWorkspaceUser } from "./nxtActionTotals";
import { buildStandingsActionQuery } from "./standingsActionQuery";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

const workspaceUsers = [
  { id: 1, name: "Alex Rivera", blackbaud_constituent_id: "101", blackbaud_lookup_id: "901" },
  { id: 2, name: "Jordan Rivera", blackbaud_constituent_id: "102" },
];
const options = { workspaceUsers, authUserId: 7, origin: "https://example.org", fiscalYearStart: "2026-07-01", fiscalYearEnd: "2027-06-30" };
const action = (id, fields = {}) => ({ system_record_id: id, action_date: "2026-09-01", fundraisers: [{ system_record_id: "101" }], ...fields });
const comparison = getStandingsPeriods(new Date("2026-09-04T15:00:00Z"));
const comparisonOptions = {
  ...options,
  fiscalYearStart: comparison.prior.startsOn,
  fiscalYearEnd: comparison.current.endsOn,
  fiscalYears: comparison.actionFiscalYears,
  periods: { current: comparison.current, prior: comparison.prior, week: comparison.week },
};

beforeEach(() => {
  executeBlackbaudListQueryMock.mockReset().mockResolvedValue([]);
  listBlackbaudActionsMock.mockReset();
  identityLookupMock.mockReset();
});

describe("solicitor and fiscal-year scoped action retrieval", () => {
  it("queries each full fiscal year using only the listed solicitor system IDs", async () => {
    executeBlackbaudListQueryMock.mockResolvedValueOnce([action("current")]).mockResolvedValueOnce([action("prior", { action_date: "2025-07-01" })]);
    const result = await getNxtActionSummaryByWorkspaceUser(comparisonOptions);
    expect(executeBlackbaudListQueryMock).toHaveBeenCalledTimes(2);
    comparison.actionFiscalYears.forEach((window, index) => {
      expect(executeBlackbaudListQueryMock).toHaveBeenNthCalledWith(index + 1, {
        userId: 7, authUserId: 7, origin: options.origin, dataModelName: "renxt-action",
        definition: buildStandingsActionQuery({ fundraiserIds: ["101", "102"], ...window }),
        limit: 250, maxPages: 20, requireComplete: true,
      });
    });
    expect(result.get(1)).toMatchObject({ actionsThisFY: 1, periods: { prior: { actions: 1 } } });
    expect(listBlackbaudActionsMock).not.toHaveBeenCalled();
    expect(identityLookupMock).not.toHaveBeenCalled();
  });

  it("accepts an empty fiscal year without another connection or broader endpoint", async () => {
    executeBlackbaudListQueryMock.mockResolvedValueOnce([]).mockResolvedValueOnce([action("prior", { category: "Meeting", action_date: "2025-08-01" })]);
    const result = await getNxtActionSummaryByWorkspaceUser(comparisonOptions);
    expect(result.get(1)).toMatchObject({ actionsThisFY: 0, highValueActionsThisFY: 0, periods: { prior: { highValueActions: 1 } } });
    expect(executeBlackbaudListQueryMock).toHaveBeenCalledTimes(2);
    expect(listBlackbaudActionsMock).not.toHaveBeenCalled();
  });

  it.each(["401", "403 quota", "429", "404", "NXT_INCOMPLETE_RESULTS"])("propagates %s without an unfiltered or alternate-user fallback", async (message) => {
    executeBlackbaudListQueryMock.mockRejectedValue(new Error(message));
    await expect(getNxtActionSummaryByWorkspaceUser(comparisonOptions)).rejects.toThrow(message);
    expect(executeBlackbaudListQueryMock).toHaveBeenCalledTimes(1);
    expect(listBlackbaudActionsMock).not.toHaveBeenCalled();
  });

  it("does not return a partial comparison when the second FY fails", async () => {
    executeBlackbaudListQueryMock.mockResolvedValueOnce([action("current")]).mockRejectedValueOnce(new Error("FY26 incomplete"));
    await expect(getNxtActionSummaryByWorkspaceUser(comparisonOptions)).rejects.toThrow("FY26 incomplete");
    expect(executeBlackbaudListQueryMock).toHaveBeenCalledTimes(2);
    expect(listBlackbaudActionsMock).not.toHaveBeenCalled();
  });

  it("refuses to query if no listed solicitor has a system ID mapping", async () => {
    await expect(getNxtActionSummaryByWorkspaceUser({ ...options, workspaceUsers: [{ id: 1, blackbaud_lookup_id: "901" }] })).rejects.toThrow("solicitor system IDs");
    expect(executeBlackbaudListQueryMock).not.toHaveBeenCalled();
  });

  it("includes explicitly configured aliases, never an unrelated lookup ID", async () => {
    const users = [{ ...workspaceUsers[0], blackbaud_fundraiser_alias_ids: ["103"] }];
    executeBlackbaudListQueryMock.mockResolvedValue([
      action("alias", { category: "Meeting", fundraisers: [{ system_record_id: "103" }] }),
      action("lookup", { category: "Meeting", fundraisers: [{ system_record_id: "901" }] }),
    ]);
    const result = await getNxtActionSummaryByWorkspaceUser({ ...options, workspaceUsers: users });
    expect(executeBlackbaudListQueryMock.mock.calls[0][0].definition).toEqual(buildStandingsActionQuery({ fundraiserIds: ["101", "103"], startsOn: options.fiscalYearStart, endsOn: options.fiscalYearEnd }));
    expect(result.get(1).highValueActionsThisFY).toBe(1);
  });
});

describe("high-value NXT action scoring", () => {
  it("counts Meeting OR Solicitation once, deduplicates system IDs and honors inclusive FY boundaries", async () => {
    executeBlackbaudListQueryMock.mockResolvedValue([
      action("meeting", { category: " Meeting ", type: "Visit" }),
      action("ask", { category: "Phone call", type: { description: "solicitation" } }),
      action("both", { id: "modern-1", category: { description: "MEETING" }, "type.description": "Solicitation" }),
      action("both", { id: "modern-2", category: "Meeting", type: "Solicitation" }),
      action("wrong-fields", { category: "Solicitation", type: "Meeting" }),
      action("not-exact", { category: "Meeting preparation", type: "Pre-Solicitation" }),
      action("old", { category: "Meeting", action_date: "2026-06-30" }),
      action("future-fy", { category: "Meeting", action_date: "2027-07-01" }),
      action("invalid-date", { category: "Meeting", action_date: "invalid" }),
      action("start", { category: "Meeting", action_date: "2026-07-01" }),
      action("end", { type: "Solicitation", action_date: "2027-06-30" }),
    ]);
    const result = await getNxtActionSummaryByWorkspaceUser(options);
    expect(result.get(1)).toMatchObject({ actionsThisFY: 7, highValueActionsThisFY: 5 });
    expect(result.get(1).actions.filter((item) => item.highValue)).toHaveLength(5);
    expect(result.get(2)).toMatchObject({ actionsThisFY: 0, highValueActionsThisFY: 0 });
  });

  it("credits only explicit action solicitors, not the subject constituent or a guessed name", async () => {
    executeBlackbaudListQueryMock.mockResolvedValue([
      action("subject", { constituent_id: "101", fundraisers: [], category: "Meeting" }),
      action("shared", { category: "Meeting", fundraisers: [{ system_record_id: "101" }, { system_record_id: "101" }, { system_record_id: "102" }] }),
      action("wrong-person", { category: "Meeting", fundraisers: [{ system_record_id: "103", formatted_name: "Alex Rivera" }] }),
    ]);
    const result = await getNxtActionSummaryByWorkspaceUser(options);
    expect(result.get(1).highValueActionsThisFY).toBe(1);
    expect(result.get(2).highValueActionsThisFY).toBe(1);
    expect(identityLookupMock).not.toHaveBeenCalled();
  });

  it("distinguishes a confirmed empty feed from a missing identity", async () => {
    const result = await getNxtActionSummaryByWorkspaceUser({ ...options, workspaceUsers: [...workspaceUsers, { id: 3, name: "No mapping" }] });
    expect(result.get(1).highValueActionsThisFY).toBe(0);
    expect(result.get(3).highValueActionsThisFY).toBeNull();
  });

  it("uses action dates, never completion, creation or modification dates", async () => {
    executeBlackbaudListQueryMock.mockResolvedValue([
      action("created", { action_date: null, date_added: "2026-09-01" }),
      action("modified", { action_date: null, date_last_changed: "2026-09-01" }),
      action("completed", { action_date: null, completed_date: "2026-09-01" }),
      action("prior-action", { action_date: "2026-06-30", completed_date: "2026-09-01" }),
    ]);
    expect((await getNxtActionSummaryByWorkspaceUser(options)).get(1).actionsThisFY).toBe(0);
  });

  it("preserves matching YTD and weekly cutoffs within the full fiscal-year windows", async () => {
    executeBlackbaudListQueryMock.mockResolvedValueOnce([
      action("now", { category: "Meeting", type: "Solicitation", action_date: "2026-08-25" }),
      action("now", { category: "Meeting", action_date: "2026-08-25" }),
      action("today", { type: "Solicitation", action_date: "2026-09-04" }),
      action("future", { category: "Meeting", action_date: "2026-09-05" }),
    ]).mockResolvedValueOnce([
      action("prior", { category: "Meeting", action_date: "2025-09-04" }),
      action("after-cutoff", { category: "Meeting", action_date: "2025-09-05" }),
    ]);
    const result = await getNxtActionSummaryByWorkspaceUser(comparisonOptions);
    expect(result.get(1)).toMatchObject({ actionsThisFY: 2, highValueActionsThisFY: 2, periods: { prior: { highValueActions: 1 }, week: { highValueActions: 1 } } });
    expect(result.get(1).actions).toHaveLength(2);
    expect(executeBlackbaudListQueryMock).toHaveBeenCalledTimes(2);
  });
});
