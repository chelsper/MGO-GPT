import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent } from "@testing-library/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Page from "./page";
import { WorkspaceTerminologyProvider } from "@/components/WorkspaceTerminology";

const state = vi.hoisted(() => ({
  session: { email: "reviewer@example.org" }, reviewer: true, failed: false, counts: {}, options: null, role: null, overdueNextSteps: [],
  actingStatus: { actingUser: null }, workspaceFailed: false, usersPending: false, usersFailed: false, queries: {},
  mgoUsers: [], setViewMode: vi.fn(), setQueryData: vi.fn(),
}));
vi.mock("@/utils/useUser", () => ({ default: () => ({ data: state.session, loading: false }) }));
vi.mock("@/utils/useWorkspaceView", () => ({
  default: () => ({ isReviewerView: state.reviewer, isMgoView: !state.reviewer, isAdmin: state.role?.split(",").includes("admin"), effectiveRole: state.reviewer ? "reviewer" : "mgo", setViewMode: state.setViewMode }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ setQueryData: state.setQueryData }),
  useQuery: (options) => {
    state.queries[options.queryKey[0]] = options;
    if (options.queryKey[0] === "acting-workspace-status") return { data: state.actingStatus, isError: state.workspaceFailed };
    if (options.queryKey[0] === "workspace-mgo-users") return { data: state.mgoUsers, isPending: state.usersPending, isError: state.usersFailed };
    if (options.queryKey[0] !== "app-shell-worklist") return {};
    state.options = options;
    return { data: { queueCounts: state.counts, summary: { openDiscussionItems: 1 }, overdueNextSteps: state.overdueNextSteps }, isError: state.failed };
  },
}));

let container, root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  state.reviewer = true;
  state.failed = false;
  state.role = null;
  state.overdueNextSteps = [];
  state.actingStatus = { actingUser: null };
  state.workspaceFailed = false;
  state.usersPending = false;
  state.usersFailed = false;
  state.queries = {};
  state.mgoUsers = [{ id: 9, name: "Selected MGO", role: "mgo" }];
  state.setViewMode.mockReset();
  state.setQueryData.mockReset();
  state.counts = { workQueue: 12, dataRequests: 0, listRequests: 0, constituencyImports: 12, familyImports: 2, prospectPool: 31 };
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ user: { id: 7, name: "Test Reviewer", email: state.session.email, role: state.role || (state.reviewer ? "advancement_services" : "mgo") } }) })));
});

