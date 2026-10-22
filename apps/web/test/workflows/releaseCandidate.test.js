// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { candidateOrigin, ju, parseReleaseArgs, runRelease, validateReceipt, verifyReleaseSurface } from "../../scripts/release-candidate.mjs";

const expected = { deploymentId: "dpl_Fictional123", commitSha: "a".repeat(40) };
const origin = "https://mgo-fictional-chelspers-projects.vercel.app";
const args = ["--deployment", expected.deploymentId, "--sha", expected.commitSha];
const metadata = () => ({ id: expected.deploymentId, projectId: ju.projectId, url: origin.slice(8),
  target: "production", readyState: "READY", meta: { githubCommitSha: expected.commitSha } });
const receipt = () => ({ schemaVersion: 1, status: "passed", commitSha: expected.commitSha,
  sourceSha256: "b".repeat(64), completedAt: "2026-10-21T12:00:00Z", workflows: { tests: 1202, files: 54, skipped: 0 },
  typecheck: "passed", build: "passed" });
function response(route) {
  if (route === "/api/version") return Response.json({ ...expected, environment: "production" });
  if (route === "/.well-known/ju-release-checks.json") return Response.json(receipt());
  if (route === "/account/signin") return new Response('<html><script src="/assets/entry.client-fixture.js"></script></html>');
  if (route.startsWith("/assets/")) return new Response("");
  if (route === "/api/auth/providers") return Response.json({ okta: { type: "oidc" } });
  if (route === "/api/auth/session") return Response.json(null);
  if (route === "/integrations/chat-gpt/conversationgpt4") return new Response(null, { status: 410 });
  return new Response(null, { status: 401, headers: { "cache-control": "private, no-store" } });
}
const fetcher = () => vi.fn(async url => response(new URL(url).pathname));
const cli = () => vi.fn(command => command[0] === "api" ? JSON.stringify(metadata()) : "promoted");

