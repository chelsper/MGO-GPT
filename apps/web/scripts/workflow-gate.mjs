import path from "node:path";

// No inherited database URLs, provider keys, auth secrets or NODE_OPTIONS.
export function workflowEnvironment(source = process.env) {
  const env = Object.fromEntries(["PATH", "HOME", "TMPDIR", "TEMP", "TMP", "SystemRoot", "COMSPEC"]
    .filter(key => typeof source[key] === "string").map(key => [key, source[key]]));
  return { ...env, NODE_ENV: "test", TZ: "UTC", CI: "1", WORKFLOW_OFFLINE: "1", BROWSERSLIST_IGNORE_OLD_DATA: "1" };
}

export function validateWorkflowReport(report, groups, root) {
  if (!report || report.success !== true || report.numFailedTests !== 0 || report.numFailedTestSuites !== 0 ||
      report.numRuntimeErrorTestSuites > 0 || report.numPendingTests > 0 || report.numTodoTests > 0 ||
      report.wasInterrupted || !(report.numTotalTests > 0)) {
    throw new Error("Workflow gate failed: tests failed, were skipped, were interrupted, or did not run.");
  }
  const results = new Map((report.testResults || []).map(result => [path.resolve(result.name), result]));
  return Object.entries(groups).map(([name, files]) => {
    let tests = 0;
    for (const file of files) {
      const result = results.get(path.resolve(root, file));
      if (!result || result.status !== "passed" || !result.assertionResults?.length ||
          result.assertionResults.some(test => test.status !== "passed")) {
        throw new Error(`Workflow gate failed: required suite incomplete: ${file}`);
      }
      tests += result.assertionResults.length;
    }
    return { name, files: files.length, tests };
  });
}
