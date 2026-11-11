import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ListMembershipSearch from "./ListMembershipSearch";
import { projectSource } from "@/utils/projectProspecting";
import { LIST_MEMBERSHIP_TIMEOUT_MS } from "@/utils/listMembershipRequest";
const report = {
  key: "list-demo",
  title: "Demo",
  revision: "1",
  dataConfiguration: { fieldCategory: "Interests", fieldDescription: "Golf" },
};
const response = (payload, status = 200) => ({
  ok: status < 400,
  status,
  json: async () => payload,
});
beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
async function search(project = false) {
  fireEvent.click(screen.getByText(project ? "Add a constituent to this project" : "Add a constituent to this list"));
  fireEvent.change(screen.getByLabelText("Find an NXT constituent"), {
    target: { value: "Example" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Search NXT" }));
  await screen.findByText("Example Person");
}
const people = {
  results: [
    { name: "Example Person", lookupId: "ABC", blackbaudConstituentId: "123" },
  ],
};
it("does not search on mount and sends uncertain additions to verification, not another add", async () => {
  fetch
    .mockResolvedValueOnce(response(people))
    .mockRejectedValueOnce(new Error("Network interrupted"))
    .mockResolvedValueOnce(
      response({ status: "already_present", message: "Verified" }),
    );
  render(<ListMembershipSearch report={report} />);
  expect(fetch).not.toHaveBeenCalled();
  await search();
  expect(screen.getByRole("link", { name: "Open NXT record" })).toHaveAttribute(
    "target",
    "_blank",
  );
  fireEvent.click(screen.getByRole("button", { name: "Add to list" }));
  fireEvent.click(await screen.findByRole("button", { name: "Check status" }));
  await screen.findByText("Verified");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({
    action: "add",
    constituentId: "123",
    revision: "1",
    value: "Golf",
  });
  expect(JSON.parse(fetch.mock.calls[2][1].body).action).toBe("verify");
  expect(
    screen.getByRole("button", { name: "Confirmed in NXT" }),
  ).toBeDisabled();
});
it("permits correcting pre-write validation errors without suggesting the request was sent", async () => {
  fetch
    .mockResolvedValueOnce(response(people))
    .mockResolvedValueOnce(
      response({ error: "Choose an existing NXT description" }, 422),
    );
  render(<ListMembershipSearch report={report} />);
  await search();
  fireEvent.click(screen.getByRole("button", { name: "Add to list" }));
  await screen.findByText("Choose an existing NXT description");
  expect(screen.getByRole("button", { name: "Add to list" })).toBeEnabled();
  expect(
    screen.queryByRole("button", { name: "Check status" }),
  ).not.toBeInTheDocument();
});
it("does not write when confirmation is cancelled", async () => {
  fetch.mockResolvedValueOnce(response(people));
  window.confirm.mockReturnValue(false);
  render(<ListMembershipSearch report={report} />);
  await search();
  fireEvent.click(screen.getByRole("button", { name: "Add to list" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
});
const project = { ...report, dataConfiguration: { ...projectSource(), fieldCategory: "Prospect Research", fieldDescription: "The Center" } };
it("shows the fixed NXT field separately from tags and confirms before adding to a project", async () => {
  fetch.mockResolvedValueOnce(response(people)).mockResolvedValueOnce(response({ status: "added", message: "Added and verified in NXT" }));
  render(<ListMembershipSearch report={project} />);
  await search(true);
  expect(screen.getByText(/Project tags are separate/)).toBeVisible();
  expect(screen.queryByLabelText("Description to add")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Add to project" }));
  await screen.findByText("Added and verified in NXT");
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('Prospect Research with value "The Center"'));
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ constituentId: "123", action: "add", value: "The Center", revision: "1" });
  expect(screen.getByRole("button", { name: "Confirmed in NXT" })).toBeDisabled();
});
it("recovers from a stalled addition with verification only and ignores a late write response", async () => {
  let resolve;
  fetch.mockResolvedValueOnce(response(people))
    .mockImplementationOnce(() => new Promise(done => { resolve = done; }))
    .mockResolvedValueOnce(response({ status: "already_present", message: "Verified without another add" }));
  render(<ListMembershipSearch report={project} />);
  await search(true);
  vi.useFakeTimers();
  fireEvent.click(screen.getByRole("button", { name: "Add to project" }));
  expect(screen.getByRole("button", { name: "Checking..." })).toBeDisabled();
  await act(() => vi.advanceTimersByTimeAsync(LIST_MEMBERSHIP_TIMEOUT_MS));
  expect(screen.getByText(/addition may have finished/)).toBeVisible();
  await act(async () => resolve(response({ status: "added", message: "Late reply" })));
  expect(screen.queryByText("Late reply")).not.toBeInTheDocument();
  await act(async () => fireEvent.click(screen.getByRole("button", { name: "Check status" })));
  expect(screen.getByText("Verified without another add")).toBeVisible();
  expect(fetch.mock.calls.slice(1).map(([, options]) => JSON.parse(options.body).action)).toEqual(["add", "verify"]);
});
it("offers a new explicit add only when verification confirms no recorded submission", async () => {
  fetch.mockResolvedValueOnce(response(people))
    .mockRejectedValueOnce(new Error("Connection unavailable"))
    .mockResolvedValueOnce(response({ status: "not_submitted", message: "Nothing was submitted. You can add again." }))
    .mockResolvedValueOnce(response({ status: "added", message: "Verified after reconnecting" }));
  render(<ListMembershipSearch report={project} />);
  await search(true);
  fireEvent.click(screen.getByRole("button", { name: "Add to project" }));
  fireEvent.click(await screen.findByRole("button", { name: "Check status" }));
  await screen.findByText("Nothing was submitted. You can add again.");
  expect(fetch).toHaveBeenCalledTimes(3);
  fireEvent.click(screen.getByRole("button", { name: "Add to project" }));
  await screen.findByText("Verified after reconnecting");
  expect(window.confirm).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls.slice(1).map(([, options]) => JSON.parse(options.body).action)).toEqual(["add", "verify", "add"]);
});
