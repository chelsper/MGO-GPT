import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { workflowGroups } from "../test/workflows/manifest.mjs";
import { validateWorkflowReport } from "./workflow-gate.mjs";

export const receiptPath = "build/client/.well-known/ju-release-checks.json";
const ignored = new Set(["node_modules", ".git", ".vercel", ".vitest", ".react-router", "build", ".DS_Store"]);

// Hash the same source before and after testing/building; generated files and
// local credentials must neither invalidate the run nor enter its public receipt.
export function sourceFingerprint(root) {
  const hash = createHash("sha256");
  function walk(relative = "") {
    for (const entry of readdirSync(path.join(root, relative), { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name, "en"))) {
      if (ignored.has(entry.name) || entry.name.startsWith(".env")) continue;
      const file = path.join(relative, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Release source cannot contain symlinks: ${file}`);
      if (entry.isDirectory()) walk(file);
      else if (entry.isFile()) {
        const contents = readFileSync(path.join(root, file));
        hash.update(`${file.split(path.sep).join("/")}\0${contents.length}\0`);
        hash.update(contents);
      }
    }
  }
  walk();
  return hash.digest("hex");
}

export function runReleaseBuild({ root, env = process.env, run = spawnSync, now = () => new Date() }) {
  const receiptFile = path.join(root, receiptPath);
  const reportFile = path.join(root, ".vitest/release/report.json");
  const workflowFile = path.join(root, ".vitest/workflows/report.json");
  const lockFile = path.join(root, ".vitest/release/build.lock");
  mkdirSync(path.dirname(reportFile), { recursive: true });
  let lock;
  try { lock = openSync(lockFile, "wx"); }
  catch { throw new Error("Release build lock exists. Check for a running build before removing a stale .vitest/release/build.lock."); }
  const report = { schemaVersion: 1, status: "running", startedAt: now().toISOString(), steps: [] };
  const save = () => writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
  try {
    for (const file of [receiptFile, reportFile, workflowFile]) rmSync(file, { force: true });
    rmSync(path.join(root, "build"), { recursive: true, force: true });
    const fingerprint = sourceFingerprint(root);
    const steps = [
      ["workflows", ["scripts/test-workflows.mjs"]],
      ["route-types", ["node_modules/@react-router/dev/bin.js", "typegen"]],
      ["typecheck", ["node_modules/typescript/bin/tsc", "--noEmit"]],
      ["production-build", ["node_modules/@react-router/dev/bin.js", "build"]],
    ];
    let workflow;
    for (const [name, args] of steps) {
      report.steps.push({ name, status: "running" }); save();
      console.log(`Release gate: ${name}`);
      const result = run(process.execPath, args, { cwd: root,
        env: { ...env, BROWSERSLIST_IGNORE_OLD_DATA: "1" }, stdio: "inherit", timeout: 15 * 60 * 1000 });
      if (result.error || result.status !== 0 || result.signal) throw new Error(`Release gate failed: ${name}.`);
      if (name === "workflows") {
        workflow = JSON.parse(readFileSync(workflowFile, "utf8"));
        validateWorkflowReport(workflow, workflowGroups, root);
      }
      report.steps.at(-1).status = "passed"; save();
    }
    if (sourceFingerprint(root) !== fingerprint) throw new Error("Release source changed during checks; run a fresh build.");
    if (!existsSync(path.join(root, "build/client/assets")) || !existsSync(path.join(root, "build/server"))) {
      throw new Error("Production build outputs are missing.");
    }
    const commit = env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA || null;
    if (commit && !/^[a-f0-9]{40}$/.test(commit)) throw new Error("Invalid release commit SHA.");
    const receipt = { schemaVersion: 1, status: "passed", commitSha: commit, sourceSha256: fingerprint,
      completedAt: now().toISOString(), workflows: { tests: workflow.numTotalTests,
        files: workflow.testResults.length, skipped: 0 }, typecheck: "passed", build: "passed" };
    mkdirSync(path.dirname(receiptFile), { recursive: true });
    writeFileSync(receiptFile, `${JSON.stringify(receipt)}\n`);
    Object.assign(report, receipt); save();
    console.log("Release gate passed. This does not authorize production promotion.");
    return receipt;
  } catch (error) {
    rmSync(receiptFile, { force: true });
    report.status = "failed";
    if (report.steps.at(-1)?.status === "running") report.steps.at(-1).status = "failed";
    save();
    throw error;
  } finally {
    closeSync(lock);
    rmSync(lockFile, { force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 2) throw new Error("The release build does not accept bypass or partial-run arguments.");
    runReleaseBuild({ root: fileURLToPath(new URL("..", import.meta.url)) });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
