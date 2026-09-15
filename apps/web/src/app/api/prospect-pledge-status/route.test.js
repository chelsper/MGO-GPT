import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  schema: vi.fn(),
  workspace: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: mocks.workspace,
}));
vi.mock("@/app/api/utils/prospectPledgeStatus", () => ({
  readProspectPledgeStatus: mocks.read,
}));
import { GET } from "./route";
const user = { id: 44, active: true, role: "mgo" };
const request = () =>
  new Request(
    "https://app.example/api/prospect-pledge-status?workspaceUserId=999&constituentIds=999",
  );
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "mgo@example.com" } });
  mocks.workspace.mockResolvedValue({ sessionUser: user, workspaceUser: user });
  mocks.read.mockResolvedValue({
    queryId: "12033",
    available: true,
    byConstituentId: {
      100: { count: 1, stale: false, verifiedAt: "2026-09-15T13:00:00Z" },
    },
  });
});
it("uses only authenticated workspace membership, never supplied IDs", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  expect((await response.json()).workspaceUserId).toBe(44);
  expect(mocks.read).toHaveBeenCalledWith({
    workspaceUserId: 44,
    origin: "https://app.example",
  });
});
it("requires sign-in before schema/data access", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401);
  expect(mocks.schema).not.toHaveBeenCalled();
  expect(mocks.read).not.toHaveBeenCalled();
});
it.each([
  { sessionUser: { ...user, active: false }, workspaceUser: user },
  { sessionUser: user, workspaceUser: { ...user, active: false } },
  { sessionUser: user, workspaceUser: { ...user, id: 99 } },
  { sessionUser: { ...user, role: "unknown" }, workspaceUser: user },
  { sessionUser: user, workspaceUser: user, invalidActingUserId: 99 },
])(
  "rejects unavailable or unauthorized workspace contexts %#",
  async (context) => {
    mocks.workspace.mockResolvedValue(context);
    expect((await GET(request())).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
  },
);
it.each(["admin", "executive"])(
  "allows existing %s delegated read access without permitting report access",
  async (role) => {
    mocks.workspace.mockResolvedValue({
      sessionUser: { ...user, id: 1, role },
      workspaceUser: user,
    });
    expect((await GET(request())).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledWith({
      workspaceUserId: 44,
      origin: "https://app.example",
    });
  },
);
it("sanitizes errors instead of reporting no pledges", async () => {
  mocks.read.mockRejectedValue(new Error("private donor database details"));
  const response = await GET(request());
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("private donor");
});
