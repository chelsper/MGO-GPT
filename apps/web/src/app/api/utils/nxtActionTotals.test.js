import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeBlackbaudListQueryMock, listBlackbaudActionsMock } = vi.hoisted(() => ({
  executeBlackbaudListQueryMock: vi.fn(),
  listBlackbaudActionsMock: vi.fn(),
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  executeBlackbaudListQuery: executeBlackbaudListQueryMock,
  listBlackbaudActions: listBlackbaudActionsMock,
  getBlackbaudFundraiserById: vi.fn().mockResolvedValue(null),
  getBlackbaudConstituentById: vi.fn().mockResolvedValue(null),
}));

import { getNxtActionSummaryByWorkspaceUser } from "./nxtActionTotals";
import { getStandingsPeriods } from "@/utils/standingsPeriods";

describe("getNxtActionSummaryByWorkspaceUser", () => {
  beforeEach(() => {
    executeBlackbaudListQueryMock.mockReset();
    listBlackbaudActionsMock.mockReset();
  });

  it("falls back to another connected workspace user when the first action fetch fails", async () => {
    executeBlackbaudListQueryMock
      .mockRejectedValueOnce(new Error("Blackbaud is not connected for this user"))
      .mockResolvedValueOnce([
        {
          id: "action-1",
          action_date: "2026-08-14",
          fundraisers: [{ constituent_id: "436887" }],
          constituent_summary: {
            system_record_id: "186057",
            formatted_name: "Leslie M. Redd",
          },
          type: { description: "Visit" },
          action_summary: {
            note_summary: "Leadership meeting",
          },
        },
      ]);
    listBlackbaudActionsMock.mockRejectedValueOnce(
      new Error("Blackbaud is not connected for this user"),
    );

    const results = await getNxtActionSummaryByWorkspaceUser({
      workspaceUsers: [
        {
          id: 22,
          blackbaud_constituent_id: "436887",
          blackbaud_lookup_id: "436887",
          blackbaud_fundraiser_alias_ids: [],
        },
      ],
      authUserId: 7,
      origin: "https://www.jumgogpt.app",
      fiscalYearStart: "2026-07-01",
      fiscalYearEnd: "2027-06-30",
    });

    expect(executeBlackbaudListQueryMock).toHaveBeenCalledTimes(2);
    expect(executeBlackbaudListQueryMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userId: 7,
        authUserId: 7,
      }),
    );
    expect(executeBlackbaudListQueryMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        userId: 22,
        authUserId: 22,
      }),
    );
    expect(listBlackbaudActionsMock).toHaveBeenCalled();

    expect(results.get(22)).toEqual({
      actionsThisFY: 1,
      highValueActionsThisFY: 0,
      actions: [
        {
          actionId: "action-1",
          date: "2026-08-14",
          category: "",
          type: "Visit",
          highValue: false,
          summary: "Leadership meeting",
          blackbaudConstituentId: "186057",
          constituentName: "Leslie M. Redd",
        },
      ],
    });
  });

  it("falls back to the legacy action list when the sorted list query is unavailable", async () => {
    executeBlackbaudListQueryMock.mockRejectedValueOnce(new Error("List v2 unavailable"));
    listBlackbaudActionsMock.mockResolvedValueOnce([
      {
        id: "action-3",
        completed_date: "2026-10-01",
        fundraisers: [{ constituent_id: "436887" }],
        constituent_id: "186057",
        constituent_name: "Leslie M. Redd",
        category: "Call",
        summary: "Legacy action payload",
      },
    ]);

    const results = await getNxtActionSummaryByWorkspaceUser({
      workspaceUsers: [
        {
          id: 22,
          blackbaud_constituent_id: "436887",
          blackbaud_lookup_id: "436887",
          blackbaud_fundraiser_alias_ids: [],
        },
      ],
      authUserId: 7,
      origin: "https://www.jumgogpt.app",
      fiscalYearStart: "2026-07-01",
      fiscalYearEnd: "2027-06-30",
    });

    expect(executeBlackbaudListQueryMock).toHaveBeenCalledTimes(2);
    expect(listBlackbaudActionsMock).toHaveBeenCalled();
    expect(results.get(22)?.actionsThisFY).toBe(1);
    expect(results.get(22)?.actions?.[0]?.summary).toBe("Legacy action payload");
  });

  it("keeps searching candidate connections until it finds the one with in-range FY actions", async () => {
    executeBlackbaudListQueryMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "action-7",
          action_date: "2026-08-14",
          fundraisers: [{ constituent_id: "436887" }],
          constituent_summary: {
            system_record_id: "186057",
            formatted_name: "Leslie M. Redd",
          },
          type: { description: "Visit" },
          action_summary: {
            note_summary: "FY27 match from second connection",
          },
        },
      ]);
    listBlackbaudActionsMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const results = await getNxtActionSummaryByWorkspaceUser({
      workspaceUsers: [
        {
          id: 22,
          blackbaud_constituent_id: "186057",
          blackbaud_lookup_id: "436887",
          blackbaud_fundraiser_alias_ids: [],
        },
      ],
      authUserId: 7,
      origin: "https://www.jumgogpt.app",
      fiscalYearStart: "2026-07-01",
      fiscalYearEnd: "2027-06-30",
    });

    expect(executeBlackbaudListQueryMock).toHaveBeenCalledTimes(2);
    expect(results.get(22)?.actionsThisFY).toBe(1);
    expect(results.get(22)?.actions?.[0]?.summary).toBe(
      "FY27 match from second connection",
    );
  });
});

