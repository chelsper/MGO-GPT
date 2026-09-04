import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import WorkQueuePage from "./WorkQueuePage";

const state = vi.hoisted(() => ({ reviewer: true }));
vi.mock("@/utils/useUser", () => ({ default: () => ({ data: "session", loading: false }) }));
vi.mock("@/utils/useWorkspaceView", () => ({ default: () => ({ isReviewerView: state.reviewer }) }));
vi.mock("./AdvancementWorkQueue", () => ({ default: ({ initialCategory }) => <div>Shared reviewer queue: {initialCategory}</div> }));
vi.mock("./SubmissionTracker", () => ({ default: () => <div>Original submission tracker</div> }));
vi.mock("./DataRequestTracker", () => ({ default: () => <div>Original data request tracker</div> }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });

describe("queue role routing", () => {
  it("opens the reviewer queue with the requested category", async () => {
    state.reviewer = true;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ user: { role: "reviewer" } }) })));
    render(<WorkQueuePage initialCategory="lists" />);
    expect(await screen.findByText("Shared reviewer queue: lists")).toBeInTheDocument();
  });

  it("keeps the original MGO data request tracker", async () => {
    state.reviewer = false;
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ user: { role: "mgo" } }) })));
    render(<WorkQueuePage mgoPage="data" />);
    expect(await screen.findByText("Original data request tracker")).toBeInTheDocument();
    expect(screen.queryByText(/Shared reviewer queue/)).not.toBeInTheDocument();
  });

  it("retains the detailed reviewer tools on explicit navigation", async () => {
    state.reviewer = true;
    window.history.replaceState({}, "", "/submissions?view=activity");
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ user: { role: "reviewer" } }) })));
    render(<WorkQueuePage />);
    expect(await screen.findByText("Original submission tracker")).toBeInTheDocument();
    expect(screen.getByText("Return to compact Work Queue")).toBeInTheDocument();
  });
});
