import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/stewardshipStock", () => ({ readGiftStockHistory: vi.fn() }));
import { readGiftStockHistory } from "@/app/api/utils/stewardshipStock";
vi.mock("@/app/api/utils/stewardshipInventory", () => ({
  readGiftInventory: vi.fn(),
  readGiftItemHistory: vi.fn(),
  writeGiftInventory: vi.fn(),
}));
import { auth } from "@/auth";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import {
  readGiftInventory,
  readGiftItemHistory,
  writeGiftInventory,
} from "@/app/api/utils/stewardshipInventory";
import { GET, POST } from "./route";
const actor = { id: 2, role: "admin", active: true };
const command = {
  operation: "archive",
  id: "10",
  version: 1,
  reason: "Discontinued",
  viewerKey: "auth-2",
};
const request = (body = command, headers = {}) =>
  new Request("https://app.test/api/stewardship/inventory", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  auth.mockResolvedValue({
    user: { id: "auth-2", email: "admin@example.test" },
  });
  getWorkspaceUser.mockResolvedValue({
    sessionUser: actor,
    workspaceUser: { id: 99, role: "mgo" },
    isActing: true,
  });
  readGiftInventory.mockResolvedValue([]);
  readGiftItemHistory.mockResolvedValue([]);
  readGiftStockHistory.mockResolvedValue([]);
  writeGiftInventory.mockResolvedValue([{ id: "10", version: 2 }]);
});
it("reads saved catalog only and uses the signed-in actor, not the viewed MGO", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(await response.json()).toEqual({ viewerKey: "auth-2", items: [] });
  expect(readGiftInventory).toHaveBeenCalledExactlyOnceWith(actor);
  expect(writeGiftInventory).not.toHaveBeenCalled();
});
it.each(["mgo", "executive"])(
  "denies %s even when viewing an admin",
  async (role) => {
    getWorkspaceUser.mockResolvedValue({
      sessionUser: { ...actor, role },
      workspaceUser: actor,
    });
    expect((await GET(request())).status).toBe(403);
    expect((await POST(request())).status).toBe(403);
    expect(writeGiftInventory).not.toHaveBeenCalled();
  },
);
it("allows Advancement Services and rejects inactive or signed-out users", async () => {
  getWorkspaceUser.mockResolvedValue({
    sessionUser: { ...actor, role: "advancement_services" },
  });
  expect((await POST(request())).status).toBe(200);
  getWorkspaceUser.mockResolvedValue({
    sessionUser: { ...actor, active: false },
  });
  expect((await POST(request())).status).toBe(403);
  auth.mockResolvedValue(null);
  expect((await GET(request())).status).toBe(401);
});
it.each([
  { origin: "https://evil.test" },
  { "sec-fetch-site": "cross-site" },
  { "content-type": "text/plain" },
])("rejects cross-site or non-JSON updates", async (headers) => {
  expect((await POST(request(command, headers))).status).toBe(403);
  expect(writeGiftInventory).not.toHaveBeenCalled();
});
it("rejects changed viewer, bad IDs, extra parameters and invalid versions", async () => {
  expect((await POST(request({ ...command, viewerKey: "other" }))).status).toBe(
    409,
  );
  for (const body of [
    { ...command, id: "x" },
    { ...command, version: 0 },
    { ...command, actorId: 9 },
  ])
    expect((await POST(request(body))).status).toBe(400);
  expect(writeGiftInventory).not.toHaveBeenCalled();
});
it("returns a conflict for stale versions and a safe message for uncertain saves", async () => {
  writeGiftInventory.mockResolvedValueOnce([]);
  expect((await POST(request())).status).toBe(409);
  writeGiftInventory.mockRejectedValueOnce(
    new Error("private database details"),
  );
  const response = await POST(request());
  expect(response.status).toBe(500);
  expect(await response.text()).not.toContain("private database");
  writeGiftInventory.mockRejectedValueOnce({ code: "23505" });
  expect((await POST(request())).status).toBe(409);
});
it("validates and authorizes item history reads", async () => {
  expect(
    (
      await GET(
        new Request("https://app.test/api/stewardship/inventory?id=bad"),
      )
    ).status,
  ).toBe(400);
  expect(readGiftItemHistory).not.toHaveBeenCalled();
  const result = await GET(
    new Request("https://app.test/api/stewardship/inventory?id=10"),
  );
  expect(await result.json()).toEqual({
    viewerKey: "auth-2",
    id: "10",
    events: [],
    stockEvents: [],
  });
  expect(readGiftItemHistory).toHaveBeenCalledWith(actor, "10");
});
it("authorizes stock writes and rejects unconfirmed quantities", async () => {
  const stock = { operation: "stock", viewerKey: "auth-2", id: "10", stockVersion: 0, kind: "opening", quantity: 5, reason: "", confirmed: true, token: "74512c41-89cd-41be-946e-10a056cae491" };
  expect((await POST(request(stock))).status).toBe(200);
  expect(writeGiftInventory).toHaveBeenCalledWith(actor, stock);
  expect((await POST(request({ ...stock, confirmed: false }))).status).toBe(400);
  expect((await POST(request(stock, { origin: "https://evil.test" }))).status).toBe(403);
});
