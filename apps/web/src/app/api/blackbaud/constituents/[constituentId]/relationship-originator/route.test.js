import { beforeEach, expect, it, vi } from "vitest";
const { auth, getUser, review, save } = vi.hoisted(() => ({ auth: vi.fn(), getUser: vi.fn(), review: vi.fn(), save: vi.fn() }));
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: getUser }));
vi.mock("@/app/api/utils/relationshipOriginator", async importOriginal => ({ ...await importOriginal(), originatorReview: review, saveOriginator: save }));
import { GET, POST } from "./route";
const params = { constituentId: "200" };
const request = (input = {}) => new Request("https://app.example/api/blackbaud/constituents/200/relationship-originator", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
});
beforeEach(() => {
  vi.clearAllMocks(); auth.mockResolvedValue({ user: { email: "fictional@example.org" } });
  getUser.mockResolvedValue({ id: 1, role: "mgo", active: true }); review.mockResolvedValue({ fields: [] }); save.mockResolvedValue({ message: "saved" });
});
it("requires authentication before any NXT read or write", async () => {
  auth.mockResolvedValue(null);
  expect((await GET(request(), { params })).status).toBe(401);
  expect((await POST(request(), { params })).status).toBe(401);
  expect(review).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
});
it.each([{ role: "executive", active: true }, { role: "mgo", active: false }])("blocks a read-only or inactive user %j", async extra => {
  getUser.mockResolvedValue({ id: 1, ...extra });
  expect((await POST(request(), { params })).status).toBe(403);
  expect(save).not.toHaveBeenCalled();
});
it("uses the authenticated account, never a browser-supplied acting workspace as author", async () => {
  expect((await POST(request({ userId: 900, authUserId: 900 }), { params })).status).toBe(200);
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ user: { id: 1, role: "mgo", active: true },
    constituentId: "200", options: { userId: 1, authUserId: 1, origin: "https://app.example" } }));
});
it("rejects lookup strings in place of a system record ID", async () => {
  expect((await GET(request(), { params: { constituentId: "ABC-123" } })).status).toBe(400);
  expect(review).not.toHaveBeenCalled();
});
