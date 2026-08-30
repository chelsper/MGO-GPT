import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getOrCreateUserMock = vi.fn();
const getOrganizationSettingsMock = vi.fn();

vi.mock("@/auth", () => ({
  auth: authMock,
}));

vi.mock("@/app/api/utils/ensureAppSchema", () => ({
  default: ensureAppSchemaMock,
}));

vi.mock("@/app/api/utils/getOrCreateUser", () => ({
  default: getOrCreateUserMock,
}));

vi.mock("@/app/api/utils/organizationSettings", () => ({
  getOrganizationSettings: getOrganizationSettingsMock,
}));

describe("organization settings read", () => {
  beforeEach(() => {
    authMock.mockReset();
    ensureAppSchemaMock.mockReset();
    getOrCreateUserMock.mockReset();
    getOrganizationSettingsMock.mockReset();

    ensureAppSchemaMock.mockResolvedValue();
    getOrCreateUserMock.mockResolvedValue({ id: 7, role: "mgo" });
  });

  it("requires a signed-in user", async () => {
    authMock.mockResolvedValue(null);
    const { GET } = await import("./route.js");

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(getOrCreateUserMock).not.toHaveBeenCalled();
    expect(getOrganizationSettingsMock).not.toHaveBeenCalled();
  });

  it("returns non-secret settings for a signed-in user without browser caching", async () => {
    const session = { user: { email: "user@example.edu" } };
    const settings = {
      institutionName: "Example College",
      terminology: { mgo: "Gift Officer" },
    };
    authMock.mockResolvedValue(session);
    getOrganizationSettingsMock.mockResolvedValue(settings);
    const { GET } = await import("./route.js");

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(getOrCreateUserMock).toHaveBeenCalledWith(session, "mgo");
    await expect(response.json()).resolves.toEqual({ settings });
  });
});
