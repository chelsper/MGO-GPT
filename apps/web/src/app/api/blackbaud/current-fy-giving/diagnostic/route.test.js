import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const blackbaudApiFetchMock = vi.fn();
const getBlackbaudConfigIssuesMock = vi.fn();

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({
  default: ensureAppSchemaMock,
}));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: getWorkspaceUserMock,
}));
vi.mock("@/app/api/utils/blackbaud", () => ({
  blackbaudApiFetch: blackbaudApiFetchMock,
  getBlackbaudConfigIssues: getBlackbaudConfigIssuesMock,
}));

describe("current fiscal year giving diagnostic route", () => {
  beforeEach(() => {
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getWorkspaceUserMock.mockReset();
    blackbaudApiFetchMock.mockReset();
    getBlackbaudConfigIssuesMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "reviewer@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getBlackbaudConfigIssuesMock.mockReturnValue([]);
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 9, email: "reviewer@example.com", role: "reviewer" },
      workspaceUser: { id: 9, email: "reviewer@example.com", role: "reviewer" },
      isActing: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns only relevant contribution field metadata to reviewers", async () => {
    blackbaudApiFetchMock
      .mockResolvedValueOnce({
        data_models: [{ name: "contribution" }, { name: "list-management" }],
      })
      .mockResolvedValueOnce({
        fields: [
          {
            field_id: "recognition_credit_recipient_id",
            display_name: "Recognition credit recipient ID",
            data_type: "String",
            is_filterable: true,
          },
          {
            field_id: "gift_amount",
            display_name: "Gift amount",
            data_type: "Currency",
          },
          { field_id: "unrelated_field", display_name: "Unrelated field" },
        ],
      });

    const { GET } = await import("./route.js");
    const response = await GET(
      new Request("https://example.com/api/blackbaud/current-fy-giving/diagnostic"),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.availableDataModels).toEqual(["contribution", "list-management"]);
    expect(payload.contributionFields).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldId: "recognition_credit_recipient_id" }),
        expect.objectContaining({ fieldId: "gift_amount" }),
      ]),
    );
    expect(payload.contributionFields).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ fieldId: "unrelated_field" })]),
    );
    expect(blackbaudApiFetchMock).toHaveBeenCalledWith(
      "/lst-lists/datamodels/contribution",
      expect.objectContaining({ userId: 9, authUserId: 9 }),
    );
  });

  it("does not expose the List V2 schema to non-reviewers", async () => {
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 10, email: "mgo@example.com", role: "mgo" },
      workspaceUser: { id: 10, email: "mgo@example.com", role: "mgo" },
      isActing: false,
    });

    const { GET } = await import("./route.js");
    const response = await GET(
      new Request("https://example.com/api/blackbaud/current-fy-giving/diagnostic"),
    );

    expect(response.status).toBe(403);
    expect(blackbaudApiFetchMock).not.toHaveBeenCalled();
  });
});
