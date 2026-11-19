import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { buildSignInHref } from "@/utils/signInNavigation";
const mocks = vi.hoisted(() => ({ credentials: vi.fn(), okta: vi.fn() }));
vi.mock("@/utils/useAuth", () => ({ default: () => ({
  signInWithCredentials: mocks.credentials, signInWithOkta: mocks.okta,
}) }));
import SignInPage from "./page";

const path = "/reports/project-prospecting/list-demo?view=saved#results";
const response = payload => ({ ok: true, json: async () => payload });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("location", {
    search: new URL(buildSignInHref(path), "https://app.test").search,
    href: "/account/signin", replace: vi.fn(),
  });
  vi.stubGlobal("fetch", vi.fn(async url => response(url === "/api/auth/providers"
    ? { "credentials-signin": {}, okta: {} } : null)));
  mocks.credentials.mockResolvedValue({ url: "https://app.test/" });
  mocks.okta.mockResolvedValue(undefined);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

async function submitCredentials() {
  fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "fictional@ju.edu" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "fictional-test-only" } });
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Sign In", exact: true })));
}

it("returns a password sign-in to the exact shared page, not the provider's Home URL", async () => {
  render(<SignInPage />);
  expect(await screen.findByText(/return to the page you opened/)).toBeVisible();
  await submitCredentials();
  await waitFor(() => expect(location.href).toBe(path));
  expect(mocks.credentials).toHaveBeenCalledExactlyOnceWith({
    email: "fictional@ju.edu", password: "fictional-test-only", callbackUrl: path, redirect: false,
  });
  expect(fetch.mock.calls.map(([url]) => url)).toEqual(["/api/auth/providers", "/api/auth/session"]);
});

it("passes the same validated return path through university SSO", async () => {
  render(<SignInPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Continue with Jacksonville University SSO" }));
  expect(mocks.okta).toHaveBeenCalledExactlyOnceWith({ callbackUrl: path, redirect: true });
  expect(mocks.credentials).not.toHaveBeenCalled();
});

it("returns an already signed-in user to the shared page without another sign-in", async () => {
  fetch.mockImplementation(async url => response(url === "/api/auth/session"
    ? { user: { email: "fictional@ju.edu" } } : { "credentials-signin": {} }));
  render(<SignInPage />);
  await waitFor(() => expect(location.replace).toHaveBeenCalledExactlyOnceWith(path));
  expect(mocks.credentials).not.toHaveBeenCalled();
  expect(mocks.okta).not.toHaveBeenCalled();
});

it.each(["", "?returnTo=https%3A%2F%2Foutside.test", "?returnTo=%2Faccount%2Fsignin", "?returnTo=%2Fapi%2Fwrite"])(
  "falls back to Home for direct or unsafe sign-in: %s", async search => {
    location.search = search;
    mocks.credentials.mockResolvedValue({ url: "https://outside.test/" });
    render(<SignInPage />);
    await submitCredentials();
    await waitFor(() => expect(location.href).toBe("/"));
    expect(mocks.credentials).toHaveBeenCalledWith(expect.objectContaining({ callbackUrl: "/" }));
  },
);

it("does not leave sign-in on a rejected password and retains the return path for retry", async () => {
  mocks.credentials.mockResolvedValueOnce({ error: "CredentialsSignin" });
  render(<SignInPage />);
  await submitCredentials();
  expect(await screen.findByText("Incorrect email or password. Try again.")).toBeVisible();
  expect(location.href).toBe("/account/signin");
  expect(location.replace).not.toHaveBeenCalled();
  await submitCredentials();
  await waitFor(() => expect(location.href).toBe(path));
});
