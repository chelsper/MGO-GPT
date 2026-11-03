import { afterEach, expect, it, vi } from "vitest";
import { pendingAppWrites, subscribeAppWrites, trackAppWrite } from "./appWriteActivity";

afterEach(() => { expect(pendingAppWrites()).toBe(0); vi.unstubAllGlobals(); });
it("tracks concurrent saves until each settles, preserving return values and errors", async () => {
  let finish;
  let fail;
  const changes = [];
  const unsubscribe = subscribeAppWrites(() => changes.push(pendingAppWrites()));
  const first = trackAppWrite("/api/data-requests", { method: "POST" }, () => new Promise(resolve => { finish = resolve; }));
  const second = trackAppWrite("/api/data-requests/13", { method: "PATCH" }, () => new Promise((_, reject) => { fail = reject; }));
  expect(pendingAppWrites()).toBe(2);
  finish("saved");
  expect(await first).toBe("saved");
  expect(pendingAppWrites()).toBe(1);
  fail(new Error("cancelled"));
  await expect(second).rejects.toThrow("cancelled");
  expect(changes).toEqual([1, 2, 1, 0]);
  unsubscribe();
});
it.each([
  ["/api/read", undefined], ["/api/read", { method: "HEAD" }],
  ["https://external.test/api/write", { method: "POST" }],
  ["/api/app-release/reload", { method: "POST" }], ["/integrations/write", { method: "POST" }],
])("does not track reads, external requests or the reset itself: %s", async (input, init) => {
  await trackAppWrite(input, init, async () => expect(pendingAppWrites()).toBe(0));
});
it("handles Request and URL inputs and method overrides", async () => {
  const request = new Request(new URL("/api/requests", window.location.origin), { method: "DELETE" });
  await trackAppWrite(request, undefined, async () => expect(pendingAppWrites()).toBe(1));
  await trackAppWrite(request, { method: "GET" }, async () => expect(pendingAppWrites()).toBe(0));
  await trackAppWrite(new URL("/api/requests", window.location.origin), { method: "PUT" }, async () => expect(pendingAppWrites()).toBe(1));
});
it("never lets an observer block a write, including synchronous failures", async () => {
  const unsubscribe = subscribeAppWrites(() => { throw new Error("observer"); });
  const send = vi.fn(() => { throw new Error("network"); });
  await expect(trackAppWrite("/api/write", { method: "POST" }, send)).rejects.toThrow("network");
  expect(send).toHaveBeenCalledTimes(1);
  unsubscribe();
});
it("has no server-side shared write state", async () => {
  vi.stubGlobal("window", undefined);
  await trackAppWrite("/api/write", { method: "POST" }, async () => expect(pendingAppWrites()).toBe(0));
});