describe("JU candidate checks and explicit promotion", () => {
  it("verifies without any promote call", async () => {
    const command = cli();
    await runRelease(["verify", ...args], { cli: command, fetcher: fetcher(), env: {}, log: vi.fn() });
    expect(command).toHaveBeenCalledTimes(1);
    expect(command.mock.calls[0][0][0]).toBe("api");
  });
  it("requires deployment-specific approval before any API or network request", async () => {
    const command = cli(), get = fetcher();
    await expect(runRelease(["promote", ...args], { cli: command, fetcher: get })).rejects.toThrow(/requires/);
    expect(command).not.toHaveBeenCalled(); expect(get).not.toHaveBeenCalled();
  });
  it.each([
    ["verify", "--force", "yes"], ["verify", ...args, "--sha", expected.commitSha],
    ["verify", ...args, "--url", "https://evil.invalid"], ["verify", "--deployment", "dpl_ok"],
    ["promote", ...args, "--approve-production", "dpl_Other"],
    ["verify", ...args, "--approve-production", expected.deploymentId],
    ["verify", "--deployment", "--yes", "--sha", expected.commitSha],
  ])("rejects unsafe or incomplete arguments: %j", values => expect(() => parseReleaseArgs(values)).toThrow());
  it.each([
    { id: "dpl_Other" }, { projectId: "another-project" }, { target: "preview" }, { readyState: "ERROR" },
    { url: "evil.invalid" }, { url: "mgo-test-chelspers-projects.vercel.app/redirect" },
    { meta: { githubCommitSha: "b".repeat(40) } },
  ])("rejects mismatched deployment metadata: %j", override => {
    expect(() => candidateOrigin({ ...metadata(), ...override }, expected)).toThrow(/expected/);
  });
  it.each([
    { status: "failed" }, { commitSha: "b".repeat(40) }, { sourceSha256: "invalid" }, { build: "pending" },
    { typecheck: "skipped" }, { workflows: { tests: 1, files: 1, skipped: 1 } },
    { workflows: { tests: 0, files: 1, skipped: 0 } }, { workflows: { tests: 1, skipped: 0 } },
    { schemaVersion: 0 }, { completedAt: "invalid" },
  ])("rejects missing or incomplete gate evidence: %j", override => {
    expect(() => validateReceipt({ ...receipt(), ...override }, expected)).toThrow(/receipt/);
  });
  it("rejects a missing receipt", () => expect(() => validateReceipt(null, expected)).toThrow(/receipt/));
  it("will not check arbitrary hosts or send bypass credentials to them", async () => {
    const get = fetcher();
    await expect(verifyReleaseSurface("https://evil.invalid", expected, { fetcher: get, bypass: "secret" })).rejects.toThrow(/restricted/);
    expect(get).not.toHaveBeenCalled();
  });
  it("uses read-only requests, never auth cookies, and never follows credential-bearing redirects", async () => {
    const get = fetcher();
    await verifyReleaseSurface(origin, expected, { fetcher: get, bypass: "fictional-bypass" });
    for (const [, options] of get.mock.calls) {
      expect(["GET", "HEAD"]).toContain(options.method);
      expect(options.headers.cookie).toBeUndefined(); expect(options.headers.authorization).toBeUndefined();
      expect(options.redirect).toBe("manual");
      expect(options.headers["x-vercel-protection-bypass"]).toBe("fictional-bypass");
    }
  });
  it.each(["/api/version", "/.well-known/ju-release-checks.json", "/account/signin", "/assets/entry.client-fixture.js",
    "/api/auth/providers", "/api/auth/session", "/api/submissions/export-csv", "/api/submissions/export-my-csv",
    "/api/admin/runtime-diagnostics", "/integrations/chat-gpt/conversationgpt4"])("blocks promotion if %s fails", async route => {
    const command = cli();
    const get = vi.fn(async url => new URL(url).pathname === route ? new Response(null, { status: 503 }) : response(new URL(url).pathname));
    await expect(runRelease(["promote", ...args, "--approve-production", expected.deploymentId],
      { cli: command, fetcher: get, env: {}, log: vi.fn() })).rejects.toThrow(/failed/);
    expect(command.mock.calls.some(([value]) => value[0] === "promote")).toBe(false);
  });
  it("rejects a redirect instead of following it", async () => {
    await expect(verifyReleaseSurface(origin, expected, { fetcher: async () => new Response(null,
      { status: 302, headers: { location: "https://evil.invalid" } }) })).rejects.toThrow(/302/);
  });
  it.each([
    ["/api/version", () => Response.json({ ...expected, deploymentId: "dpl_Old", environment: "production" })],
    ["/api/auth/providers", () => Response.json({})],
    ["/account/signin", () => new Response("error page")],
    ["/api/submissions/export-csv", () => new Response(null, { status: 401 })],
  ])("rejects invalid response content for %s", async (route, bad) => {
    await expect(verifyReleaseSurface(origin, expected, { fetcher: async url => new URL(url).pathname === route ? bad() : response(new URL(url).pathname) }))
      .rejects.toThrow();
  });
  it("promotes only the checked deployment, then verifies production without a bypass", async () => {
    const command = cli(), get = fetcher();
    await runRelease(["promote", ...args, "--approve-production", expected.deploymentId],
      { cli: command, fetcher: get, env: { VERCEL_AUTOMATION_BYPASS_SECRET: "fictional-bypass" }, log: vi.fn() });
    expect(command.mock.calls.map(([value]) => value[0])).toEqual(["api", "api", "promote"]);
    expect(command.mock.calls[2][0]).toEqual(["promote", expected.deploymentId, "--yes", "--scope", ju.scope]);
    const live = get.mock.calls.filter(([url]) => url.startsWith(ju.production));
    expect(live.length).toBeGreaterThan(0);
    expect(live.every(([, options]) => !options.headers["x-vercel-protection-bypass"])).toBe(true);
  });
  it("does not retry promotion or roll back automatically after a live verification failure", async () => {
    const command = cli();
    await expect(runRelease(["promote", ...args, "--approve-production", expected.deploymentId],
      { cli: command, fetcher: async url => url.startsWith(ju.production) ? new Response(null, { status: 503 }) : response(new URL(url).pathname),
        env: {}, log: vi.fn() })).rejects.toThrow(/Promotion was requested/);
    expect(command.mock.calls.filter(([value]) => value[0] === "promote")).toHaveLength(1);
  });
});
