import { describe, expect, it, vi } from "vitest";
import { advancePledge, newPledgeJob, runPledgeBatch } from "./pledgePaymentPipeline";

function memoryStore() {
  const items = new Map();
  const store = { items, job: null,
    saveJob: vi.fn(async (job) => { store.job = structuredClone(job); }),
    discover: vi.fn(async (runId, ids) => { ids.forEach((pledgeId) => {
      if (items.get(pledgeId)?.runId !== runId) items.set(pledgeId, { pledgeId, runId, status: "pending", stage: "gift", draft: {}, payload: items.get(pledgeId)?.payload || null });
    }); }),
    nextItem: vi.fn(async (runId) => structuredClone([...items.values()].find((item) => item.runId === runId && item.status === "pending") || null)),
    saveItem: vi.fn(async (item) => { items.set(item.pledgeId, structuredClone(item)); }),
    counts: async () => ({ total: items.size, failed: [...items.values()].filter((i) => i.status === "failed").length }),
  };
  return store;
}
const giftRead = (id) => ({ id, type: "Pledge", constituent_id: "10", amount: { value: 100 }, balance: { value: 100 } });
async function read(url) {
  if (url.includes("installments")) return { installments: [{ id: "1", date: "2026-09-09", amount: { value: 100 }, balance: 100 }] };
  if (url.includes("pledgepayments")) return { pledge_payments: [] };
  if (url.includes("constituents")) return { id: "10", name: "Test Donor", privateField: "never stored" };
  return giftRead(url.split("/").at(-1));
}
const initial = (id = "1") => ({ pledgeId: id, runId: "run", status: "pending", stage: "gift", draft: {}, payload: null });
const queryFixture = (count = 301) => ({
  metadata: vi.fn(async () => ({ id: 12033, type: "Gift", can_execute: true })),
  create: vi.fn(async () => ({ id: "query-job", status: "Running" })),
  poll: vi.fn(async () => ({ id: "query-job", status: "Completed", row_count: count, sas_uri: "https://results.blob.core.windows.net/result.csv?sig=secret" })),
  download: vi.fn(async () => ({ httpStatus: 200, contentType: "text/csv; charset=windows-1252", body: new TextEncoder().encode(`QRECID\r\n${Array.from({ length: count }, (_, i) => String(i + 1)).join("\r\n")}`) })),
});

