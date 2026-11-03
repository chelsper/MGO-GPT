import { afterEach, expect, it, vi } from "vitest";
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it("preserves original request, headers, body and response while tracking a save", async () => {
  const result = new Response("saved");
  let resolve;
  const nativeFetch = vi.fn(() => new Promise(done => { resolve = done; }));
  vi.stubGlobal("fetch", nativeFetch);
  const { default: fetch } = await import("./fetch");
  const { pendingAppWrites } = await import("@/utils/appWriteActivity");
  const input = new Request(new URL("/api/data-requests/13", window.location.origin), {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: '{"status":"Open"}',
  });
  const init = { credentials: "same-origin", signal: new AbortController().signal };
  const pending = fetch(input, init);
  expect(pendingAppWrites()).toBe(1);
  expect(nativeFetch).toHaveBeenCalledExactlyOnceWith(input, init);
  resolve(result);
  expect(await pending).toBe(result);
  expect(pendingAppWrites()).toBe(0);
  expect(await input.text()).toBe('{"status":"Open"}');
});
