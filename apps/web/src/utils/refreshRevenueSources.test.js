import { expect, it, vi } from "vitest";
import { refreshRevenueSources, REVENUE_REFRESH_SOURCES } from "./refreshRevenueSources";

const saved = key => ({ canManage: true, revision: `${key}-saved`, source: { queryName: key }, snapshot: { total: 10 }, job: null });
const json = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });
function harness(handle = () => null) {
  const calls = [];
  const fetcher = vi.fn(async (url, options) => {
    const source = REVENUE_REFRESH_SOURCES.find(item => item.url === url);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ key: source.key, body });
    return handle(source.key, body, calls) || json(body ? { ...saved(source.key), revision: `${source.key}-updated` } : saved(source.key));
  });
  return { calls, fetcher, onData: vi.fn(), onProgress: vi.fn(), wait: vi.fn().mockResolvedValue() };
}
it("refreshes each source sequentially using its latest saved settings and revision", async () => {
  const h = harness();
  const results = await refreshRevenueSources(h);
  expect(results.map(result => result.status)).toEqual(["updated", "updated", "updated"]);
  expect(h.calls.map(call => call.key)).toEqual(["reinvestment", "reinvestment", "cash", "cash", "pledges", "pledges"]);
  for (const call of h.calls.filter(call => call.body)) expect(call.body).toEqual({ operation: "refresh", input: saved(call.key).source, revision: `${call.key}-saved` });
  expect(h.onData).toHaveBeenCalledTimes(6);
  expect(h.fetcher.mock.calls.every(([url, options]) => url.startsWith("/api/reports/fy-revenue-goals") && options.cache === "no-store")).toBe(true);
});
it("keeps successful sources and continues to other sources after a validation failure", async () => {
  const h = harness((key, body) => key === "cash" && body ? json({ error: "Query outputs changed. Reload fields." }, 409) : null);
  const results = await refreshRevenueSources(h);
  expect(results.map(result => result.status)).toEqual(["updated", "error", "updated"]);
  expect(results[1].message).toMatch(/Reload fields/);
  expect(h.onData.mock.calls.filter(([key]) => key === "cash")).toEqual([["cash", saved("cash")]]);
});
it("skips unconnected sources without posting guessed settings", async () => {
  const h = harness(key => key === "cash" ? json({ canManage: true, source: null, revision: null }) : null);
  expect((await refreshRevenueSources(h))[1].status).toBe("skipped");
  expect(h.calls.filter(call => call.key === "cash")).toHaveLength(1);
});
it.each([401, 403])("stops immediately on lost access (%s)", async status => {
  const h = harness(key => key === "cash" ? json({ error: "Access denied." }, status) : null);
  await expect(refreshRevenueSources(h)).rejects.toMatchObject({ status });
  expect(h.calls.some(call => call.key === "pledges")).toBe(false);
});
it("does not post when the latest saved response no longer allows management", async () => {
  const h = harness(() => json({ ...saved("reinvestment"), canManage: false }));
  await expect(refreshRevenueSources(h)).rejects.toMatchObject({ status: 403 });
  expect(h.calls).toHaveLength(1);
});
it("honors throttling without retrying or starting more sources", async () => {
  const h = harness((key, body) => key === "cash" && body ? json({ error: "NXT requested a pause." }, 429) : null);
  const results = await refreshRevenueSources(h);
  expect(results.map(result => result.status)).toEqual(["updated", "error", "attention"]);
  expect(h.calls.some(call => call.key === "pledges")).toBe(false);
});
it("waits for all pledge balance batches before reporting completion", async () => {
  const h = harness((key, body) => {
    if (key !== "pledges" || !body) return null;
    if (body.operation === "refresh") return json({ ...saved(key), revision: "batch-one", job: { status: "running", completed: 0, total: 4 } });
    if (body.revision === "batch-one") return json({ ...saved(key), revision: "batch-two", job: { status: "running", completed: 3, total: 4 } });
    return json({ ...saved(key), revision: "finished" });
  });
  expect((await refreshRevenueSources(h))[2].status).toBe("updated");
  expect(h.calls.filter(call => call.body?.operation === "continue").map(call => call.body.revision)).toEqual(["batch-one", "batch-two"]);
  expect(h.wait).toHaveBeenCalledTimes(2);
  expect(h.onData).toHaveBeenLastCalledWith("pledges", expect.objectContaining({ revision: "finished", job: null }));
});
it("resumes an existing pledge job without rerunning its query", async () => {
  const h = harness((key, body) => key === "pledges" && !body ? json({ ...saved(key), job: { source: saved(key).source, status: "running", completed: 3, total: 4 } }) : null);
  await refreshRevenueSources(h);
  expect(h.calls.filter(call => call.key === "pledges").map(call => call.body?.operation)).toEqual([undefined, "continue"]);
});
it.each(["paused", "blocked"])("preserves a %s pledge job and does not claim it is complete", async status => {
  const h = harness((key, body) => key === "pledges" && body ? json({ ...saved(key), job: { status, error: "Review saved pledge status." } }) : null);
  const results = await refreshRevenueSources(h);
  expect(results[2]).toMatchObject({ status: "attention", message: "Review saved pledge status." });
  expect(h.wait).not.toHaveBeenCalled();
});
it("does not poll or restart a rate-limited existing pledge job", async () => {
  const h = harness(key => key === "pledges" ? json({ ...saved(key), job: { status: "paused", resumeAfter: "2099-01-01T00:00:00Z" } }) : null);
  expect((await refreshRevenueSources(h))[2]).toMatchObject({ status: "attention", message: expect.stringContaining("paused until") });
  expect(h.calls.filter(call => call.key === "pledges")).toHaveLength(1);
});
it("aborts on navigation without starting subsequent requests", async () => {
  const controller = new AbortController();
  const h = harness((key, body) => { if (body) controller.abort(); return null; });
  await expect(refreshRevenueSources({ ...h, signal: controller.signal })).rejects.toMatchObject({ name: "AbortError" });
  expect(h.calls).toHaveLength(2);
  expect(h.onData).toHaveBeenCalledTimes(1);
});
