import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Page from "./page";

const state = vi.hoisted(() => ({
  session: { email: "reviewer@example.org" }, reviewer: true, failed: false, counts: {}, options: null,
}));
vi.mock("@/utils/useUser", () => ({ default: () => ({ data: state.session, loading: false }) }));
vi.mock("@/utils/useWorkspaceView", () => ({
  default: () => ({ isReviewerView: state.reviewer, isMgoView: !state.reviewer, isAdmin: false, effectiveRole: state.reviewer ? "reviewer" : "mgo" }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({}),
  useQuery: (options) => {
    if (options.queryKey[0] !== "app-shell-worklist") return {};
    state.options = options;
    return { data: { queueCounts: state.counts, summary: { openDiscussionItems: 1 } }, isError: state.failed };
  },
}));

let container, root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  state.reviewer = true;
  state.failed = false;
  state.counts = { workQueue: 12, dataRequests: 0, listRequests: 0, constituencyImports: 12, familyImports: 2, prospectPool: 31 };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ user: { id: 7, name: "Test Reviewer", email: state.session.email, role: state.reviewer ? "advancement_services" : "mgo" } }) })));
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = async () => act(async () => root.render(<Page />));
const badge = (href) => container.querySelector(`main a[href="${href}"] span[aria-label]`)
  || container.querySelector(`a[href="${href}"] span[aria-label]`);

describe("Advancement Services home alerts", () => {
  it("shows outstanding counts on relevant cards but no alert for empty queues", async () => {
    await render();
    expect(badge("/submissions")).toHaveAttribute("aria-label", "12 items in the work queue");
    expect(badge("/constituency-import")).toHaveTextContent("12");
    expect(badge("/family-import")).toHaveTextContent("2");
    expect(badge("/prospect-pool")).toHaveTextContent("31");
    expect(badge("/list-requests")).toBeNull();
    expect(badge("/data-requests")).toBeNull();
    expect(container.textContent).toContain("Import alerts count batches, not rows");
    expect(state.options).toMatchObject({ refetchInterval: 60000, refetchIntervalInBackground: false, refetchOnWindowFocus: "always" });
  });

  it("updates counts after refresh and clears completed queue alerts", async () => {
    await render();
    state.counts = { ...state.counts, workQueue: 0, constituencyImports: 0, dataRequests: 14 };
    await render();
    expect(badge("/submissions")).toBeNull();
    expect(badge("/constituency-import")).toBeNull();
    expect(badge("/data-requests")).toHaveTextContent("14");
  });

  it("retains counts with a warning when refresh fails", async () => {
    await render();
    state.failed = true;
    await render();
    expect(container.querySelector('[role="status"]')).toHaveTextContent("Queue alerts could not refresh");
    expect(badge("/submissions")).toHaveTextContent("12");
  });

  it("does not show reviewer badges in the MGO workspace", async () => {
    state.reviewer = false;
    await render();
    expect(badge("/submissions")).toBeNull();
    expect(state.options.refetchInterval).toBe(false);
  });
});
