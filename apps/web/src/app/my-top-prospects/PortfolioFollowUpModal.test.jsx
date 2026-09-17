import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PortfolioFollowUpModal from "./PortfolioFollowUpModal";

let client;
beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => [{ id: 7, name: "Test MGO" }] }));
});
afterEach(() => { cleanup(); client.clear(); vi.unstubAllGlobals(); });

async function discussion() {
  const onClose = vi.fn();
  render(<QueryClientProvider client={client}><PortfolioFollowUpModal kind="discussion"
    person={{ constituentId: "100", prospectId: 40, name: "Test Donor" }} onClose={onClose} /></QueryClientProvider>);
  await screen.findByRole("option", { name: "Test MGO" });
  fireEvent.change(screen.getByLabelText(/Discussion subject/), { target: { value: "  Plan visit  " } });
  fireEvent.change(screen.getByLabelText("Discussion notes"), { target: { value: "  Bring proposal  " } });
  fireEvent.change(screen.getByLabelText("Discuss by"), { target: { value: "2026-09-30" } });
  fireEvent.change(screen.getByLabelText("Share with teammate"), { target: { value: "7" } });
  return onClose;
}

it("loads teammates and submits the existing local discussion contract, not an NXT action", async () => {
  await discussion();
  expect(fetch).toHaveBeenCalledExactlyOnceWith("/api/users/mgos");
  fetch.mockResolvedValueOnce({ ok: true, json: async () => ({ id: 50 }) });
  fireEvent.click(screen.getByRole("button", { name: "Save discussion" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Team discussion saved for Test Donor"));
  expect(screen.getByRole("status")).toHaveTextContent("No NXT action was created");
  expect(fetch).toHaveBeenCalledTimes(2);
  const [url, options] = fetch.mock.calls[1];
  expect(url).toBe("/api/discussion-items");
  expect(options.method).toBe("POST");
  expect(JSON.parse(options.body)).toEqual({ prospectId: 40, constituentId: "100",
    subject: "Plan visit", body: "Bring proposal", dueDate: "2026-09-30", assignedUserId: "7", taggedUserIds: [7] });
});

it("blocks duplicate saves and dismissal in flight and retains the entire failed discussion draft", async () => {
  const onClose = await discussion();
  let finish;
  fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const form = screen.getByRole("button", { name: "Save discussion" }).closest("form");
  fireEvent.submit(form);
  fireEvent.submit(form);
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
  fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => finish({ ok: false, json: async () => ({ error: "Save unavailable" }) }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Save unavailable");
  expect(screen.getByLabelText(/Discussion subject/)).toHaveValue("  Plan visit  ");
  expect(screen.getByLabelText("Discussion notes")).toHaveValue("  Bring proposal  ");
  expect(screen.getByLabelText("Discuss by")).toHaveValue("2026-09-30");
  expect(screen.getByLabelText("Share with teammate")).toHaveValue("7");
  expect(screen.getByRole("button", { name: "Save discussion" })).toBeEnabled();
  expect(fetch).toHaveBeenCalledTimes(2);
});
