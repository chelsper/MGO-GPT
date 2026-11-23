import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
const mocks = vi.hoisted(() => ({ list: vi.fn(), reload: vi.fn(), refresh: vi.fn() }));
vi.mock("@/app/reports/lists/useConstituentList", () => ({ default: mocks.list }));
vi.mock("@/app/reports/SharedReportHeader", () => ({ default: ({ title, action, accessibleReports }) => <header>
  <h1>{title}</h1>{action}{!accessibleReports && <nav aria-label="Reports">Project Prospecting</nav>}
</header> }));
import Page from "@/app/project-outreach/[listKey]/page";
import { report, snapshot, saved, result, ids } from "../../test/fixtures/projectOutreach";
let state, writes, submitUncertain;
beforeEach(() => {
  vi.clearAllMocks();
  state = structuredClone(saved); writes = []; submitUncertain = false;
  window.history.replaceState({}, "", `/project-outreach/${report.key}?from=tasks`);
  mocks.list.mockReturnValue({ data: { report: { ...report, canConfigure: true }, snapshot }, loading: false, reload: mocks.reload, refresh: mocks.refresh });
  vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
    if (url !== `/api/reports/lists/${report.key}/outreach`) throw Error("Unexpected endpoint");
    if (!options.method) return Response.json(state);
    const body = JSON.parse(options.body); writes.push(body);
    if (body.operation === "record") {
      state.tasks[0].stage = body.result.stage;
      state.tasks[0].version++;
      state.tasks[0].events.unshift({ id: body.result.eventId, actorId: 8, actorName: "Fictional Caller", result: body.result, state: "draft" });
      return Response.json({ id: body.result.eventId });
    }
    if (body.operation === "submit" && submitUncertain) {
      state.tasks[0].events[0].state = "review";
      return Response.json({ state: "review", message: "Fictional provider uncertainty." }, {status:202});
    }
    throw Error("No provider writes in caller preview tests");
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const mount = () => render(<Page params={{ listKey: report.key }} />);

it("opens Tasks into personal calls, not Reports or the prospecting list", async () => {
  mount();
  await screen.findByRole("button", { name: "Open call details" });
  expect(screen.getByRole("link", { name: "Back to My Tasks" })).toHaveAttribute("href", "/tasks");
  expect(screen.getByRole("heading", { name: report.title })).toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Reports" })).not.toBeInTheDocument();
  expect(screen.queryByRole("navigation", { name: "Project views" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Refresh list" })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "List & tags" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Queue")).not.toBeInTheDocument();
  expect(screen.getAllByRole("heading", { name: "Fictional Avery" })).toHaveLength(1);
  expect(screen.queryByRole("heading", { name: "Fictional Blake" })).not.toBeInTheDocument();
  expect(writes).toEqual([]); expect(mocks.refresh).not.toHaveBeenCalled();
});
it("keeps managers in their own assignments until they explicitly choose management", async () => {
  state.canManage = true;
  state.tasks.push({ ...state.tasks[0], id: "other-task", constituentId: "456", name: "Fictional Blake", assigneeId: 9 });
  mount();
  await screen.findByRole("button", { name: "Open call details" });
  expect(screen.queryByRole("heading", { name: "Fictional Blake" })).not.toBeInTheDocument();
  expect(screen.queryByText("Outreach setup", { exact: true })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Assign caller")).not.toBeInTheDocument();
  expect(screen.queryByText(/Team progress/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Manage this project's setup & assignments" })).toHaveAttribute("href", `/project-outreach/${report.key}?view=manage`);
  expect(writes).toEqual([]);
});
it("keeps the explicit manager route and its tools without the reports navigation", async () => {
  state.canManage = true;
  window.history.replaceState({}, "", `/project-outreach/${report.key}?view=manage`);
  mount();
  await screen.findByLabelText("Assign caller");
  expect(screen.getByText("Outreach setup", { exact: true })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "My assigned outreach" })).toHaveAttribute("href", `/project-outreach/${report.key}?from=tasks`);
  expect(screen.queryByRole("navigation", { name: "Reports" })).not.toBeInTheDocument();
  expect(writes).toEqual([]);
});
it("starts exactly one own call from Tasks and consumes only the start marker", async () => {
  window.history.replaceState({ key: "kept" }, "", `/project-outreach/${report.key}?from=tasks&start=calls&extra=kept#calls`);
  mount();
  await screen.findByRole("region", { name: "Current call details" });
  expect(window.location.search).toBe("?from=tasks&extra=kept");
  expect(window.location.hash).toBe("#calls");
  expect(window.history.state).toEqual({ key: "kept" });
  expect(writes).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Reload saved outreach" }));
  await screen.findByRole("button", { name: "Open call details" });
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(writes).toEqual([]);
});
it.each(["", "?start=calls", "?from=external&start=calls"])("does not auto-open a call for unrelated navigation %s", async query => {
  window.history.replaceState({}, "", `/project-outreach/${report.key}${query}`);
  mount(); await screen.findByRole("button", { name: "Open call details" });
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(writes).toEqual([]);
});
it("opens contact context before outcome entry and returns to the originating assignment on cancel", async () => {
  mount(); fireEvent.click(await screen.findByRole("button", { name: "Open call details" }));
  expect(screen.getByRole("region", { name: "Current call details" })).toHaveTextContent("Do not call");
  expect(screen.getByRole("heading", { name: "Fictional Avery" })).toHaveFocus();
  fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Fictional unsaved note" } });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(screen.getByLabelText("Notes")).toHaveValue("Fictional unsaved note");
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(screen.getByRole("button", { name: "Open call details" })).toHaveFocus();
  expect(writes).toEqual([]);
});
it("saves locally and keeps the unfinished NXT update reachable without another call", async () => {
  mount(); fireEvent.click(await screen.findByRole("button", { name: "Start my next call" }));
  fireEvent.click(screen.getByRole("radio", { name: "Reached", exact: true }));
  fireEvent.change(screen.getByLabelText("Next step"), { target: { value: "complete" } });
  fireEvent.change(screen.getByLabelText("Notes"), { target: { value: "Fictional completed conversation" } });
  fireEvent.click(screen.getByLabelText(/I reviewed contact/));
  fireEvent.click(screen.getByRole("button", { name: "Save & next (local only)" }));
  await screen.findByRole("heading", { name: "No more people ready in this session" });
  expect(writes.map(body => body.operation)).toEqual(["record"]);
  fireEvent.click(screen.getByRole("button", { name: "Back to my assignments" }));
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "nxt" } });
  expect(screen.getByRole("button", { name: "Submit this saved outcome to NXT" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Resume my calls" })).toBeDisabled();
});
it("opens only the caller's unfinished NXT work even after reassignment", async () => {
  state.tasks[0].assigneeId = 9;
  state.tasks[0].events = [{ id: ids.event, actorId: 8, result, state: "review" }];
  state.tasks.push({ ...state.tasks[0], id: "other", constituentId: "456", name: "Fictional Blake", events: [{ id: "other-event", actorId: 9, result, state: "draft" }] });
  window.history.replaceState({}, "", `/project-outreach/${report.key}?from=tasks&focus=nxt`);
  mount();
  expect(await screen.findByRole("button", { name: "Verify existing action only" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Open call details" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Fictional Blake" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Submit this saved outcome to NXT" })).not.toBeInTheDocument();
  expect(writes).toEqual([]);
});
it("does not expose old saved work while the list reload is failing", async () => {
  mocks.list.mockReturnValue({ data: { report, snapshot }, error: "Unavailable", errorStatus: 503, loading: false, reload: mocks.reload });
  mount(); await screen.findByRole("alert");
  expect(screen.queryByRole("region", { name: "Project outreach" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reload saved project" }));
  expect(mocks.reload).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
});
it("stops after uncertain NXT submission and keeps verification separate from new calls", async () => {
  submitUncertain = true;
  mount(); fireEvent.click(await screen.findByRole("button", { name: "Start my next call" }));
  fireEvent.click(screen.getByRole("radio", { name: "Reached", exact: true }));
  fireEvent.change(screen.getByLabelText("Next step"), {target:{value:"complete"}});
  fireEvent.change(screen.getByLabelText("Notes"), {target:{value:"Fictional completed conversation"}});
  fireEvent.click(screen.getByLabelText(/I reviewed contact/));
  fireEvent.click(screen.getByRole("button", { name:"Save, submit & next" }));
  await screen.findByRole("alert");
  expect(writes.map(body=>body.operation)).toEqual(["record","submit"]);
  fireEvent.click(screen.getByRole("button", { name:"Reload saved status" }));
  await screen.findByRole("button", { name:"Verify existing action only" });
  expect(screen.queryByRole("button", { name:"Submit this saved outcome to NXT" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name:"Continue to next person" })).toBeDisabled();
  expect(writes.map(body=>body.operation)).toEqual(["record","submit"]);
});
it("keeps connection help personal even for a manager using the caller view", async () => {
  state.canManage = true; state.canManageAccounts = true;
  state.nxtReadiness = {state:"saved",checkedAt:"2026-11-23T15:00:00Z",callers:[
    {id:8,name:"Fictional Caller",connection:"not_connected",fundraiserMapped:false},
    {id:9,name:"Another staff connection",connection:"reconnect",fundraiserMapped:false},
  ]};
  mount(); await screen.findByRole("button",{name:"Open call details"});
  fireEvent.click(screen.getByText("Help & saved connection status"));
  fireEvent.click(screen.getByText(/Setup & readiness/));
  expect(screen.getByRole("heading",{name:"Your NXT setup"})).toBeInTheDocument();
  expect(screen.queryByText("Another staff connection")).not.toBeInTheDocument();
  expect(screen.queryByRole("link",{name:"Admin account setup"})).not.toBeInTheDocument();
  expect(screen.getByRole("button",{name:"Start my next call"})).toBeEnabled();
});
it("does not render caller work before access is resolved", () => {
  mocks.list.mockReturnValue({data:{report,snapshot},loading:true,reload:mocks.reload});
  mount();
  expect(screen.queryByRole("region",{name:"Project outreach"})).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
