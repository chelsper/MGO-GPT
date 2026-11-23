import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
it("offers phone-number links on the caller's cards without saving an outcome", async () => {
  render(<Page />);
  const phone = await screen.findByRole("link", { name: "Call 555-0100" });
  expect(phone).toHaveAttribute("href", "tel:5550100");
  expect(phone).toHaveTextContent("555-0100");
  expect(screen.getByRole("link", { name: "Call 555-0101" })).toHaveAttribute("href", "tel:5550101");
  phone.addEventListener("click", event => event.preventDefault());
  fireEvent.click(phone);
  expect(screen.queryByRole("form", { name: /Record outcome/ })).not.toBeInTheDocument();
  expect(fetch.mock.calls).toHaveLength(2);
  expect(fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
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
  expect(screen.queryByRole("link", { name: /^Call / })).not.toBeInTheDocument();
  expect(fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
  expect(fetch.mock.calls.some(([url]) => url.includes("/preview?workspaceId=8"))).toBe(true);
  expect(fetch.mock.calls.some(([url]) => url.endsWith("/outreach"))).toBe(false);
});
function useReadOnlyWorkspace() {
  summary.canRecord = false; summary.workspace.readOnly = true;
  Object.assign(outreach, { workspace: summary.workspace, canManage: false, canManageAccounts: false, canRecord: false, nxtReadiness: null });
}
it("opens caller instructions by default in both own-login and colleague preview", async () => {
  const view = render(<Page />);
  await screen.findByRole("button", { name: "Open call details" });
  expect(screen.getByText(outreach.settings.instructions)).toBeVisible();
  expect(screen.getByText(/Call instructions \/ Due/).closest("details")).toHaveAttribute("open");
  view.unmount(); useReadOnlyWorkspace(); render(<Page />);
  await screen.findByRole("button", { name: "Preview call details" });
  expect(screen.getByText(outreach.settings.instructions)).toBeVisible();
});
it("previews the actual call context and disabled outcome fields without calls, writes, or unload warnings", async () => {
  useReadOnlyWorkspace();
  render(<Page />);
  fireEvent.click(await screen.findByRole("button", { name: "Preview call details" }));
  const preview = screen.getByRole("region", { name: "Read-only call preview" });
  expect(within(preview).getByRole("heading", { name: "Fictional Avery" })).toHaveFocus();
  expect(within(preview).getByText(/Review contact restrictions: Do not call/)).toBeVisible();
  expect(within(preview).getByText(outreach.settings.instructions)).toBeVisible();
  expect(within(preview).getByText("555-0100")).toBeVisible();
  expect(within(preview).getByText("555-0101")).toBeVisible();
  const form = within(preview).getByRole("form", { name: "Preview outcome for Fictional Avery" });
  for (const input of form.querySelectorAll("input,select,textarea,button")) expect(input).toBeDisabled();
  expect(within(preview).queryByRole("link", { name: /^Call / })).not.toBeInTheDocument();
  expect(within(preview).queryByRole("button", { name: /^Copy / })).not.toBeInTheDocument();
  fireEvent.click(within(form).getByRole("button", { name: "Save, submit & next" }));
  fireEvent.click(within(form).getByRole("button", { name: "Save & next (local only)" }));
  fireEvent.submit(form);
  expect(window.dispatchEvent(new Event("beforeunload", { cancelable: true }))).toBe(true);
  expect(fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
  expect(fetch.mock.calls).toHaveLength(2);
});
it("returns to the originating preview button with the same search and status and no draft warning", async () => {
  useReadOnlyWorkspace();
  const confirm = vi.spyOn(window, "confirm");
  render(<Page />);
  await screen.findByRole("button", { name: "Preview call details" });
  fireEvent.change(screen.getByRole("combobox", { name: "Status" }), { target: { value: "all" } });
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Avery" } });
  fireEvent.click(screen.getByRole("button", { name: "Preview call details" }));
  fireEvent.click(screen.getAllByRole("button", { name: "Back to assignments" })[0]);
  expect(screen.getByRole("button", { name: "Preview call details" })).toHaveFocus();
  expect(screen.getByRole("combobox", { name: "Status" })).toHaveValue("all");
  expect(screen.getByRole("searchbox")).toHaveValue("Avery");
  expect(screen.queryByRole("region", { name: "Read-only call preview" })).not.toBeInTheDocument();
  expect(confirm).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe("/tasks");
});
it("keeps pending NXT history read-only inside and outside the call preview", async () => {
  useReadOnlyWorkspace();
  outreach.tasks[0].events = [{ id: "saved-draft", actorId: 8, actorName: "Fictional Caller", state: "draft",
    result: { outcome: "reached", actionDate: "2026-11-20", notes: "Saved conversation, not a new action.", nextDate: "2026-12-01" } }];
  render(<Page />);
  fireEvent.click(await screen.findByRole("button", { name: "Preview call details" }));
  const preview = screen.getByRole("region", { name: "Read-only call preview" });
  fireEvent.click(within(preview).getByText("Latest recorded outcome"));
  expect(within(preview).getByText("Saved conversation, not a new action.")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Submit this saved outcome to NXT" })).not.toBeInTheDocument();
  expect(fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
});
it("hides an open preview if a saved-status reload loses access", async () => {
  useReadOnlyWorkspace(); render(<Page />);
  fireEvent.click(await screen.findByRole("button", { name: "Preview call details" }));
  fetch.mockResolvedValueOnce(Response.json({ error: "Project access changed" }, { status: 403 }));
  fireEvent.click(screen.getByRole("button", { name: "Reload saved outreach" }));
  await screen.findByRole("alert");
  expect(screen.queryByRole("region", { name: "Read-only call preview" })).not.toBeInTheDocument();
  expect(screen.queryByRole("form", { name: /Preview outcome/ })).not.toBeInTheDocument();
  expect(fetch.mock.calls.every(([, options]) => !options.method)).toBe(true);
});
it("does not retain a removed assignment in an open preview", async () => {
  useReadOnlyWorkspace(); render(<Page />);
  fireEvent.click(await screen.findByRole("button", { name: "Preview call details" }));
  outreach.tasks = [];
  fireEvent.click(screen.getByRole("button", { name: "Reload saved outreach" }));
  await waitFor(() => expect(screen.getByRole("heading", { name: "This assignment is no longer available in the saved preview." })).toHaveFocus());
  expect(screen.queryByRole("region", { name: "Call details (read-only)" })).not.toBeInTheDocument();
  expect(screen.queryByRole("form", { name: /Preview outcome/ })).not.toBeInTheDocument();
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
