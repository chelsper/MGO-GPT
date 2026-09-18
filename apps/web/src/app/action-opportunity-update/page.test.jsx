import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
const state = vi.hoisted(() => ({ profile: null, pending: false, error: false }));
vi.mock("@/utils/useUser", () => ({ default: () => ({ data: { id: 2 }, loading: false }) }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: state.profile, isPending: state.pending, isError: state.error }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));
import ActionEntry from "./page";
beforeEach(() => {
  window.history.replaceState({}, "", "/action-opportunity-update");
  state.pending = false;
  state.error = false;
  state.profile = {
    user: { id: 2, role: "admin", name: "Admin Author" },
    workspaceUser: { id: 44, role: "mgo", name: "Selected MGO" },
    actingAsUser: { id: 44, role: "mgo", name: "Selected MGO" },
  };
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });
it.each([
  ["/my-top-prospects?tab=portfolio&search=Test%20Person", "Back to My Portfolio"],
  ["/reports", "Back to Reports"],
  ["/follow-ups?tab=next-steps", "Back to Follow-ups & Discussion"],
])("labels the form's return destination and retains its context: %s", (href, label) => {
  window.history.replaceState({}, "", `/action-opportunity-update?${new URLSearchParams({ returnTo: href })}`);
  render(<ActionEntry />);
  expect(screen.getByRole("link", { name: label })).toHaveAttribute("href", href);
  expect(screen.getByRole("status")).toHaveTextContent("Selected MGO");
  expect(fetch.mock.calls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
});
it("falls back to Home rather than following an unsafe return parameter", () => {
  window.history.replaceState({}, "", `/action-opportunity-update?${new URLSearchParams({ returnTo: "/\\outside.test" })}`);
  render(<ActionEntry />);
  expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/");
});
it("clearly identifies both the credited MGO and Admin author", () => {
  render(<ActionEntry />);
  expect(screen.getByRole("status")).toHaveTextContent("Entering updates for Selected MGO as Admin");
  expect(screen.getByRole("status")).toHaveTextContent("Entered by: Admin Author");
  expect(screen.getByRole("button", { name: "Save update" })).toBeEnabled();
});
it("blocks the entry form when an Executive views another MGO", () => {
  state.profile.user.role = "executive";
  render(<ActionEntry />);
  expect(screen.getByRole("status")).toHaveTextContent("read-only");
  expect(screen.queryByRole("button", { name: "Save update" })).not.toBeInTheDocument();
});
it("fails closed if permission lookup fails", () => {
  state.profile = undefined; state.error = true;
  render(<ActionEntry />);
  expect(screen.getByRole("status")).toHaveTextContent("Could not verify workspace permissions");
  expect(screen.queryByRole("button", { name: "Save update" })).not.toBeInTheDocument();
});
