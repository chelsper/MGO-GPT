import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: 2, name: "Test Admin", role: "admin" },
  mutations: [],
  mutate: vi.fn(),
}));
vi.mock("@/utils/useUser", () => ({ default: () => ({ data: state.user, loading: false }) }));
vi.mock("@/utils/useUpload", () => ({ default: () => [vi.fn(), { loading: false }] }));
vi.mock("@tanstack/react-query", () => ({
  useMutation: options => {
    state.mutations.push(options);
    return { mutate: state.mutate, isPending: false };
  },
}));

import NewConstituent from "./new-constituent/page";
import LogDonorUpdate from "./log-donor-update/page";
import UpdateOpportunity from "./update-opportunity/page";
import RequestList from "./request-list/page";
import Settings from "./settings/page";
import AccessManagement from "./access-management/page";
import BlackbaudMapping from "./blackbaud-mapping/page";

const pages = [
  ["/new-constituent", NewConstituent, "/", "Back to Home", true],
  ["/log-donor-update", LogDonorUpdate, "/", "Back to Home", true],
  ["/update-opportunity", UpdateOpportunity, "/", "Back to Home", false],
  ["/request-list", RequestList, "/submissions", "Back to Work Queue", true],
  ["/settings", Settings, "/", "Back to Home", false],
  ["/access-management", AccessManagement, "/setup", "Back to Setup Hub", false],
  ["/blackbaud-mapping", BlackbaudMapping, "/setup", "Back to Setup Hub", false],
];
beforeEach(() => {
  window.history.replaceState({}, "", "/");
  vi.spyOn(document, "referrer", "get").mockReturnValue("");
  state.mutations = [];
  state.mutate.mockClear();
  vi.stubGlobal("fetch", vi.fn(async url => ({
    ok: true,
    json: async () => url === "/api/prospects" ? [] : url === "/api/users/profile" ? { user: state.user } : {},
  })));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  window.history.replaceState({}, "", "/");
});

describe.each(pages)("workflow returns on %s", (path, Page, fallback, fallbackLabel, hasCancel) => {
  it("returns Back and Cancel to the originating workflow without submitting", async () => {
    const destination = "/my-top-prospects?tab=portfolio&category=Priority#portfolio-list";
    window.history.replaceState({}, "", `${path}?${new URLSearchParams({ returnTo: destination })}`);
    await act(async () => { render(<Page />); });
    expect(screen.getByRole("link", { name: "Back to My Portfolio", exact: true })).toHaveAttribute("href", destination);
    if (hasCancel) {
      const cancel = screen.getByRole("link", { name: "Cancel", exact: true });
      expect(cancel).toHaveAttribute("href", destination);
      cancel.addEventListener("click", event => event.preventDefault(), { once: true });
      fireEvent.click(cancel);
    }
    expect(state.mutate).not.toHaveBeenCalled();
    expect(fetch.mock.calls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
  });
  it("uses the previous in-app page when no explicit destination was supplied", async () => {
    window.history.replaceState({}, "", path);
    vi.spyOn(document, "referrer", "get").mockReturnValue(`${window.location.origin}/reports/opportunity-pipeline?fy=2027`);
    await act(async () => { render(<Page />); });
    expect(screen.getByRole("link", { name: "Back to Opportunity Pipeline", exact: true }))
      .toHaveAttribute("href", "/reports/opportunity-pipeline?fy=2027");
    if (hasCancel) expect(screen.getByRole("link", { name: "Cancel", exact: true }))
      .toHaveAttribute("href", "/reports/opportunity-pipeline?fy=2027");
  });
  it.each(["", "https://outside.test", "/api/delete", "/account/logout"])("has a safe direct-entry fallback for %s", async returnTo => {
    window.history.replaceState({}, "", `${path}?${new URLSearchParams({ returnTo })}`);
    await act(async () => { render(<Page />); });
    expect(screen.getByRole("link", { name: fallbackLabel, exact: true })).toHaveAttribute("href", fallback);
    if (hasCancel) expect(screen.getByRole("link", { name: "Cancel", exact: true })).toHaveAttribute("href", fallback);
  });
});

it.each(pages.slice(0, 3))("keeps the same return destination after success on %s", async (path, Page) => {
  window.history.replaceState({}, "", `${path}?returnTo=%2Freports%2Fdashboards`);
  await act(async () => { render(<Page />); });
  await act(async () => { await state.mutations[0].onSuccess({}); });
  const links = screen.getAllByRole("link", { name: "Back to My Dashboards", exact: true });
  expect(links).toHaveLength(2);
  for (const link of links) expect(link).toHaveAttribute("href", "/reports/dashboards");
});

it("returns a successful list request to the validated origin, never blind browser history", async () => {
  vi.useFakeTimers();
  window.history.replaceState({}, "", "/request-list?returnTo=%2Freports%2Flists");
  const back = vi.spyOn(window.history, "back");
  await act(async () => { render(<RequestList />); });
  await act(async () => { state.mutations[0].onSuccess(); });
  const browserWindow = window;
  const assign = vi.fn();
  vi.stubGlobal("window", { location: { assign } });
  await act(async () => { await vi.advanceTimersByTimeAsync(900); });
  vi.stubGlobal("window", browserWindow);
  expect(assign).toHaveBeenCalledExactlyOnceWith("/reports/lists");
  expect(back).not.toHaveBeenCalled();
});

it("does not redirect a list request after the user has already left the form", async () => {
  vi.useFakeTimers();
  window.history.replaceState({}, "", "/request-list?returnTo=%2Freports%2Flists");
  const view = render(<RequestList />);
  await act(async () => { state.mutations[0].onSuccess(); });
  expect(vi.getTimerCount()).toBe(1);
  view.unmount();
  expect(vi.getTimerCount()).toBe(0);
});
