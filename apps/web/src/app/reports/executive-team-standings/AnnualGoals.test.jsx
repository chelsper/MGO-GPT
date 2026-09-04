import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import AnnualGoals, { AnnualGoalsProvider } from "./AnnualGoals";
import { comparisonChange } from "./standingsPresentation";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("saves annual goals independently and shows attainment beyond 100 percent", async () => {
  const fetchMock = vi.fn(async (_url, options) => Response.json(options.method === "PUT" ? { goal: { user_id: 1, raised_goal: 500, actions_goal: 20 } } : { canEdit: true, goals: [] }));
  vi.stubGlobal("fetch", fetchMock);
  render(<AnnualGoalsProvider fiscalYear={{ label: "FY27", startsOn: "2026-07-01" }}><AnnualGoals entry={{ userId: 1, name: "Alex MGO", fundedThisFiscalYear: 1000, highValueActionsThisFiscalYear: 10 }} /></AnnualGoalsProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Edit annual goals" }));
  fireEvent.change(screen.getByLabelText("Fundraising goal (USD)"), { target: { value: "500" } });
  fireEvent.change(screen.getByLabelText("High-value action goal"), { target: { value: "20" } });
  fireEvent.click(screen.getByRole("button", { name: "Save goals" }));
  expect(await screen.findByText("200% of annual goal")).toBeInTheDocument();
  expect(screen.getByText("50% of annual goal")).toBeInTheDocument();
  expect(screen.getByLabelText("Raised annual goal attainment")).toHaveAttribute("value", "100");
  expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ fiscalYearStart: "2026", userId: 1, raisedGoal: "500", actionsGoal: "20" });
  expect(fetchMock.mock.calls.every(([url]) => url.includes("/goals"))).toBe(true);
});
it("keeps edits after a save failure", async () => {
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => Response.json(options.method === "PUT" ? { error: "Could not save goals" } : { canEdit: true, goals: [] }, { status: options.method === "PUT" ? 500 : 200 })));
  render(<AnnualGoalsProvider fiscalYear={{ label: "FY27", startsOn: "2026-07-01" }}><AnnualGoals entry={{ userId: 1, name: "Alex" }} /></AnnualGoalsProvider>);
  fireEvent.click(await screen.findByRole("button", { name: "Edit annual goals" }));
  fireEvent.change(screen.getByLabelText("Fundraising goal (USD)"), { target: { value: "500" } });
  fireEvent.click(screen.getByRole("button", { name: "Save goals" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Could not save goals"));
  expect(screen.getByLabelText("Fundraising goal (USD)")).toHaveValue(500);
});
it("handles missing and zero prior-year baselines without infinite percentages", () => {
  expect(comparisonChange(10, 0, "actions")).toBe("+10 (no prior baseline)");
  expect(comparisonChange(0, 0, "actions")).toBe("No change");
  expect(comparisonChange(0, 10, "actions")).toBe("-10 (-100%)");
  expect(comparisonChange(100, null, "raised")).toBe("Unavailable");
});
