import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
vi.mock("@/components/WorkflowReturnLink", () => ({ default: ({ href }) => <a href={href}>Back to received items</a> }));
vi.mock("@/utils/useUser", () => ({ default: () => ({ data: { id: "session" } }) }));
import { GiftHistoryImport } from "./page";
const response = state => ({ ok: true, json: async () => ({ state, viewerKey: "2", sessionKey: "session", items: [{ id: "1", name: "Blanket" }] }) });
beforeEach(() => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ version: 1, config: {}, job: null }))); });
it("loads saved state without running a query and requires source confirmation", async () => {
  render(<GiftHistoryImport sessionKey="session" />);
  const query = await screen.findByLabelText("NXT query system record ID");
  fireEvent.change(query, { target: { value: "31053" } });
  expect(screen.getByRole("button", { name: "Load query" })).toBeDisabled();
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByLabelText(/My connected NXT account/));
  fetch.mockResolvedValueOnce(response({ version: 2, config: { queryId: "31053" }, job: { stage: "query", canContinue: true, nextCheckAt: new Date(Date.now() + 15000).toISOString() } }));
  fireEvent.click(screen.getByRole("button", { name: "Load query" }));
  await screen.findByText("NXT is preparing your query");
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({ operation: "start", queryId: "31053", confirmed: true });
  expect(screen.getByRole("button", { name: "Check query status" })).toBeDisabled();
});
it("offers a resumable recipient check without importing or polling automatically", async () => {
  fetch.mockResolvedValue(response({ version: 3, config: { queryId: "31053" }, job: { stage: "resolving", canContinue: true, preview: { rows: [{ constituentId: "" }, { constituentId: "100" }] } } }));
  render(<GiftHistoryImport sessionKey="session" />);
  await screen.findByText(/1 of 2 gift records verified/);
  expect(fetch).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "Continue recipient checks" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetch.mock.calls[1][1].body).operation).toBe("resolve");
});
it("rejects a response from a changed signed-in user", async () => {
  render(<GiftHistoryImport sessionKey="other-session" />);
  expect(await screen.findByRole("alert")).toHaveTextContent(/sign-in changed/);
  expect(screen.queryByRole("button", { name: "Load query" })).not.toBeInTheDocument();
});
