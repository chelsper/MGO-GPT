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
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options = {}) => {
      if (url !== "/api/project-outreach/priorities" || options.method)
        throw new Error("Unexpected query refresh or write");
      return Response.json({
        canRecord: false,
        today: "2026-11-22",
        checkedAt: "2026-11-22T16:00:00Z",
        projects: [],
      });
    }),
  );
  mocks.configuration.mockReturnValue({
    configurations: [
      { ...report, canView: true },
      { ...report, key: "hidden", title: "Hidden", canView: false },
    ],
    canManage: false,
    isPending: false,
  });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
describe("project outreach entry", () => {
  it("links only explicitly accessible projects without issuing query refreshes", async () => {
    render(<Page />);
    expect(
      screen.getByRole("link", { name: `Open outreach for ${report.title}` }),
    ).toHaveAttribute("href", `/project-outreach/${report.key}`);
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /Manage projects/ }),
    ).not.toBeInTheDocument();
    await screen.findByText(/Your account has viewing access/);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/project-outreach/priorities",
      expect.objectContaining({ cache: "no-store" }),
    );
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
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each([
    { isPending: true, error: null },
    { isPending: false, error: new Error("Access unavailable") },
  ])("does not load priorities before project access is known", (state) => {
    mocks.configuration.mockReturnValue({
      configurations: [{ ...report, canView: true }],
      ...state,
    });
    render(<Page />);
    expect(
      screen.queryByRole("region", { name: "My outreach priorities" }),
    ).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
