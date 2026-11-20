import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ configuration: vi.fn() }));
vi.mock("@/app/reports/useReportConfigurations", () => ({
  useReportConfigurations: mocks.configuration,
}));
vi.mock("@/app/reports/SharedReportHeader", () => ({
  default: ({ title, action }) => (
    <header>
      <h1>{title}</h1>
      {action}
    </header>
  ),
}));
import Page from "./page";
import { report } from "../../../test/fixtures/projectOutreach";
beforeEach(() => {
  mocks.configuration.mockReturnValue({
    configurations: [
      { ...report, canView: true },
      { ...report, key: "hidden", title: "Hidden", canView: false },
    ],
    canManage: false,
    isPending: false,
  });
});
afterEach(cleanup);
describe("project outreach entry", () => {
  it("links only explicitly accessible projects without issuing query refreshes", () => {
    render(<Page />);
    expect(screen.getByRole("link", { name: "Open outreach" })).toHaveAttribute(
      "href",
      `/project-outreach/${report.key}`,
    );
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Manage projects/ }),
    ).not.toBeInTheDocument();
  });
  it("offers managers the existing project configuration path", () => {
    mocks.configuration.mockReturnValue({
      configurations: [],
      canManage: true,
      isPending: false,
    });
    render(<Page />);
    expect(
      screen.getByRole("link", { name: "Manage projects & access" }),
    ).toHaveAttribute("href", "/reports/project-prospecting");
    expect(screen.getByText(/No shared projects/)).toBeInTheDocument();
  });
});
