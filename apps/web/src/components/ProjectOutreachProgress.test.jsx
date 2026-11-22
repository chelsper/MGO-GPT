import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import Panel from "./ProjectOutreachPanel";
import {
  saved,
  report,
  snapshot,
  result,
} from "../../test/fixtures/projectOutreach";
let state, snap, requests;
beforeEach(() => {
  state = structuredClone(saved);
  state.canManage = true;
  state.callers = [
    { id: 8, name: "Fictional Caller" },
    { id: 9, name: "Fictional Manager" },
  ];
  state.tasks[0].dueDate = "2026-11-19";
  state.tasks.push({
    ...structuredClone(state.tasks[0]),
    id: "33333333-3333-4333-8333-333333333333",
    constituentId: "456",
    name: "Fictional Blake",
    assigneeId: 9,
    assigneeName: "Fictional Manager",
    stage: "complete",
    events: [
      {
        id: result.eventId,
        actorId: 8,
        actorName: "Fictional Caller",
        state: "draft",
        result,
      },
      {
        id: "44444444-4444-4444-8444-444444444444",
        actorId: 8,
        actorName: "Fictional Caller",
        state: "review",
        result,
      },
    ],
  });
  snap = structuredClone(snapshot);
  snap.tableRows.push(["789", "Fictional Casey", "", ""]);
  requests = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options = {}) => {
      requests.push({ url, method: options.method || "GET" });
      if (options.method === "POST")
        throw new Error("No writes in progress tests");
      return Response.json(state);
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function open() {
  render(<Panel report={report} snapshot={snap} />);
  fireEvent.click(await screen.findByText("Team progress"));
}
const shownNames = () =>
  screen
    .getAllByRole("article")
    .map((article) => within(article).getByRole("heading").textContent);
it("shows manager-only saved progress and performs no write or provider request", async () => {
  await open();
  expect(
    screen.getByRole("button", { name: "Fictional Caller: Overdue, 1 person" }),
  ).toBeEnabled();
  expect(
    screen.getByRole("button", {
      name: "Fictional Caller: NXT drafts, 1 action",
    }),
  ).toBeEnabled();
  expect(
    screen.getByRole("button", {
      name: "Fictional Manager: Complete, 1 person",
    }),
  ).toBeEnabled();
  expect(requests).toEqual([
    { url: `/api/reports/lists/${report.key}/outreach`, method: "GET" },
  ]);
});
it("opens an exact caller count, clears hidden filters, focuses its heading and restores the prior view", async () => {
  await open();
  fireEvent.change(screen.getByLabelText("Find a person or caller"), {
    target: { value: "Casey" },
  });
  fireEvent.change(screen.getByLabelText("Status"), {
    target: { value: "unassigned" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Fictional Caller: Overdue, 1 person" }),
  );
  expect(shownNames()).toEqual(["Fictional Avery"]);
  expect(screen.getByText(/^1 matching person\./)).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "Fictional Caller: Overdue" }),
  ).toHaveFocus();
  expect(screen.getByLabelText("Find a person or caller")).toHaveValue("");
  expect(screen.getByLabelText("Status")).toHaveValue("all");
  fireEvent.click(
    screen.getByRole("button", { name: "Back to previous view" }),
  );
  expect(screen.getByLabelText("Find a person or caller")).toHaveValue("Casey");
  expect(
    screen.getByRole("button", { name: /Fictional Caller: Overdue, 1/ }),
  ).toHaveFocus();
  expect(screen.getByLabelText("Status")).toHaveValue("unassigned");
  expect(shownNames()).toEqual(["Fictional Casey"]);
  expect(requests).toHaveLength(1);
});
it("opens NXT follow-through by author even when the person was reassigned", async () => {
  await open();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Fictional Caller: NXT drafts, 1 action",
    }),
  );
  expect(shownNames()).toEqual(["Fictional Blake"]);
  fireEvent.click(screen.getByText("2 recorded outcome(s)"));
  expect(
    screen.getByRole("button", { name: "Submit this saved outcome to NXT" }),
  ).toBeEnabled();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Fictional Caller: NXT verification needed, 1 action",
    }),
  );
  expect(shownNames()).toEqual(["Fictional Blake"]);
  expect(requests).toHaveLength(1);
});
it("does not let a manager submit another caller's actions", async () => {
  state.viewerId = 9;
  await open();
  fireEvent.click(
    screen.getByRole("button", {
      name: "Fictional Caller: NXT drafts, 1 action",
    }),
  );
  fireEvent.click(screen.getByText("2 recorded outcome(s)"));
  expect(
    screen.queryByRole("button", { name: "Submit this saved outcome to NXT" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Verify existing action only" }),
  ).not.toBeInTheDocument();
});
it("clears assignment selection when changing a drill-down, without assigning anyone", async () => {
  await open();
  fireEvent.click(
    screen.getByRole("checkbox", { name: "Select Fictional Avery" }),
  );
  expect(screen.getByText("1 selected")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Unassigned people: 1" }));
  expect(shownNames()).toEqual(["Fictional Casey"]);
  expect(screen.getByText("0 selected")).toBeInTheDocument();
  expect(requests).toHaveLength(1);
});
it("manual filters replace the progress focus instead of silently intersecting it", async () => {
  await open();
  fireEvent.click(
    screen.getByRole("button", { name: "Fictional Caller: Overdue, 1 person" }),
  );
  fireEvent.change(screen.getByLabelText("Find a person or caller"), {
    target: { value: "Casey" },
  });
  expect(
    screen.queryByRole("region", { name: "Focused outreach list" }),
  ).not.toBeInTheDocument();
  expect(shownNames()).toEqual(["Fictional Casey"]);
});
it("uses all project assignments rather than just the first page", async () => {
  for (let i = 0; i < 30; i++) {
    const id = String(2000 + i);
    snap.tableRows.push([id, `Fictional extra ${i}`, "", ""]);
    state.tasks.push({
      ...structuredClone(state.tasks[0]),
      id: `extra-${i}`,
      constituentId: id,
      name: `Fictional extra ${i}`,
    });
  }
  await open();
  expect(
    screen.getByRole("button", {
      name: "Fictional Caller: Assigned, 31 people",
    }),
  ).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Next", exact: true }));
  const before = shownNames();
  fireEvent.click(screen.getByRole("button", { name: "Unassigned people: 1" }));
  expect(shownNames()).toEqual(["Fictional Casey"]);
  fireEvent.click(
    screen.getByRole("button", { name: "Back to previous view" }),
  );
  expect(shownNames()).toEqual(before);
});
it("preserves a focused list when entering and cancelling the caller's guided workflow", async () => {
  await open();
  fireEvent.click(screen.getByRole("button", { name: "Unassigned people: 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Start my next call" }));
  expect(
    screen.getByRole("form", { name: "Record outcome for Fictional Avery" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(shownNames()).toEqual(["Fictional Casey"]);
  expect(
    screen.getByRole("button", { name: "Start my next call" }),
  ).toHaveFocus();
});
it("does not discard an open outcome when clicking a progress count", async () => {
  await open();
  fireEvent.click(
    screen.getByRole("button", { name: "Record outcome", exact: true }),
  );
  fireEvent.change(screen.getByLabelText("Notes"), {
    target: { value: "Unsaved fictional notes" },
  });
  const progress = screen.getByRole("button", { name: "Unassigned people: 1" });
  expect(progress).toBeDisabled();
  fireEvent.click(progress);
  expect(screen.getByLabelText("Notes")).toHaveValue("Unsaved fictional notes");
});
it("refreshes counts and focused people from saved status without changing assignments", async () => {
  await open();
  fireEvent.click(
    screen.getByRole("button", { name: "Fictional Caller: Overdue, 1 person" }),
  );
  state.tasks[0].stage = "complete";
  fireEvent.click(
    screen.getByRole("button", { name: "Reload saved outreach" }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", {
        name: "Fictional Caller: Overdue, 0 people",
      }),
    ).toBeDisabled(),
  );
  expect(screen.queryAllByRole("article")).toHaveLength(0);
  expect(screen.getByText(/^0 matching people\./)).toBeInTheDocument();
  expect(requests.every((request) => request.method === "GET")).toBe(true);
});
it.each([true, false])(
  "does not display manager progress for non-manager with canRecord=%s",
  async (canRecord) => {
    state.canManage = false;
    state.canRecord = canRecord;
    render(<Panel report={report} snapshot={snap} />);
    await screen.findByLabelText("Queue");
    expect(screen.queryByText("Team progress")).not.toBeInTheDocument();
  },
);
