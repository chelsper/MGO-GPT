import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import Panel from "./ProjectOutreachPanel";
import { report, saved } from "../../test/fixtures/projectOutreach";

let state, snapshot, requests, post, get, savedEvent;
beforeEach(() => {
  state = structuredClone(saved);
  requests = [];
  post = null;
  get = null;
  state.nxtReadiness = {
    state: "saved",
    checkedAt: "2026-11-20T12:00:00Z",
    callers: [
      {
        id: 8,
        name: "Fictional Caller",
        connection: "not_connected",
        fundraiserMapped: false,
      },
    ],
  };
  state.tasks = [
    {
      ...state.tasks[0],
      id: "11111111-1111-4111-8111-111111111111",
      constituentId: "101",
      name: "Fictional Avery",
      stage: "not_started",
      dueDate: state.today,
    },
    {
      ...structuredClone(state.tasks[0]),
      id: "33333333-3333-4333-8333-333333333333",
      constituentId: "102",
      name: "Fictional Blake",
      stage: "follow_up",
      dueDate: "2026-11-19",
    },
  ];
  snapshot = {
    generatedAt: state.snapshotAt,
    headers: ["System ID", "Name", "Phone", "Restrictions"],
    tableRows: [
      ["101", "Fictional Avery", "555-0100", ""],
      ["102", "Fictional Blake", "555-0102", "Do not call"],
      ["102", "Fictional Blake", "555-0103", ""],
    ],
  };
  savedEvent = (body) => {
    const task = state.tasks.find((t) => t.id === body.result.taskId);
    const existing = task.events.find((e) => e.id === body.result.eventId);
    if (!existing) {
      task.stage = body.result.stage;
      task.dueDate = body.result.nextDate || task.dueDate;
      task.version++;
      task.events.unshift({
        id: body.result.eventId,
        actorId: 8,
        actorName: "Fictional Caller",
        state: "draft",
        result: { ...body.result, notes: body.result.notes.trim() },
      });
    }
    return Response.json({ id: body.result.eventId });
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url, options = {}) => {
      if (options.method !== "POST") return get ? get() : Response.json(state);
      const body = JSON.parse(options.body);
      requests.push(body);
      if (post) return post(body);
      if (body.operation === "record") return savedEvent(body);
      const event = state.tasks
        .flatMap((t) => t.events)
        .find((e) => e.id === body.eventId);
      event.state = "confirmed";
      event.actionId = "909";
      return Response.json({ state: "confirmed", actionId: "909" });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function start() {
  render(<Panel report={report} snapshot={snapshot} />);
  fireEvent.click(
    await screen.findByRole("button", { name: "Start my next call" }),
  );
  return screen.findByRole("form", {
    name: "Record outcome for Fictional Blake",
  });
}
function fill(nextDate = "") {
  fireEvent.change(screen.getByLabelText("What happened?"), {
    target: { value: "contact_issue" },
  });
  if (nextDate)
    fireEvent.change(screen.getByLabelText("Follow-up date"), {
      target: { value: nextDate },
    });
  else
    fireEvent.change(screen.getByLabelText("Next step"), {
      target: { value: "complete" },
    });
  fireEvent.change(screen.getByLabelText("Notes"), {
    target: { value: "Fictional contact review; no call made." },
  });
  fireEvent.click(screen.getByLabelText(/I reviewed contact/));
}
it("opens the Tasks shortcut once using saved priority, keeps contact warnings and cancels without relaunching", async () => {
  state.canManage = true;
  const handled = vi.fn();
  render(<StrictMode><Panel report={report} snapshot={snapshot} startCalls onStartCallsHandled={handled} /></StrictMode>);
  await screen.findByRole("form", { name: "Record outcome for Fictional Blake" });
  expect(screen.getByRole("heading", { name: "Fictional Blake" })).toHaveFocus();
  expect(screen.getByText(/Review contact restrictions: Do not call/)).toBeInTheDocument();
  expect(screen.getByText("Outreach setup", {exact:true})).not.toBeVisible();
  expect(screen.queryByLabelText("Queue")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(screen.getByRole("button", { name: "Start my next call" })).toHaveFocus();
  expect(screen.getByText("Outreach setup", {exact:true})).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reload saved outreach" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Reload saved outreach" })).toBeEnabled());
  expect(screen.queryByRole("region", { name: "Guided call workspace" })).not.toBeInTheDocument();
  expect(handled).toHaveBeenCalledTimes(1);
  expect(requests).toHaveLength(0);
});
it("preserves unsaved manager setup when entering calls and cancelling back to the list", async () => {
  state.canManage = true;
  render(<Panel report={report} snapshot={snapshot} />);
  const startButton = await screen.findByRole("button", { name: "Start my next call" });
  fireEvent.click(screen.getByText("Outreach setup", {exact:true}));
  fireEvent.change(screen.getByLabelText("Instructions for callers"), {target:{value:"Unsaved fictional instructions"}});
  fireEvent.click(startButton);
  expect(screen.getByLabelText("Instructions for callers")).not.toBeVisible();
  fireEvent.click(screen.getByRole("button", {name:"Cancel",exact:true}));
  expect(screen.getByLabelText("Instructions for callers")).toHaveValue("Unsaved fictional instructions");
  expect(state.settings.instructions).toBe("Fictional test only.");
  expect(requests).toHaveLength(0);
});
it("ignores other callers and resumes from saved outcomes rather than the first original assignment", async () => {
  state.canManage = true;
  state.tasks[1].assigneeId = 9;
  state.tasks.unshift({ ...structuredClone(state.tasks[0]), id:"44444444-4444-4444-8444-444444444444", stage:"complete" });
  render(<Panel report={report} snapshot={snapshot} startCalls />);
  await screen.findByRole("form", { name: "Record outcome for Fictional Avery" });
  expect(screen.queryByRole("heading", { name: "Fictional Blake" })).not.toBeInTheDocument();
  expect(requests).toHaveLength(0);
});
it.each(["future follow-ups", "complete", "uncertain actions", "other caller", "unavailable caller", "removed from query"])("shows a non-error empty queue for %s without changing saved records", async (scenario) => {
  for (const task of state.tasks) {
    if (scenario === "future follow-ups") { task.stage = "follow_up"; task.dueDate = "2026-12-31"; }
    if (scenario === "complete") task.stage = "complete";
    if (scenario === "uncertain actions") task.events = [{ id:"22222222-2222-4222-8222-222222222222", actorId:8, state:"review", result:{outcome:"reached",actionDate:state.today,notes:"Fictional pending verification"} }];
    if (scenario === "other caller") task.assigneeId = 9;
    if (scenario === "unavailable caller") task.assigneeAvailable = false;
    if (scenario === "removed from query") task.inCurrentQuery = false;
  }
  const before = structuredClone(state);
  render(<Panel report={report} snapshot={snapshot} startCalls />);
  await screen.findByText(/No calls are ready for you right now/);
  expect(screen.queryByRole("region", { name: "Guided call workspace" })).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(state).toEqual(before);
  expect(requests).toHaveLength(0);
});
it.each(["view only", "missing setup", "invalid setup", "invalid identity"])("keeps shortcut safeguards for %s", async (scenario) => {
  if (scenario === "view only") state.canRecord = false;
  if (scenario === "missing setup") state.settings = null;
  if (scenario === "invalid setup") state.settings.nameColumn = "Missing column";
  const source = scenario === "invalid identity" ? {...report,dataConfiguration:{...report.dataConfiguration,systemIdColumn:"Missing ID"}} : report;
  render(<Panel report={source} snapshot={snapshot} startCalls />);
  await screen.findByText(scenario === "view only" ? /cannot record calls/ : /saved setup needs attention before calls/);
  expect(screen.queryByRole("region", { name: "Guided call workspace" })).not.toBeInTheDocument();
  expect(requests).toHaveLength(0);
});
it("waits for query refresh and matching saved revisions before opening the shortcut", async () => {
  const handled = vi.fn();
  const view = render(<Panel report={report} snapshot={snapshot} startCalls refreshing onStartCallsHandled={handled} />);
  await screen.findByText("Work through my calls");
  expect(handled).not.toHaveBeenCalled();
  expect(screen.queryByRole("region", { name: "Guided call workspace" })).not.toBeInTheDocument();
  view.rerender(<Panel report={report} snapshot={snapshot} startCalls onStartCallsHandled={handled} />);
  await screen.findByRole("form", { name: "Record outcome for Fictional Blake" });
  expect(handled).toHaveBeenCalledTimes(1);
  expect(requests).toHaveLength(0);
});
it.each(["failed read", "stale revision", "stale snapshot"])("does not open or consume a shortcut after %s, but supports an explicit retry", async (scenario) => {
  const handled = vi.fn();
  get = () => scenario === "failed read" ? Response.json({error:"Unavailable"},{status:503})
    : Response.json({...state, ...(scenario === "stale revision" ? {revision:"old"} : {snapshotAt:"2026-11-01T12:00:00Z"})});
  render(<Panel report={report} snapshot={snapshot} startCalls onStartCallsHandled={handled} />);
  await screen.findByRole("alert");
  expect(handled).not.toHaveBeenCalled();
  expect(screen.queryByRole("region", { name: "Guided call workspace" })).not.toBeInTheDocument();
  get = null;
  fireEvent.click(screen.getByRole("button", { name: "Reload saved status", exact:true }));
  await screen.findByRole("form", { name: "Record outcome for Fictional Blake" });
  expect(handled).toHaveBeenCalledTimes(1);
  expect(requests).toHaveLength(0);
});
it("starts with the overdue follow-up, consolidates contact details and makes no write", async () => {
  await start();
  const context = screen.getByRole("region", { name: "Current call details" });
  expect(
    within(context).getByRole("heading", { name: "Fictional Blake" }),
  ).toBeInTheDocument();
  expect(within(context).getByText("555-0102 / 555-0103")).toBeInTheDocument();
  expect(
    within(context).getByText(/Review contact restrictions: Do not call/),
  ).toBeInTheDocument();
  expect(within(context).getByText("Fictional test only.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Queue")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "Fictional Avery" }),
  ).not.toBeInTheDocument();
  expect(
    within(context).getByRole("heading", { name: "Fictional Blake" }),
  ).toHaveFocus();
  expect(requests).toHaveLength(0);
});
it("uses only the caller's queue despite project overview and search filters", async () => {
  state.canManage = true;
  state.tasks[1].assigneeId = 9;
  render(<Panel report={report} snapshot={snapshot} />);
  const startButton = await screen.findByRole("button", {
    name: "Start my next call",
  });
  fireEvent.change(screen.getByLabelText("Find a person or caller"), {
    target: { value: "Blake" },
  });
  fireEvent.click(startButton);
  expect(
    screen.getByRole("form", { name: "Record outcome for Fictional Avery" }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(screen.getByLabelText("Find a person or caller")).toHaveValue("Blake");
  expect(screen.getByLabelText("Queue")).toHaveValue("all");
  expect(
    screen.getByRole("button", { name: "Start my next call" }),
  ).toHaveFocus();
  expect(requests).toHaveLength(0);
});
it("waits for the saved read before advancing and double-clicks save only once", async () => {
  await start();
  fill();
  let resolveRead;
  get = () =>
    new Promise((resolve) => {
      resolveRead = () => resolve(Response.json(state));
    });
  const save = screen.getByRole("button", { name: "Save & next (local only)" });
  fireEvent.click(save);
  fireEvent.click(save);
  await waitFor(() => expect(resolveRead).toBeTypeOf("function"));
  expect(
    screen.queryByRole("form", { name: "Record outcome for Fictional Avery" }),
  ).not.toBeInTheDocument();
  resolveRead();
  await screen.findByRole("form", {
    name: "Record outcome for Fictional Avery",
  });
  expect(requests.map((r) => r.operation)).toEqual(["record"]);
  expect(screen.getByLabelText("Notes")).toHaveValue("");
  expect(
    screen.getByRole("heading", { name: "Fictional Avery" }),
  ).toHaveFocus();
});
it("saves then submits exactly one NXT action before advancing", async () => {
  await start();
  fill();
  fireEvent.click(screen.getByRole("button", { name: "Save, submit & next" }));
  await screen.findByRole("form", {
    name: "Record outcome for Fictional Avery",
  });
  expect(requests.map((r) => r.operation)).toEqual(["record", "submit"]);
  expect(requests[1].eventId).toBe(requests[0].result.eventId);
  fill();
  fireEvent.click(
    screen.getByRole("button", { name: "Save & next (local only)" }),
  );
  await screen.findByRole("heading", {
    name: "No more people ready in this session",
  });
  expect(requests[2].result.eventId).not.toBe(requests[0].result.eventId);
});
it("does not repeat a same-day follow-up within this session, or silently complete it", async () => {
  state.tasks = [state.tasks[1]];
  await start();
  fill(state.today);
  fireEvent.click(
    screen.getByRole("button", { name: "Save & next (local only)" }),
  );
  await screen.findByRole("heading", {
    name: "No more people ready in this session",
  });
  expect(state.tasks[0].stage).toBe("follow_up");
  fireEvent.click(screen.getByRole("button", { name: "Return to list" }));
  expect(
    screen.getByRole("button", { name: "Start my next call" }),
  ).toBeDisabled();
  expect(requests).toHaveLength(1);
});
it("stops on uncertain NXT response and requires exact verification then explicit continuation", async () => {
  await start();
  fill();
  post = (body) => {
    if (body.operation === "record") return savedEvent(body);
    const event = state.tasks[1].events[0];
    if (body.operation === "submit") {
      event.state = "review";
      return Response.json(
        { state: "review", message: "Verify existing action." },
        { status: 202 },
      );
    }
    event.state = "confirmed";
    event.actionId = "909";
    return Response.json({ state: "confirmed" });
  };
  fireEvent.click(screen.getByRole("button", { name: "Save, submit & next" }));
  await screen.findByRole("alert");
  fireEvent.click(
    screen.getByRole("button", { name: "Reload saved status", exact: true }),
  );
  const verify = await screen.findByRole("button", {
    name: "Verify existing action only",
  });
  expect(
    screen.getByRole("button", { name: "Continue to next person" }),
  ).toBeDisabled();
  expect(
    screen.queryByRole("button", { name: "Submit this saved outcome to NXT" }),
  ).not.toBeInTheDocument();
  fireEvent.click(verify);
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Continue to next person" }),
    ).toBeEnabled(),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Continue to next person" }),
  );
  await screen.findByRole("form", {
    name: "Record outcome for Fictional Avery",
  });
  expect(requests.map((r) => r.operation)).toEqual([
    "record",
    "submit",
    "verify",
  ]);
});
it("recovers a lost local-save response without repeating the record", async () => {
  await start();
  fill();
  post = (body) => {
    savedEvent(body);
    throw new Error("Response lost");
  };
  fireEvent.click(
    screen.getByRole("button", { name: "Save & next (local only)" }),
  );
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Notes")).toHaveValue(
    "Fictional contact review; no call made.",
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Reload saved status", exact: true }),
  );
  const next = await screen.findByRole("button", {
    name: "Continue to next person",
  });
  await waitFor(() => expect(next).toBeEnabled());
  fireEvent.click(next);
  await screen.findByRole("form", {
    name: "Record outcome for Fictional Avery",
  });
  expect(requests).toHaveLength(1);
});
it("preserves form data and event ID when a save fails without a persisted result", async () => {
  await start();
  fill();
  post = () =>
    Response.json({ error: "Conflict; reload saved status." }, { status: 409 });
  fireEvent.click(
    screen.getByRole("button", { name: "Save & next (local only)" }),
  );
  await screen.findByRole("alert");
  fireEvent.click(
    screen.getByRole("button", { name: "Reload saved status", exact: true }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  expect(screen.getByLabelText("Notes")).toHaveValue(
    "Fictional contact review; no call made.",
  );
  post = null;
  fireEvent.click(
    screen.getByRole("button", { name: "Save & next (local only)" }),
  );
  await screen.findByRole("form", {
    name: "Record outcome for Fictional Avery",
  });
  expect(requests[1].result.eventId).toBe(requests[0].result.eventId);
});
it("does not advance when a successful save cannot be reloaded", async () => {
  await start();
  fill();
  get = () => {
    throw new Error("Saved status unavailable");
  };
  fireEvent.click(
    screen.getByRole("button", { name: "Save & next (local only)" }),
  );
  await screen.findByRole("alert");
  expect(
    screen.queryByRole("form", { name: "Record outcome for Fictional Avery" }),
  ).not.toBeInTheDocument();
  get = null;
  fireEvent.click(
    screen.getByRole("button", { name: "Reload saved status", exact: true }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Continue to next person" }),
    ).toBeEnabled(),
  );
  expect(requests).toHaveLength(1);
});
it("does not submit NXT when the local acknowledgement has a different event ID", async () => {
  await start();
  fill();
  post = () => Response.json({ id: "wrong" });
  fireEvent.click(screen.getByRole("button", { name: "Save, submit & next" }));
  await screen.findByRole("alert");
  expect(requests.map((r) => r.operation)).toEqual(["record"]);
});
it("asks before discarding unsaved edits and preserves them if cancel is declined", async () => {
  await start();
  fill();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(screen.getByLabelText("Notes")).toHaveValue(
    "Fictional contact review; no call made.",
  );
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(requests).toHaveLength(0);
});
it("blocks the next call if assignments are completed, future follow-ups, or not recordable", async () => {
  state.tasks[0].stage = "complete";
  state.tasks[1].dueDate = "2026-12-01";
  render(<Panel report={report} snapshot={snapshot} />);
  expect(
    await screen.findByRole("button", { name: "Start my next call" }),
  ).toBeDisabled();
  expect(requests).toHaveLength(0);
});
it("keeps edits but disables saving if the assignment changes during the call", async () => {
  await start();
  fill();
  state.tasks[1].assigneeId = 9;
  fireEvent.click(
    screen.getByRole("button", { name: "Reload saved outreach" }),
  );
  await screen.findByText(/This assignment or its saved status changed/);
  expect(screen.getByLabelText("Notes")).toHaveValue(
    "Fictional contact review; no call made.",
  );
  expect(
    screen.getByRole("button", { name: "Save & next (local only)" }),
  ).toBeDisabled();
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(confirm).toHaveBeenCalledOnce();
  expect(screen.getByRole("form")).toBeInTheDocument();
  expect(requests).toHaveLength(0);
});
it("recomputes the next person from refreshed assignments, not the starting queue", async () => {
  await start();
  fill();
  post = (body) => {
    const response = savedEvent(body);
    state.tasks[0].assigneeId = 9;
    return response;
  };
  fireEvent.click(
    screen.getByRole("button", { name: "Save & next (local only)" }),
  );
  await screen.findByRole("heading", {
    name: "No more people ready in this session",
  });
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
  expect(requests).toHaveLength(1);
});
it("holds a successful acknowledgement when the persisted result differs", async () => {
  await start();
  fill();
  post = (body) => {
    const response = savedEvent(body);
    state.tasks[1].events[0].result.notes = "Different saved notes";
    return response;
  };
  fireEvent.click(
    screen.getByRole("button", { name: "Save & next (local only)" }),
  );
  await screen.findByRole("alert");
  expect(
    screen.getByRole("button", { name: "Continue to next person" }),
  ).toBeDisabled();
  expect(
    screen.queryByRole("form", { name: "Record outcome for Fictional Avery" }),
  ).not.toBeInTheDocument();
  expect(requests).toHaveLength(1);
});
it("requires persisted NXT confirmation even when the submit response claims success", async () => {
  await start();
  fill();
  post = (body) =>
    body.operation === "record"
      ? savedEvent(body)
      : Response.json({ state: "confirmed" });
  fireEvent.click(screen.getByRole("button", { name: "Save, submit & next" }));
  await screen.findByRole("alert");
  expect(
    screen.getByRole("button", { name: "Continue to next person" }),
  ).toBeDisabled();
  expect(screen.queryByText(/NXT action confirmed/)).not.toBeInTheDocument();
  expect(requests.map((r) => r.operation)).toEqual(["record", "submit"]);
});
it("offers a rejected unsaved call again after reload and cancel", async () => {
  await start();
  fill();
  post = () =>
    Response.json({ error: "Reload saved status." }, { status: 409 });
  fireEvent.click(
    screen.getByRole("button", { name: "Save & next (local only)" }),
  );
  await screen.findByRole("alert");
  fireEvent.click(
    screen.getByRole("button", { name: "Reload saved status", exact: true }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  vi.spyOn(window, "confirm").mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  fireEvent.click(screen.getByRole("button", { name: "Start my next call" }));
  expect(
    screen.getByRole("form", { name: "Record outcome for Fictional Blake" }),
  ).toBeInTheDocument();
  expect(screen.getByText("0 handled this session")).toBeInTheDocument();
  expect(requests).toHaveLength(1);
});
it("does not announce verification success before persisted NXT confirmation", async () => {
  await start();
  fill();
  post = (body) => {
    if (body.operation === "record") return savedEvent(body);
    if (body.operation === "submit") {
      state.tasks[1].events[0].state = "review";
      return Response.json({ state: "review" });
    }
    return Response.json({ state: "confirmed" });
  };
  fireEvent.click(screen.getByRole("button", { name: "Save, submit & next" }));
  await screen.findByRole("alert");
  fireEvent.click(
    screen.getByRole("button", { name: "Reload saved status", exact: true }),
  );
  const verify = await screen.findByRole("button", {
    name: "Verify existing action only",
  });
  fireEvent.click(verify);
  await screen.findByRole("alert");
  expect(screen.queryByText(/NXT action confirmed/)).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Continue to next person" }),
  ).toBeDisabled();
  expect(requests.map((r) => r.operation)).toEqual([
    "record",
    "submit",
    "verify",
  ]);
});
it("focuses the completed-session heading after recovering the last outcome", async () => {
  state.tasks = [state.tasks[1]];
  await start();
  fill();
  post = (body) => {
    savedEvent(body);
    throw new Error("Response lost");
  };
  fireEvent.click(
    screen.getByRole("button", { name: "Save & next (local only)" }),
  );
  await screen.findByRole("alert");
  fireEvent.click(
    screen.getByRole("button", { name: "Reload saved status", exact: true }),
  );
  const next = await screen.findByRole("button", {
    name: "Continue to next person",
  });
  await waitFor(() => expect(next).toBeEnabled());
  fireEvent.click(next);
  expect(
    screen.getByRole("heading", {
      name: "No more people ready in this session",
    }),
  ).toHaveFocus();
});
it("counts a recovered saved outcome as handled when returning directly to the list", async () => {
  await start();
  fill(state.today);
  post = (body) => {
    savedEvent(body);
    throw new Error("Response lost");
  };
  fireEvent.click(
    screen.getByRole("button", { name: "Save & next (local only)" }),
  );
  await screen.findByRole("alert");
  fireEvent.click(
    screen.getByRole("button", { name: "Reload saved status", exact: true }),
  );
  const back = await screen.findByRole("button", { name: "Return to list" });
  await waitFor(() => expect(back).toBeEnabled());
  fireEvent.click(back);
  expect(
    screen.queryByText(/paused after an unconfirmed save/),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Start my next call" }));
  expect(
    screen.getByRole("form", { name: "Record outcome for Fictional Avery" }),
  ).toBeInTheDocument();
  expect(screen.getByText("1 handled this session")).toBeInTheDocument();
  expect(requests).toHaveLength(1);
});
it("pauses ambiguous save attempts without counting them as handled", async () => {
  await start();
  fill();
  post = () => {
    throw new Error("Response lost");
  };
  fireEvent.click(
    screen.getByRole("button", { name: "Save & next (local only)" }),
  );
  await screen.findByRole("alert");
  fireEvent.click(
    screen.getByRole("button", { name: "Reload saved status", exact: true }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  vi.spyOn(window, "confirm").mockReturnValue(true);
  fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
  expect(
    screen.getByText(/1 paused after an unconfirmed save/),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Start my next call" }));
  expect(
    screen.getByRole("form", { name: "Record outcome for Fictional Avery" }),
  ).toBeInTheDocument();
  expect(screen.getByText("0 handled this session")).toBeInTheDocument();
  expect(requests).toHaveLength(1);
});
it("keeps an acknowledged attempt recoverable if its subsequent read returns a conflict", async () => {
  await start();
  fill();
  get = () =>
    Response.json({ error: "Read changed; reload." }, { status: 409 });
  fireEvent.click(
    screen.getByRole("button", { name: "Save & next (local only)" }),
  );
  await screen.findByRole("alert");
  expect(
    screen.getByRole("button", { name: "Continue to next person" }),
  ).toBeDisabled();
  get = null;
  fireEvent.click(
    screen.getByRole("button", { name: "Reload saved status", exact: true }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "Continue to next person" }),
    ).toBeEnabled(),
  );
  expect(requests).toHaveLength(1);
});
it("offers newly reloaded work after the session queue was exhausted", async () => {
  const later = state.tasks[0];
  state.tasks = [state.tasks[1]];
  await start();
  fill();
  fireEvent.click(
    screen.getByRole("button", { name: "Save & next (local only)" }),
  );
  await screen.findByRole("heading", {
    name: "No more people ready in this session",
  });
  state.tasks.push(later);
  fireEvent.click(
    screen.getByRole("button", { name: "Reload saved outreach" }),
  );
  const next = await screen.findByRole("button", {
    name: "Start next available call",
  });
  expect(
    screen.queryByText("No more people ready in this session"),
  ).not.toBeInTheDocument();
  fireEvent.click(next);
  expect(
    screen.getByRole("form", { name: "Record outcome for Fictional Avery" }),
  ).toBeInTheDocument();
  expect(requests).toHaveLength(1);
});
it("does not offer a calling flow to read-only viewers", async () => {
  state.canRecord = false;
  render(<Panel report={report} snapshot={snapshot} />);
  await screen.findByLabelText("Queue");
  expect(
    screen.queryByRole("button", { name: "Start my next call" }),
  ).not.toBeInTheDocument();
  expect(requests).toHaveLength(0);
});
