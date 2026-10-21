import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { workflowFiles, workflowGroups } from "../test/workflows/manifest.mjs";
import { validateWorkflowReport, workflowEnvironment } from "./workflow-gate.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const output = path.join(root, ".vitest/workflows/report.json");
try {
  if (new Set(workflowFiles).size !== workflowFiles.length) throw new Error("Duplicate workflow suite in manifest.");
  for (const file of workflowFiles) {
    if (!existsSync(path.join(root, file))) throw new Error(`Missing required workflow suite: ${file}`);
  }
  mkdirSync(path.dirname(output), { recursive: true });
  rmSync(output, { force: true });
  console.log("Running offline role/workflow checks. Live credentials and network access are disabled.");
  const child = spawnSync(process.execPath, [path.join(root, "node_modules/vitest/vitest.mjs"), "run",
    "--config", "vitest.workflows.config.ts", "--reporter=default", "--reporter=json", `--outputFile.json=${output}`],
  { cwd: root, env: workflowEnvironment(), stdio: "inherit", timeout: 15 * 60 * 1000 });
  if (child.error) throw child.error;
  if (child.status !== 0) throw new Error(`Workflow tests did not pass (exit ${child.status ?? child.signal}).`);
  const report = JSON.parse(readFileSync(output, "utf8"));
  for (const group of validateWorkflowReport(report, workflowGroups, root)) {
    console.log(`PASS ${group.name}: ${group.tests} tests across ${group.files} files`);
  }
  console.log(`Workflow gate passed: ${report.numTotalTests} tests, none skipped. Report: ${output}`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
