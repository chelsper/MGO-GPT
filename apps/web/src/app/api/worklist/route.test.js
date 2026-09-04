import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const { auth, sql, getWorkspaceUser, queueCounts } = vi.hoisted(() => ({
  auth: vi.fn(), sql: vi.fn(), getWorkspaceUser: vi.fn(), queueCounts: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/app/api/utils/sql", () => ({ default: sql }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: getWorkspaceUser }));
vi.mock("@/app/api/utils/reviewerQueueCounts", () => ({ default: queueCounts }));

const user = (role) => ({ id: 7, email: "reviewer@example.org", role });
const request = (view = "reviewer") => new Request(`https://example.org/api/worklist?view=${view}`);

beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({ user: { email: "reviewer@example.org" } });
  getWorkspaceUser.mockResolvedValue({ sessionUser: user("advancement_services"), workspaceUser: user("advancement_services") });
  sql.mockResolvedValue([]);
  queueCounts.mockResolvedValue({ workQueue: 43, dataRequests: 24, prospectPool: 31, discussions: 20 });
});

describe("worklist queue alerts", () => {
  it("exposes complete counts only to reviewers and prevents shared HTTP caching", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("private, no-store");
    const payload = await response.json();
    expect(payload.queueCounts.workQueue).toBe(43);
    expect(payload.summary).toMatchObject({ openDataRequests: 24, poolNeedsAttention: 31, openDiscussionItems: 20 });
    expect(payload.dataRequests).toHaveLength(0);
  });

  it("does not let an MGO request shared reviewer counts with a query parameter", async () => {
    getWorkspaceUser.mockResolvedValue({ sessionUser: user("mgo"), workspaceUser: user("mgo") });
    const payload = await (await GET(request())).json();
    expect(payload.role).toBe("mgo");
    expect(payload).not.toHaveProperty("queueCounts");
    expect(queueCounts).not.toHaveBeenCalled();
  });

  it("restores shared counts when an admin returns from viewing an MGO", async () => {
    getWorkspaceUser.mockResolvedValue({ sessionUser: user("admin"), workspaceUser: user("mgo") });
    expect((await (await GET(request())).json()).role).toBe("reviewer");
    expect(queueCounts).toHaveBeenCalledOnce();
  });

  it("does not expose reviewer counts in an admin's MGO view", async () => {
    getWorkspaceUser.mockResolvedValue({ sessionUser: user("admin"), workspaceUser: user("admin") });
    const payload = await (await GET(request("mgo"))).json();
    expect(payload.role).toBe("mgo");
    expect(queueCounts).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    auth.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
    expect(queueCounts).not.toHaveBeenCalled();
  });

  it("reports count failures rather than returning a false all-clear", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    queueCounts.mockRejectedValueOnce(new Error("Queue counts unavailable"));
    expect((await GET(request())).status).toBe(500);
    log.mockRestore();
  });
});
