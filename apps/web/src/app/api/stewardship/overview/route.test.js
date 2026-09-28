import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  schema: vi.fn(),
  context: vi.fn(),
  letters: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.context }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/societyLetterStore", () => ({
  ensureSocietyLetterSchema: mocks.letters,
}));
vi.mock("@/app/api/utils/stewardshipOverview", () => ({
  readStewardshipOverview: mocks.read,
}));
import * as route from "./route";
const request = () =>
  new Request("https://example.test/api/stewardship/overview?workspaceId=999");
beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({
    user: { id: "auth-2", email: "staff@example.test" },
  });
  mocks.context.mockResolvedValue({
    sessionUser: { id: 2, role: "admin", active: true },
    workspaceUser: { id: 999, role: "mgo" },
  });
  mocks.read.mockResolvedValue({ holding: 3, inProgress: 1, readyToMail: 2 });
});
it.each(["admin", "advancement_services", "mgo,advancement_services"])(
  "allows real reviewer %s and returns private counts only",
  async (role) => {
    mocks.context.mockResolvedValue({
      sessionUser: { id: 2, role, active: true },
    });
    const response = await route.GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain(
      "private, no-store",
    );
    expect(await response.json()).toEqual({
      holding: 3,
      inProgress: 1,
      readyToMail: 2,
      viewerKey: "auth-2",
    });
    expect(mocks.read).toHaveBeenCalledOnce();
    expect(Object.keys(route)).toEqual(["GET"]);
  },
);
it.each([
  { id: 2, role: "mgo" },
  { id: 2, role: "executive" },
  { id: 2, role: "admin", active: false },
  null,
])(
  "denies unauthorized session despite delegated workspace",
  async (sessionUser) => {
    mocks.context.mockResolvedValue({
      sessionUser,
      workspaceUser: { id: 1, role: "admin" },
    });
    expect((await route.GET(request())).status).toBe(403);
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.letters).not.toHaveBeenCalled();
  },
);
it("does no database work before authentication", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await route.GET(request())).status).toBe(401);
  expect(mocks.schema).not.toHaveBeenCalled();
});
it("does not claim zero counts or reveal database errors on failure", async () => {
  mocks.read.mockRejectedValue(new Error("private details"));
  const response = await route.GET(request());
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    error: "Saved counts are unavailable. You can still open your work below.",
  });
});
