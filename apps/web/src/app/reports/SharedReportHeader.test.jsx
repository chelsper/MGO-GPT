import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import SharedReportHeader from "./SharedReportHeader";
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

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