describe("resumable pledge payment pipeline", () => {
  it("checkpoints a payment-heavy pledge after each API call and persists only normalized fields", async () => {
    let item = initial();
    const reader = vi.fn(read);
    for (let i = 0; i < 5; i++) item = await advancePledge(item, reader);
    expect(item.status).toBe("success");
    expect(reader).toHaveBeenCalledTimes(4);
    expect(JSON.stringify(item)).not.toContain("privateField");
    expect(item.draft).toEqual({});
  });
  it("checkpoints query discovery separately, then resumes a 301-pledge job after failure on 24", async () => {
    const store = memoryStore();
    let job = newPledgeJob();
    const query = queryFixture();
    let clock = Date.now();
    const now = () => clock;
    const reader = vi.fn(async (url) => {
      if (url.endsWith("/24/installments")) throw Object.assign(new Error("donor secrets"), { httpStatus: 500 });
      return read(url);
    });
    for (let i = 0; i < 4; i++) {
      job = await runPledgeBatch({ job, store, read: reader, query, now });
      if (i < 3) expect(store.items.size).toBe(0);
      clock += 3001;
    }
    expect(query.create).toHaveBeenCalledOnce();
    expect(reader).not.toHaveBeenCalled();
    expect(store.items.size).toBe(301);
    for (let i = 0; i < 22; i++) job = await runPledgeBatch({ job, store, read: reader });
    expect(store.items.get("24").status).toBe("failed");
    expect(store.items.get("25").status).toBe("success");
    const before = reader.mock.calls.filter(([url]) => url.endsWith("/gifts/1")).length;
    while (job.status === "running") job = await runPledgeBatch({ job, store, read: reader });
    expect(job.status).toBe("completed_with_errors");
    expect([...store.items.values()].filter((item) => item.status === "success")).toHaveLength(300);
    expect(reader.mock.calls.filter(([url]) => url.endsWith("/gifts/1"))).toHaveLength(before);
    expect(JSON.stringify(store.job)).not.toContain("donor secrets");
    store.items.set("24", { ...store.items.get("24"), status: "pending", stage: "gift", draft: {} });
    const retry = vi.fn(read);
    job = await runPledgeBatch({ job: { ...job, status: "running" }, store, read: retry });
    expect(job.status).toBe("completed");
    expect(retry.mock.calls.filter(([url]) => url.includes("/gifts/") && !url.includes("/24"))).toHaveLength(0);
  });
  it.each([429, 403])("pauses on HTTP %s with Retry-After and makes no calls before the deadline", async (httpStatus) => {
    const store = memoryStore();
    store.items.set("1", initial());
    const reader = vi.fn().mockRejectedValue(Object.assign(new Error("secret"), { httpStatus, retryAfterMs: 90000 }));
    const now = () => Date.parse("2026-09-09T15:00:00Z");
    let job = await runPledgeBatch({ job: { ...newPledgeJob(), id: "run", status: "running", discoveryComplete: true }, store, read: reader, now });
    expect(job.status).toBe("paused");
    expect(job.resumeAfter).toBe("2026-09-09T15:01:30.000Z");
    expect(store.items.get("1").status).toBe("pending");
    job = await runPledgeBatch({ job, store, read: reader, now });
    expect(reader).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(job)).not.toContain("secret");
  });
  it("preserves last-good values after malformed responses and resumes an interrupted DB save", async () => {
    const store = memoryStore();
    const lastGood = { name: "Saved Donor" };
    store.items.set("1", { ...initial(), payload: lastGood });
    let job = { ...newPledgeJob(), id: "run", status: "running", discoveryComplete: true };
    job = await runPledgeBatch({ job, store, read: async () => "<html>Error</html>" });
    expect(store.items.get("1").payload).toEqual(lastGood);
    store.items.set("1", { ...initial(), payload: lastGood });
    store.saveItem.mockRejectedValueOnce(new Error("database unavailable"));
    job = { ...job, status: "running" };
    await expect(runPledgeBatch({ job, store, read })).rejects.toThrow("database unavailable");
    expect(store.items.get("1").stage).toBe("gift");
    await runPledgeBatch({ job, store, read });
    expect(store.items.get("1").status).toBe("success");
  });
  it("does not run cancelled/completed jobs or exceed the small step budget", async () => {
    const store = memoryStore();
    const reader = vi.fn(read);
    for (const status of ["completed", "cancelled"]) await runPledgeBatch({ job: { status }, store, read: reader });
    expect(reader).not.toHaveBeenCalled();
    store.items.set("1", initial());
    await runPledgeBatch({ job: { ...newPledgeJob(), id: "run", discoveryComplete: true }, store, read: reader, maxSteps: 2 });
    expect(reader).toHaveBeenCalledTimes(2);
    expect(store.items.get("1").stage).toBe("payments");
  });
  it("never resumes the legacy all-pledges scan", async () => {
    const store = memoryStore();
    const reader = vi.fn();
    const job = await runPledgeBatch({ job: { id: "old", status: "discovering", nextUrl: "https://api.sky.blackbaud.com/gift/v1/gifts?gift_type=Pledge" }, store, read: reader });
    expect(job.error.code).toBe("legacy_source_requires_refresh");
    expect(reader).not.toHaveBeenCalled();
    expect(store.discover).not.toHaveBeenCalled();
  });
  it("still skips pledges settled since query execution but never treats a missing balance as zero", async () => {
    const settled = await advancePledge(initial(), async () => ({ ...giftRead("1"), balance: { value: 0 } }));
    expect(settled.status).toBe("success");
    expect(settled.payload).toBeNull();
    await expect(advancePledge(initial(), async () => ({ ...giftRead("1"), balance: undefined }))).rejects.toThrow();
  });
  it("resumes a pledge with many payment gifts without re-fetching completed payment details", async () => {
    const applications = Array.from({ length: 30 }, (_, i) => ({ installmentId: "1", giftId: String(i + 100), amountCents: 1 }));
    const store = memoryStore();
    store.items.set("1", { ...initial(), stage: "payment_details", draft: { applications, paymentGifts: {} } });
    const job = { ...newPledgeJob(), id: "run", discoveryComplete: true, status: "running" };
    const reader = vi.fn(async (url) => ({ id: url.split("/").at(-1), type: "PledgePayment", date: "2026-09-01" }));
    await runPledgeBatch({ job, store, read: reader });
    expect(reader).toHaveBeenCalledTimes(6);
    expect(Object.keys(store.items.get("1").draft.paymentGifts)).toHaveLength(6);
    await runPledgeBatch({ job, store, read: reader });
    expect(reader).toHaveBeenCalledTimes(12);
    expect(reader.mock.calls.filter(([url]) => url.endsWith("/100"))).toHaveLength(1);
    expect(reader.mock.calls[6][0]).toContain("/106");
  });
  it("does not declare a truncated manifest complete when the reported count is larger", async () => {
    const store = memoryStore();
    const query = queryFixture(1);
    query.poll.mockResolvedValue({ id: "query-job", status: "Completed", row_count: 301, sas_uri: "https://results.blob.core.windows.net/result.csv" });
    const job = await runPledgeBatch({ job: { ...newPledgeJob(), queryJobId: "query-job", queryStage: "download" }, store, query });
    expect(job.status).toBe("paused");
    expect(job.discoveryComplete).toBe(false);
    expect(job.error.code).toBe("query_row_count_mismatch");
    expect(store.discover).not.toHaveBeenCalled();
  });
  it.each([429, 403])("retains the same query job on throttling (%s) and excludes SAS/raw data from saved diagnostics", async (httpStatus) => {
    const store = memoryStore();
    const query = queryFixture(1);
    query.download.mockRejectedValueOnce(Object.assign(new Error("donor secret sig=secret"), { httpStatus, retryAfterMs: 5000 }));
    let clock = Date.now();
    let job = await runPledgeBatch({ job: { ...newPledgeJob(), queryJobId: "query-job", queryStage: "download" }, store, query, now: () => clock });
    expect(job.status).toBe("paused");
    expect(store.discover).not.toHaveBeenCalled();
    await runPledgeBatch({ job, store, query, now: () => clock });
    expect(query.download).toHaveBeenCalledOnce();
    clock += 5001;
    job = await runPledgeBatch({ job, store, query, now: () => clock });
    expect(job.discoveryComplete).toBe(true);
    expect(query.create).not.toHaveBeenCalled();
    expect(JSON.stringify(store.job)).not.toContain("secret");
  });
  it("does not automatically submit another query if submission outcome is uncertain", async () => {
    const store = memoryStore();
    const query = queryFixture();
    query.create.mockRejectedValueOnce(new Error("network timeout"));
    let job = await runPledgeBatch({ job: { ...newPledgeJob(), queryStage: "create" }, store, query });
    expect(store.job.queryStage).toBe("creating");
    job = await runPledgeBatch({ job, store, query });
    expect(job.error.code).toBe("query_submission_uncertain");
    expect(query.create).toHaveBeenCalledOnce();
  });
  it("waits for the polling deadline without a request or resetting query progress", async () => {
    const store = memoryStore();
    const query = queryFixture();
    const job = { ...newPledgeJob(), queryStage: "poll", queryJobId: "query-job", nextPollAt: new Date(5000).toISOString() };
    await runPledgeBatch({ job, store, query, now: () => 1000 });
    expect(query.poll).not.toHaveBeenCalled();
    expect(store.saveJob).not.toHaveBeenCalled();
  });
  it("allows a throttled query submission to retry only after its cooldown", async () => {
    const store = memoryStore();
    const query = queryFixture();
    query.create.mockRejectedValueOnce(Object.assign(new Error("throttled"), { httpStatus: 429, retryAfterMs: 5000 }));
    let job = await runPledgeBatch({ job: { ...newPledgeJob(), queryStage: "create" }, store, query, now: () => 1000 });
    expect(job.queryStage).toBe("create");
    expect(job.status).toBe("paused");
    await runPledgeBatch({ job, store, query, now: () => 2000 });
    expect(query.create).toHaveBeenCalledOnce();
    job = await runPledgeBatch({ job, store, query, now: () => 6001 });
    expect(job.queryJobId).toBe("query-job");
    expect(query.create).toHaveBeenCalledTimes(2);
  });
  it("keeps an idempotent manifest and cached values when interrupted during its final save", async () => {
    const store = memoryStore();
    const query = queryFixture(1);
    const original = { ...newPledgeJob(), id: "new", queryJobId: "query-job", queryStage: "download" };
    store.items.set("1", { ...initial(), payload: { name: "Previous cached donor" } });
    store.saveJob.mockImplementation(async (job) => {
      if (job.discoveryComplete) throw new Error("database unavailable");
      store.job = structuredClone(job);
    });
    await expect(runPledgeBatch({ job: original, store, query })).rejects.toThrow("database unavailable");
    expect(store.items.get("1").payload.name).toBe("Previous cached donor");
    expect(store.job.discoveryComplete).toBe(false);
    store.saveJob.mockImplementation(async (job) => { store.job = structuredClone(job); });
    await runPledgeBatch({ job: store.job, store, query });
    expect(store.job.discoveryComplete).toBe(true);
    expect(store.items.size).toBe(1);
    expect(query.create).not.toHaveBeenCalled();
  });
});
