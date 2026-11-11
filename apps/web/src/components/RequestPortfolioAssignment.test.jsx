import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import RequestPortfolioAssignment from "./RequestPortfolioAssignment";
const props = { constituentId: "123", constituentName: "Example Donor", user: { id: 7, name: "Example Fundraiser" } };
const response = payload => ({ ok: true, json: async () => payload });
const saved = { status: "requested", reviewStatus: "Open", requestId: "1", message: "Request saved for Advancement Services review. No NXT assignment changed." };
beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
function begin() { fireEvent.click(screen.getByRole("button", { name: "Request portfolio assignment" })); }
function send() { fireEvent.click(screen.getByRole("button", { name: "Send to Advancement Services" })); }
it("makes review explicit and cancels in place without a request", () => {
  render(<RequestPortfolioAssignment {...props} />);
  expect(screen.getByText("Advancement Services review required")).toBeVisible();
  begin();
  expect(screen.getByText(/Example Fundraiser.*Lead Solicitor/)).toBeVisible();
  expect(screen.getByText(/This is a request for review, not an assignment/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("button", { name: "Request portfolio assignment" })).toBeEnabled();
  expect(fetch).not.toHaveBeenCalled();
});
it("submits an optional reason once and links to the request tracker, not a portfolio", async () => {
  fetch.mockResolvedValue(response(saved));
  render(<RequestPortfolioAssignment {...props} />);
  begin();
  fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "We met recently." } });
  send();
  expect(screen.getByRole("button", { name: "Checking request..." })).toBeDisabled();
  await screen.findByText(saved.message);
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][0]).toBe("/api/portfolio-assignment-requests");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ constituentId: "123", constituentName: "Example Donor", action: "submit", expectedUserId: "7", reason: "We met recently." });
  expect(screen.getByRole("button", { name: "Request open" })).toBeDisabled();
  expect(screen.getByRole("link", { name: "View my requests" })).toHaveAttribute("href", "/data-requests");
  expect(screen.queryByText("Assigned to you")).not.toBeInTheDocument();
});
it("does not link to another MGO's viewed request queue", async () => {
  fetch.mockResolvedValue(response(saved));
  render(<RequestPortfolioAssignment {...props} viewingOtherWorkspace />);
  begin(); send();
  await screen.findByText(saved.message);
  expect(screen.getByText(/Switch back to your own workspace/)).toBeVisible();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
});
it("recovers a lost response by checking status rather than resubmitting", async () => {
  fetch.mockRejectedValueOnce(new Error("timeout")).mockResolvedValueOnce(response(saved));
  render(<RequestPortfolioAssignment {...props} />);
  begin(); send();
  fireEvent.click(await screen.findByRole("button", { name: "Check request status" }));
  await screen.findByText(saved.message);
  expect(fetch.mock.calls.map(([, options]) => JSON.parse(options.body).action)).toEqual(["submit", "verify"]);
});
it("lets the user correct rejected input while keeping their reason", async () => {
  fetch.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "Check the request details." }) });
  render(<RequestPortfolioAssignment {...props} />);
  begin();
  fireEvent.change(screen.getByLabelText("Reason (optional)"), { target: { value: "Keep this reason" } });
  send();
  await screen.findByText("Check the request details.");
  begin();
  expect(screen.getByLabelText("Reason (optional)")).toHaveValue("Keep this reason");
});
it("does not get stuck on a hanging request and ignores its late response", async () => {
  let resolve;
  fetch.mockImplementation(() => new Promise(done => { resolve = done; }));
  vi.useFakeTimers();
  render(<RequestPortfolioAssignment {...props} />);
  begin(); send();
  await act(() => vi.advanceTimersByTimeAsync(30000));
  expect(screen.getByRole("button", { name: "Check request status" })).toBeEnabled();
  await act(async () => resolve(response(saved)));
  expect(screen.queryByText(saved.message)).not.toBeInTheDocument();
});
it("shows email failure as a warning without offering a duplicate request", async () => {
  fetch.mockResolvedValue(response({ ...saved, notificationWarning: "Saved in queue; email not confirmed." }));
  render(<RequestPortfolioAssignment {...props} />);
  begin(); send();
  await screen.findByText("Saved in queue; email not confirmed.");
  expect(screen.getByRole("button", { name: "Request open" })).toBeDisabled();
});
