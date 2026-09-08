import { beforeEach, it, expect, vi } from "vitest";
const { auth, workspace, formats } = vi.hoisted(() => ({ auth: vi.fn(), workspace: vi.fn(), formats: vi.fn() }));
vi.mock("@/auth", () => ({ auth }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: workspace }));
vi.mock("@/app/api/utils/safeConstituentCreate", () => ({ getNameFormatConfigurations: formats }));
import { GET } from "./route";
const request = () => new Request("https://example.com/api/constituency-import/name-formats");
beforeEach(() => { vi.clearAllMocks(); auth.mockResolvedValue({ user: { email: "reviewer@example.com" } }); workspace.mockResolvedValue({ sessionUser: { id: 7, role: "reviewer" } }); formats.mockResolvedValue([{ id: "5", format: "First Last" }]); });
it("returns only table IDs and format labels to reviewers", async () => {
  const response = await GET(request());
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toEqual({ formats: [{ id: "5", format: "First Last" }] });
});
it("rejects unauthenticated and MGO requests before NXT calls", async () => {
  auth.mockResolvedValueOnce(null);
  expect((await GET(request())).status).toBe(401);
  workspace.mockResolvedValueOnce({ sessionUser: { id: 7, role: "mgo" } });
  expect((await GET(request())).status).toBe(403);
  expect(formats).not.toHaveBeenCalled();
});
