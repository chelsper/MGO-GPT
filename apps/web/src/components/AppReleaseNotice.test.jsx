import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { renderToString } from "react-dom/server.node";
import { hydrateRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import AppReleaseNotice from "./AppReleaseNotice";
import { trackAppWrite } from "@/utils/appWriteActivity";

const current = "a".repeat(40);
const version = { environment: "production", commitSha: "b".repeat(40), deploymentId: "dpl_new" };
const path = "/stewardship/requests?status=open#request-13";
const reply = value => ({ ok: true, json: async () => value });
function setup() {
  const fetch = vi.fn(async url => reply(url === "/api/app-release/reload"
    ? { deploymentId: "dpl_new", returnTo: path } : version));
  const assign = vi.fn();
  vi.stubGlobal("fetch", fetch);
  vi.stubGlobal("location", { origin: "http://localhost:3000", assign });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
  return { fetch, assign, confirm };
}
afterEach(() => {
  cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers();
});

it("leaves the workspace untouched until confirmation and returns to the same filtered view", async () => {
  const { fetch, assign, confirm } = setup();
  render(<><AppReleaseNotice path={path} buildCommit={current} /><input aria-label="Notes" defaultValue="Unsaved draft" /></>);
  const button = await screen.findByRole("button", { name: "Load latest version" });
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][1]).toMatchObject({ credentials: "omit", cache: "no-store", redirect: "error" });
  expect(assign).not.toHaveBeenCalled();
  confirm.mockReturnValue(false);
  fireEvent.click(button);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText("Notes")).toHaveValue("Unsaved draft");
  confirm.mockReturnValue(true);
  fireEvent.click(button);
  await waitFor(() => expect(assign).toHaveBeenCalledWith(path));
  expect(fetch).toHaveBeenCalledTimes(5);
});

it.each([
  [path, "", version], [path, current, { ...version, commitSha: current }],
  [path, current, { ...version, environment: "preview" }],
  ["/account/logout", current, version], ["/stewardship/society-letters?view=history", current, version],
])("does not prompt for unsupported/current builds or duplicate Society Letters controls", async (destination, build, metadata) => {
  const { fetch } = setup();
  fetch.mockResolvedValue(reply(metadata));
  await act(async () => render(<AppReleaseNotice path={destination} buildCommit={build} />));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("disables updates while a save is active, without changing the save", async () => {
  const { assign } = setup();
  render(<AppReleaseNotice path={path} buildCommit={current} />);
  const button = await screen.findByRole("button", { name: "Load latest version" });
  let finish;
  let saving;
  act(() => { saving = trackAppWrite("/api/data-requests/13", { method: "PATCH" }, () => new Promise(resolve => { finish = resolve; })); });
  expect(button).toBeDisabled();
  expect(screen.getByText("Waiting for the current save to finish.")).toBeInTheDocument();
  fireEvent.click(button);
  expect(assign).not.toHaveBeenCalled();
  await act(async () => { finish("saved"); expect(await saving).toBe("saved"); });
  expect(button).toBeEnabled();
});

it("stays in place when recovery fails and offers an explicit retry", async () => {
  const { fetch, assign } = setup();
  fetch.mockImplementation(async url => url === "/api/app-release/reload" ? { ok: false, status: 409 } : reply(version));
  render(<AppReleaseNotice path={path} buildCommit={current} />);
  fireEvent.click(await screen.findByRole("button", { name: "Load latest version" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Your work has not been reloaded");
  expect(assign).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Load latest version" })).toBeEnabled();
  expect(fetch).toHaveBeenCalledTimes(3);
});

it("prevents repeat clicks and aborts recovery on leaving the view", async () => {
  const { fetch, assign } = setup();
  fetch.mockResolvedValueOnce(reply(version)).mockImplementation((_url, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("cancelled")))));
  const view = render(<AppReleaseNotice path={path} buildCommit={current} />);
  const button = await screen.findByRole("button", { name: "Load latest version" });
  fireEvent.click(button); fireEvent.click(button);
  expect(fetch).toHaveBeenCalledTimes(2);
  view.unmount();
  expect(fetch.mock.calls[1][1].signal.aborted).toBe(true);
  await act(async () => {});
  fireEvent.focus(window);
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(assign).not.toHaveBeenCalled();
});

it("bounds discovery checks and retries only on a later focus", async () => {
  vi.useFakeTimers();
  const { fetch } = setup();
  fetch.mockImplementationOnce((_url, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("timeout")))));
  render(<AppReleaseNotice path={path} buildCommit={current} />);
  fireEvent.focus(window);
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(() => vi.advanceTimersByTimeAsync(60000));
  expect(fetch).toHaveBeenCalledTimes(1);
  await act(async () => fireEvent.focus(window));
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("times out a stalled update without reloading or retrying automatically", async () => {
  vi.useFakeTimers();
  const { fetch, assign } = setup();
  fetch.mockResolvedValueOnce(reply(version)).mockImplementation((_url, { signal }) => new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("timeout")))));
  await act(async () => render(<AppReleaseNotice path={path} buildCommit={current} />));
  fireEvent.click(screen.getByRole("button", { name: "Load latest version" }));
  await act(() => vi.advanceTimersByTimeAsync(15000));
  expect(screen.getByRole("alert")).toHaveTextContent("could not be confirmed");
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(assign).not.toHaveBeenCalled();
});

it("hydrates a clean document without replacing its contents", async () => {
  const tree = <html><head /><body><AppReleaseNotice path={path} buildCommit="" /><main>Saved request</main></body></html>;
  const doc = new DOMParser().parseFromString("<!doctype html>" + renderToString(tree), "text/html");
  const main = doc.querySelector("main");
  const onRecoverableError = vi.fn();
  let root;
  await act(async () => { root = hydrateRoot(doc, tree, { onRecoverableError }); });
  expect(onRecoverableError).not.toHaveBeenCalled();
  expect(doc.querySelector("main")).toBe(main);
  act(() => root.unmount());
});

it("reproduces the inspection-browser warning when an overlay is injected outside body", async () => {
  const tree = <html><head /><body><main>Saved request</main></body></html>;
  const doc = new DOMParser().parseFromString("<!doctype html>" + renderToString(tree), "text/html");
  const overlay = doc.createElement("div");
  overlay.id = "codex-browser-sidebar-comments-root";
  doc.documentElement.appendChild(overlay);
  const onRecoverableError = vi.fn();
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  let root;
  await act(async () => { root = hydrateRoot(doc, tree, { onRecoverableError }); });
  expect(onRecoverableError).toHaveBeenCalled();
  expect(consoleError).toHaveBeenCalled();
  expect(doc.querySelector("main")?.textContent).toBe("Saved request");
  act(() => root.unmount());
});
