import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
const ensureAppSchemaMock = vi.fn();
const getWorkspaceUserMock = vi.fn();
const sqlQueue = [];
const sqlMockImpl = vi.fn(async () => sqlQueue.shift() ?? []);
function sqlTag(strings, ...values) {
  return sqlMockImpl(strings, ...values);
}

vi.mock("@/auth", () => ({ auth: authMock }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: ensureAppSchemaMock }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: getWorkspaceUserMock }));
vi.mock("@/app/api/utils/sql", () => ({ default: sqlTag }));

describe("discussion item detail route", () => {
  beforeEach(() => {
    sqlQueue.length = 0;
    sqlMockImpl.mockClear();
    authMock.mockResolvedValue({ user: { email: "mgo@example.com" } });
    ensureAppSchemaMock.mockResolvedValue();
    getWorkspaceUserMock.mockResolvedValue({
      workspaceUser: { id: 44, email: "mgo@example.com", role: "mgo" },
    });
  });

  it("replaces constituent topics and updates the primary anchor for a general item", async () => {
    const { PATCH } = await import("./route.js");
    sqlQueue.push(
      [{ id: 15, prospect_id: null }],
      [{ id: 501, name: "Anna Arribas", blackbaud_constituent_id: "242718" }],
      [{ id: 15, constituent_id: 501, subject: "PPC strategy" }],
      [],
      [],
      [],
      [
        {
          constituent_id: 501,
          blackbaud_constituent_id: "242718",
          name: "Anna Arribas",
        },
      ],
    );

    const request = new Request("https://example.com/api/discussion-items/15", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        linkedConstituents: [
          { blackbaudConstituentId: "242718", name: "Anna Arribas" },
        ],
      }),
    });
    const response = await PATCH(request, { params: { id: "15" } });

    expect(response.status).toBe(200);
    expect(String(sqlMockImpl.mock.calls[2][0])).toContain("constituent_id = $1");
    expect(String(sqlMockImpl.mock.calls[4][0])).toContain(
      "INSERT INTO discussion_item_constituents",
    );
    await expect(response.json()).resolves.toMatchObject({
      linked_constituents: [
        {
          constituent_id: 501,
          blackbaudConstituentId: "242718",
          name: "Anna Arribas",
        },
      ],
    });
  });
});
