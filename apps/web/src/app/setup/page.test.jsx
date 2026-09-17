import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const { useUser } = vi.hoisted(() => ({ useUser: vi.fn() }));
vi.mock("@/utils/useUser", () => ({ default: useUser }));
import SetupPage from "./page";
import { isSetupStatus } from "@/components/SetupHub";

const snapshot = (isAdmin = true) => ({
  version: 1,
  viewerId: "7",
  isAdmin,
  readAt: "2026-09-17T15:00:00Z",
  sections: {
    organization: {
      state: "ready",
      summary: "Saved profile: Example University.",
      details: ["Review your saved labels."],
    },
    connection: {
      state: "needs_setup",
      summary: "No scheduled connection saved.",
      details: ["Only the account owner can connect."],
    },
    fundraisers: {
      state: "needs_setup",
      summary: "2 of 3 active fundraising workspaces mapped.",
      details: [],
    },
    sources: {
      state: "technical",
      summary: "Built-in rules require technical configuration.",
      details: ["Custom queries are editable."],
    },
    reports: {
      state: "ready",
      summary: "2 custom dashboards saved.",
      details: [],
    },
  },
});
const reply = (body, status = 200) => ({
  ok: status === 200,
  status,
  json: async () => body,
});
beforeEach(() => {
  vi.clearAllMocks();
  useUser.mockReturnValue({
    data: { email: "manager@example.test" },
    loading: false,
  });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply(snapshot())));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("renders five named areas from a single saved read, with technical detail collapsed", async () => {
  render(<SetupPage />);
  await screen.findByText("Saved profile: Example University.");
  for (const name of [
    "Organization & Terminology",
    "NXT Connection",
    "Fundraiser Mapping",
    "Data Sources",
    "Reports",
  ]) {
    expect(screen.getByRole("region", { name })).toBeVisible();
  }
  expect(
    screen.getByText(
      "Ready means saved setup is present, not a live NXT test.",
    ),
  ).toBeVisible();
  expect(screen.getByText(/Opening or reloading this hub/)).toBeVisible();
  const advanced = screen
    .getByText("Advanced settings & diagnostics")
    .closest("details");
  expect(advanced).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("Advanced settings & diagnostics"));
  expect(advanced).toHaveAttribute("open");
  expect(
    screen.getByRole("link", { name: "Integration Health (Admin only)" }),
  ).toHaveAttribute("href", "/integration-health");
  fireEvent.click(
    screen.getAllByText(/Details & limitations/, { selector: "summary" })[0],
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith(
    "/api/admin/setup-status",
    expect.objectContaining({
      cache: "no-store",
      signal: expect.any(AbortSignal),
    }),
  );
  expect(
    screen.queryByRole("button", {
      name: /^(save|run query|reconnect|refresh NXT)\b/i,
    }),
  ).not.toBeInTheDocument();
});

