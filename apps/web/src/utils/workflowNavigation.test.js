import { describe, expect, it } from "vitest";
import { buildImportBatchHref, getImportReturnPath, getReturnDestination, getSafeInternalReturnPath } from "./workflowNavigation";

describe("workflow return destinations", () => {
  it.each([
    ["/", "Back to Home"],
    ["/reports", "Back to Reports"],
    ["/my-top-prospects?tab=portfolio&search=Test%20Donor#list", "Back to My Portfolio"],
    ["/my-top-prospects?statusFilter=Active&fyFilter=FY27", "Back to Top Prospects"],
    ["/follow-ups?tab=next-steps&status=Open", "Back to Follow-ups & Discussion"],
    ["/reports/dashboards/campaign-progress", "Back to Report"],
    ["/constituency-import?queueRun=42&queueRow=9", "Back to Import Batch #42"],
  ])("names and preserves %s", (href, label) => {
    expect(getReturnDestination(href)).toEqual({ href, label });
  });
  it.each([null, "", "https://outside.test/reports", "//outside.test", "/\\outside.test", "/%5Coutside.test",
    "/\noutside.test", "/reports%0a", "/api/users/profile?bootstrapPortfolio=1", "/account/logout",
    "/action-opportunity-update", "javascript:alert(1)", "/reports/../../api/delete", "/not-a-page"])("rejects unsafe or unknown destination %s", value => {
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
