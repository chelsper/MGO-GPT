import { describe, expect, it } from "vitest";
import { validateWorkflowReport, workflowEnvironment } from "../../scripts/workflow-gate.mjs";

const root = "/fictional/app";
const groups = { Workflow: ["test/journey.test.js"] };
const report = () => ({ success: true, numTotalTests: 1, numFailedTests: 0, numFailedTestSuites: 0,
  numPendingTests: 0, numTodoTests: 0, testResults: [{ name: `${root}/test/journey.test.js`, status: "passed",
    assertionResults: [{ status: "passed" }] }] });
describe("workflow release gate", () => {
  it("passes a fully completed required suite", () => {
    expect(validateWorkflowReport(report(), groups, root)).toEqual([{ name: "Workflow", files: 1, tests: 1 }]);
  });
  it.each([{ success: false }, { numFailedTests: 1 }, { numFailedTestSuites: 1 }, { numPendingTests: 1 },
    { numTodoTests: 1 }, { numRuntimeErrorTestSuites: 1 }, { wasInterrupted: true }, { numTotalTests: 0 },
    { testResults: [] }])("rejects a partial or failed report: %j", override => {
    expect(() => validateWorkflowReport({ ...report(), ...override }, groups, root)).toThrow();
  });
  it.each(["pending", "todo", "skipped", "failed"])("rejects a %s assertion even if aggregate status says success", status => {
    const result = report(); result.testResults[0].assertionResults[0].status = status;
    expect(() => validateWorkflowReport(result, groups, root)).toThrow(/incomplete/);
  });
  it("rejects a renamed or empty required suite", () => {
    const result = report(); result.testResults[0].assertionResults = [];
    expect(() => validateWorkflowReport(result, groups, root)).toThrow(/incomplete/);
    expect(() => validateWorkflowReport(report(), { Workflow: ["new.test.js"] }, root)).toThrow(/incomplete/);
  });
  it("does not inherit production credentials, provider endpoints or injected Node options", () => {
    const env = workflowEnvironment({ PATH: "/bin", HOME: "/fictional/home", DATABASE_URL: "private",
      AUTH_SECRET: "private", BLACKBAUD_CLIENT_SECRET: "private", VERCEL_TOKEN: "private", RESEND_API_KEY: "private",
      SOCIETY_PDF_CONVERTER_URL: "https://private.invalid", NODE_OPTIONS: "--import=unsafe.js", NODE_ENV: "production" });
    expect(env).toEqual({ PATH: "/bin", HOME: "/fictional/home", NODE_ENV: "test", TZ: "UTC", CI: "1",
      WORKFLOW_OFFLINE: "1", BROWSERSLIST_IGNORE_OLD_DATA: "1" });
  });
});
