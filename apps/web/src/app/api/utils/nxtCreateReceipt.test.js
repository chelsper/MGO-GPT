import { beforeEach, expect, it, vi } from "vitest";
const sql = vi.hoisted(() => vi.fn());
vi.mock("./sql", () => ({ default: sql }));
vi.mock("./ensureAppSchema", () => ({ default: vi.fn() }));
import { guardedNxtCreate, completeNxtCreateReceipt, createFingerprint, nxtCreateFailure } from "./nxtCreateReceipt";

let rows, failIdCheckpoint, failClaim, failComplete;
const options = () => ({ ownerUserId: 7, enteredByUserId: 2, kind: "action", source: "test:1",
  requestData: { summary: "Call", actionDate: "2026-09-21" },
  payload: { constituent_id: "123", summary: "Call", date: "2026-09-21" },
  onReceipt: vi.fn(), create: vi.fn(async () => ({ id: "456" })) });
beforeEach(() => {
  rows = []; failIdCheckpoint = false; failClaim = false; failComplete = false;
  sql.mockReset().mockImplementation(async (parts, ...v) => {
    const query = parts.join("?");
    if (query.includes("INSERT INTO")) {
      if (failClaim) throw new Error("database unavailable");
      const [owner, actor, kind, constituent, requestHash, payloadHash, payload] = v;
      if (rows.some(row => row.owner_user_id === owner && row.kind === kind &&
        (row.request_hash === requestHash || row.payload_hash === payloadHash || row.constituent_id === constituent && ["processing", "review", "created"].includes(row.state)))) return [];
      const row = { id: String(rows.length + 1), owner_user_id: owner, entered_by_user_id: actor, kind,
        constituent_id: constituent, request_hash: requestHash, payload_hash: payloadHash, payload: JSON.parse(payload), state: "processing" };
      rows.push(row); return [structuredClone(row)];
    }
    if (query.includes("SELECT *")) return rows.filter(row => row.owner_user_id === v[0] && row.kind === v[1] &&
      (row.request_hash === v[2] || row.payload_hash === v[3] || row.constituent_id === v[4] && ["processing", "review", "created"].includes(row.state))).map(row => structuredClone(row));
    if (query.includes("state = 'created'")) {
      if (failIdCheckpoint) throw new Error("checkpoint failed");
      if (query.includes("state = 'complete'")) {
        if (failComplete) throw new Error("finalize failed");
        const row = rows.find(row => row.id === v[0] && row.state === "created");
        if (!row) return []; row.state = "complete"; return [{ id: row.id }];
      }
      const row = rows.find(row => row.id === v[1] && row.state === "processing");
      if (!row) return []; row.remote_id = v[0]; row.state = "created"; return [structuredClone(row)];
    }
    if (query.includes("state = 'review'")) {
      const row = rows.find(row => row.id === v[0] && row.state === "processing");
      if (row) row.state = "review";
      return [];
    }
    throw new Error(`Unexpected test SQL: ${query}`);
  });
});
it("fingerprints nested content independent of key order", () => {
  expect(createFingerprint({ b: { x: 1, y: 2 }, a: [1, 2] })).toBe(createFingerprint({ a: [1, 2], b: { y: 2, x: 1 } }));
});
it("claims before sending and checkpoints the returned ID before local completion", async () => {
  const opt = options();
  opt.create.mockImplementation(async () => { expect(rows[0].state).toBe("processing"); return { id: "456" }; });
  await guardedNxtCreate(opt);
  expect(rows[0]).toMatchObject({ state: "created", remote_id: "456", entered_by_user_id: 2 });
  await completeNxtCreateReceipt(opt.onReceipt.mock.calls.at(-1)[0]);
  expect(rows[0].state).toBe("complete");
  await expect(guardedNxtCreate(opt)).rejects.toHaveProperty("writeReceipt.state", "complete");
  expect(opt.create).toHaveBeenCalledTimes(1);
});
it.each([{ value: { id: "456" } }, { action_id: 456 }, { constituent_action_id: "456" }])("normalizes accepted ID responses for legacy callers: %j", async result => {
  const opt = options(); opt.create.mockResolvedValue(result);
  expect(await guardedNxtCreate(opt)).toMatchObject({ id: "456" });
  expect(rows[0].remote_id).toBe("456");
});
it.each(["timeout", "HTTP 503", "HTTP 404", "connection failed"])("holds %s results permanently against identical and edited retries", async error => {
  const opt = options(); opt.create.mockRejectedValue(new Error(error));
  await expect(guardedNxtCreate(opt)).rejects.toHaveProperty("writeReceipt.id", "1");
  await expect(guardedNxtCreate(opt)).rejects.toHaveProperty("writeReceipt.id", "1");
  await expect(guardedNxtCreate({ ...opt, source: "other-form", requestData: { summary: "edited" }, payload: { ...opt.payload, summary: "edited" } })).rejects.toHaveProperty("writeReceipt.id", "1");
  expect(opt.create).toHaveBeenCalledTimes(1);
  expect(rows[0].state).toBe("review");
});
it("allows only one concurrent create for the same constituent", async () => {
  const opt = options();
  const results = await Promise.allSettled([guardedNxtCreate(opt), guardedNxtCreate({ ...opt, requestData: { title: "changed" }, payload: { ...opt.payload, summary: "changed" } })]);
  expect(results.map(result => result.status).sort()).toEqual(["fulfilled", "rejected"]);
  expect(opt.create).toHaveBeenCalledTimes(1);
});
it("blocks cross-form identical provider payloads after completion", async () => {
  const opt = options(); await guardedNxtCreate(opt); await completeNxtCreateReceipt(rows[0]);
  await expect(guardedNxtCreate({ ...opt, source: "other-form", requestData: { something: "different" } })).rejects.toHaveProperty("writeReceipt.id", "1");
  expect(opt.create).toHaveBeenCalledTimes(1);
});
it("never sends without a durable claim", async () => {
  failClaim = true; const opt = options();
  await expect(guardedNxtCreate(opt)).rejects.toThrow(); expect(opt.create).not.toHaveBeenCalled();
});
it("retains the guard if the provider succeeds but the ID checkpoint fails", async () => {
  const opt = options(); failIdCheckpoint = true;
  await expect(guardedNxtCreate(opt)).rejects.toHaveProperty("writeReceipt.id", "1");
  failIdCheckpoint = false;
  await expect(guardedNxtCreate(opt)).rejects.toHaveProperty("writeReceipt.id", "1");
  expect(opt.create).toHaveBeenCalledTimes(1);
});
it("retains the ID and prevents replay if local completion fails", async () => {
  const opt = options(); await guardedNxtCreate(opt); failComplete = true;
  await expect(completeNxtCreateReceipt(rows[0])).rejects.toThrow();
  await expect(guardedNxtCreate(opt)).rejects.toHaveProperty("writeReceipt.remote_id", "456");
  expect(opt.create).toHaveBeenCalledTimes(1);
});
it.each([{}, { id: "bad" }, null])("holds a response without a valid system ID: %j", async result => {
  const opt = options(); opt.create.mockResolvedValue(result);
  await expect(guardedNxtCreate(opt)).rejects.toHaveProperty("writeReceipt.id", "1");
  expect(rows[0].state).toBe("review");
});
it("does not block other owners or constituents, or genuine different requests after completion", async () => {
  const opt = options(); await guardedNxtCreate(opt);
  await guardedNxtCreate({ ...opt, ownerUserId: 8 });
  await guardedNxtCreate({ ...opt, requestData: { target: "other" }, payload: { ...opt.payload, constituent_id: "999" } });
  await completeNxtCreateReceipt(rows[0]);
  await guardedNxtCreate({ ...opt, requestData: { summary: "another call" }, payload: { ...opt.payload, summary: "another call" } });
  expect(opt.create).toHaveBeenCalledTimes(4);
});
it("never includes provider errors or action notes in public error responses", async () => {
  const response = nxtCreateFailure(new Error("secret token"), { id: "1", kind: "action", state: "review", payload: { description: "private notes" } });
  expect(response.status).toBe(409);
  const text = await response.text(); expect(text).not.toMatch(/secret token|private notes/);
});
