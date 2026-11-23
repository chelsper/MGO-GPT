import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), schema: vi.fn(), workspace: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("./ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("./getWorkspaceUser", () => ({ default: mocks.workspace }));
import { outreachWorkspace } from "./outreachWorkspace";
beforeEach(() => {
  vi.clearAllMocks(); mocks.auth.mockResolvedValue({ user: { email: "fictional@example.test" } });
  mocks.workspace.mockResolvedValue({ sessionUser: { id: 7, role: "admin", active: true },
    workspaceUser: { id: 8, role: "mgo", active: true }, isActing: true });
});
it("uses the existing validated workspace resolver, not URL user overrides", async () => {
  const request = new Request("https://app.test/api/project-outreach/workspace?userId=99");
  expect((await outreachWorkspace(request)).workspaceUser.id).toBe(8);
  expect(mocks.workspace).toHaveBeenCalledWith({ user: { email: "fictional@example.test" } }, request);
});
it("rejects a signed-out request before any schema or workspace read", async () => {
  mocks.auth.mockResolvedValue(null);
  await expect(outreachWorkspace(new Request("https://app.test"))).rejects.toMatchObject({ status: 401 });
  expect(mocks.schema).not.toHaveBeenCalled(); expect(mocks.workspace).not.toHaveBeenCalled();
});
it.each(["inactive-viewer","inactive-caller","invalid-selection","not-authorized"])("fails closed for %s", async reason => {
  const context = await mocks.workspace();
  if (reason === "inactive-viewer") context.sessionUser.active = false;
  if (reason === "inactive-caller") context.workspaceUser.active = false;
  if (reason === "invalid-selection") context.invalidActingUserId = 10;
  if (reason === "not-authorized") context.sessionUser.role = "mgo";
  mocks.workspace.mockResolvedValue(context);
  await expect(outreachWorkspace(new Request("https://app.test"))).rejects.toMatchObject({ status: 403 });
});
