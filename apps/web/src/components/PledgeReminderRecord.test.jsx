import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PledgeReminderRecord from "./PledgeReminderRecord";
import PledgeReminderHistory from "./PledgeReminderHistory";
const snapshotId = "10000000-0000-4000-8000-000000000001";
const reminder = { snapshotId, name: "Avery Example", lookupId: "P100", letterDate: "2026-11-19", preparedOn: "2026-11-19", email: "avery@example.test", amountDueCents: 50000 };
const saved = { state: "saved", actionId: "90", sentDate: "2026-11-20", message: "Staff-confirmed reminder sending recorded and verified in NXT. This is not proof of email delivery." };
const response = receipt => Response.json({ today: "2026-11-20", reminder, receipt: receipt || null });
beforeEach(() => { vi.stubGlobal("fetch", vi.fn(async () => response())); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
async function open() {
  fireEvent.click(screen.getByRole("button", { name: "Record reminder sent in NXT" }));
  await screen.findByLabelText("Actual sending date");
}
describe("explicit staff sending confirmation", () => {
  it("does nothing on mount and requires the exact confirmation before submitting", async () => {
    render(<PledgeReminderRecord snapshotId={snapshotId} />); expect(fetch).not.toHaveBeenCalled(); await open();
    const save = screen.getByRole("button", { name: "I sent this - record in NXT" }); expect(save).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox")); fetch.mockResolvedValueOnce(Response.json({ receipt: saved }));
    fireEvent.click(save); await screen.findByText(/Staff-confirmed reminder sending recorded/);
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ snapshotId, operation: "record", confirm: true, sentDate: "2026-11-20" });
    expect(screen.queryByRole("button", { name: "I sent this - record in NXT" })).not.toBeInTheDocument();
  });
  it("clears confirmation on a date change and blocks future or pre-preparation dates", async () => {
    render(<PledgeReminderRecord snapshotId={snapshotId} />); await open(); fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.change(screen.getByLabelText("Actual sending date"), { target: { value: "2026-11-21" } });
    expect(screen.getByRole("checkbox")).not.toBeChecked(); fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "I sent this - record in NXT" })).toBeDisabled();
  });
  it("requires saved-status reload after an uncertain response, not another create", async () => {
    render(<PledgeReminderRecord snapshotId={snapshotId} />); await open(); fireEvent.click(screen.getByRole("checkbox"));
    fetch.mockRejectedValueOnce(new Error("lost response")); fireEvent.click(screen.getByRole("button", { name: "I sent this - record in NXT" }));
    await screen.findByRole("alert"); expect(screen.queryByRole("button", { name: "I sent this - record in NXT" })).not.toBeInTheDocument();
    fetch.mockResolvedValueOnce(response({ state: "review", actionId: "90", message: "Do not record again" }));
    fireEvent.click(screen.getByRole("button", { name: "Reload saved status" })); await screen.findByText("Do not record again");
    expect(screen.queryByRole("button", { name: "I sent this - record in NXT" })).not.toBeInTheDocument();
    fetch.mockResolvedValueOnce(Response.json({ receipt: saved })); fireEvent.click(screen.getByRole("button", { name: "Verify existing NXT action only" }));
    await screen.findByText(/Staff-confirmed reminder sending recorded/);
    expect(JSON.parse(fetch.mock.calls[3][1].body)).toEqual({ snapshotId, operation: "verify", actionId: "90" });
  });
  it("does not offer recording or verification for another staff member's attempt", async () => {
    fetch.mockResolvedValue(response({ state: "review", otherStaff: true, message: "Already being recorded" }));
    render(<PledgeReminderRecord snapshotId={snapshotId} />); fireEvent.click(screen.getByRole("button", { name: "Record reminder sent in NXT" }));
    await screen.findByText(/Another staff member/); expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Verify existing NXT action only" })).not.toBeInTheDocument();
  });
  it("requires an existing numeric ID when recovering an unknown action ID", async () => {
    fetch.mockResolvedValue(response({ state: "review", message: "Needs verification" }));
    render(<PledgeReminderRecord snapshotId={snapshotId} />); fireEvent.click(screen.getByRole("button", { name: "Record reminder sent in NXT" }));
    await screen.findByLabelText("Existing NXT action system record ID");
    expect(screen.getByRole("button", { name: "Verify existing NXT action only" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Existing NXT action system record ID"), { target: { value: "90" } });
    expect(screen.getByRole("button", { name: "Verify existing NXT action only" })).toBeEnabled();
  });
  it("blocks double clicks and aborts on unmount without retrying", async () => {
    let signal;
    render(<PledgeReminderRecord snapshotId={snapshotId} />); await open(); fireEvent.click(screen.getByRole("checkbox"));
    fetch.mockImplementation((url, options) => new Promise((resolve, reject) => { signal = options.signal; signal.addEventListener("abort", () => reject(new Error("aborted"))); }));
    const button = screen.getByRole("button", { name: "I sent this - record in NXT" }); fireEvent.click(button); fireEvent.click(button);
    expect(fetch).toHaveBeenCalledTimes(2); await act(async () => cleanup()); expect(signal.aborted).toBe(true);
  });
  it("loads saved history only when opened and preserves it on a failed reload", async () => {
    fetch.mockResolvedValueOnce(Response.json({ reminders: [reminder], today: "2026-11-20" }));
    render(<PledgeReminderHistory />); expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Saved pledge reminders and NXT logging" }));
    await screen.findByRole("heading", { name: /Avery Example/ }); expect(fetch.mock.calls[0][1].method).toBeUndefined();
    fetch.mockRejectedValueOnce(new Error("offline")); fireEvent.click(screen.getByRole("button", { name: "Reload saved reminders" }));
    await screen.findByRole("alert"); expect(screen.getByRole("heading", { name: /Avery Example/ })).toBeInTheDocument();
  });
});
