import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ workspace: vi.fn(), sql: vi.fn() }));
vi.mock("@/auth", () => ({ auth: vi.fn(async () => ({ user: { email: "viewer@example.com" } })) }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.workspace }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));

const routes = [
  ["create prospect", "POST", () => import("../prospects/route")],
  ["edit prospect", "PUT", () => import("../prospects/[id]/route")],
  ["delete prospect", "DELETE", () => import("../prospects/[id]/route")],
  ["reorder prospects", "POST", () => import("../prospects/reorder/route")],
  ["log action", "POST", () => import("../prospects/[id]/actions/route")],
  ["log progress", "POST", () => import("../prospects/[id]/updates/route")],
  ["edit action", "PUT", () => import("../prospects/[prospectId]/updates/[updateId]/route")],
  ["delete action", "DELETE", () => import("../prospects/[prospectId]/updates/[updateId]/route")],
  ["delete submission", "DELETE", () => import("../prospects/[prospectId]/submissions/[submissionId]/route")],
  ["create opportunity", "POST", () => import("../prospects/[id]/opportunities/route")],
  ["edit opportunity", "PUT", () => import("../prospects/opportunities/[id]/route")],
  ["link gift", "POST", () => import("../prospects/opportunities/[id]/gift-links/route")],
  ["unlink gift", "DELETE", () => import("../prospects/opportunities/[id]/gift-links/route")],
  ["roll opportunity", "POST", () => import("../prospects/opportunities/[id]/rollover/route")],
  ["submit action", "POST", () => import("../submissions/donor-update/route")],
  ["submit opportunity", "POST", () => import("../submissions/opportunity-update/route")],
  ["create next step", "POST", () => import("../pending-actions/route")],
  ["edit next step", "PUT", () => import("../pending-actions/[id]/route")],
  ["create category", "POST", () => import("../portfolio-categories/route")],
  ["edit category", "PATCH", () => import("../portfolio-categories/[id]/route")],
  ["delete category", "DELETE", () => import("../portfolio-categories/[id]/route")],
  ["reorder categories", "PUT", () => import("../portfolio-categories/order/route")],
  ["categorize constituent", "PUT", () => import("../portfolio-categories/assignments/route")],
];

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sql.mockImplementation(() => { throw new Error("No data access expected before permission check"); });
});

describe.each(["executive", "mgo", "advancement_services"])("%s delegated write protection", (role) => {
  it.each(routes)("rejects %s before data access", async (_name, method, load) => {
    mocks.workspace.mockResolvedValue({
      sessionUser: { id: 2, role }, workspaceUser: { id: 44, role: "mgo" }, isActing: true,
    });
    const route = await load();
    const response = await route[method](new Request("https://example.com/api/test", {
      method, body: JSON.stringify({}),
    }), { params: { id: "7", prospectId: "7", updateId: "8", submissionId: "9" } });
    expect(response.status).toBe(403);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
});

it("lets Admins organize only the selected MGO's portfolio", async () => {
  mocks.workspace.mockResolvedValue({
    sessionUser: { id: 2, role: "admin" }, workspaceUser: { id: 44, role: "mgo" }, isActing: true,
  });
  mocks.sql.mockReset().mockResolvedValueOnce([{ next_sort_order: 0 }]).mockResolvedValueOnce([{ id: 7, name: "Priority" }]);
  const { POST } = await import("../portfolio-categories/route");
  const response = await POST(new Request("https://example.com/api/portfolio-categories", {
    method: "POST", body: JSON.stringify({ name: "Priority", ownerUserId: 999 }),
  }));
  expect(response.status).toBe(201);
  expect(mocks.sql.mock.calls[0].slice(1)).toContain(44);
  expect(mocks.sql.mock.calls[1].slice(1)).toContain(44);
  expect(mocks.sql.mock.calls[1].slice(1)).not.toContain(999);
});
