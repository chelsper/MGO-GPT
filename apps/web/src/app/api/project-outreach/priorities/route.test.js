import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  user: vi.fn(),
  schema: vi.fn(),
  read: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: mocks.user }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/outreachPriorities", () => ({
  readOutreachPriorities: mocks.read,
}));
import { GET } from "./route";
const request = () =>
  new Request("https://app.test/api/project-outreach/priorities?userId=9");
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "fictional@example.test" } });
  mocks.user.mockResolvedValue({ id: 8, role: "mgo", active: true });
  mocks.read.mockResolvedValue([]);
});
it("uses the authenticated caller and exact origin, not URL user overrides", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(mocks.read).toHaveBeenCalledWith({
    userId: 8,
    origin: "https://app.test",
    today: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  });
  expect(await response.json()).toMatchObject({
    canRecord: true,
    projects: [],
  });
});
it("rejects unauthenticated and inactive accounts without loading counts", async () => {
  mocks.auth.mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401);
  expect(mocks.schema).not.toHaveBeenCalled();
  mocks.auth.mockResolvedValue({ user: { email: "fictional@example.test" } });
  mocks.user.mockResolvedValue({ id: 8, role: "mgo", active: false });
  expect((await GET(request())).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("does not expose personal workload to executive-only viewers", async () => {
  mocks.user.mockResolvedValue({ id: 8, role: "executive", active: true });
  expect(await (await GET(request())).json()).toMatchObject({
    canRecord: false,
    projects: [],
  });
  expect(mocks.read).not.toHaveBeenCalled();
});
it.each(["admin", "advancement_services", "mgo,executive"])(
  "supports explicit caller role %s",
  async (role) => {
    mocks.user.mockResolvedValue({ id: 8, role, active: true });
    expect((await GET(request())).status).toBe(200);
    expect(mocks.read).toHaveBeenCalledTimes(1);
  },
);
it("returns a redacted unavailable response rather than false zero totals", async () => {
  mocks.read.mockRejectedValue(new Error("secret database details"));
  const response = await GET(request());
  expect(response.status).toBe(503);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  const body = await response.json();
  expect(JSON.stringify(body)).not.toContain("secret");
  expect(body.projects).toBeUndefined();
});
