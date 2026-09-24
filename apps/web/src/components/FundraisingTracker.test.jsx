import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FundraisingTrackerCard, FundraisingTrackerEditor } from "./FundraisingTracker";
import ReportDashboardPanels from "./ReportDashboardPanels";
import { newFundraisingTracker, trackerFingerprint } from "@/utils/fundraisingTracker";

const panel = { ...newFundraisingTracker("campaign", true), funds: [{ id: "123", name: "A-Train Campaign" }] };
const saved = { key: panel.key, fingerprint: trackerFingerprint(panel), committedCents: 20000000, receivedCents: 12500000, refreshedAt: "2026-09-24T12:00:00Z", pending: false };
beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("fundraising tracker presentation", () => {
  it("renders the goal, 75% milestone and separate saved totals without fetching NXT", () => {
    render(<ReportDashboardPanels configuration={{ panels: [panel] }} snapshot={{ trackers: [saved] }} />);
    expect(screen.getByRole("heading", { name: "The A-Train Campaign" })).toBeInTheDocument();
    expect(screen.getByText("$250,000")).toBeInTheDocument();
    expect(screen.getByText(/\$187,500/)).toHaveTextContent("75%");
    expect(within(screen.getByRole("region", { name: "Revenue committed" })).getByText("$200,000")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Revenue received" })).getByText("$125,000")).toBeInTheDocument();
    expect(screen.getByText("Milestone reached")).toBeInTheDocument();
    expect(screen.getByText("$62,500 to milestone")).toBeInTheDocument();
    expect(screen.queryByText("$325,000")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("supports one-sided display, caps progress over the goal, and treats zero as known", () => {
    const { rerender } = render(<FundraisingTrackerCard panel={{ ...panel, display: "received" }} saved={{ ...saved, receivedCents: 30000000 }} />);
    expect(screen.queryByRole("region", { name: "Revenue committed" })).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "250000");
    expect(screen.getByText(/120% of goal/)).toBeInTheDocument();
    rerender(<FundraisingTrackerCard panel={{ ...panel, display: "received", milestone: null }} saved={{ ...saved, receivedCents: 0 }} />);
    expect(screen.getByText("$0")).toBeInTheDocument();
    expect(screen.queryByText("Milestone")).not.toBeInTheDocument();
  });
  it("does not show stale source values or missing values as zero", () => {
    const { rerender } = render(<FundraisingTrackerCard panel={panel} />);
    expect(screen.getAllByText("Not refreshed")).toHaveLength(2);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    rerender(<FundraisingTrackerCard panel={{ ...panel, funds: [{ id: "456", name: "Different" }] }} saved={saved} />);
    expect(screen.getAllByText("Not refreshed")).toHaveLength(2);
    expect(screen.queryByText("$200,000")).not.toBeInTheDocument();
  });
  it("shows retained totals without exposing technical errors", () => {
    render(<FundraisingTrackerCard panel={panel} saved={{ ...saved, error: "internal status 429", pending: true }} />);
    expect(screen.getByText("$200,000")).toBeInTheDocument();
    expect(screen.getByText(/Showing the last successful totals/)).toBeInTheDocument();
    expect(screen.queryByText(/internal status/)).not.toBeInTheDocument();
  });
  it("loads the fund directory only by explicit request and selects verified IDs", async () => {
    fetch.mockResolvedValue({ ok: true, json: async () => ({ funds: [{ id: "123", name: "A-Train Campaign", lookupId: "TRAIN" }, { id: "456", name: "Annual Fund" }], nextOffset: null }) });
    const onChange = vi.fn();
    render(<FundraisingTrackerEditor panel={newFundraisingTracker("campaign", true)} onChange={onChange} />);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Load NXT funds" }));
    const checkbox = await screen.findByRole("checkbox", { name: /A-Train Campaign/ });
    expect(screen.queryByRole("checkbox", { name: /Annual Fund/ })).not.toBeInTheDocument();
    fireEvent.click(checkbox);
    expect(onChange).toHaveBeenCalledWith({ funds: [{ id: "123", name: "A-Train Campaign" }] });
    await waitFor(() => expect(screen.getByRole("button", { name: "Load more NXT funds" })).toBeDisabled());
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST", body: '{"offset":0}' });
  });
  it("keeps dates optional and exposes them only for a selected range", () => {
    const onChange = vi.fn();
    const { rerender } = render(<FundraisingTrackerEditor panel={panel} onChange={onChange} />);
    expect(screen.queryByLabelText("Start date")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Giving period"), { target: { value: "date_range" } });
    expect(onChange).toHaveBeenCalledWith({ period: "date_range", startDate: "", endDate: "" });
    rerender(<FundraisingTrackerEditor panel={{ ...panel, period: "date_range", startDate: "2026-01-01", endDate: "2026-12-31" }} onChange={onChange} />);
    expect(screen.getByLabelText("Start date")).toHaveValue("2026-01-01");
    expect(screen.getByLabelText("End date")).toHaveValue("2026-12-31");
  });
});
