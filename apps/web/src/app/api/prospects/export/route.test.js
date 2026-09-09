import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_EXPORT_COLUMNS } from "@/utils/prospectExport";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), schema: vi.fn(), workspace: vi.fn(), sql: vi.fn(), workbook: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({ default: mocks.workspace }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
vi.mock("@/app/api/utils/prospectExportWorkbook", () => ({ prospectExportWorkbook: mocks.workbook }));
import { GET, POST } from "./route";

const user = { id: 1, name: "Example MGO", role: "mgo", active: true };
const request = (body = {}, headers = {}) => new Request("https://app.example/api/prospects/export", { method: "POST", headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify({ scope: "active", ownerIds: [1], format: "csv", columns: DEFAULT_EXPORT_COLUMNS, ...body }) });
describe("prospect export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { email: "test@example.com" } });
    mocks.workspace.mockResolvedValue({ sessionUser: user, workspaceUser: user });
    mocks.sql.mockResolvedValue([{ id: 1, user_id: 1, status: "Active", prospect_name: "Sample", opportunities: [] }]);
    mocks.workbook.mockResolvedValue(new Uint8Array([80, 75, 1, 2]));
  });
  it("requires authentication before querying the database", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await POST(request())).status).toBe(401);
    expect((await GET(new Request("https://app.example/api/prospects/export"))).status).toBe(401);
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.schema).not.toHaveBeenCalled();
  });
  it("does not expose a master roster to MGOs", async () => {
    expect((await GET(new Request("https://app.example/api/prospects/export"))).status).toBe(403);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("returns a sanitized roster for Advancement Services even when viewing an MGO", async () => {
    mocks.workspace.mockResolvedValue({ sessionUser: { ...user, role: "advancement_services" }, workspaceUser: user });
    mocks.sql.mockResolvedValue([{ ...user, email: "test@example.com", active_count: 5, secret: "not exposed" }]);
    const response = await GET(new Request("https://app.example/api/prospects/export"));
    expect(response.status).toBe(200);
    expect((await response.json()).users[0]).not.toHaveProperty("secret");
  });
  it("rejects unauthorized workspaces and cross-origin requests", async () => {
    expect((await POST(request({ ownerIds: [99] }))).status).toBe(403);
    expect((await POST(request({}, { origin: "https://other.example" }))).status).toBe(403);
    expect(mocks.sql).not.toHaveBeenCalled();
  });
  it("delivers CSV with private download headers and selected columns only", async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/csv");
    expect(response.headers.get("content-disposition")).toContain("attachment;");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const text = await response.text();
    expect(text).toContain("Sample");
    expect(text).not.toContain("Email (saved)");
    expect(mocks.workbook).not.toHaveBeenCalled();
  });
  it("writes an Excel workbook with the correct content type", async () => {
    const response = await POST(request({ format: "xlsx" }));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("spreadsheetml.sheet");
    expect(mocks.workbook).toHaveBeenCalledOnce();
  });
  it("exports selected MGOs only in a master request", async () => {
    mocks.workspace.mockResolvedValue({ sessionUser: { ...user, role: "admin" }, workspaceUser: user });
    mocks.sql.mockResolvedValueOnce([{ ...user }, { ...user, id: 2, name: "MGO Two" }]);
    mocks.sql.mockResolvedValueOnce([{ id: 10, user_id: 2, prospect_name: "Selected workspace", status: "Active", opportunities: [] }]);
    const response = await POST(request({ scope: "master", ownerIds: [2] }));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("MGO Two");
    expect(mocks.sql.mock.calls[1][1]).toEqual(["2"]);
  });
  it("rejects malformed input and hides database error details", async () => {
    const malformed = new Request("https://app.example/api/prospects/export", { method: "POST", body: "{" });
    expect((await POST(malformed)).status).toBe(400);
    mocks.sql.mockRejectedValue(new Error("postgres private donor token data"));
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("private donor");
  });
});
