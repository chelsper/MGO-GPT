import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const session = vi.hoisted(() => ({ user: null, loading: false }));
vi.mock("@/utils/useUser", () => ({ default: () => ({ data: session.user, loading: session.loading }) }));
import ConstituencyImportPage from "./page";

const email = "operator@example.test";
let profileReply;
const allowedProfile = (role = "admin") => ({ user: { id: 7, email, role, active: true }, workspaceUser: { id: 8, role: "mgo" } });
const reply = (payload, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => payload });
const importReads = () => fetch.mock.calls.filter(([url]) => url !== "/api/users/profile");

beforeEach(() => {
  localStorage.clear();
  session.user = { email, role: "admin" };
  session.loading = false;
  profileReply = reply(allowedProfile());
  vi.stubGlobal("fetch", vi.fn(async (url, options) => {
    if (options?.method && options.method !== "GET") throw new Error("Access checks must not write");
    if (url === "/api/users/profile") return profileReply;
    if (url === "/api/constituency-import/runs?limit=8") return reply({ runs: [] });
    if (url === "/api/blackbaud/status?availability=1") return reply({ quota: { paused: false } });
    throw new Error(`Unexpected request: ${url}`);
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe("import entry account access", () => {
  it.each([
    ["admin", "reviewer"], ["admin", "mgo"], ["admin,mgo", "mgo"],
    ["advancement_services", "mgo"], ["reviewer", "mgo"],
    ["advancement_admin", "reviewer"], ["advancement_services,mgo", "mgo"],
  ])("allows saved account role %s regardless of the %s display preference", async (role, view) => {
    localStorage.setItem("mgo-gpt:admin-view-mode", view);
    profileReply = reply(allowedProfile(role));
    render(<ConstituencyImportPage />);
    expect(await screen.findByRole("heading", { name: "Constituency Import", exact: true })).toBeInTheDocument();
    expect(screen.queryByText("Constituency imports need reviewer access")).not.toBeInTheDocument();
    await waitFor(() => expect(fetch.mock.calls.some(([url]) => url === "/api/constituency-import/runs?limit=8")).toBe(true));
    expect(fetch.mock.calls.every(([, options]) => !options?.method || options.method === "GET")).toBe(true);
    expect(localStorage.getItem("mgo-gpt:admin-view-mode")).toBe(view);
    expect(fetch.mock.calls.filter(([url]) => url === "/api/users/profile")).toHaveLength(1);
    expect(fetch.mock.calls.find(([url]) => url === "/api/users/profile")[1]).toMatchObject({ cache: "no-store" });
  });

  it.each(["mgo", "executive", "", "unknown"])("blocks %s even with a privileged workspace or session role", async (role) => {
    localStorage.setItem("mgo-gpt:admin-view-mode", "reviewer");
    profileReply = reply({ user: { id: 7, email, role, active: true }, workspaceUser: { id: 8, role: "admin" } });
    render(<ConstituencyImportPage />);
    expect(await screen.findByRole("heading", { name: "Constituency imports need reviewer access" })).toBeInTheDocument();
    expect(screen.queryByText("1. Upload CSV")).not.toBeInTheDocument();
    expect(importReads()).toEqual([]);
  });

  it("keeps profile failures separate from denied access and retries only the profile read", async () => {
    profileReply = reply({ error: "Private backend details" }, 503);
    render(<ConstituencyImportPage />);
    expect(await screen.findByRole("heading", { name: "Import access could not be checked" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("This check makes no changes to NXT");
    expect(screen.queryByText("Private backend details")).not.toBeInTheDocument();
    expect(screen.queryByText("Constituency imports need reviewer access")).not.toBeInTheDocument();
    expect(screen.queryByText("1. Upload CSV")).not.toBeInTheDocument();
    expect(importReads()).toEqual([]);
    profileReply = reply(allowedProfile());
    fireEvent.click(screen.getByRole("button", { name: "Retry access check" }));
    expect(await screen.findByRole("heading", { name: "Constituency Import", exact: true })).toBeInTheDocument();
    expect(fetch.mock.calls.filter(([url]) => url === "/api/users/profile")).toHaveLength(2);
  });

  it("does not inherit access from a workspace-only profile response", async () => {
    profileReply = reply({ workspaceUser: { id: 8, email, role: "admin" } });
    render(<ConstituencyImportPage />);
    expect(await screen.findByRole("heading", { name: "Import access could not be checked" })).toBeInTheDocument();
    expect(importReads()).toEqual([]);
  });

  it("blocks an inactive account without loading import data", async () => {
    const profile = allowedProfile();
    profile.user.active = false;
    profileReply = reply(profile);
    render(<ConstituencyImportPage />);
    expect(await screen.findByRole("heading", { name: "Constituency imports need reviewer access" })).toBeInTheDocument();
    expect(importReads()).toEqual([]);
  });

  it("offers a Home path for signed-out users without looking up a profile", () => {
    session.user = null;
    render(<ConstituencyImportPage />);
    expect(screen.getByRole("heading", { name: "Sign in to use imports" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to Home" })).toHaveAttribute("href", "/");
    expect(fetch).not.toHaveBeenCalled();
  });
});
