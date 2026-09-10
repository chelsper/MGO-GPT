import { describe, expect, it, vi } from "vitest";
import { advancePledge, newPledgeJob, PLEDGE_LIST_URL, runPledgeBatch, validatePledgePage } from "./pledgePaymentPipeline";

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
  it("uses one paginated discovery page per execution, then resumes a 301-pledge job after failure on 24", async () => {
    const store = memoryStore();
    let job = newPledgeJob();
    const next = `${PLEDGE_LIST_URL}&offset=200`;
    const reader = vi.fn(async (url) => {
      if (url === PLEDGE_LIST_URL) return { value: Array.from({ length: 200 }, (_, i) => ({ id: String(i + 1) })), next_link: next };
      if (url === next) return { value: Array.from({ length: 101 }, (_, i) => ({ id: String(i + 201) })) };
      if (url.endsWith("/24/installments")) throw Object.assign(new Error("donor secrets"), { httpStatus: 500 });
      return read(url);
    });
    job = await runPledgeBatch({ job, store, read: reader });
    expect(store.items.size).toBe(200);
    expect(reader).toHaveBeenCalledTimes(1);
    job = await runPledgeBatch({ job, store, read: reader });
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
  it("rejects pagination outside the filtered SKY endpoint or repeated pages", () => {
    for (const next_link of ["https://evil.example/gift/v1/gifts?gift_type=Pledge", "https://api.sky.blackbaud.com/other?gift_type=Pledge", PLEDGE_LIST_URL, "/gift/v1/gifts?limit=200"]) {
      expect(() => validatePledgePage({ value: [{ id: "1" }], next_link }, PLEDGE_LIST_URL, [])).toThrow();
    }
  });
  it("only skips explicitly settled pledges; an absent balance is not zero", () => {
    const page = validatePledgePage({ value: [
      { id: "1", type: "Pledge", amount: { value: 100 }, balance: { value: 0 } },
      { id: "2", type: "Pledge", amount: { value: 100 } },
      { id: "3", type: "Pledge", amount: { value: 100 }, balance: { value: 20 } },
    ] }, PLEDGE_LIST_URL, []);
    expect(page.settledIds).toEqual(["1"]);
    expect(page.ids).toEqual(["1", "2", "3"]);
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
    const job = await runPledgeBatch({ job: newPledgeJob(), store, read: async () => ({ count: 301, value: [{ id: "1" }] }) });
    expect(job.status).toBe("paused");
    expect(job.discoveryComplete).toBe(false);
    expect(job.error.code).toBe("incomplete_gift_list");
  });
});
