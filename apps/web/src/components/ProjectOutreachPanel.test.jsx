import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
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
  report,
  snapshot,
  saved,
  result,
  ids,
} from "../../test/fixtures/projectOutreach";
let state, requests, reply;
beforeEach(() => {
  state = structuredClone(saved);
  requests = [];
  reply = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url, options = {}) => {
      if (options.method !== "POST") return Response.json(state);
      const body = JSON.parse(options.body);
      requests.push(body);
      if (reply) return reply(body);
      if (body.operation === "record") {
        state.tasks[0].stage = body.result.stage;
        state.tasks[0].version++;
        state.tasks[0].events.unshift({
          id: body.result.eventId,
          actorId: 8,
          actorName: "Fictional Caller",
          result: body.result,
          state: "draft",
        });
        return Response.json({ id: body.result.eventId });
      }
      if (body.operation === "submit") {
        state.tasks[0].events[0].state = "confirmed";
        state.tasks[0].events[0].actionId = "909";
        return Response.json({ state: "confirmed", actionId: "909" });
      }
      return Response.json({ changed: 1 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const mount = async () => {
  render(<Panel report={report} snapshot={snapshot} />);
  await screen.findByRole("button", { name: "Record outcome" });
};
function completeForm() {
  fireEvent.click(screen.getByRole("button", { name: "Record outcome" }));
  fireEvent.change(screen.getByLabelText("What happened?"), {
    target: { value: "reached" },
  });
  fireEvent.change(screen.getByLabelText("Next step"), {
    target: { value: "complete" },
  });
  fireEvent.change(screen.getByLabelText("Notes"), {
    target: { value: "Fictional conversation." },
  });
  fireEvent.click(screen.getByLabelText(/I reviewed contact/));
}
describe("project outreach pilot UI", () => {
  it("opens and focuses the requested setup field without saving or contacting NXT", async () => {
    state.canManage = true;
    await mount();
    fireEvent.click(screen.getByText(/Setup & readiness/));
    fireEvent.click(screen.getByRole("button", {name:"Edit phone numbers"}));
    expect(screen.getByLabelText("Phone number")).toHaveFocus();
    expect(screen.getByLabelText("Phone number").closest("details")).toHaveAttribute("open");
    expect(requests).toHaveLength(0);
  });
  it("missing NXT connection and mapping do not block saving a local outcome", async () => {
    state.nxtReadiness={state:"saved",checkedAt:"2026-11-21T15:00:00Z",callers:[{id:8,name:"Fictional Caller",connection:"not_connected",fundraiserMapped:false}]};
    await mount();
    completeForm();
    fireEvent.click(screen.getByRole("button",{name:"Save outcome only"}));
    await waitFor(() => expect(requests.map(r => r.operation)).toEqual(["record"]));
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });
  it("focuses the outcome form and returns to the original caller row on cancel", async () => {
    await mount();
    const opener = screen.getByRole("button", { name: "Record outcome" });
    fireEvent.click(opener);
    expect(screen.getByLabelText("What happened?")).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(opener).toHaveFocus();
    expect(requests).toHaveLength(0);
  });
  it("defaults callers to their own queue, deduplicates and shows restrictions", async () => {
    await mount();
    expect(screen.getByLabelText("Queue")).toHaveValue("mine");
    expect(
      screen.getAllByRole("heading", { name: "Fictional Avery" }),
    ).toHaveLength(1);
    expect(
      screen.queryByRole("heading", { name: "Fictional Blake" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/Review contact restrictions: Do not call/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Assign caller")).not.toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });
  it("saves locally without an NXT request and closes the completed form", async () => {
    await mount();
    completeForm();
    fireEvent.click(screen.getByRole("button", { name: "Save outcome only" }));
    await screen.findByText("Outcome saved; NXT not submitted.");
    expect(requests.map((r) => r.operation)).toEqual(["record"]);
    expect(screen.queryByRole("form")).not.toBeInTheDocument();
  });
  it("saves before submitting, confirms NXT separately, and double-clicks do not resend", async () => {
    await mount();
    completeForm();
    const submit = screen.getByRole("button", {
      name: "Save & submit NXT action",
    });
    fireEvent.click(submit);
    fireEvent.click(submit);
    await screen.findByText(
      "NXT action confirmed. Nothing was sent to the constituent.",
    );
    expect(requests.map((r) => r.operation)).toEqual(["record", "submit"]);
    expect(requests[1]).toMatchObject({
      eventId: requests[0].result.eventId,
      confirm: true,
    });
  });
  it("keeps the form and same event identity when a save fails", async () => {
    await mount();
    completeForm();
    reply = () =>
      Response.json({ error: "Reload saved status" }, { status: 409 });
    fireEvent.click(screen.getByRole("button", { name: "Save outcome only" }));
    await screen.findByRole("alert");
    expect(screen.getByLabelText("Notes")).toHaveValue(
      "Fictional conversation.",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Reload saved status" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save outcome only" }));
    await screen.findByRole("alert");
    expect(requests[1].result.eventId).toBe(requests[0].result.eventId);
  });
  it("preserves a saved outcome when NXT fails and exposes verification, not a replacement", async () => {
    await mount();
    completeForm();
    reply = (body) => {
      if (body.operation === "record") {
        state.tasks[0].events = [
          {
            id: body.result.eventId,
            actorId: 8,
            actorName: "Fictional Caller",
            result: body.result,
            state: "review",
          },
        ];
        return Response.json({ id: body.result.eventId });
      }
      return Response.json(
        { state: "review", message: "Outcome saved; verify existing action." },
        { status: 202 },
      );
    };
    fireEvent.click(
      screen.getByRole("button", { name: "Save & submit NXT action" }),
    );
    await screen.findByRole("alert");
    fireEvent.click(
      screen.getByRole("button", { name: "Reload saved status" }),
    );
    await screen.findByRole("button", { name: "Verify existing action only" });
    expect(
      screen.queryByRole("button", {
        name: "Submit this saved outcome to NXT",
      }),
    ).not.toBeInTheDocument();
    expect(requests).toHaveLength(2);
  });
  it("requires a manager to review explicit assignments and cancel does not mutate", async () => {
    state.canManage = true;
    state.callers = [{ id: 8, name: "Fictional Caller" }];
    await mount();
    fireEvent.click(screen.getByLabelText("Select Fictional Blake"));
    fireEvent.change(screen.getByLabelText("Assign caller"), {
      target: { value: "8" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review assignments" }));
    expect(requests).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(requests).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Review assignments" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Confirm assignments" }),
    );
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0]).toMatchObject({
      operation: "assign",
      people: [{ constituentId: "456", version: 0 }],
      assigneeId: 8,
      snapshotAt: snapshot.generatedAt,
    });
  });
  it("clears a stale confirmation when the filter changes", async () => {
    state.canManage = true;
    state.callers = [{ id: 8, name: "Fictional Caller" }];
    await mount();
    fireEvent.click(
      screen.getByRole("button", { name: "Select up to 100 matching people" }),
    );
    fireEvent.change(screen.getByLabelText("Assign caller"), {
      target: { value: "8" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Review assignments" }));
    fireEvent.change(screen.getByLabelText("Status"), {
      target: { value: "all" },
    });
    expect(
      screen.queryByRole("button", { name: "Confirm assignments" }),
    ).not.toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });
  it("blocks new outcomes for a missing query member but keeps history visible", async () => {
    state.tasks[0].inCurrentQuery = false;
    state.tasks[0].events = [
      {
        id: ids.event,
        actorId: 8,
        actorName: "Fictional Caller",
        result,
        state: "confirmed",
        actionId: "909",
      },
    ];
    await mount();
    expect(
      screen.getByRole("button", { name: "Record outcome" }),
    ).toBeDisabled();
    expect(screen.getByText("NXT action confirmed: 909")).toBeInTheDocument();
  });
  it("rejects a stale server snapshot and offers reload instead of editing stale data", async () => {
    state.snapshotAt = "different";
    render(<Panel report={report} snapshot={snapshot} />);
    await screen.findByRole("alert");
    expect(
      screen.queryByRole("button", { name: "Record outcome" }),
    ).not.toBeInTheDocument();
    expect(requests).toHaveLength(0);
  });
  it("shows setup only to managers and requires a mapped name and deadline", async () => {
    state.canManage = true;
    state.settings = null;
    state.settingsVersion = 0;
    render(<Panel report={report} snapshot={snapshot} />);
    const save = await screen.findByRole("button", {
      name: "Save outreach setup",
    });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Constituent name"), {
      target: { value: "Name" },
    });
    fireEvent.change(screen.getByLabelText("Project deadline"), {
      target: { value: "2026-12-31" },
    });
    expect(save).toBeEnabled();
  });
});
