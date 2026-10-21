import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ user: vi.fn(), sql: vi.fn() }));
vi.mock("./getOrCreateUser", () => ({ default: mocks.user }));
vi.mock("./sql", () => ({ default: mocks.sql }));
import getWorkspaceUser, { getActingUserIdFromRequest } from "./getWorkspaceUser";
import { canEditWorkspace } from "@/utils/workspaceRoles";

const session = { user: { email: "fictional@example.test" } };
const target = { id: 20, role: "mgo", active: true };
const request = (cookie = "") => new Request("https://app.example.test/api/worklist", { headers: { cookie } });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.sql.mockResolvedValue([target]);
});

describe("workspace selection uses authenticated authority", () => {
  it.each(["admin", "advancement_services", "mgo"])("lets %s work in their own workspace", async role => {
    const actor = { id: 10, role, active: true };
    mocks.user.mockResolvedValue(actor);
    const context = await getWorkspaceUser(session, request());
    expect(context).toMatchObject({ sessionUser: actor, workspaceUser: actor, isActing: false });
    expect(canEditWorkspace(context)).toBe(true);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it.each(["mgo", "advancement_services"])("does not let a forged cookie delegate %s authority", async role => {
    mocks.user.mockResolvedValue({ id: 10, role, active: true });
    const context = await getWorkspaceUser(session, request("workspace_acting_user_id=20; role=admin"));
    expect(context.workspaceUser.id).toBe(10);
    expect(context.isActing).toBe(false);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it.each([["admin", true], ["executive", false]])("lets %s view an MGO with delegated editing=%s", async (role, editable) => {
    mocks.user.mockResolvedValue({ id: 10, role, active: true });
    const context = await getWorkspaceUser(session, request("workspace_acting_user_id=20"));
    expect(context.workspaceUser).toEqual(target);
    expect(canEditWorkspace(context)).toBe(editable);
    expect(mocks.sql.mock.calls[0].slice(1)).toEqual([20]);
  });
  it.each([{ rows: [] }, { rows: [{ id: 20, role: "admin", active: true }] }])("does not silently redirect edits when the selected workspace is unavailable: %j", async ({ rows }) => {
    mocks.user.mockResolvedValue({ id: 10, role: "admin", active: true });
    mocks.sql.mockResolvedValue(rows);
    const context = await getWorkspaceUser(session, request("workspace_acting_user_id=20"));
    expect(context.invalidActingUserId).toBe(20);
    expect(canEditWorkspace(context)).toBe(false);
  });
  it("propagates rejected account provisioning before any workspace lookup", async () => {
    mocks.user.mockRejectedValueOnce(new Error("Account not authorized"));
    await expect(getWorkspaceUser(session, request("workspace_acting_user_id=20"))).rejects.toThrow("Account not authorized");
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});

describe("browser cookie resilience", () => {
  it("ignores a malformed unrelated cookie while preserving the chosen workspace", async () => {
    mocks.user.mockResolvedValue({ id: 10, role: "admin", active: true });
    const context = await getWorkspaceUser(session, request("analytics=%E0%A4%A; workspace_acting_user_id=20"));
    expect(context.workspaceUser.id).toBe(20);
    expect(canEditWorkspace(context)).toBe(true);
  });
  it.each(["%E0%A4%A", "not-an-id", "-1", "0", "1.5", "9007199254740992"])("does not throw or select an invalid workspace for %s", value => {
    expect(getActingUserIdFromRequest(request(`workspace_acting_user_id=${value}`))).toBeNull();
  });
  it("still accepts an encoded positive workspace ID", () => {
    expect(getActingUserIdFromRequest(request("workspace_acting_user_id=%32%30"))).toBe(20);
  });
});
