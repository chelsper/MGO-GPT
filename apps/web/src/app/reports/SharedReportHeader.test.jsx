import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SharedReportHeader from "./SharedReportHeader";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("groups legacy and configured lists under one selected Lists destination", () => {
  render(<SharedReportHeader title="Legacy list" activeReportKey="future-made-phase-ii" accessibleReports={[
    { key: "future-made-phase-ii", title: "Future. Made. Phase II" },
    { key: "list-demo", title: "Example list", configurationSchema: "constituent-list-v1" },
  ]} />);
  expect(screen.getAllByRole("link", { name: "Lists" })).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Lists" })).toHaveAttribute("href", "/reports/lists");
  expect(screen.getByRole("link", { name: "Lists" })).toHaveAttribute("aria-current", "page");
  expect(screen.queryByRole("link", { name: "Future. Made. Phase II" })).not.toBeInTheDocument();
});

it("shows the report destination as visible text without loading report data", () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  render(<SharedReportHeader title="Sample Report" accessibleReports={[]} />);
  const back = screen.getByRole("link", { name: "Back to reports" });
  expect(back).toHaveAttribute("href", "/reports");
  expect(back).toHaveTextContent("Back to reports");
  expect(fetch).not.toHaveBeenCalled();
});
it("keeps the Reports landing page return destination as Home", () => {
  render(<SharedReportHeader title="My Reports" accessibleReports={[]} backHref="/" backLabel="Return to home" />);
  expect(screen.getByRole("link", { name: "Return to home" })).toHaveAttribute("href", "/");
});

it("keeps long report names within the navigation and preserves the selected destination", () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  render(<SharedReportHeader title="A long presentation report title" activeReportKey="portfolio-fy-giving"
    accessibleReports={[{ key: "portfolio-fy-giving", title: "A very long configured report name" }]} />);
  const report = screen.getByRole("link", { name: "A very long configured report name" });
  expect(report).toHaveAttribute("href", "/reports");
  expect(report).toHaveAttribute("aria-current", "page");
  expect(report).toHaveStyle({ maxWidth: "100%", minHeight: "44px", overflowWrap: "anywhere" });
  expect(fetch).not.toHaveBeenCalled();
});
