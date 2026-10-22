import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import RelationshipOriginator from "./RelationshipOriginator";
const review = { fields: [], fingerprint: "version", canClaim: true, canCorrect: false, selfUserId: "1",
  today: "2026-10-06", fundraisers: [{ id: "1", name: "Ada" }] };
const response = (data, ok = true) => ({ ok, json: async () => data });
beforeEach(() => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(review))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("does not call NXT until the user opens the originator control", async () => {
  render(<RelationshipOriginator constituentId="200" />);
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Relationship originator" }));
  await screen.findByRole("button", { name: "Record me as originator" });
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("sends the reviewed version and introduction date without accepting arbitrary names", async () => {
  render(<RelationshipOriginator constituentId="200" />);
  fireEvent.click(screen.getByRole("button", { name: "Relationship originator" }));
  const save = await screen.findByRole("button", { name: "Record me as originator" });
  fireEvent.change(screen.getByLabelText("When did the relationship begin?"), { target: { value: "2025-07-01" } });
  fetch.mockResolvedValueOnce(response({ message: "Saved in NXT" }));
  fireEvent.click(save);
  await screen.findByText("Saved in NXT");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ ownerUserId: "1", originDate: "2025-07-01", reason: "", fingerprint: "version" });
});
it("disables resending after an uncertain response and offers a read-only check", async () => {
  render(<RelationshipOriginator constituentId="200" />);
  fireEvent.click(screen.getByRole("button", { name: "Relationship originator" }));
  const save = await screen.findByRole("button", { name: "Record me as originator" });
  fetch.mockResolvedValueOnce(response({ error: "Check NXT" }, false));
  fireEvent.click(save);
  await screen.findByRole("alert");
  expect(save).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Check NXT" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
  expect(fetch.mock.calls[2][1].method).toBeUndefined();
});
it("does not offer an MGO an edit for someone else's existing originator", async () => {
  fetch.mockResolvedValue(response({ ...review, canClaim: false, fields: [{ id: "71", value: "Other", date: "2026-07-01" }] }));
  render(<RelationshipOriginator constituentId="200" />);
  fireEvent.click(screen.getByRole("button", { name: "Relationship originator" }));
  await screen.findByText("Ask an Admin to correct an existing originator.");
  expect(screen.queryByRole("button", { name: "Record me as originator" })).toBeNull();
});
