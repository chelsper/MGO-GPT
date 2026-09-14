import { beforeEach, describe, expect, it, vi } from "vitest";
import sql from "./sql";
import loadProposalSummary from "./portfolioProposalSummary";

vi.mock("./sql", () => ({ default: vi.fn() }));
beforeEach(() => { sql.mockReset().mockResolvedValue([]); });

describe("portfolio proposal summary query", () => {
  it("uses real opportunity columns and keeps workspace and constituent boundaries parameterized", async () => {
    const rows = [{ opportunity_title: "Scholarship", expected_close_fy: "FY27" }];
    sql.mockResolvedValue(rows);
    expect(await loadProposalSummary({ workspaceUserId: 9, constituentId: "123", currentFYNumber: 27 })).toBe(rows);
    const [strings, ...values] = sql.mock.calls[0];
    const statement = strings.join("?");
    expect(values).toEqual([9, "123", 27]);
    const columns = [...new Set([...statement.matchAll(/\bpo\.(\w+)/g)].map((match) => match[1]))];
    expect(columns.sort()).toEqual(["current_stage", "estimated_amount", "expected_date", "opportunity_status", "prospect_id", "title"]);
    expect(statement).toContain("po.title AS opportunity_title");
    expect(statement).toContain("p.ask_type");
    expect(statement).toContain("p.user_id = ?");
    expect(statement).toContain("COALESCE(p.blackbaud_constituent_id, c.blackbaud_constituent_id) = ?");
  });
  it("uses the opportunity expected date for its July-to-June FY, with only a missing-date fallback to the prospect", async () => {
    await loadProposalSummary({ workspaceUserId: 9, constituentId: "123", currentFYNumber: 27 });
    const statement = sql.mock.calls[0][0].join("?");
    expect(statement).toContain("CASE WHEN po.expected_date IS NOT NULL");
    expect(statement).toContain("EXTRACT(YEAR FROM po.expected_date + INTERVAL '6 months')");
    expect(statement).toContain("ELSE p.expected_close_fy");
    expect(statement).toContain("COALESCE(po.opportunity_status, 'Active') = 'Active'");
    expect(statement).toContain("('solicitation', 'cultivation', 'solicitation - verbal')");
    expect(statement).toContain("LIMIT 3");
  });
  it("identifies database errors as a local proposal-summary failure", async () => {
    const error = new Error("Database unavailable");
    sql.mockRejectedValue(error);
    await expect(loadProposalSummary({ workspaceUserId: 9, constituentId: "123", currentFYNumber: 27 }))
      .rejects.toMatchObject({ message: "Database unavailable", stage: "proposal_summary" });
  });
});
