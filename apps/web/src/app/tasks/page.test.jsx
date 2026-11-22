import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ configuration: vi.fn(), refetch: vi.fn() }));
vi.mock("@/app/reports/useReportConfigurations", () => ({ useReportConfigurations: mocks.configuration }));
import Page from "./page";
import { report } from "../../../test/fixtures/projectOutreach";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configuration.mockReturnValue({ configurations: [
    { ...report, canView: true },
    { ...report, key: "hidden", title: "Not shared", canView: false },
    { key: "ordinary-report", title: "Not a project", canView: true },
  ], canManage: false, isPending: false, error: null, refetch: mocks.refetch });
  vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
    if (url !== "/api/project-outreach/priorities" || options.method) throw new Error("Unexpected write or refresh");
    return Response.json({ canRecord: false, today: "2026-11-22", checkedAt: "2026-11-22T17:00:00Z", projects: [] });
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("provides a personal entry point using only accessible projects and the existing saved read", async () => {
  render(<Page />);
  expect(screen.getByRole("heading", { name: "My Tasks" })).toBeInTheDocument();
  expect(screen.getByText(/belong to your signed-in account/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/");
  expect(screen.getByRole("link", { name: "Follow-ups & Discussion" })).toHaveAttribute("href", "/follow-ups");
  expect(screen.getByRole("link", { name: "Browse Project Outreach" })).toHaveAttribute("href", "/project-outreach");
  expect(screen.getByRole("link", { name: `Open outreach for ${report.title}` })).toHaveAttribute("href", `/project-outreach/${report.key}?from=tasks`);
  expect(screen.queryByText("Not shared")).not.toBeInTheDocument();
  expect(screen.queryByText("Not a project")).not.toBeInTheDocument();
  await screen.findByText(/Your account has viewing access/);
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("keeps management separate and describes a valid empty project list", () => {
  mocks.configuration.mockReturnValue({ configurations: [], canManage: true, isPending: false });
  render(<Page />);
  expect(screen.getByRole("link", { name: "Manage Project Outreach" })).toHaveAttribute("href", "/project-outreach");
  expect(screen.getByRole("heading", { name: "No shared outreach projects yet" })).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it.each([{ isPending: true }, { isPending: false, error: new Error("Unavailable") }])("does not show cached workloads before access is resolved: %j", state => {
  mocks.configuration.mockReturnValue({ configurations: [{ ...report, canView: true }], refetch: mocks.refetch, ...state });
  render(<Page />);
  expect(screen.queryByRole("region", { name: "My outreach priorities" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "No shared outreach projects yet" })).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
  if (state.error) {
    expect(screen.getByRole("alert")).toHaveTextContent("does not mean you have no tasks");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  }
});
