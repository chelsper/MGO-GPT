import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ context: vi.fn(), state: vi.fn(), read: vi.fn(), mutate: vi.fn() }));
vi.mock("@/app/api/utils/constituentListContext", async importOriginal => ({ ...await importOriginal(), listContext: mocks.context }));
vi.mock("@/app/api/utils/projectProspectingTags", () => ({ projectTagSnapshot: mocks.state, readProjectTags: mocks.read, mutateProjectTags: mocks.mutate }));
import { GET, POST } from "./route";
const params = { params: { listKey: "list-project-center" } };
const req = (body, origin = "https://app.test") => new Request("https://app.test/api/reports/lists/list-project-center/tags", { method: "POST", headers: { origin }, body: JSON.stringify(body) });
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(console, "error").mockImplementation(() => {}); mocks.context.mockResolvedValue({ report: { revision: "r1" } }); mocks.state.mockResolvedValue({}); mocks.read.mockResolvedValue({ tags: [] }); mocks.mutate.mockResolvedValue({ changed: 1 }); });
afterEach(() => vi.restoreAllMocks());
describe("project tag endpoint", () => {
  it("requires same origin before processing a write", async () => { expect((await POST(req({}, "https://other.test"), params)).status).toBe(403); expect(mocks.context).not.toHaveBeenCalled(); });
  it.each([401, 403, 404])("preserves access refusal %s on reads and writes", async status => {
    mocks.context.mockRejectedValue(Object.assign(new Error("Denied"), { status }));
    expect((await GET(new Request("https://app.test"), params)).status).toBe(status);
    expect((await POST(req({}), params)).status).toBe(status); expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("rechecks access after reading data and returns no-cache responses", async () => {
    const response = await GET(new Request("https://app.test"), params);
    expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(mocks.context).toHaveBeenCalledTimes(2);
    mocks.context.mockResolvedValueOnce({ report: { revision: "r1" } }).mockResolvedValueOnce({ report: { revision: "r2" } });
    expect((await GET(new Request("https://app.test"), params)).status).toBe(409);
  });
  it("limits request size and rejects malformed JSON", async () => {
    expect((await POST(req({ name: "x".repeat(12000) }), params)).status).toBe(413);
    expect((await POST(new Request("https://app.test", { method: "POST", body: "{" }), params)).status).toBe(400);
    expect(mocks.mutate).not.toHaveBeenCalled();
  });
  it("uses local tag mutation and redacts unexpected infrastructure errors", async () => {
    expect((await POST(req({ action: "apply" }), params)).status).toBe(200);
    mocks.mutate.mockRejectedValue(Object.assign(new Error("private database error"), { code: "42804" }));
    const response = await POST(req({}), params); expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("private database");
    expect(console.error).toHaveBeenCalledWith("Project tags request failed", { operation: "write", code: "42804" });
    expect(JSON.stringify(console.error.mock.calls)).not.toContain("private database");
  });
  it("does not log expected access errors or unsafe diagnostic values", async () => {
    mocks.context.mockRejectedValueOnce(Object.assign(new Error("Denied"), { status: 403 }));
    await GET(new Request("https://app.test"), params); expect(console.error).not.toHaveBeenCalled();
    mocks.read.mockRejectedValueOnce(Object.assign(new Error("private details"), { code: "unsafe payload" }));
    await GET(new Request("https://app.test"), params);
    expect(console.error).toHaveBeenCalledWith("Project tags request failed", { operation: "read", code: "unknown" });
  });
});
