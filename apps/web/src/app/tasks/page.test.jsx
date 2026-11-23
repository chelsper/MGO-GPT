import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ configuration: vi.fn(), list: vi.fn(), refetch: vi.fn() }));
vi.mock("@/app/reports/useReportConfigurations", () => ({ useReportConfigurations: mocks.configuration }));
vi.mock("@/app/reports/lists/useConstituentList", () => ({ default: mocks.list }));
import Page from "./page";
import { report, snapshot, saved } from "../../../test/fixtures/projectOutreach";
let summary, outreach;
beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/tasks");
  summary = { canRecord: true, workspace: { id: 8, name: "Fictional Caller", readOnly: false },
    today: "2026-11-23", checkedAt: "2026-11-23T17:00:00Z", projects: [
      { key: report.key, open: 1, overdue: 0, today: 0, upcoming: 1, drafts: 0, verification: 0 },
      { key: "list-prospecting", open: 0, overdue: 0, today: 0, upcoming: 0, drafts: 0, verification: 0 },
    ] };
  outreach = structuredClone(saved);
  mocks.configuration.mockReturnValue({ configurations: [
    { ...report, canView: true }, { ...report, key: "list-prospecting", title: "Project Prospecting", canView: true },
    { ...report, key: "hidden", title: "Not shared", canView: false },
  ], canManage: true, isPending: false, refetch: mocks.refetch });
  mocks.list.mockReturnValue({ data: { report, snapshot }, loading: false });
  vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
    if (options.method) throw new Error("Unexpected write or refresh");
    if (url === "/api/project-outreach/workspace") return Response.json(summary);
    if (url === `/api/reports/lists/${report.key}/outreach` || url === `/api/project-outreach/${report.key}/preview?workspaceId=8`)
      return Response.json(outreach);
    throw new Error("Unexpected request");
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("opens the current assigned list directly without a management step or prospecting projects", async () => {
  render(<Page />);
  await screen.findByRole("button", { name: "Open call details" });
  expect(screen.getByRole("heading", { name: "My Tasks" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: report.title })).toBeInTheDocument();
  expect(screen.queryByText("Team management")).not.toBeInTheDocument();
  expect(screen.queryByText("Project Prospecting", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Manage/ })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Assignment project")).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Back to My Tasks" })).not.toBeInTheDocument();
  expect(screen.getAllByRole("main")).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Follow-ups & Discussion" })).toHaveAttribute("href", "/follow-ups");
});
it("shows the selected MGO's list read-only when viewed by an authorized colleague", async () => {
  summary.canRecord = false; summary.workspace.readOnly = true;
  Object.assign(outreach, { workspace: summary.workspace, canManage: false, canManageAccounts: false, canRecord: false, nxtReadiness: null });
  render(<Page />);
  await screen.findByRole("heading", { name: "Fictional Avery" });
  expect(screen.getByRole("heading", { name: "Fictional Caller's Tasks" })).toBeInTheDocument();
  expect(screen.getByText(/Read-only workspace preview/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Start my next call|Open call details|Submit/ })).not.toBeInTheDocument();
  expect(screen.queryByText("Team management")).not.toBeInTheDocument();
  expect(fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
  expect(fetch.mock.calls.some(([url]) => url.includes("/preview?workspaceId=8"))).toBe(true);
  expect(fetch.mock.calls.some(([url]) => url.endsWith("/outreach"))).toBe(false);
});
it("keeps call cancellation within the current list without opening Reports", async () => {
  render(<Page />);
  fireEvent.click(await screen.findByRole("button", { name: "Open call details" }));
  expect(screen.getByRole("region", { name: "Current call details" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(screen.getByRole("button", { name: "Open call details" })).toHaveFocus();
  expect(window.location.pathname).toBe("/tasks");
  expect(fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
});
it("does not turn workspace errors into an empty assignment list", async () => {
  fetch.mockResolvedValue(Response.json({ error: "Workspace unavailable" }, { status: 403 }));
  render(<Page />);
  expect(await screen.findByRole("alert")).toHaveTextContent("does not mean you have no tasks");
  expect(screen.queryByText("No open call assignments")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reload My Tasks" }));
  expect(mocks.refetch).toHaveBeenCalledOnce();
});
it("fails closed if workspace identity or preview capabilities are inconsistent", async () => {
  summary.workspace.readOnly = true;
  render(<Page />);
  await screen.findByRole("alert");
  expect(screen.queryByRole("heading", { name: report.title })).not.toBeInTheDocument();
});
it("does not display another workspace's returned preview", async () => {
  summary.canRecord = false; summary.workspace.readOnly = true;
  Object.assign(outreach, { workspace: { ...summary.workspace, id: 9 }, canManage: false, canManageAccounts: false, canRecord: false });
  render(<Page />);
  await screen.findByRole("alert");
  expect(screen.queryByRole("heading", { name: "Fictional Avery" })).not.toBeInTheDocument();
});
it("describes genuine zero work and keeps completed source lists out of Tasks", async () => {
  summary.projects[0] = { ...summary.projects[1], key: report.key };
  render(<Page />);
  await screen.findByRole("heading", { name: "No open call assignments" });
  expect(screen.queryByRole("heading", { name: report.title })).not.toBeInTheDocument();
});
it("does not load personal details until shared-project access is resolved", async () => {
  mocks.configuration.mockReturnValue({ configurations: [{ ...report, canView: true }], isPending: true });
  render(<Page />);
  await screen.findByRole("status");
  expect(mocks.list).not.toHaveBeenCalled();
});
it("offers a project picker only when there are multiple assigned projects and confirms switching", async () => {
  const second = { ...report, key: "list-second", title: "Second assignment", canView: true };
  mocks.configuration.mockReturnValue({ configurations: [{ ...report, canView: true }, second], isPending: false });
  summary.projects.push({ ...summary.projects[0], key: second.key });
  render(<Page />);
  await screen.findByLabelText("Assignment project");
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const original = screen.getByLabelText("Assignment project").value;
  fireEvent.change(screen.getByLabelText("Assignment project"), { target: { value: original === second.key ? report.key : second.key } });
  expect(confirm).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Assignment project")).toHaveValue(original);
});
