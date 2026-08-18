import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authMock,
  ensureAppSchemaMock,
  getOrCreateUserMock,
  getBlackbaudConfigIssuesMock,
  listBlackbaudConstituentCustomFieldsMock,
  createBlackbaudConstituentCustomFieldMock,
} = vi.hoisted(() => ({
  authMock: vi.fn(),
  ensureAppSchemaMock: vi.fn(),
  getOrCreateUserMock: vi.fn(),
  getBlackbaudConfigIssuesMock: vi.fn(),
  listBlackbaudConstituentCustomFieldsMock: vi.fn(),
  createBlackbaudConstituentCustomFieldMock: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: getOrCreateUserMock }));
vi.mock("@/app/api/utils/blackbaud", () => ({
  createBlackbaudConstituentCustomField: createBlackbaudConstituentCustomFieldMock,
  getBlackbaudConfigIssues: getBlackbaudConfigIssuesMock,
  listBlackbaudConstituentCustomFields: listBlackbaudConstituentCustomFieldsMock,
}));

function createRequest(body) {
  return new Request("https://www.jumgogpt.app/api/reports/future-made-phase-ii/membership", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Future. Made. Phase II membership route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { email: "executive@example.edu" } });
    ensureAppSchemaMock.mockResolvedValue();
    getOrCreateUserMock.mockResolvedValue({ id: 17, role: "executive" });
    getBlackbaudConfigIssuesMock.mockReturnValue([]);
    listBlackbaudConstituentCustomFieldsMock.mockResolvedValue([]);
    createBlackbaudConstituentCustomFieldMock.mockResolvedValue({ id: "cf-900" });
  });

  it("rejects non-executive and non-admin users", async () => {
    getOrCreateUserMock.mockResolvedValueOnce({ id: 22, role: "mgo" });
    const { POST } = await import("./route.js");

    const response = await POST(createRequest({ constituentId: "555321" }));
    const payload = await response.json();

    expect(response.status).toBe(403);
    expect(payload.error).toMatch(/Only executives and admins/i);
    expect(createBlackbaudConstituentCustomFieldMock).not.toHaveBeenCalled();
  });

  it("returns already_present when the attribute already exists", async () => {
    listBlackbaudConstituentCustomFieldsMock.mockResolvedValueOnce([
      {
        id: "cf-1",
        category: "Prospect Research",
        description: "Future. Made. Phase II",
      },
    ]);
    const { POST } = await import("./route.js");

    const response = await POST(createRequest({ constituentId: "555321" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "already_present",
      constituentId: "555321",
      customFieldId: "cf-1",
    });
    expect(createBlackbaudConstituentCustomFieldMock).not.toHaveBeenCalled();
  });

  it("creates the prospect research attribute when missing", async () => {
    const { POST } = await import("./route.js");

    const response = await POST(createRequest({ constituentId: "555321" }));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toMatchObject({
      status: "added",
      constituentId: "555321",
      customFieldId: "cf-900",
    });
    expect(createBlackbaudConstituentCustomFieldMock).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 17,
        authUserId: 17,
        origin: "https://www.jumgogpt.app",
        payload: expect.objectContaining({
          parent_id: "555321",
          category: "Prospect Research",
          description: "Future. Made. Phase II",
          comment: "Added from JUMGOGPT",
        }),
      }),
    );
  });
});
