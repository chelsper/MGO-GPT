import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), read: vi.fn() }));
vi.mock("@/app/api/utils/outreachWorkspace", async original => ({ ...await original(), outreachWorkspace: mocks.context }));
vi.mock("@/app/api/utils/outreachPriorities", () => ({ readOutreachPriorities: mocks.read }));
import { GET } from "./route";
let context;
beforeEach(() => {
  vi.clearAllMocks(); context = { sessionUser: { id: 7, role: "admin" }, workspaceUser: { id: 8, name: "Fictional Caller", role: "mgo" }, isActing: true };
  mocks.context.mockImplementation(async () => context); mocks.read.mockResolvedValue([]);
});
it("returns selected MGO counts with an explicit read-only identity and independent viewer access", async () => {
  const response = await GET(new Request("https://app.test/api/project-outreach/workspace?userId=99"));
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toMatchObject({ canRecord: false, workspace: { id: 8, name: "Fictional Caller", readOnly: true } });
  expect(mocks.read).toHaveBeenCalledWith({ userId: 8, viewerId: 7, origin: "https://app.test", today: expect.any(String) });
});
it("keeps an MGO's own login writable without impersonation", async () => {
  context.sessionUser = context.workspaceUser; context.isActing = false;
  expect(await (await GET(new Request("https://app.test"))).json()).toMatchObject({ canRecord: true, workspace: { id: 8, readOnly: false } });
});
it("does not represent failed authorization as a zero workload", async () => {
  mocks.context.mockRejectedValue(Object.assign(new Error("Workspace unavailable"), { status: 403 }));
  const response = await GET(new Request("https://app.test"));
  expect(response.status).toBe(403); expect((await response.json()).projects).toBeUndefined(); expect(mocks.read).not.toHaveBeenCalled();
});
