import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import SharedReportHeader from "./SharedReportHeader";
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("shows the requested report order even when the API returns a different order", () => {
  render(
    <SharedReportHeader
      title="Reports"
      activeReportKey="opportunity-pipeline"
      accessibleReports={[
        { key: "future-made-phase-ii" },
        { key: "alumni-family-engagement" },
        { key: "opportunity-pipeline", title: "Opportunity Pipeline" },
        { key: "executive-team-standings", title: "Team Standings" },
        { key: "portfolio-fy-giving", title: "My FY27 Portfolio Giving" },
      ]}
    />,
  );
  expect(
    within(screen.getByRole("navigation", { name: "Reports" }))
      .getAllByRole("link")
      .map((link) => link.textContent),
  ).toEqual([
    "My FY27 Portfolio Giving",
    "Team Standings",
    "Opportunity Pipeline",
    "My Dashboards",
    "Lists",
  ]);
  expect(
    screen.getByRole("link", { name: "Opportunity Pipeline" }),
  ).toHaveAttribute("aria-current", "page");
});

it("groups legacy and configured lists under one selected Lists destination", () => {
  render(
    <SharedReportHeader
      title="Legacy list"
      activeReportKey="future-made-phase-ii"
      accessibleReports={[
        { key: "future-made-phase-ii", title: "Future. Made. Phase II" },
        {
          key: "list-demo",
          title: "Example list",
          configurationSchema: "constituent-list-v1",
        },
      ]}
    />,
  );
  expect(screen.getAllByRole("link", { name: "Lists" })).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Lists" })).toHaveAttribute(
    "href",
    "/reports/lists",
  );
  expect(screen.getByRole("link", { name: "Lists" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(
    screen.queryByRole("link", { name: "Future. Made. Phase II" }),
  ).not.toBeInTheDocument();
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
  render(
    <SharedReportHeader
      title="My Reports"
      accessibleReports={[]}
      backHref="/"
      backLabel="Return to home"
    />,
  );
  expect(screen.getByRole("link", { name: "Return to home" })).toHaveAttribute(
    "href",
    "/",
  );
});

it("keeps long report names within the navigation and preserves the selected destination", () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  render(
    <SharedReportHeader
      title="A long presentation report title"
      activeReportKey="portfolio-fy-giving"
      accessibleReports={[
        {
          key: "portfolio-fy-giving",
          title: "A very long configured report name",
        },
      ]}
    />,
  );
  const report = screen.getByRole("link", {
    name: "A very long configured report name",
  });
  expect(report).toHaveAttribute("href", "/reports");
  expect(report).toHaveAttribute("aria-current", "page");
  expect(report).toHaveStyle({
    maxWidth: "100%",
    minHeight: "44px",
    overflowWrap: "anywhere",
  });
  expect(fetch).not.toHaveBeenCalled();
});

it("can compact report navigation without removing authorized dashboard destinations or actions", () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  render(<MemoryRouter><SharedReportHeader compact title="Future. Made. Campaign"
    activeReportKey="future-made-campaign" reportSection="dashboards"
    action={<button>Manage dashboard</button>}
    accessibleReports={[
      { key: "future-made-campaign", title: "Future. Made. Campaign", canView: true },
      { key: "alumni-family-engagement", title: "Alumni & Family Engagement", canView: true },
      { key: "list-hidden", title: "Hidden dashboard", configurationSchema: "query-count-dashboard-v1", canView: false },
      { key: "portfolio-fy-giving", title: "My FY27 Portfolio Giving", canView: true },
    ]} /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "Future. Made. Campaign" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Manage dashboard" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Back to My Dashboards" })).toHaveAttribute("href", "/reports/dashboards");
  const disclosure = screen.getByText("Reports & dashboards").closest("details");
  expect(disclosure).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("Reports & dashboards"));
  expect(disclosure).toHaveAttribute("open");
  expect(screen.getByRole("navigation", { name: "Reports" })).toBeVisible();
  expect(screen.getByRole("link", { name: "My Dashboards" })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("combobox", { name: "Dashboard" })).toHaveValue("future-made-campaign");
  expect(screen.getAllByRole("option")).toHaveLength(2);
  expect(fetch).not.toHaveBeenCalled();
});
