import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ workspace: vi.fn(), context: vi.fn(), record: vi.fn(), snapshot: vi.fn(), read: vi.fn() }));
vi.mock("@/app/api/utils/outreachWorkspace", async original => ({ ...await original(), outreachWorkspace: mocks.workspace }));
vi.mock("@/app/api/utils/constituentListContext", async original => ({ ...await original(), listContext: mocks.context }));
vi.mock("@/app/api/utils/listConfigurations", async original => ({ ...await original(), getListRecord: mocks.record }));
vi.mock("@/app/api/utils/projectProspectingTags", () => ({ projectTagSnapshot: mocks.snapshot }));
vi.mock("@/app/api/utils/projectOutreachStore", () => ({ createProjectOutreachStore: () => ({ read: mocks.read }) }));
import { GET, POST } from "./route";
const params = { listKey: "list-fictional" };
const request = id => new Request(`https://app.test/api/project-outreach/list-fictional/preview?workspaceId=${id ?? 8}`);
let workspace, record;
beforeEach(() => {
  vi.clearAllMocks();
  workspace = { sessionUser: { id: 7, role: "admin", active: true }, workspaceUser: { id: 8, role: "mgo", name: "Fictional Caller", active: true }, isActing: true };
  record = { report_key: params.listKey, title: "Fictional calls", active: true, visibility: "specific_users", specific_user_ids: [7,8], revision: "r1", data_configuration: { section: "project-prospecting" } };
  mocks.workspace.mockImplementation(async () => workspace);
  mocks.context.mockResolvedValue({ user: workspace.sessionUser, report: { key: params.listKey, revision: "r1" }, origin: "https://app.test" });
  mocks.record.mockImplementation(async () => record); mocks.snapshot.mockResolvedValue({ snapshot: {} });
  mocks.read.mockResolvedValue({ canManage: true, canRecord: true, canManageAccounts: true, viewerId: 8, callers: [{ id: 9 }], overlaps: [{ count: 1 }], nxtReadiness: { callers: [9] }, tasks: [
    { id: "own", assigneeId: 8, events: [{ actorId: 8, state: "confirmed" },{ actorId: 9, state: "draft" }] },
    { id: "old-assignment", assigneeId: 9, events: [{ actorId: 8, state: "review" }] },
    { id: "other", assigneeId: 9, events: [] },
  ] });
});
it("returns only the selected caller's assignments and authored history without write capabilities", async () => {
  const response = await GET(request(), { params });
  expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toContain("no-store");
  const value = await response.json();
  expect(value).toMatchObject({ canManage: false, canRecord: false, canManageAccounts: false, workspace: { id: 8, readOnly: true }, callers: [], overlaps: [], nxtReadiness: null });
  expect(value.tasks.map(t => t.id)).toEqual(["own", "old-assignment"]);
  expect(value.tasks.flatMap(t => t.events).every(e => e.actorId === 8)).toBe(true);
});
it.each(["other-id","self","unshared-caller","unshared-viewer"])("does not expose a preview for %s", async mode => {
  if (mode === "self") workspace.isActing = false;
  if (mode === "unshared-caller") record.specific_user_ids = [7];
  if (mode === "unshared-viewer") mocks.context.mockRejectedValue(Object.assign(new Error("Not shared"), { status: 403 }));
  expect((await GET(request(mode === "other-id" ? 99 : 8), { params })).status).toBeGreaterThanOrEqual(400);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("discards results after access changes during the read", async () => {
  mocks.record.mockResolvedValueOnce(record).mockResolvedValueOnce({ ...record, specific_user_ids: [7] });
  const response = await GET(request(), { params });
  expect(response.status).toBe(409); expect((await response.json()).tasks).toBeUndefined();
});
it("rejects every mutation without reading or writing NXT or assignments", async () => {
  expect((await POST()).status).toBe(403); expect(mocks.workspace).not.toHaveBeenCalled(); expect(mocks.read).not.toHaveBeenCalled();
});
