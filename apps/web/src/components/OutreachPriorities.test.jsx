import { afterEach, beforeEach, it, expect, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
  waitFor,
} from "@testing-library/react";
import OutreachPriorities from "./OutreachPriorities";
const projects = [
  { key: "list-later", title: "Fictional Later", description: "Future calls" },
  { key: "list-due", title: "Fictional Due", description: "Current calls" },
];
const counts = (key, patch = {}) => ({
  key,
  open: 0,
  overdue: 0,
  today: 0,
  upcoming: 0,
  drafts: 0,
  verification: 0,
  ...patch,
});
let state, requests, reply;
beforeEach(() => {
  state = {
    canRecord: true,
    today: "2026-11-22",
    checkedAt: "2026-11-22T16:00:00Z",
    projects: [
      counts("list-later", { open: 1, upcoming: 1 }),
      counts("list-due", { open: 2, overdue: 1, today: 1, drafts: 2 }),
    ],
  };
  requests = [];
  reply = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options = {}) => {
      requests.push({ url, options });
      return reply ? reply() : Response.json(state);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const open = async () => {
  render(<OutreachPriorities projects={projects} />);
  await screen.findByText("Overdue assignments");
};
it("prioritizes due projects and loads saved counts once without mutation", async () => {
  await open();
  expect(
    screen
      .getAllByRole("article")
      .map((a) => within(a).getByRole("heading").textContent),
  ).toEqual(["Fictional Due", "Fictional Later"]);
  expect(requests).toHaveLength(1);
  expect(requests[0].url).toBe("/api/project-outreach/priorities");
  expect(requests[0].options.method).toBeUndefined();
  expect(
    screen.getByRole("link", { name: "Open outreach for Fictional Due" }),
  ).toHaveAttribute("href", "/project-outreach/list-due");
  expect(
    screen.getByText(/do not mean another call is due/),
  ).toBeInTheDocument();
});
it("filters locally without another request and keeps other projects reachable", async () => {
  await open();
  fireEvent.change(screen.getByLabelText("Show projects"), {
    target: { value: "actions" },
  });
  expect(screen.getAllByRole("article")).toHaveLength(1);
  fireEvent.change(screen.getByLabelText("Show projects"), {
    target: { value: "all" },
  });
  expect(screen.getAllByRole("article")).toHaveLength(2);
  expect(requests).toHaveLength(1);
});
it("opens the existing workflow with a fixed return to Tasks, not another assignment or provider write", async () => {
  render(<OutreachPriorities projects={projects} fromTasks />);
  await screen.findByText("Finish recording in NXT");
  expect(screen.getByRole("heading", { name: "Project call assignments" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Open outreach for Fictional Due" }))
    .toHaveAttribute("href", "/project-outreach/list-due?from=tasks");
  expect(requests).toHaveLength(1);
  expect(requests[0].options.method).toBeUndefined();
});
it("does not report zero work after an error and leaves project links available for retry", async () => {
  reply = () => Response.json({ error: "Unavailable" }, { status: 503 });
  render(<OutreachPriorities projects={projects} />);
  await screen.findByRole("alert");
  expect(screen.queryByText("Overdue assignments")).not.toBeInTheDocument();
  expect(screen.getAllByRole("link")).toHaveLength(2);
  reply = null;
  fireEvent.click(
    screen.getByRole("button", { name: "Reload saved priorities" }),
  );
  await screen.findByText("Overdue assignments");
  expect(requests).toHaveLength(2);
});
it("rejects incomplete counts and does not retain stale totals on reload", async () => {
  await open();
  state.projects[0].open = 99;
  fireEvent.click(
    screen.getByRole("button", { name: "Reload saved priorities" }),
  );
  await screen.findByRole("alert");
  expect(screen.queryByText("Overdue assignments")).not.toBeInTheDocument();
});
it("hides aggregate totals when a visible project lacks authorized counts", async () => {
  state.projects = [state.projects[0]];
  render(<OutreachPriorities projects={projects} />);
  await screen.findByText("Workload summary unavailable.");
  expect(screen.queryByText("Overdue assignments")).not.toBeInTheDocument();
  expect(screen.getAllByRole("link")).toHaveLength(2);
});
it("does not display personal counters for view-only users", async () => {
  state = { ...state, canRecord: false, projects: [] };
  render(<OutreachPriorities projects={projects} />);
  await screen.findByText(/Your account has viewing access/);
  expect(screen.queryByLabelText("Show projects")).not.toBeInTheDocument();
  expect(screen.getAllByRole("link")).toHaveLength(2);
});
it("keeps empty views informative without suggesting failure", async () => {
  state.projects = state.projects.map((p) => counts(p.key));
  await open();
  expect(screen.getAllByText(/No open assignments or unfinished/)).toHaveLength(
    2,
  );
  fireEvent.change(screen.getByLabelText("Show projects"), {
    target: { value: "overdue" },
  });
  expect(screen.getByRole("status")).toHaveTextContent(
    "No projects match this view",
  );
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});
it("aborts an in-flight read when unmounted", async () => {
  reply = () => new Promise(() => {});
  const view = render(<OutreachPriorities projects={projects} />);
  await waitFor(() => expect(requests).toHaveLength(1));
  view.unmount();
  expect(requests[0].options.signal.aborted).toBe(true);
});
