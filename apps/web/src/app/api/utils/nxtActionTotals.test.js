import { beforeEach, describe, expect, it, vi } from "vitest";

const { listBlackbaudActionsMock } = vi.hoisted(() => ({
  listBlackbaudActionsMock: vi.fn(),
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  listBlackbaudActions: listBlackbaudActionsMock,
}));

import { getNxtActionSummaryByWorkspaceUser } from "./nxtActionTotals";

describe("getNxtActionSummaryByWorkspaceUser", () => {
  beforeEach(() => {
    listBlackbaudActionsMock.mockReset();
  });

  it("falls back to another connected workspace user when the first action fetch fails", async () => {
    listBlackbaudActionsMock
      .mockRejectedValueOnce(new Error("Blackbaud is not connected for this user"))
      .mockResolvedValueOnce([
        {
          id: "action-1",
          completed_date: "2026-08-14",
          fundraisers: [{ constituent_id: "436887" }],
          constituent_id: "186057",
          constituent_name: "Leslie M. Redd",
          category: "Visit",
          summary: "Leadership meeting",
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

    expect(listBlackbaudActionsMock).toHaveBeenCalledTimes(2);
    expect(listBlackbaudActionsMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userId: 7,
        authUserId: 7,
      }),
    );
    expect(listBlackbaudActionsMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        userId: 22,
        authUserId: 22,
      }),
    );

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
});
