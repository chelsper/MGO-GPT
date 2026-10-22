import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
const session = vi.hoisted(() => ({ user: { id: "auth-2" }, loading: false }));
vi.mock("@/utils/useUser", () => ({
  default: () => ({ data: session.user, loading: session.loading }),
}));
import Page from "./page";
const base = {
  viewerKey: "auth-2",
  holding: 25,
  inProgress: 2,
  hasDraft: true,
  readyToMail: 8,
  requests: { open: 3, inProgress: 1, overdue: 1 },
};
beforeEach(() => {
  session.user = { id: "auth-2" };
  session.loading = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(base)),
  );
});
afterEach(() => vi.unstubAllGlobals());
it("shows four one-click shortcuts with one read and no new review steps", async () => {
  render(<Page />);
  await screen.findByText("25");
  expect(
    screen.getByRole("link", { name: /Letters to review/ }),
  ).toHaveAttribute("href", "/stewardship/society-letters");
  expect(
    screen.getByRole("link", { name: /Batches in progress/ }),
  ).toHaveTextContent("Resume draft");
  expect(screen.getByRole("link", { name: /Ready to mail/ })).toHaveAttribute(
    "href",
    "/stewardship/society-letters?view=history&history=ready_to_mail",
  );
  expect(
    screen.getByRole("link", { name: /Assistance Requests/ }),
  ).toHaveAttribute("href", "/stewardship/requests");
  expect(screen.getByRole("link", { name: "Gift Inventory" })).toHaveAttribute(
    "href",
    "/stewardship/inventory",
  );
  expect(screen.getByText(/3 new, 1 in progress; 1 overdue/)).toBeVisible();
  expect(fetch).toHaveBeenCalledExactlyOnceWith(
    "/api/stewardship/overview",
    expect.objectContaining({ cache: "no-store" }),
  );
  fireEvent.focus(window);
  expect(fetch).toHaveBeenCalledOnce();
  expect(
    screen.queryByRole("button", { name: /send|approve|create/i }),
  ).toBeNull();
});
it("keeps the navigation usable while counts load", () => {
  fetch.mockImplementation(() => new Promise(() => {}));
  const view = render(<Page />);
  expect(screen.getByRole("link", { name: /Review letters/ })).toBeVisible();
  expect(screen.getByRole("link", { name: "Letter setup" })).toBeVisible();
  const signal = fetch.mock.calls[0][1].signal;
  view.unmount();
  expect(signal.aborted).toBe(true);
});
it.each([401, 403, 500])(
  "clears stale counts after a failed reload (%s), keeping normal links",
  async (status) => {
    render(<Page />);
    await screen.findByText("25");
    fetch.mockResolvedValueOnce(
      Response.json({ error: "private error" }, { status }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Reload counts" }));
    await screen.findByRole("alert");
    expect(screen.queryByText("25")).toBeNull();
    expect(screen.queryByText("private error")).toBeNull();
    expect(screen.getByRole("link", { name: "Gift Follow-ups" })).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);
  },
);
it("distinguishes no saved membership from a genuinely empty list", async () => {
  fetch.mockResolvedValueOnce(
    Response.json({ ...base, holding: null, hasDraft: false }),
  );
  render(<Page />);
  await screen.findByText(/set up or refresh this period/);
  expect(
    screen.getByRole("link", { name: /Letters to review/ }),
  ).toHaveTextContent("Not available");
  expect(
    screen.getByRole("link", { name: /Batches in progress/ }),
  ).toHaveAttribute(
    "href",
    "/stewardship/society-letters?view=history&history=in_progress",
  );
  fetch.mockResolvedValueOnce(Response.json({ ...base, holding: 0 }));
  fireEvent.click(screen.getByRole("button", { name: "Reload counts" }));
  await screen.findByText("0");
});
it("rejects another account's response and does not load when signed out", async () => {
  fetch.mockResolvedValueOnce(Response.json({ ...base, viewerKey: "other" }));
  const view = render(<Page />);
  await screen.findByRole("alert");
  expect(screen.queryByText("25")).toBeNull();
  session.user = null;
  view.rerender(<Page />);
  expect(
    screen.getByRole("link", { name: "Sign in to view stewardship" }),
  ).toBeVisible();
  expect(fetch).toHaveBeenCalledOnce();
});
