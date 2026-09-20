import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  user: vi.fn(),
  record: vi.fn(),
  read: vi.fn(),
  claim: vi.fn(),
  checkpoint: vi.fn(),
  advance: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: mocks.user }));
vi.mock("@/app/api/utils/listConfigurations", async (original) => ({
  ...(await original()),
  getListRecord: mocks.record,
}));
vi.mock("@/app/api/utils/portfolioGivingReportStore", () => ({
  readPortfolioReport: mocks.read,
  claimPortfolioReport: mocks.claim,
  checkpointPortfolioReport: mocks.checkpoint,
}));
vi.mock("@/app/api/utils/constituentListRefresh", async (original) => ({
  ...(await original()),
  advanceListRefresh: mocks.advance,
}));
vi.mock("@/app/api/utils/sql", () => ({ default: vi.fn() }));
import { GET, POST } from "./route";
const record = {
  report_key: "list-demo",
  title: "Demo",
  active: true,
  specific_user_ids: [1],
  revision: "1",
  data_configuration: {
    version: 1,
    source: "custom_field",
    fieldCategory: "Interests",
    fieldDescription: "Golf",
  },
};
const params = { params: { listKey: "list-demo" } };
const req = (body, headers = {}) =>
  new Request(
    "https://example.test/api/reports/lists/list-demo?refresh=1",
    body ? { method: "POST", headers, body: JSON.stringify(body) } : {},
  );
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { email: "test@example.test" } });
  mocks.user.mockResolvedValue({ id: 1, active: true, role: "mgo" });
  mocks.record.mockResolvedValue(record);
  mocks.read.mockResolvedValue({ snapshot: { total: 0, rows: [] }, job: null });
  mocks.claim.mockImplementation(async (keys, previous, next) => ({
    ...next,
    revision: "lease",
  }));
  mocks.advance.mockImplementation(async ({ job }) => ({
    job: { ...job, status: "complete" },
    snapshot: { total: 1, rows: [] },
  }));
  mocks.checkpoint.mockResolvedValue(true);
});
it("GET only reads saved data even with refresh query parameter", async () => {
  const response = await GET(req(), params);
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toMatchObject({
    snapshot: { total: 0 },
    report: { canView: true },
  });
  expect(mocks.advance).not.toHaveBeenCalled();
  expect(mocks.claim).not.toHaveBeenCalled();
});
it("rejects unauthenticated, inactive, unassigned, and disabled access before reading data", async () => {
  mocks.auth.mockResolvedValueOnce(null);
  expect((await GET(req(), params)).status).toBe(401);
  mocks.user.mockResolvedValueOnce({ id: 1, active: false, role: "admin" });
  expect((await GET(req(), params)).status).toBe(403);
  mocks.user.mockResolvedValueOnce({ id: 2, active: true, role: "admin" });
  expect((await GET(req(), params)).status).toBe(403);
  mocks.record.mockResolvedValueOnce({ ...record, active: false });
  expect((await GET(req(), params)).status).toBe(403);
  expect(mocks.read).not.toHaveBeenCalled();
});
it("rejects cross-site refreshes and client-supplied rows or sources", async () => {
  expect(
    (
      await POST(
        req({ action: "start" }, { origin: "https://evil.test" }),
        params,
      )
    ).status,
  ).toBe(403);
  expect((await POST(req({ action: "start", rows: [] }), params)).status).toBe(
    400,
  );
  expect(mocks.advance).not.toHaveBeenCalled();
});
it("honors durable leases, cooldowns and completed continuations without new NXT reads", async () => {
  for (const job of [
    { leaseUntil: Date.now() + 60000 },
    { retryAt: new Date(Date.now() + 60000).toISOString() },
    { id: "done", status: "complete" },
  ]) {
    mocks.read.mockResolvedValue({ snapshot: null, job });
    expect(
      (await POST(req({ action: "continue", jobId: "done" }), params)).status,
    ).toBe(200);
  }
  expect(mocks.advance).not.toHaveBeenCalled();
});
it("keeps the last good snapshot on a failed provider phase", async () => {
  mocks.advance.mockRejectedValueOnce(new Error("429 provider details"));
  const response = await POST(req({ action: "start" }), params);
  expect(response.status).toBe(200);
  expect(mocks.checkpoint.mock.calls[0][2]).toMatchObject({ status: "paused" });
  expect(mocks.checkpoint.mock.calls[0][3]).toBeUndefined();
  expect(await response.json()).toMatchObject({ snapshot: { total: 0 } });
});
it("does not publish after a configuration revision or permission changes", async () => {
  mocks.record
    .mockResolvedValueOnce(record)
    .mockResolvedValueOnce({ ...record, revision: "2" });
  expect((await POST(req({ action: "start" }), params)).status).toBe(409);
  expect(mocks.checkpoint).not.toHaveBeenCalled();
});
it("returns cached query previews without repeatedly running a query that needs mapping changes", async () => {
  const job = {
    id: "mapping-job",
    status: "needs_configuration",
    stage: "mapping",
    table: { headers: ["Name"], rows: [["Example"]] },
    message: "Choose the correct ID field.",
  };
  mocks.read.mockResolvedValue({ snapshot: { total: 0, rows: [] }, job });
  for (const response of [
    await GET(req(), params),
    await POST(req({ action: "start" }), params),
    await POST(req({ action: "continue", jobId: job.id }), params),
    await POST(req({ action: "restart" }), params),
  ]) {
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      snapshot: { total: 0 },
      queryOutput: { headers: ["Name"], tableRows: [["Example"]] },
      refresh: { status: "needs_configuration" },
      report: { canConfigure: false },
    });
  }
  expect(mocks.advance).not.toHaveBeenCalled();
  expect(mocks.claim).not.toHaveBeenCalled();
  expect(mocks.checkpoint).not.toHaveBeenCalled();
});
it("checkpoints a configuration hold and its preview without replacing the last good list", async () => {
  mocks.advance.mockImplementationOnce(async ({ job }) => ({
    job: {
      ...job,
      status: "needs_configuration",
      stage: "mapping",
      table: { headers: ["Name"], rows: [["Example"]] },
    },
    snapshot: null,
  }));
  expect((await POST(req({ action: "start" }), params)).status).toBe(200);
  expect(mocks.checkpoint.mock.calls[0][2]).toMatchObject({
    status: "needs_configuration",
    table: { headers: ["Name"] },
  });
  expect(mocks.checkpoint.mock.calls[0][3]).toBeNull();
});
it("allows an explicit restart after a saved query is edited in NXT without changing its ID", async () => {
  mocks.record.mockResolvedValue({
    ...record,
    data_configuration: {
      version: 1,
      source: "saved_query",
      queryId: "123",
      fieldCategory: "",
      fieldDescription: "",
    },
  });
  mocks.read.mockResolvedValue({
    snapshot: { total: 0 },
    job: { id: "old", status: "needs_configuration", stage: "mapping" },
  });
  for (const action of ["start", "continue"]) {
    await POST(req({ action, jobId: "old" }), params);
  }
  expect(mocks.advance).not.toHaveBeenCalled();
  expect((await POST(req({ action: "restart" }), params)).status).toBe(200);
  expect(mocks.advance).toHaveBeenCalledTimes(1);
  expect(mocks.advance.mock.calls[0][0].job).toMatchObject({
    status: "running",
    stage: "members",
  });
  expect(mocks.advance.mock.calls[0][0].job.id).not.toBe("old");
});
