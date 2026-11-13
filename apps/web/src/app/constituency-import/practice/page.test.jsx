import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
const session = vi.hoisted(() => ({ user: { email: "operator@example.test", role: "admin" }, loading: false }));
vi.mock("@/utils/useUser", () => ({ default: () => ({ data: session.user, loading: session.loading }) }));
import Page from "./page";
let account, status;
beforeEach(() => {
  session.user = { email: "operator@example.test", role: "admin" }; status = 200;
  account = { id: 1, email: session.user.email, role: "reviewer", active: true };
  vi.stubGlobal("fetch", vi.fn(async (url, options) => {
    expect(url).toBe("/api/users/profile");
    expect(options.method || "GET").toBe("GET");
    return { status, ok: status === 200, json: async () => ({ user: account, workspaceUser: { role: "admin" } }) };
  }));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("practice account access", () => {
  it.each(["reviewer", "admin", "advancement_services"])("allows an active %s and only checks the saved account", async (role) => {
    account.role = role; render(<Page />);
    expect(await screen.findByRole("heading", { name: "Try an import safely" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: /Add custom fields/ }));
    fireEvent.click(screen.getByRole("button", { name: "Review fictional records" }));
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it.each([["mgo", true], ["executive", true], ["admin", false]])("blocks %s active=%s despite a privileged session or workspace", async (role, active) => {
    Object.assign(account, { role, active }); render(<Page />);
    expect(await screen.findByRole("heading", { name: "Import practice needs reviewer access" })).toBeVisible();
    expect(screen.queryByText("Practice examples")).not.toBeInTheDocument();
  });
  it("distinguishes a failed access check and retries only that read", async () => {
    status = 503; render(<Page />);
    expect(await screen.findByRole("heading", { name: "Practice access could not be checked" })).toBeVisible();
    status = 200; fireEvent.click(screen.getByRole("button", { name: "Retry access check" }));
    expect(await screen.findByRole("heading", { name: "Try an import safely" })).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("never looks up a profile when signed out", () => {
    session.user = null; render(<Page />);
    expect(screen.getByRole("heading", { name: "Sign in to use import practice" })).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });
});
