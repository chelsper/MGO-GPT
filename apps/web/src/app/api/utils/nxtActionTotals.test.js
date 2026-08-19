import { beforeEach, describe, expect, it, vi } from "vitest";

const { executeBlackbaudListQueryMock, listBlackbaudActionsMock } = vi.hoisted(() => ({
  executeBlackbaudListQueryMock: vi.fn(),
  listBlackbaudActionsMock: vi.fn(),
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  executeBlackbaudListQuery: executeBlackbaudListQueryMock,
  listBlackbaudActions: listBlackbaudActionsMock,
  getBlackbaudFundraiserById: vi.fn(),
  getBlackbaudConstituentById: vi.fn(),
}));

import { getNxtActionSummaryByWorkspaceUser } from "./nxtActionTotals";

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
    expect(listBlackbaudActionsMock).toHaveBeenCalledTimes(1);

    expect(results.get(22)).toEqual({
      actionsThisFY: 1,
      actions: [
        {
          actionId: "action-1",
          date: "2026-08-14",
          category: "Visit",
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

    expect(executeBlackbaudListQueryMock).toHaveBeenCalledTimes(1);
    expect(listBlackbaudActionsMock).toHaveBeenCalledTimes(1);
    expect(results.get(22)?.actionsThisFY).toBe(1);
    expect(results.get(22)?.actions?.[0]?.summary).toBe("Legacy action payload");
  });
});
