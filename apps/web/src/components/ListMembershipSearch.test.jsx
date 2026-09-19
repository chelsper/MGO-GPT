import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ListMembershipSearch from "./ListMembershipSearch";
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
});
async function search() {
  fireEvent.click(screen.getByText("Add a constituent to this list"));
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
