import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  workspace: vi.fn(),
  schema: vi.fn(),
  ownSchema: vi.fn(),
  read: vi.fn(),
  acquire: vi.fn(),
  view: vi.fn(),
  send: vi.fn(),
  prepare: vi.fn(),
  finish: vi.fn(),
  release: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: mocks.schema }));
vi.mock("@/app/api/utils/getWorkspaceUser", () => ({
  default: mocks.workspace,
}));
vi.mock("@/app/api/utils/organizationSettings", () => ({
  getOrganizationSettings: async () => ({ timeZone: "America/New_York" }),
}));
vi.mock("@/app/api/utils/givingSocietyConfigurations", () => ({
  listGivingSocietyConfigurations: async () => [],
}));
vi.mock("@/app/api/utils/societyLetterStore", () => ({
  ensureSocietyLetterSchema: mocks.ownSchema,
  readSocietyLetterState: mocks.read,
  acquireSocietyLetters: mocks.acquire,
}));
vi.mock("@/app/api/utils/societyLetterWorkflow", () => ({
  letterWorkspace: mocks.view,
  previewLetters: vi.fn(),
  prepareLetterBatch: mocks.prepare,
  updateLetterSettings: vi.fn(),
  saveLetterTemplate: vi.fn(),
  refreshLetterSource: vi.fn(),
  sendLetterBatch: mocks.send,
  verifyLetterEmail: vi.fn(),
}));
vi.mock("@/app/api/utils/societyLetterDocuments", () => ({
  letterArchive: vi.fn(() => Buffer.from("zip")),
  renderSocietyLetter: vi.fn(),
}));
import { GET, POST } from "./route";
const url = "https://example.org/api/stewardship/society-letters";
const request = (body, headers = {}) =>
  new Request(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://example.org",
      ...headers,
    },
    body: JSON.stringify(body),
  });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "staff@example.org" } });
  mocks.release.mockResolvedValue(undefined);
  mocks.workspace.mockResolvedValue({
    sessionUser: { id: 1, active: true, role: "advancement_services" },
    workspaceUser: { role: "mgo" },
  });
  mocks.read.mockResolvedValue({
    revision: 3,
    settings: null,
    templates: {},
    history: [],
  });
  mocks.view.mockReturnValue({ revision: 3, rows: [] });
  mocks.acquire.mockResolvedValue({
    release: mocks.release,
    finishBatch: mocks.finish,
  });
});
describe("stewardship API authorization and delivery boundaries", () => {
  it("requires authentication before any database work", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await GET(new Request(url))).status).toBe(401);
    expect(mocks.schema).not.toHaveBeenCalled();
  });
  it.each(["mgo", "executive"])(
    "denies %s regardless of an impersonated reviewer workspace",
    async (role) => {
      mocks.workspace.mockResolvedValue({
        sessionUser: { id: 1, active: true, role },
        workspaceUser: { role: "admin" },
      });
      expect((await GET(new Request(url))).status).toBe(403);
      expect(mocks.read).not.toHaveBeenCalled();
      expect(mocks.ownSchema).not.toHaveBeenCalled();
    },
  );
  it("denies inactive users", async () => {
    mocks.workspace.mockResolvedValue({
      sessionUser: { id: 1, active: false, role: "admin" },
    });
    expect((await GET(new Request(url))).status).toBe(403);
  });
  it("reads private saved state without preparing or sending letters", async () => {
    const response = await GET(new Request(url));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.acquire).not.toHaveBeenCalled();
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("rejects cross-site mutations before authentication", async () => {
    expect(
      (
        await POST(
          request(
            { action: "send", revision: 3 },
            { Origin: "https://bad.example.org" },
          ),
        )
      ).status,
    ).toBe(403);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(
      (
        await POST(
          request(
            { action: "send", revision: 3 },
            { "sec-fetch-site": "cross-site" },
          ),
        )
      ).status,
    ).toBe(403);
  });
  it("fails closed when another request owns the lease", async () => {
    mocks.acquire.mockRejectedValueOnce(
      Object.assign(new Error("Changed; reload"), { status: 409 }),
    );
    expect((await POST(request({ action: "send", revision: 3 }))).status).toBe(
      409,
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("keeps preparation separate from email transport", async () => {
    mocks.prepare.mockResolvedValue("batch");
    const response = await POST(request({ action: "prepare", revision: 3 }));
    expect(response.status).toBe(200);
    expect(mocks.prepare).toHaveBeenCalledOnce();
    expect(mocks.send).not.toHaveBeenCalled();
    expect(mocks.release).toHaveBeenCalledOnce();
  });
  it("marks only confirmed postal batches mailed with one atomic operation", async () => {
    mocks.read.mockResolvedValue({
      revision: 3,
      templates: {},
      history: [{ batchId: "batch", channel: "post", status: "prepared" }],
    });
    expect(
      (await POST(request({ action: "mailed", revision: 3, batchId: "batch" })))
        .status,
    ).toBe(422);
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(
      (
        await POST(
          request({
            action: "mailed",
            revision: 3,
            batchId: "batch",
            confirm: true,
          }),
        )
      ).status,
    ).toBe(200);
    expect(mocks.finish).toHaveBeenCalledWith("batch", "mailed");
    expect(mocks.send).not.toHaveBeenCalled();
  });
  it("does not permit uncertain emails to be cancelled and made sendable again", async () => {
    mocks.read.mockResolvedValue({
      history: [{ batchId: "batch", channel: "email", status: "needs_review" }],
    });
    expect(
      (
        await POST(
          request({
            action: "cancel",
            revision: 3,
            batchId: "batch",
            confirm: true,
          }),
        )
      ).status,
    ).toBe(422);
    expect(mocks.finish).not.toHaveBeenCalled();
  });
  it("does not mark a downloaded postal archive as mailed", async () => {
    mocks.read.mockResolvedValue({
      templates: {},
      history: [{ batchId: "batch", channel: "post", status: "prepared" }],
    });
    const response = await GET(new Request(`${url}?download=batch`));
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(mocks.finish).not.toHaveBeenCalled();
    expect(mocks.acquire).not.toHaveBeenCalled();
  });
});
