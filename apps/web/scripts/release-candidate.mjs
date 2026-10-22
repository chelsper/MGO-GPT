import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const ju = Object.freeze({ projectId: "prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY",
  teamId: "team_3IFhURAiYjacqM7q8OIl6z0G", scope: "chelspers-projects", production: "https://www.jumgogpt.app" });

export function parseReleaseArgs(args) {
  const [command, ...options] = args;
  if (!["verify", "promote"].includes(command)) throw new Error("Choose verify or promote.");
  const result = { command };
  const names = { "--deployment": "deploymentId", "--sha": "commitSha", "--approve-production": "approval" };
  for (let i = 0; i < options.length; i += 2) {
    const key = names[options[i]];
    if (!key || result[key] || !options[i + 1]) throw new Error("Unknown, duplicate, or incomplete release argument.");
    result[key] = options[i + 1];
  }
  if (!/^dpl_[A-Za-z0-9]+$/.test(result.deploymentId || "") || !/^[a-f0-9]{40}$/.test(result.commitSha || "")) {
    throw new Error("Supply the exact --deployment ID and full --sha.");
  }
  if ((command === "promote" && result.approval !== result.deploymentId) ||
      (command === "verify" && result.approval)) {
    throw new Error("Promotion requires --approve-production matching this exact deployment, after user approval.");
  }
  return result;
}

export function candidateOrigin(deployment, expected) {
  if (deployment.id !== expected.deploymentId || deployment.projectId !== ju.projectId ||
      deployment.target !== "production" || deployment.readyState !== "READY" ||
      (deployment.meta?.githubCommitSha || deployment.gitSource?.sha) !== expected.commitSha ||
      !/^mgo-[a-z0-9]+-chelspers-projects\.vercel\.app$/.test(deployment.url || "")) {
    throw new Error("Candidate is not the expected ready JU production deployment.");
  }
  return `https://${deployment.url}`;
}

export function validateReceipt(receipt, expected) {
  if (receipt?.schemaVersion !== 1 || receipt.status !== "passed" || receipt.commitSha !== expected.commitSha ||
      !/^[a-f0-9]{64}$/.test(receipt.sourceSha256 || "") || receipt.build !== "passed" || receipt.typecheck !== "passed" ||
      !Number.isSafeInteger(receipt.workflows?.tests) || receipt.workflows.tests < 1 ||
      !Number.isSafeInteger(receipt.workflows?.files) || receipt.workflows.files < 1 || receipt.workflows.skipped !== 0 ||
      !Number.isFinite(Date.parse(receipt.completedAt))) {
    throw new Error("Candidate has no valid, matching release-gate receipt. Build it through npm run build.");
  }
}

export async function verifyReleaseSurface(origin, expected, { fetcher = fetch, bypass } = {}) {
  if (origin !== ju.production && !/^https:\/\/mgo-[a-z0-9]+-chelspers-projects\.vercel\.app$/.test(origin)) {
    throw new Error("Release checks are restricted to JU.");
  }
  async function request(route, status, accept = "application/json", method = "GET") {
    const headers = { accept, "cache-control": "no-cache" };
    // Never follow redirects with a bypass credential or send it to production.
    if (origin !== ju.production && bypass) headers["x-vercel-protection-bypass"] = bypass;
    const response = await fetcher(`${origin}${route}`, { method, headers, cache: "no-store", redirect: "manual",
      signal: AbortSignal.timeout(15000) });
    if (response.status !== status) throw new Error(`Release check failed: ${route} expected ${status}, got ${response.status}.`);
    return response;
  }
  const version = await (await request("/api/version", 200)).json();
  if (version.commitSha !== expected.commitSha || version.deploymentId !== expected.deploymentId || version.environment !== "production") {
    throw new Error("Release version does not match the approved candidate.");
  }
  const receipt = await (await request("/.well-known/ju-release-checks.json", 200)).json();
  validateReceipt(receipt, expected);
  const signin = await (await request("/account/signin", 200, "text/html")).text();
  const assets = [...new Set(signin.match(/\/assets\/[A-Za-z0-9_.-]+\.js/g) || [])];
  if (!assets.length) throw new Error("Sign-in page has no built JavaScript assets.");
  for (const asset of assets.slice(0, 3)) await request(asset, 200, "*/*", "HEAD");
  const providers = await (await request("/api/auth/providers", 200)).json();
  if (providers.okta?.type !== "oidc" && providers.okta?.type !== "oauth") throw new Error("Okta sign-in provider is unavailable.");
  await request("/api/auth/session", 200);
  for (const route of ["/api/submissions/export-csv", "/api/submissions/export-my-csv", "/api/admin/runtime-diagnostics"]) {
    const response = await request(route, 401);
    if (!response.headers.get("cache-control")?.includes("no-store")) throw new Error(`Protected response is cacheable: ${route}.`);
  }
  await request("/integrations/chat-gpt/conversationgpt4", 410);
  return { deploymentId: expected.deploymentId, commitSha: expected.commitSha, tests: receipt.workflows.tests,
    checked: "release receipt, assets, sign-in availability and anonymous access boundaries" };
}

export function vercelCommand(args) {
  const result = spawnSync("vercel", args, { encoding: "utf8", timeout: 5 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 });
  // API output can contain secrets. Never echo raw CLI output on an error.
  if (result.error || result.status !== 0 || result.signal) throw new Error("Vercel command failed; inspect securely before retrying. Do not assume promotion succeeded.");
  return result.stdout;
}

export async function runRelease(args, { cli = vercelCommand, fetcher = fetch, env = process.env, log = console.log } = {}) {
  const options = parseReleaseArgs(args);
  const getDeployment = () => JSON.parse(cli(["api", `/v13/deployments/${options.deploymentId}?teamId=${ju.teamId}`, "--raw"]));
  const origin = candidateOrigin(getDeployment(), options);
  const result = await verifyReleaseSurface(origin, options, { fetcher, bypass: env.VERCEL_AUTOMATION_BYPASS_SECRET });
  log(`Candidate verified: ${result.commitSha} (${result.tests} workflow tests).`);
  if (options.command === "verify") return result;
  candidateOrigin(getDeployment(), options);
  cli(["promote", options.deploymentId, "--yes", "--scope", ju.scope]);
  try {
    await verifyReleaseSurface(ju.production, options, { fetcher });
  } catch {
    throw new Error("Promotion was requested, but live verification failed. Stop and inspect production; do not automatically retry or roll back.");
  }
  log("JU promotion and live read-only checks passed. No NXT writes or email sends were tested.");
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRelease(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
