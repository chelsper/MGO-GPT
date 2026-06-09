import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");

const blockedPaths = [
  "apps/web/plugins/layouts.ts",
  "apps/web/src/__create/PolymorphicComponent.tsx",
];

function readGitStatus() {
  const output = execFileSync("git", ["status", "--porcelain"], {
    cwd: repoRoot,
    encoding: "utf8",
  });

  return output
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({
      status: line.slice(0, 2).trim(),
      path: line.slice(3).trim(),
    }));
}

function main() {
  const entries = readGitStatus();
  const blocked = entries.filter((entry) => blockedPaths.includes(entry.path));

  if (blocked.length === 0) {
    console.log("Release worktree check passed.");
    return;
  }

  console.error("Release worktree check failed. Known experimental files are dirty:");
  for (const entry of blocked) {
    console.error(`- ${entry.path} (${entry.status || "modified"})`);
  }
  process.exit(1);
}

main();
