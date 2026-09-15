import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sql: vi.fn(), auth: vi.fn(), context: vi.fn(), discussion: vi.fn(), clear: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.context }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/pendingActions", () => ({ syncPendingActionDiscussion: mocks.discussion }));
vi.mock("@/app/api/utils/userDataCache", () => ({ clearUserDashboardDataCaches: mocks.clear }));
import { PUT } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "admin@example.com" } });
  mocks.context.mockResolvedValue({ sessionUser: { id: 2, role: "admin" }, workspaceUser: { id: 7, role: "mgo" }, isActing: true });
  mocks.sql.mockResolvedValue([{ id: 40, owner_user_id: 7, prospect_id: 1, is_primary: true, title: "Call", status: "Open", due_date: null }]);
});
const request = body => new Request("https://example.com/api/pending-actions/40", {
  method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

it.each([true, false])("distinguishes explicitly cleared fields from omitted fields: %s", async clearFields => {
  const body = clearFields ? { dueDate: null, details: null, discussionNote: null } : { title: "Rescheduled call" };
  const response = await PUT(request(body), { params: { id: "40" } });
  expect(response.status).toBe(200);
  const [strings, ...values] = mocks.sql.mock.calls.find(([parts]) => parts.join("").includes("UPDATE pending_actions"));
  for (const field of ["details", "due_date", "discussion_note"]) {
    const index = strings.findIndex(part => part.includes(`${field} = CASE WHEN`));
    expect(index).toBeGreaterThanOrEqual(0);
    expect(values[index]).toBe(clearFields);
    expect(values[index + 1]).toBeNull();
  }
  expect(values).toContain(7);
  const prospectUpdate = mocks.sql.mock.calls.find(([parts]) => parts.join("").includes("UPDATE prospects"));
  expect(prospectUpdate).toBeTruthy();
  expect(mocks.discussion).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: 7, createdByUserId: 2, dueDate: null }));
});

it("rejects a record outside the current workspace", async () => {
  mocks.sql.mockResolvedValue([]);
  const response = await PUT(request({ dueDate: null }), { params: { id: "40" } });
  expect(response.status).toBe(404);
  expect(mocks.sql).toHaveBeenCalledTimes(1);
  expect(mocks.clear).not.toHaveBeenCalled();
});

it("keeps read-only workspace permissions", async () => {
  mocks.context.mockResolvedValue({ sessionUser: { id: 2, role: "executive" }, workspaceUser: { id: 7, role: "mgo" }, isActing: true });
  const response = await PUT(request({ dueDate: null }), { params: { id: "40" } });
  expect(response.status).toBe(403);
  expect(mocks.sql).not.toHaveBeenCalled();
});
