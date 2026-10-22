import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ManualCashPanel from "./ManualCashPanel";
const item = { key: "seed", label: "Original receipt", cents: 500000, receivedDate: null, origin: "initial", reason: "Confirmed received", archived: false };
const config = { label: "FY27", startsOn: "2026-07-01", endsOn: "2027-06-30", manual: { revision: "initial", entries: [item], history: [], historyCount: 0 } };
const json = (data, status = 200) => ({ ok: status === 200, status, json: async () => data });
beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("shows original entries without writing or querying NXT and hides editing from viewers", () => {
  render(<ManualCashPanel config={config} canManage={false} />);
  expect(screen.getByText("Original receipt")).toBeVisible(); expect(screen.getByText("FY27 (previously confirmed)")).toBeVisible();
  expect(screen.queryByRole("button")).not.toBeInTheDocument(); expect(fetch).not.toHaveBeenCalled();
});
it("adds a confirmed received entry and reports the updated goal to the dashboard", async () => {
  const onChange = vi.fn(); render(<ManualCashPanel config={config} canManage onChange={onChange} />);
  fireEvent.click(screen.getByRole("button", { name: "Add cash received" }));
  fireEvent.change(screen.getByLabelText("Description or receipt reference"), { target: { value: "Another receipt" } });
  fireEvent.change(screen.getByLabelText("Cash received amount"), { target: { value: "125.01" } });
  fireEvent.change(screen.getByLabelText("Receipt date"), { target: { value: "2026-10-18" } });
  fireEvent.change(screen.getByLabelText("Reason or source note"), { target: { value: "Separate source" } });
  expect(screen.getByRole("button", { name: "Save cash entry" })).toBeDisabled(); fireEvent.click(screen.getByRole("checkbox"));
  fetch.mockResolvedValue(json({ goal: { ...config, cents: 650000000 } }));
  fireEvent.click(screen.getByRole("button", { name: "Save cash entry" })); await screen.findByRole("status");
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ operation: "save", revision: "initial", input: { key: null, label: "Another receipt", amount: "125.01", receivedDate: "2026-10-18", reason: "Separate source", confirmed: true } });
  expect(onChange).toHaveBeenCalledWith({ ...config, cents: 650000000 });
});
it("requires a reason before archiving and preserves the entry on failure", async () => {
  render(<ManualCashPanel config={config} canManage onChange={vi.fn()} />); fireEvent.click(screen.getByRole("button", { name: "Archive Original receipt" }));
  expect(screen.getByRole("button", { name: "Archive entry" })).toBeDisabled(); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Reason or source note"), { target: { value: "Already in query" } });
  fetch.mockResolvedValue(json({ error: "Manual entries changed." }, 409)); fireEvent.click(screen.getByRole("button", { name: "Archive entry" }));
  await screen.findByRole("alert"); expect(screen.getByText("Original receipt")).toBeVisible(); expect(screen.getByLabelText("Reason or source note")).toHaveValue("Already in query");
});
it("requires a new duplicate-count confirmation after editing an amount and keeps drafts on reload", async () => {
  render(<ManualCashPanel config={config} canManage onChange={vi.fn()} />); fireEvent.click(screen.getByRole("button", { name: "Edit Original receipt" }));
  fireEvent.change(screen.getByLabelText("Reason or source note"), { target: { value: "Correction" } }); fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(screen.getByLabelText("Cash received amount"), { target: { value: "4500" } }); expect(screen.getByRole("checkbox")).not.toBeChecked();
  fireEvent.click(screen.getByRole("checkbox")); fetch.mockResolvedValueOnce(json({ error: "Conflict" }, 409));
  fireEvent.click(screen.getByRole("button", { name: "Save cash entry" })); await screen.findByRole("alert");
  fetch.mockResolvedValueOnce(json({ goal: config })); fireEvent.click(screen.getByRole("button", { name: "Reload manual entries" }));
  await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("reloaded")); expect(screen.getByLabelText("Cash received amount")).toHaveValue("4500");
});
