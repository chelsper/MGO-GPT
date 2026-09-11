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
  state.pending = false;
  state.error = false;
  state.profile = {
    user: { id: 2, role: "admin", name: "Admin Author" },
    workspaceUser: { id: 44, role: "mgo", name: "Selected MGO" },
    actingAsUser: { id: 44, role: "mgo", name: "Selected MGO" },
  };
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => [] })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
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
