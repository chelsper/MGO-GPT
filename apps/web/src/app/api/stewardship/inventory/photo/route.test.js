import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/stewardshipInventory", () => ({ readGiftPhoto: vi.fn(), readGiftInventory: vi.fn(), readGiftItemHistory: vi.fn(), writeGiftInventory: vi.fn() }));
import { auth } from "@/auth";
import getWorkspaceUser from "@/app/api/utils/getWorkspaceUser";
import { readGiftPhoto } from "@/app/api/utils/stewardshipInventory";
import { GET } from "./route";
const actor = { id: 2, role: "admin", active: true };
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jVh0AAAAASUVORK5CYII=";
const request = (query = "id=1&v=1") => new Request(`https://app.test/api/stewardship/inventory/photo?${query}`);
beforeEach(() => { vi.clearAllMocks(); auth.mockResolvedValue({ user: { id: "auth-2", email: "admin@example.test" } }); getWorkspaceUser.mockResolvedValue({ sessionUser: actor, workspaceUser: { id: 7, role: "mgo" } }); readGiftPhoto.mockResolvedValue(png); });
it("serves only PNG bytes with private no-store and anti-sniffing headers", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200); expect(response.headers.get("content-type")).toBe("image/png");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(Buffer.from(await response.arrayBuffer()).toString("base64")).toBe(png.split(",")[1]);
  expect(readGiftPhoto).toHaveBeenCalledWith(actor, "1", 1);
});
it.each(["mgo", "executive", "donor"])("denies %s even in a staff workspace", async role => {
  getWorkspaceUser.mockResolvedValue({ sessionUser: { ...actor, role }, workspaceUser: actor });
  expect((await GET(request())).status).toBe(403); expect(readGiftPhoto).not.toHaveBeenCalled();
});
it("denies inactive or signed-out users", async () => {
  getWorkspaceUser.mockResolvedValue({ sessionUser: { ...actor, active: false } }); expect((await GET(request())).status).toBe(403);
  auth.mockResolvedValue(null); expect((await GET(request())).status).toBe(401);
});
it.each(["id=bad&v=1", "id=1&v=0", "id=1&v=-1", "id=1&v=foo", "id=1&v=9999999999", "id=1&v=999999999999999", "id=1"])("validates photo identity %s", async query => {
  expect((await GET(request(query))).status).toBe(400); expect(readGiftPhoto).not.toHaveBeenCalled();
});
it("hides missing, invalid, and failed image reads without returning private data", async () => {
  readGiftPhoto.mockResolvedValueOnce(null); expect((await GET(request())).status).toBe(404);
  readGiftPhoto.mockResolvedValueOnce("https://elsewhere.test/private.png"); expect((await GET(request())).status).toBe(404);
  readGiftPhoto.mockRejectedValueOnce(new Error("private database error")); const result = await GET(request()); expect(result.status).toBe(500); expect(await result.text()).not.toContain("private");
});
