import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ auth: vi.fn(), workspace: vi.fn(), catalog: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mock.auth }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mock.workspace }));
vi.mock("@/app/api/utils/importCustomFields", () => ({ importCustomFieldCatalog: mock.catalog }));
import { GET } from "./route";
const request = new Request("https://example.test/api/constituency-import/custom-field-categories");
beforeEach(() => {
  vi.resetAllMocks();
  mock.auth.mockResolvedValue({ user: { email: "reviewer@example.test" } });
  mock.workspace.mockResolvedValue({ sessionUser: { id: 7, role: "reviewer", active: true } });
  mock.catalog.mockResolvedValue([{ name: "Interest", dataType: "Text" }]);
});
describe("custom field metadata access", () => {
  it("requires sign-in before metadata access", async () => {
    mock.auth.mockResolvedValue(null);
    expect((await GET(request)).status).toBe(401);
    expect(mock.catalog).not.toHaveBeenCalled();
  });
  it.each([{ id: 7, role: "mgo" }, { id: 7, role: "reviewer", active: false }, null])("rejects unauthorized users without a provider read", async (user) => {
    mock.workspace.mockResolvedValue({ sessionUser: user });
    expect((await GET(request)).status).toBe(403);
    expect(mock.catalog).not.toHaveBeenCalled();
  });
  it("uses the session identity and disables caching", async () => {
    const response = await GET(request);
    expect(await response.json()).toMatchObject({ categories: [{ name: "Interest" }] });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mock.catalog).toHaveBeenCalledWith({ user: { id: 7, role: "reviewer", active: true }, origin: "https://example.test" });
  });
  it("returns an actionable but sanitized provider failure", async () => {
    mock.catalog.mockRejectedValue(new Error("private diagnostic"));
    const response = await GET(request);
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("private diagnostic");
  });
});
