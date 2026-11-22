import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import OutreachCallSummary from "./OutreachCallSummary";
import { outreachCallSummary } from "@/utils/outreachCallSummary";
import { saved, result } from "../../test/fixtures/projectOutreach";
afterEach(cleanup);
const makeSummary = () => outreachCallSummary({ ...saved, tasks: [{ ...saved.tasks[0], events: [
  { id: "1", actorId: 8, createdAt: "2026-11-20T15:00:00Z", state: "draft", result },
  { id: "2", actorId: 8, createdAt: "2026-11-19T15:00:00Z", state: "review", result },
] }] });
it("distinguishes saved results from NXT confirmation and offers read-only review", () => {
  const review = vi.fn();
  render(<OutreachCallSummary summary={makeSummary()} today={saved.today} onReview={review} />);
  expect(screen.getByText(/0 confirmed in NXT/)).toBeInTheDocument();
  expect(screen.getByText(/1 saved in app only/)).toBeInTheDocument();
  fireEvent.click(screen.getByText(/Review saved outcomes/));
  fireEvent.click(screen.getByRole("button", { name: "Review saved outcomes for Fictional Avery" }));
  expect(review).toHaveBeenCalledWith(saved.tasks[0].id, expect.any(HTMLElement));
  fireEvent.change(screen.getByLabelText("Show saved outcomes"), { target: { value: "unfinished" } });
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
  expect(screen.getByText("Awaiting verification")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /submit/i })).not.toBeInTheDocument();
});
it("disables review while a workflow is busy", () => {
  render(<OutreachCallSummary summary={makeSummary()} today={saved.today} onReview={vi.fn()} busy />);
  fireEvent.click(screen.getByText(/Review saved outcomes/));
  expect(screen.getByRole("button", { name: /Review saved outcomes for/ })).toBeDisabled();
  expect(screen.getByLabelText("Show saved outcomes")).toBeDisabled();
});
it("paginates long summaries and resets the page limit when switching views", () => {
  const summary = makeSummary();
  summary.today = Array.from({length:30}, (_, i) => ({ ...summary.today[0], event: { ...summary.today[0].event, id: String(i) } }));
  render(<OutreachCallSummary summary={summary} today={saved.today} onReview={vi.fn()} />);
  fireEvent.click(screen.getByText(/Review saved outcomes/));
  expect(screen.getAllByRole("listitem")).toHaveLength(25);
  fireEvent.click(screen.getByRole("button", { name: "Show more saved outcomes" }));
  expect(screen.getAllByRole("listitem")).toHaveLength(30);
  fireEvent.change(screen.getByLabelText("Show saved outcomes"), { target: { value: "unfinished" } });
  expect(screen.getAllByRole("listitem")).toHaveLength(2);
});
it("shows a non-error empty summary with no invented completion", () => {
  render(<OutreachCallSummary summary={outreachCallSummary(saved)} today={saved.today} onReview={vi.fn()} />);
  expect(within(screen.getByRole("region", { name: "Your call summary" })).getByText(/No outcomes recorded today/)).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
