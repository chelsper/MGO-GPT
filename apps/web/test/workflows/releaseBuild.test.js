// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { receiptPath, runReleaseBuild, sourceFingerprint } from "../../scripts/release-build.mjs";
import { workflowFiles } from "./manifest.mjs";

const sha = "a".repeat(40);
let root;
function write(file, value) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), value);
}
function report() {
  return { success: true, numTotalTests: workflowFiles.length, numFailedTests: 0, numFailedTestSuites: 0,
    numPendingTests: 0, numTodoTests: 0, testResults: workflowFiles.map(file => ({ name: path.join(root, file),
      status: "passed", assertionResults: [{ status: "passed" }] })) };
}
function child(_node, args) {
  if (args[0] === "scripts/test-workflows.mjs") write(".vitest/workflows/report.json", JSON.stringify(report()));
  if (args.at(-1) === "build") {
    mkdirSync(path.join(root, "build/client/assets"), { recursive: true });
    mkdirSync(path.join(root, "build/server"), { recursive: true });
  }
  return { status: 0 };
}
beforeEach(() => {
  root = mkdtempSync(path.join(os.tmpdir(), "ju-release-build-test-"));
  write("src/app.js", "fictional source");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
const build = run => runReleaseBuild({ root, env: { VERCEL_GIT_COMMIT_SHA: sha }, run });

describe("mandatory release build", () => {
  it("intentional enforcement proof: must block this validation-only PR", () => {
    expect("blocked").toBe("allowed");
  });
  it("checks workflows and types before building and publishes only the passing receipt", () => {
    const run = vi.fn(child);
    const receipt = build(run);
    expect(run.mock.calls.map(([, args]) => args)).toEqual([
      ["scripts/test-workflows.mjs"], ["node_modules/@react-router/dev/bin.js", "typegen"],
      ["node_modules/typescript/bin/tsc", "--noEmit"], ["node_modules/@react-router/dev/bin.js", "build"],
    ]);
    expect(receipt).toMatchObject({ status: "passed", commitSha: sha, typecheck: "passed", build: "passed" });
    expect(JSON.parse(readFileSync(path.join(root, receiptPath)))).toEqual(receipt);
    expect(receipt).not.toHaveProperty("steps");
  });
  it.each([0, 1, 2, 3])("stops at failed step %s, removes stale evidence, and releases its lock", index => {
    write(receiptPath, "stale passed receipt");
    write(".vitest/workflows/report.json", JSON.stringify(report()));
    let count = 0;
    const run = vi.fn((...args) => count++ === index ? { status: 1 } : child(...args));
    expect(() => build(run)).toThrow(/failed/);
    expect(run).toHaveBeenCalledTimes(index + 1);
    expect(existsSync(path.join(root, receiptPath))).toBe(false);
    expect(existsSync(path.join(root, ".vitest/release/build.lock"))).toBe(false);
    expect(JSON.parse(readFileSync(path.join(root, ".vitest/release/report.json"))).status).toBe("failed");
  });
  it.each([{ status: null, signal: "SIGTERM" }, { status: 0, error: new Error("timeout") }])("rejects interrupted children", result => {
    expect(() => build(() => result)).toThrow(/failed/);
    expect(existsSync(path.join(root, receiptPath))).toBe(false);
  });
  it("does not reuse a prior workflow report even when the child exits zero", () => {
    write(".vitest/workflows/report.json", JSON.stringify(report()));
    expect(() => build(() => ({ status: 0 }))).toThrow();
  });
  it.each(["pending", "skipped", "todo", "failed"])("blocks a %s required assertion", status => {
    expect(() => build(() => {
      const result = report(); result.testResults[0].assertionResults[0].status = status;
      write(".vitest/workflows/report.json", JSON.stringify(result));
      return { status: 0 };
    })).toThrow(/incomplete/);
  });
  it("detects source edits during a build", () => {
    expect(() => build((...args) => { const result = child(...args); write("src/app.js", "changed"); return result; }))
      .toThrow(/source changed/);
    expect(existsSync(path.join(root, receiptPath))).toBe(false);
  });
  it("requires fresh production outputs", () => {
    mkdirSync(path.join(root, "build/client/assets"), { recursive: true });
    mkdirSync(path.join(root, "build/server"), { recursive: true });
    expect(() => build((node, args) => args.at(-1) === "build" ? { status: 0 } : child(node, args)))
      .toThrow(/outputs are missing/);
  });
  it("allows local validation without falsely assigning it a release SHA", () => {
    expect(runReleaseBuild({ root, env: {}, run: child }).commitSha).toBeNull();
  });
  it("rejects malformed release identity", () => {
    expect(() => runReleaseBuild({ root, env: { VERCEL_GIT_COMMIT_SHA: "main" }, run: child })).toThrow(/commit SHA/);
  });
  it("rejects concurrent builds without deleting the other build's evidence or lock", () => {
    write(".vitest/release/build.lock", "running"); write(receiptPath, "another run");
    expect(() => build(child)).toThrow(/lock exists/);
    expect(readFileSync(path.join(root, receiptPath), "utf8")).toBe("another run");
    expect(readFileSync(path.join(root, ".vitest/release/build.lock"), "utf8")).toBe("running");
  });
  it("hashes source/configuration but ignores build products, dependencies and private env files", () => {
    const initial = sourceFingerprint(root);
    for (const file of ["build/out.js", ".vercel/output.json", ".vitest/report.json", ".react-router/types.js", "node_modules/example.js", ".env.local"]) write(file, "ignored");
    expect(sourceFingerprint(root)).toBe(initial);
    write("package-lock.json", "new dependency lock");
    expect(sourceFingerprint(root)).not.toBe(initial);
  });
  it("refuses source symlinks", () => {
    symlinkSync(path.join(root, "src/app.js"), path.join(root, "src/link.js"));
    expect(() => sourceFingerprint(root)).toThrow(/symlinks/);
  });
  it("stops on a real typechecker process failure, without reaching the build process", () => {
    write("scripts/test-workflows.mjs", `import {mkdirSync,writeFileSync} from 'node:fs';
      mkdirSync('.vitest/workflows',{recursive:true});
      writeFileSync('.vitest/workflows/report.json',${JSON.stringify(JSON.stringify(report()))});`);
    write("node_modules/@react-router/dev/bin.js", `const {writeFileSync}=require('node:fs');
      if (process.argv[2]==='build') writeFileSync('.vitest/build-was-called','yes');`);
    write("node_modules/typescript/bin/tsc", "process.exit(9);");
    expect(() => runReleaseBuild({ root, env: { VERCEL_GIT_COMMIT_SHA: sha } })).toThrow(/typecheck/);
    expect(existsSync(path.join(root, ".vitest/build-was-called"))).toBe(false);
    expect(existsSync(path.join(root, receiptPath))).toBe(false);
  });
  it("keeps the normal local and Vercel build paths wired to the mandatory gate", () => {
    const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url)));
    const vercel = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url)));
    expect(pkg.scripts.build).toBe("node ./scripts/release-build.mjs");
    expect(vercel.buildCommand).toBe("npm run build");
  });
});
