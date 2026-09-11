import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const resolveConstituentMock = vi.fn();
const sendSubmissionEmailMock = vi.fn();
const createBlackbaudActionMock = vi.fn();
const getBlackbaudActionMock = vi.fn();
const updateBlackbaudActionMock = vi.fn();
const buildBlackbaudActionPayloadMock = vi.fn();
const buildBlackbaudActionMetadataPayloadMock = vi.fn();
const findBlackbaudConstituentByEmailMock = vi.fn();
const findBlackbaudConstituentByLookupIdMock = vi.fn();
const searchBlackbaudConstituentsMock = vi.fn();
const getBlackbaudFundraiserByIdMock = vi.fn();

const sqlQueue = [];
function queueSqlResult(value) {
  sqlQueue.push(value);
}
const sqlMockImpl = vi.fn(async () => sqlQueue.shift() ?? []);
function sqlTag(strings, ...values) {
  return sqlMockImpl(strings, ...values);
}
sqlTag.transaction = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: getWorkspaceUserMock,
}));

vi.mock("@/app/api/utils/constituents", () => ({
  resolveConstituent: resolveConstituentMock,
}));

vi.mock("@/app/api/utils/sendSubmissionEmail", () => ({
  sendSubmissionEmail: sendSubmissionEmailMock,
}));

vi.mock("@/app/api/utils/sql", () => ({
  default: sqlTag,
}));

vi.mock("@/app/api/utils/blackbaud", () => ({
  buildBlackbaudActionMetadataPayload: buildBlackbaudActionMetadataPayloadMock,
  buildBlackbaudActionPayload: buildBlackbaudActionPayloadMock,
  createBlackbaudAction: createBlackbaudActionMock,
  findBlackbaudConstituentByEmail: findBlackbaudConstituentByEmailMock,
  findBlackbaudConstituentByLookupId: findBlackbaudConstituentByLookupIdMock,
  getBlackbaudAction: getBlackbaudActionMock,
  getBlackbaudFundraiserById: getBlackbaudFundraiserByIdMock,
  searchBlackbaudConstituents: searchBlackbaudConstituentsMock,
  updateBlackbaudAction: updateBlackbaudActionMock,
}));

describe("donor update route", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-22T13:00:00.000Z"));

    sqlQueue.length = 0;
    sqlMockImpl.mockClear();
    authMock.mockReset();
    getWorkspaceUserMock.mockReset();
    resolveConstituentMock.mockReset();
    sendSubmissionEmailMock.mockReset();
    createBlackbaudActionMock.mockReset();
    getBlackbaudActionMock.mockReset();
    updateBlackbaudActionMock.mockReset();
    buildBlackbaudActionPayloadMock.mockReset();
    buildBlackbaudActionMetadataPayloadMock.mockReset();
    findBlackbaudConstituentByEmailMock.mockReset();
    findBlackbaudConstituentByLookupIdMock.mockReset();
    searchBlackbaudConstituentsMock.mockReset();
    getBlackbaudFundraiserByIdMock.mockReset();

    authMock.mockResolvedValue({ user: { email: "chelsea@example.com" } });
    getWorkspaceUserMock.mockResolvedValue({
      workspaceUser: {
        id: 44,
        name: "Leslie M. Redd",
        email: "lredd@example.com",
        role: "mgo",
        blackbaud_constituent_id: "234684",
      },
      sessionUser: {
        id: 2,
        name: "Chelsea Santoro",
        email: "chelsea@example.com",
        role: "admin",
        blackbaud_constituent_id: "800",
      },
      isActing: true,
    });
    resolveConstituentMock.mockResolvedValue({
      id: 88,
      blackbaud_constituent_id: "227949",
    });
    buildBlackbaudActionPayloadMock.mockImplementation((payload) => ({
      constituent_id: String(payload.blackbaudConstituentId),
      date: payload.actionDate,
      category: payload.actionCategory,
      summary: payload.summary,
      author: payload.authorName,
    }));
    buildBlackbaudActionMetadataPayloadMock.mockImplementation((payload) => ({
      metadata: payload,
    }));
    createBlackbaudActionMock.mockResolvedValue({ id: "bb-action-1" });
    getBlackbaudActionMock.mockResolvedValue({
      id: "bb-action-1",
      constituent_id: "227949",
    });
    findBlackbaudConstituentByLookupIdMock.mockResolvedValue(null);
    findBlackbaudConstituentByEmailMock.mockResolvedValue(null);
    searchBlackbaudConstituentsMock.mockResolvedValue([]);
    getBlackbaudFundraiserByIdMock.mockImplementation(async ({ fundraiserId }) => ({
      fundraiserId: String(fundraiserId),
    }));
    updateBlackbaudActionMock.mockResolvedValue({ ok: true });
    sendSubmissionEmailMock.mockResolvedValue();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("credits the selected MGO while recording and authenticating the Admin author", async () => {
    const { POST } = await import("./route.js");

    queueSqlResult([
      {
        id: 1001,
        donor_name: "Pat Prospect",
        submission_type: "donor_update",
      },
    ]);

    const request = new Request("https://example.com/api/submissions/donor-update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        donorName: "Pat Prospect",
        blackbaudConstituentId: "227949",
        actionCategory: "Meeting",
        interactionType: "Cultivation",
        summary: "Discovery visit with Pat",
        notes: "Met with Pat.",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.id).toBe(1001);
    expect(buildBlackbaudActionPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        authorName: "Chelsea Santoro",
        completedDate: "2026-07-22",
        fundraiserIds: ["234684"],
        summary: "Discovery visit with Pat",
      }),
    );
    expect(buildBlackbaudActionMetadataPayloadMock).toHaveBeenCalledWith(
      expect.objectContaining({
        completedDate: "2026-07-22",
        interactionType: "Cultivation",
        fundraiserIds: ["234684"],
      }),
    );
    expect(updateBlackbaudActionMock).toHaveBeenCalledWith(
      expect.objectContaining({
        authUserId: 2,
        actionId: "bb-action-1",
      }),
    );
    expect(createBlackbaudActionMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 44, authUserId: 2,
    }));
    const insert = sqlMockImpl.mock.calls.find(([strings]) => strings.join("").includes("INSERT INTO submissions"));
    expect(insert[0].join("")).toContain("entered_by_user_id");
    expect(insert[1]).toBe(44);
    expect(insert.at(-1)).toBe(2);
  });

  it("blocks an Executive before resolving or changing a constituent", async () => {
    const { POST } = await import("./route.js");
    getWorkspaceUserMock.mockResolvedValue({
      sessionUser: { id: 2, role: "executive" },
      workspaceUser: { id: 44, role: "mgo" },
      isActing: true,
    });
    const response = await POST(new Request("https://example.com/api/submissions/donor-update", {
      method: "POST", body: JSON.stringify({ donorName: "Pat Prospect" }),
    }));
    expect(response.status).toBe(403);
    expect(resolveConstituentMock).not.toHaveBeenCalled();
    expect(createBlackbaudActionMock).not.toHaveBeenCalled();
    expect(sqlMockImpl).not.toHaveBeenCalled();
  });
});