it("does not offer Admin diagnostics to Advancement Services", async () => {
  fetch.mockResolvedValueOnce(reply(snapshot(false)));
  render(<SetupPage />);
  await screen.findByText("Saved profile: Example University.");
  fireEvent.click(screen.getByText("Advanced settings & diagnostics"));
  expect(
    screen.queryByRole("link", { name: /Integration Health/ }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Field Settings" })).toBeVisible();
});

it("links only to existing editors, with real section anchors", async () => {
  const { container } = render(<SetupPage />);
  await screen.findByText("Saved profile: Example University.");
  for (const anchor of container.querySelectorAll("a[href]")) {
    const [path, fragment] = anchor.getAttribute("href").split("#");
    const file = resolve("src/app", `.${path}`, "page.jsx");
    expect(existsSync(file), path).toBe(true);
    if (fragment) {
      const source =
        readFileSync(file, "utf8") +
        readFileSync(
          resolve("src/components/OrganizationConfigurationStatus.jsx"),
          "utf8",
        );
      expect(source, fragment).toContain(`id="${fragment}"`);
    }
  }
});

it("renders a failed section as unknown while other areas remain usable", async () => {
  const data = snapshot();
  data.sections.connection = {
    state: "unknown",
    summary: "Saved setup could not be read.",
    details: [],
  };
  fetch.mockResolvedValueOnce(reply(data));
  render(<SetupPage />);
  await screen.findByText("Saved profile: Example University.");
  expect(
    within(screen.getByRole("region", { name: "NXT Connection" })).getByText(
      "Unknown",
    ),
  ).toBeVisible();
  expect(screen.getByRole("link", { name: "Set up reports" })).toBeVisible();
});

it.each([401, 403, 503])(
  "handles HTTP %s without leaking raw server responses",
  async (status) => {
    fetch.mockResolvedValueOnce({
      ...reply(null, status),
      json: async () => {
        throw new Error("private server HTML");
      },
    });
    render(<SetupPage />);
    const alert = await screen.findByRole("alert");
    expect(alert).not.toHaveTextContent("private server");
    expect(
      screen.queryByRole("region", { name: "NXT Connection" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Reload saved status" }),
    ).toBeEnabled();
  },
);

it("clears privileged results when reloading after access is revoked", async () => {
  render(<SetupPage />);
  await screen.findByText("Saved profile: Example University.");
  fetch.mockResolvedValueOnce(reply({}, 403));
  fireEvent.click(screen.getByRole("button", { name: "Reload saved status" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "active Admin and Advancement Services users only",
  );
  expect(
    screen.queryByText("Saved profile: Example University."),
  ).not.toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("does not fetch during sign-in loading and removes results when signed out", async () => {
  useUser.mockReturnValue({ data: null, loading: true });
  const view = render(<SetupPage />);
  expect(fetch).not.toHaveBeenCalled();
  useUser.mockReturnValue({
    data: { email: "manager@example.test" },
    loading: false,
  });
  view.rerender(<SetupPage />);
  await screen.findByText("Saved profile: Example University.");
  useUser.mockReturnValue({ data: null, loading: false });
  view.rerender(<SetupPage />);
  expect(
    screen.queryByText("Saved profile: Example University."),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent("Sign in");
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("ignores a stale response after switching signed-in accounts", async () => {
  let finishOldRead;
  fetch.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishOldRead = resolve;
      }),
  );
  const view = render(<SetupPage />);
  const oldSignal = fetch.mock.calls[0][1].signal;
  fetch.mockResolvedValueOnce(reply({}, 403));
  useUser.mockReturnValue({
    data: { email: "other@example.test" },
    loading: false,
  });
  view.rerender(<SetupPage />);
  await screen.findByRole("alert");
  await act(async () => finishOldRead(reply(snapshot())));
  expect(oldSignal.aborted).toBe(true);
  expect(
    screen.queryByText("Saved profile: Example University."),
  ).not.toBeInTheDocument();
});

it("aborts a pending read on unmount", () => {
  fetch.mockImplementation(() => new Promise(() => {}));
  const { unmount } = render(<SetupPage />);
  const signal = fetch.mock.calls[0][1].signal;
  expect(
    screen.getByRole("button", { name: "Reading saved setup..." }),
  ).toBeDisabled();
  unmount();
  expect(signal.aborted).toBe(true);
});

it("times out a stalled read without polling or keeping the retry button disabled", async () => {
  vi.useFakeTimers();
  fetch.mockImplementation(
    (_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError")),
        );
      }),
  );
  render(<SetupPage />);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(20_000);
  });
  expect(screen.getByRole("alert")).toHaveTextContent("timed out");
  expect(
    screen.getByRole("button", { name: "Reload saved status" }),
  ).toBeEnabled();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(60_000);
  });
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("rejects malformed saved status and permits an explicit retry", async () => {
  fetch.mockResolvedValueOnce(reply({ version: 1 }));
  render(<SetupPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("incomplete");
  fireEvent.click(screen.getByRole("button", { name: "Reload saved status" }));
  await waitFor(() =>
    expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
  );
  expect(
    await screen.findByText("Saved profile: Example University."),
  ).toBeVisible();
});

it("validates all status areas before rendering", () => {
  expect(isSetupStatus(snapshot())).toBe(true);
  for (const change of [
    (data) => {
      data.sections.connection.state = "bogus";
    },
    (data) => {
      delete data.sections.reports;
    },
    (data) => {
      data.readAt = "bad date";
    },
    (data) => {
      data.sections.sources.details = [null];
    },
  ]) {
    const data = snapshot();
    change(data);
    expect(isSetupStatus(data)).toBeFalsy();
  }
});
