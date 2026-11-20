import { beforeEach, describe, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  state: vi.fn(),
  submit: vi.fn(),
  store: { read: vi.fn(), settings: vi.fn(), assign: vi.fn(), record: vi.fn() },
}));
vi.mock("@/app/api/utils/constituentListContext", async (original) => ({
  ...(await original()),
  listContext: mocks.context,
}));
vi.mock("@/app/api/utils/projectProspectingTags", () => ({
  projectTagSnapshot: mocks.state,
}));
vi.mock("@/app/api/utils/projectOutreachStore", () => ({
  createProjectOutreachStore: () => mocks.store,
}));
vi.mock("@/app/api/utils/projectOutreachActions", () => ({
  submitOutreachAction: mocks.submit,
}));
import { GET, POST } from "./route";
const params = { params: { listKey: "list-fictional-outreach" } };
const request = (body, origin = "https://app.test") =>
  new Request(
    "https://app.test/api/reports/lists/list-fictional-outreach/outreach",
    {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify({ revision: "r1", ...body }),
    },
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({
    user: { id: 8, role: "mgo" },
    report: { revision: "r1" },
  });
  mocks.state.mockResolvedValue({});
  mocks.store.read.mockResolvedValue({ tasks: [] });
  mocks.submit.mockResolvedValue({ state: "confirmed" });
});
describe("outreach endpoint boundaries", () => {
  it("reads saved results without NXT and rechecks authorization", async () => {
    const response = await GET(new Request("https://app.test"), params);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.context).toHaveBeenCalledTimes(2);
    expect(mocks.submit).not.toHaveBeenCalled();
    mocks.context
      .mockResolvedValueOnce({ report: { revision: "r1" } })
      .mockResolvedValueOnce({ report: { revision: "r2" } });
    expect((await GET(new Request("https://app.test"), params)).status).toBe(
      409,
    );
  });
  it.each([401, 403, 404])("preserves access refusal %s", async (status) => {
    mocks.context.mockRejectedValue(
      Object.assign(new Error("Denied"), { status }),
    );
    expect((await GET(new Request("https://app.test"), params)).status).toBe(
      status,
    );
    expect((await POST(request({ operation: "assign" }), params)).status).toBe(
      status,
    );
    expect(mocks.submit).not.toHaveBeenCalled();
  });
  it("rejects cross-origin, missing origin, bad content type, roles and oversized requests", async () => {
    for (const origin of ["", "https://other.test"])
      expect((await POST(request({}, origin), params)).status).toBe(403);
    expect(
      (
        await POST(
          new Request("https://app.test", {
            method: "POST",
            headers: { origin: "https://app.test" },
            body: "{}",
          }),
          params,
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await POST(
          request({ operation: "record", result: "x".repeat(20001) }),
          params,
        )
      ).status,
    ).toBe(413);
    mocks.context.mockResolvedValue({
      user: { role: "executive" },
      report: { revision: "r1" },
    });
    expect((await POST(request({ operation: "record" }), params)).status).toBe(
      403,
    );
  });
  it("requires exact operation keys, revision and explicit NXT submission", async () => {
    expect(
      (await POST(request({ operation: "submit", eventId: "e" }), params))
        .status,
    ).toBe(400);
    expect(
      (
        await POST(
          request({ operation: "submit", confirm: true, extra: true }),
          params,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await POST(
          request({ operation: "submit", confirm: true, revision: "old" }),
          params,
        )
      ).status,
    ).toBe(409);
    expect(mocks.submit).not.toHaveBeenCalled();
    expect(
      (
        await POST(
          request({ operation: "submit", confirm: true, eventId: "e" }),
          params,
        )
      ).status,
    ).toBe(200);
    mocks.submit.mockResolvedValue({ state: "review" });
    expect(
      (await POST(request({ operation: "verify", eventId: "e" }), params))
        .status,
    ).toBe(202);
  });
  it.each(["settings", "assign", "record"])(
    "never calls NXT for local %s",
    async (operation) => {
      mocks.store[operation].mockResolvedValue({ id: "saved" });
      expect((await POST(request({ operation }), params)).status).toBe(200);
      expect(mocks.store[operation]).toHaveBeenCalled();
      expect(mocks.submit).not.toHaveBeenCalled();
    },
  );
  it("redacts unexpected provider and database error details", async () => {
    mocks.store.read.mockRejectedValue(new Error("secret connection"));
    const response = await GET(new Request("https://app.test"), params);
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).not.toContain("secret");
  });
});
