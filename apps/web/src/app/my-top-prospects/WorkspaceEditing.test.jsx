import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const state = vi.hoisted(() => ({ profile: null, session: null }));
vi.mock("@/components/ProspectExport", () => ({ default: () => null }));
vi.mock("@/utils/useUser", () => ({ default: () => state.session }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: ({ queryKey }) => ({
    data: queryKey[0] === "profile-sync-status" ? state.profile : undefined,
    isLoading: false, isFetching: false, refetch: vi.fn(),
  }),
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({ invalidateQueries: vi.fn(), setQueryData: vi.fn() }),
}));
import MyProspects from "./page";
import { WorkspaceTerminologyProvider } from "@/components/WorkspaceTerminology";

beforeEach(() => {
  state.session = { data: { id: 2 }, loading: false, refetch: vi.fn() };
  state.profile = {
    user: { id: 2, role: "admin", name: "Admin Author" },
    workspaceUser: { id: 44, role: "mgo", name: "Selected MGO" },
    actingAsUser: { id: 44, role: "mgo", name: "Selected MGO" },
  };
});
afterEach(cleanup);

it('offers sign-in instead of Loading when its own session has expired', () => {
  state.session.data = null;
  render(<MyProspects />);
  expect(screen.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible();
  expect(screen.queryByText('Loading...')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add Prospect' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Sign in' })).toBeVisible();
});

it('offers a session-only retry after a failed check', () => {
  state.session.data = null;
  state.session.error = 'unavailable';
  render(<MyProspects />);
  expect(screen.getByRole('heading', { name: 'Could not check your sign-in' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'Try checking again' }));
  expect(state.session.refetch).toHaveBeenCalledWith({ showLoading: true });
});

it.each(["admin", "mgo,admin"])("enables Admin editing and action entry for %s", (role) => {
  state.profile.user.role = role;
  render(<MyProspects />);
  expect(screen.getByRole("link", { name: "Log Update" })).toHaveAttribute("href", "/action-opportunity-update");
  expect(screen.getByRole("button", { name: "Add Prospect" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Reorder prospects" })).toBeEnabled();
  expect(screen.getByText("Editing Selected MGO's workspace")).toBeInTheDocument();
  expect(screen.getByText(/MGO workspace as Admin. Actions credit the workspace owner/)).toBeInTheDocument();
});
it("keeps Executive viewers read-only", () => {
  state.profile.user.role = "executive";
  render(<MyProspects />);
  expect(screen.queryByRole("link", { name: "Log Update" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add Prospect" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reorder prospects" })).not.toBeInTheDocument();
  expect(screen.getByText(/workspace in read-only mode/)).toBeInTheDocument();
});
it("does not flash editing controls before permissions load", () => {
  state.profile = undefined;
  render(<MyProspects />);
  expect(screen.queryByRole("link", { name: "Log Update" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Add Prospect" })).not.toBeInTheDocument();
});

it("changes display terminology without granting editing rights to an Executive", () => {
  const view = render(<WorkspaceTerminologyProvider terminology={{ mgo: "Gift Officer" }}><MyProspects /></WorkspaceTerminologyProvider>);
  expect(screen.getByText(/Gift Officer workspace as Admin. Actions credit the workspace owner/)).toBeVisible();
  expect(screen.getByRole("button", { name: "Add Prospect" })).toBeEnabled();
  state.profile.user.role = "executive";
  view.rerender(<WorkspaceTerminologyProvider terminology={{ mgo: "Admin" }}><MyProspects /></WorkspaceTerminologyProvider>);
  expect(screen.getByText(/workspace in read-only mode/)).toBeVisible();
  expect(screen.queryByRole("button", { name: "Add Prospect" })).not.toBeInTheDocument();
});