describe("high-value NXT action scoring", () => {
  const workspaceUsers = [
    { id: 1, name: "Alex Rivera", blackbaud_constituent_id: "101" },
    { id: 2, name: "Jordan Rivera", blackbaud_constituent_id: "102" },
  ];
  const options = { workspaceUsers, authUserId: 1, origin: "https://example.org", fiscalYearStart: "2026-07-01", fiscalYearEnd: "2027-06-30" };
  const action = (id, fields = {}) => ({ id, action_date: "2026-09-01", fundraisers: [{ constituent_id: "101" }], ...fields });
  beforeEach(() => {
    executeBlackbaudListQueryMock.mockReset().mockResolvedValue([]);
    listBlackbaudActionsMock.mockReset().mockResolvedValue([]);
  });
  it("counts Meeting OR Solicitation once, deduplicates action IDs and honors FY boundaries", async () => {
    executeBlackbaudListQueryMock.mockResolvedValue([
      action("meeting", { category: " Meeting ", type: "Visit" }),
      action("ask", { category: "Phone Call", type: { description: "solicitation" } }),
      action("both", { category: { description: "MEETING" }, "type.description": "Solicitation" }),
      action("both", { category: "Meeting", type: "Solicitation" }),
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
  it("does not credit the subject constituent or a different fundraiser with the same surname", async () => {
    executeBlackbaudListQueryMock.mockResolvedValue([
      action("subject", { constituent_id: "101", fundraisers: [] , category: "Meeting" }),
      action("shared", { category: "Meeting", fundraisers: [{ constituent_id: "101" }, { constituent_id: "101" }, { constituent_id: "102" }] }),
      action("wrong-person", { category: "Meeting", fundraisers: [{ id: "103", name: "Taylor Rivera" }] }),
    ]);
    const result = await getNxtActionSummaryByWorkspaceUser(options);
    expect(result.get(1).highValueActionsThisFY).toBe(1);
    expect(result.get(2).highValueActionsThisFY).toBe(1);
  });
  it("distinguishes a confirmed empty feed from missing fundraiser identity", async () => {
    const result = await getNxtActionSummaryByWorkspaceUser({ ...options, workspaceUsers: [...workspaceUsers, { id: 3, name: "No mapping" }] });
    expect(result.get(1).highValueActionsThisFY).toBe(0);
    expect(result.get(3).highValueActionsThisFY).toBeNull();
  });
  it("does not turn connection errors into a zero score", async () => {
    executeBlackbaudListQueryMock.mockRejectedValue(new Error("429"));
    listBlackbaudActionsMock.mockRejectedValue(new Error("403"));
    await expect(getNxtActionSummaryByWorkspaceUser(options)).rejects.toThrow("could not be refreshed");
  });
  it("calculates YTD, prior YTD and week from one deduplicated action feed", async () => {
    const { current, prior, week } = getStandingsPeriods(new Date("2026-09-04T15:00:00Z"));
    executeBlackbaudListQueryMock.mockResolvedValue([
      action("now", { category: "Meeting", type: "Solicitation", action_date: "2026-08-25" }),
      action("now", { category: "Meeting", action_date: "2026-08-25" }),
      action("today", { type: "Solicitation", action_date: "2026-09-04" }),
      action("prior", { category: "Meeting", action_date: "2025-09-04" }),
      action("after-cutoff", { category: "Meeting", action_date: "2025-09-05" }),
      action("future", { category: "Meeting", action_date: "2026-09-05" }),
      action("record-date-only", { category: "Meeting", action_date: null, date_added: "2026-09-04" }),
    ]);
    const result = await getNxtActionSummaryByWorkspaceUser({ ...options, fiscalYearStart: prior.startsOn, fiscalYearEnd: current.endsOn, periods: { current, prior, week }, requireComplete: true });
    expect(result.get(1)).toMatchObject({ actionsThisFY: 2, highValueActionsThisFY: 2, periods: { prior: { highValueActions: 1 }, week: { highValueActions: 1 } } });
    expect(result.get(1).actions).toHaveLength(2);
    expect(executeBlackbaudListQueryMock).toHaveBeenCalledTimes(2);
    expect(executeBlackbaudListQueryMock).toHaveBeenCalledWith(expect.objectContaining({ requireComplete: true }));
  });
  it("does not replace a capped feed with a smaller fallback and call it complete", async () => {
    executeBlackbaudListQueryMock.mockRejectedValue(Object.assign(new Error("Pagination cap"), { code: "NXT_INCOMPLETE_RESULTS" }));
    await expect(getNxtActionSummaryByWorkspaceUser({ ...options, requireComplete: true })).rejects.toThrow("Pagination cap");
    expect(listBlackbaudActionsMock).not.toHaveBeenCalled();
  });
});