describe("Home workspace switching presentation", () => {
  it.each(["admin", "mgo,admin"])("keeps %s controls compact without new reads or changing query enablement", async role => {
    state.role = role;
    state.reviewer = false;
    state.actingStatus = { actingUser: state.mgoUsers[0] };
    await render();
    const controls = container.querySelector('[aria-label="Workspace controls"]');
    expect(controls.querySelector("details")).not.toHaveAttribute("open");
    expect(controls.querySelector("summary")).toHaveTextContent("MGO: Selected MGO");
    expect(controls).toHaveTextContent("Editing as Admin");
    await act(async () => { fireEvent.click(controls.querySelector("summary")); });
    expect(controls.querySelector("details")).toHaveAttribute("open");
    expect(controls.querySelector("select")).toHaveValue("9");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(state.queries["acting-workspace-status"].enabled).toBe(true);
    expect(state.queries["workspace-mgo-users"].enabled).toBe(true);
    expect(state.setViewMode).not.toHaveBeenCalled();
    expect(state.setQueryData).not.toHaveBeenCalled();
  });

  it.each(["advancement_services", "mgo", "executive"])("does not add Home Admin controls for %s", async role => {
    state.role = role;
    state.reviewer = role === "advancement_services";
    await render();
    expect(container.querySelector('[aria-label="Workspace controls"]')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("leaves workspace queries disabled in Advancement Services view even when controls expand", async () => {
    state.role = "admin";
    await render();
    await act(async () => { fireEvent.click(container.querySelector('[aria-label="Workspace controls"] summary')); });
    expect(state.queries["acting-workspace-status"].enabled).toBe(false);
    expect(state.queries["workspace-mgo-users"].enabled).toBe(false);
    expect(container.querySelector('[aria-label="Workspace controls"] select')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("retains the selected workspace and surfaces a failed switch without updating the cache", async () => {
    state.role = "admin";
    state.reviewer = false;
    await render();
    fetch.mockResolvedValueOnce({ ok: false, json: async () => ({ error: "Failed to switch workspace. Try again." }) });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await act(async () => { fireEvent.click(container.querySelector('[aria-label="Workspace controls"] summary')); });
      await act(async () => { fireEvent.change(container.querySelector('#home-workspace-owner'), { target: { value: "9" } }); });
      expect(fetch).toHaveBeenLastCalledWith("/api/admin/workspace-user", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: 9 }),
      });
      expect(container.querySelector('[role="status"]')).toHaveTextContent("Failed to switch workspace");
      expect(container.querySelector('[aria-label="Workspace controls"] summary')).toHaveTextContent("My workspace");
      expect(state.setQueryData).not.toHaveBeenCalled();
      expect(container.querySelector('#home-workspace-owner')).toHaveValue("7");
    } finally { consoleError.mockRestore(); }
  });
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});

const render = async (terminology) => act(async () => root.render(<WorkspaceTerminologyProvider terminology={terminology}><Page /></WorkspaceTerminologyProvider>));
const badge = (href) => container.querySelector(`main a[href="${href}"] span[aria-label]`)
  || container.querySelector(`a[href="${href}"] span[aria-label]`);

describe("Advancement Services home alerts", () => {
  it.each(["advancement_services", "admin"])("shows reporting shortcuts and one knowledge editor for %s", async (role) => {
    state.role = role;
    await render();
    const section = [...container.querySelectorAll("section")].find((node) => node.querySelector("h2")?.textContent === "Reports & Exports");
    expect(section.querySelector('a[href="/pledge-payments"]')).toHaveTextContent("Pledge Payments");
    const primary = container.querySelector('[aria-label="Main workspace paths"]');
    expect([...primary.querySelectorAll("a")].map(link => link.getAttribute("href")))
      .toEqual(["/submissions", "/constituency-import", "/prospect-exports"]);
    expect(primary.querySelector('a[href="/prospect-exports"]')).toHaveTextContent("Choose one or more MGO workspaces");
    expect(section.querySelector('a[href="/report-configurations"]')).not.toBeNull();
    expect(container.querySelectorAll('a[href="/knowledge-base/manage"]')).toHaveLength(1);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/users/profile");
  });

  it("shows outstanding counts on relevant cards but no alert for empty queues", async () => {
    await render();
    expect(badge("/submissions")).toHaveAttribute("aria-label", "12 items in the work queue");
    expect(badge("/constituency-import")).toBeNull();
    expect(container.querySelector('a[href="/import-history"]')).toHaveTextContent("Import History");
    expect(badge("/family-import")).toBeNull();
    expect(badge("/prospect-pool")).toHaveTextContent("31");
    expect(badge("/list-requests")).toBeNull();
    expect(badge("/data-requests")).toBeNull();
    expect(container.textContent).toContain("Imports do not trigger queue alerts");
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
    expect(container.querySelector('a[href="/pledge-payments"]')).toBeNull();
    expect(container.querySelector('a[href="/prospect-exports"]')).toBeNull();
    expect(container.querySelector('a[href="/my-top-prospects"]')).not.toBeNull();
  });

  it("puts fundraiser paths above attention items without duplicate shortcuts or new fetching", async () => {
    state.reviewer = false;
    state.overdueNextSteps = [{ id: 9, next_action_text: "Call about event", prospect_name: "Test Constituent", next_action_due_date: "2026-01-02" }];
    await render();
    const primary = container.querySelector('[aria-label="Main workspace paths"]');
    const hrefs = ["/my-top-prospects", "/follow-ups", "/reports"];
    expect([...primary.querySelectorAll("a")].map(link => link.getAttribute("href"))).toEqual(hrefs);
    for (const href of hrefs) {
      const shortcuts = [...container.querySelectorAll(`a[href="${href}"]`)]
        .filter(link => !link.closest('[aria-labelledby="attention-upcoming-title"]'));
      expect(shortcuts).toHaveLength(1);
    }
    const attention = container.querySelector('[aria-labelledby="attention-upcoming-title"]');
    expect(primary.compareDocumentPosition(attention) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(attention).toHaveTextContent("Call about event");
    expect(attention.querySelector('a[href="/my-top-prospects?prospectId=9&panel=next-step"]')).not.toBeNull();
    expect(container.querySelector('a[href="/action-opportunity-update"]')).not.toBeNull();
    expect(primary.querySelector('[aria-label="1 open team discussion item"]')).toHaveTextContent("1");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(state.options).toMatchObject({ refetchInterval: false, refetchIntervalInBackground: false });
  });

  it("keeps reporting tools out of the admin's MGO view", async () => {
    state.role = "admin";
    state.reviewer = false;
    await render();
    expect(container.querySelector('a[href="/pledge-payments"]')).toBeNull();
    expect(container.querySelector('a[href="/reports"]')).not.toBeNull();
  });
});

describe("Home configured terminology", () => {
  const terminology = { mgo: "Gift Officer", advancementServices: "Data Services", executive: "Leadership" };

  it.each(["admin", "advancement_services"])("uses configured reviewer headings, footer, and descriptions for %s without extra reads", async role => {
    state.role = role;
    await render(terminology);
    expect(container.querySelector("h1")).toHaveTextContent(role === "admin" ? "Data Services workspace" : "Data Services Hub");
    expect(container.querySelector("footer")).toHaveTextContent(role === "admin" ? "Admin · Data Services view" : "Data Services");
    expect(container.querySelector('a[href="/prospect-exports"]')).toHaveTextContent("Choose one or more Gift Officer workspaces");
    expect(container.querySelector('a[href="/prospect-pool"]')).toHaveTextContent("Assign prospects to Gift Officer workspaces");
    expect(container.querySelector('a[href="/list-requests"]')).toHaveTextContent("delivery notes to Gift Officer users");
    expect(container.textContent).not.toContain("MGOs");
    expect(container.textContent).not.toContain("Advancement Services");
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/users/profile");
  });

  it.each(["admin", "mgo", "mgo,executive"])("relabels fundraiser copy but not routes, selected people, roles, or queries for %s", async role => {
    state.role = role;
    state.reviewer = false;
    state.actingStatus = { actingUser: state.mgoUsers[0] };
    await render(terminology);
    expect(container.querySelector("h1")).toHaveTextContent(role === "admin" ? "Gift Officer Workspace" : "Today");
    expect(container.querySelector("footer")).toHaveTextContent(role === "admin" ? "Admin · Gift Officer view" : role === "mgo" ? "Gift Officer" : "Gift Officer, Leadership");
    expect(container.querySelector('a[href="/request-list"]')).toHaveTextContent("reporting support from Data Services");
    expect(container.querySelector('a[href="/data-requests"]')).toHaveTextContent("constituent information to Data Services");
    const originalQueries = Object.keys(state.queries);
    await render({ ...terminology, mgo: "Fundraiser" });
    if (role === "admin") {
      expect(container.querySelector('[aria-label="Workspace controls"] summary')).toHaveTextContent("Fundraiser: Selected MGO");
      expect(container.querySelector('#home-workspace-owner')).toHaveValue("9");
    }
    expect(Object.keys(state.queries)).toEqual(originalQueries);
    expect(originalQueries.sort()).toEqual(["acting-workspace-status", "app-shell-worklist", "workspace-mgo-users"]);
    expect(state.options).toMatchObject({ queryKey: ["app-shell-worklist", 7, "mgo"], refetchInterval: false });
    expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/users/profile");
    expect(state.setViewMode).not.toHaveBeenCalled();
    expect(state.setQueryData).not.toHaveBeenCalled();
  });

  it("falls back on blank settings and renders custom labels as text, not markup", async () => {
    state.role = "admin";
    await render({ advancementServices: " " });
    expect(container.querySelector("h1")).toHaveTextContent("Advancement Services workspace");
    await render({ advancementServices: "<b>Data Services</b>", mgo: "<img src=x>" });
    expect(container.querySelector("h1")).toHaveTextContent("<b>Data Services</b> workspace");
    expect(container.querySelector('a[href="/prospect-exports"]')).toHaveTextContent("<img src=x> workspaces");
    expect(container.querySelector("main b, main img[src=x]")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
