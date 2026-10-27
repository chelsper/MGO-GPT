import { describe, expect, it } from "vitest";
import { buildImportBatchHref, getImportReturnPath, getReturnDestination, getSafeInternalReturnPath, resolveWorkflowReturnPath } from "./workflowNavigation";

describe("workflow return destinations", () => {
  it.each([
    ["/", "Back to Home"],
    ["/reports", "Back to Reports"],
    ["/stewardship", "Back to Stewardship"],
    ["/stewardship/gift-follow-ups", "Back to Gift Follow-ups"],
    ["/my-top-prospects?tab=portfolio&search=Test%20Donor#list", "Back to My Portfolio"],
    ["/my-top-prospects?statusFilter=Active&fyFilter=FY27", "Back to Top Prospects"],
    ["/follow-ups?tab=next-steps&status=Open", "Back to Follow-ups & Discussion"],
    ["/reports/dashboards/campaign-progress", "Back to Report"],
    ["/reports/dashboards", "Back to My Dashboards"],
    ["/reports/opportunity-pipeline?fy=2027&status=active#opportunities", "Back to Opportunity Pipeline"],
    ["/reports/opportunity-pipeline/lifecycle?fy=2027", "Back to Prospect Lifecycle"],
    ["/reports/lists", "Back to Lists"],
    ["/reports/lists/current-portfolio", "Back to Report"],
    ["/reports/personal-dashboards/42", "Back to Report"],
    ["/integration-health#health-connections", "Back to Integration Health"],
    ["/settings#blackbaud-connection", "Back to My Account & Connections"],
    ["/access-management#workspace-users", "Back to Security & Access"],
    ["/blackbaud-mapping", "Back to Blackbaud Mapping"],
    ["/knowledge-base", "Back to Knowledge Base"],
    ["/constituency-import?queueRun=42&queueRow=9", "Back to Import Batch #42"],
  ])("names and preserves %s", (href, label) => {
    expect(getReturnDestination(href)).toEqual({ href, label });
  });
  it.each([null, "", "https://outside.test/reports", "//outside.test", "/\\outside.test", "/%5Coutside.test",
    "/\noutside.test", "/reports%0a", "/api/users/profile?bootstrapPortfolio=1", "/account/logout",
    "/action-opportunity-update", "javascript:alert(1)", "/reports/../../api/delete", "/not-a-page",
    "/reports/personal-dashboards/new", "/reports/personal-dashboards/0",
    "/reports/lists/../../api/delete"])("rejects unsafe or unknown destination %s", value => {
    expect(getSafeInternalReturnPath(value)).toBe("");
    expect(getReturnDestination(value, "/reports")).toEqual({ href: "/reports", label: "Back to Reports" });
  });
  it("keeps only validated import batch/row identifiers and removes recursive return paths", () => {
    expect(buildImportBatchHref("42", "9")).toBe("/constituency-import?queueRun=42&queueRow=9");
    expect(buildImportBatchHref("bad", "9")).toBe("/constituency-import");
    expect(buildImportBatchHref("42", "-9")).toBe("/constituency-import?queueRun=42");
    expect(getImportReturnPath("/constituency-import?queueRun=42&queueRow=9&returnTo=%2Fsubmissions"))
      .toBe("/constituency-import?queueRun=42&queueRow=9");
    expect(getImportReturnPath("/submissions")).toBe("/import-history");
    expect(getImportReturnPath("//outside.test", "/constituency-import")).toBe("/constituency-import");
  });
});

describe("originating workflow resolution", () => {
  const origin = "https://app.test";
  const currentUrl = `${origin}/request-list`;
  it("prefers an explicit destination over the referrer and preserves filters and fragments", () => {
    const destination = "/my-top-prospects?tab=portfolio&category=Priority#portfolio-list";
    expect(resolveWorkflowReturnPath({
      currentUrl: `${currentUrl}?${new URLSearchParams({ returnTo: destination })}`,
      referrer: `${origin}/reports`,
    })).toBe(destination);
  });
  it("uses a same-origin, allowed referrer when no return parameter is provided", () => {
    expect(resolveWorkflowReturnPath({ currentUrl, referrer: `${origin}/reports/lists?view=saved#list` }))
      .toBe("/reports/lists?view=saved#list");
  });
  it.each(["https://outside.test/reports", "https://app.test.outside.test/reports", `${origin}/api/delete`,
    `${origin}/account/logout`, currentUrl, "not a URL", ""])("falls back safely for referrer %s", referrer => {
    expect(resolveWorkflowReturnPath({ currentUrl, referrer, fallback: "/submissions" })).toBe("/submissions");
  });
  it("uses a safe referrer rather than following an invalid return parameter", () => {
    expect(resolveWorkflowReturnPath({
      currentUrl: `${currentUrl}?returnTo=https%3A%2F%2Foutside.test`, referrer: `${origin}/reports`,
    })).toBe("/reports");
  });
  it("does not return an account page to itself even with different parameters", () => {
    expect(resolveWorkflowReturnPath({
      currentUrl: `${origin}/settings?returnTo=%2Fsettings%3Ftab%3Dconnection`,
      referrer: `${origin}/settings#blackbaud-connection`,
    })).toBe("/");
  });
  it("validates the fallback even if browser context is unavailable", () => {
    expect(resolveWorkflowReturnPath({ currentUrl: undefined, fallback: "//outside.test" })).toBe("/");
  });
});
