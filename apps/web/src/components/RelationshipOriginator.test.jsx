import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

it("associates each compact disclosure with its own initially hidden panel", async () => {
  render(<><RelationshipOriginator constituentId="200" /><RelationshipOriginator constituentId="201" /></>);
  const toggles = screen.getAllByRole("button", { name: "Relationship originator" });
  const panels = toggles.map(button => document.getElementById(button.getAttribute("aria-controls")));
  expect(panels[0]).not.toBe(panels[1]);
  for (const [index, button] of toggles.entries()) {
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(panels[index]).not.toBeVisible();
  }
  expect(fetch).not.toHaveBeenCalled();
  fireEvent.click(toggles[0]);
  await screen.findByRole("button", { name: "Record me as originator" });
  expect(toggles[0]).toHaveAttribute("aria-expanded", "true");
  expect(panels[0]).toBeVisible();
  expect(panels[1]).not.toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch).toHaveBeenCalledWith("/api/blackbaud/constituents/200/relationship-originator", { cache: "no-store" });
});

it("keeps an Admin's correction draft when collapsed without another NXT check", async () => {
  fetch.mockResolvedValue(response({ ...review, admin: true, canClaim: false, canCorrect: true,
    fields: [{ id: "71", value: "Other", date: "2026-07-01" }] }));
  render(<RelationshipOriginator constituentId="200" />);
  const toggle = screen.getByRole("button", { name: "Relationship originator" });
  fireEvent.click(toggle);
  await screen.findByRole("button", { name: "Save originator in NXT" });
  fireEvent.change(screen.getByLabelText("Originator"), { target: { value: "1" } });
  fireEvent.change(screen.getByLabelText("When did the relationship begin?"), { target: { value: "2025-07-01" } });
  fireEvent.change(screen.getByLabelText("Reason for correction"), { target: { value: "Corrected attribution" } });
  fireEvent.click(toggle);
  expect(screen.queryByLabelText("Originator")).toBeNull();
  fireEvent.click(toggle);
  expect(screen.getByLabelText("Originator")).toHaveValue("1");
  expect(screen.getByLabelText("When did the relationship begin?")).toHaveValue("2025-07-01");
  expect(screen.getByLabelText("Reason for correction")).toHaveValue("Corrected attribution");
  expect(fetch).toHaveBeenCalledTimes(1);
  fetch.mockResolvedValueOnce(response({ message: "Saved in NXT" }));
  fireEvent.click(screen.getByRole("button", { name: "Save originator in NXT" }));
  await screen.findByText("Saved in NXT");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ ownerUserId: "1", originDate: "2025-07-01", reason: "Corrected attribution", fingerprint: "version" });
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  expect(screen.getByRole("status")).toHaveTextContent("Saved in NXT");
  expect(screen.queryByRole("button", { name: "Save originator in NXT" })).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("does not start duplicate checks when collapsed and reopened while loading", async () => {
  let finish;
  fetch.mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
  render(<RelationshipOriginator constituentId="200" />);
  const toggle = screen.getByRole("button", { name: "Relationship originator" });
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(screen.getByRole("button", { name: "Check NXT" })).toBeDisabled();
  await act(async () => finish(response(review)));
  expect(screen.getByRole("button", { name: "Record me as originator" })).toBeEnabled();
});

it("preserves an uncertain save warning and retry protection after collapsing", async () => {
  render(<RelationshipOriginator constituentId="200" />);
  const toggle = screen.getByRole("button", { name: "Relationship originator" });
  fireEvent.click(toggle);
  const save = await screen.findByRole("button", { name: "Record me as originator" });
  fetch.mockResolvedValueOnce(response({ error: "Check NXT before trying again." }, false));
  fireEvent.click(save);
  await screen.findByRole("alert");
  fireEvent.click(toggle);
  fireEvent.click(toggle);
  expect(screen.getByRole("alert")).toHaveTextContent("Check NXT before trying again.");
  expect(screen.getByRole("button", { name: "Record me as originator" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Check NXT" })).toBeEnabled();
  expect(fetch).toHaveBeenCalledTimes(2);
});
