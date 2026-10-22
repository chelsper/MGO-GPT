import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FundraisingTrackerCard, FundraisingTrackerEditor } from "./FundraisingTracker";
import ReportDashboardPanels from "./ReportDashboardPanels";
import { newFundraisingTracker, trackerFingerprint, TRACKER_DONOR_VERSION } from "@/utils/fundraisingTracker";

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

describe("campaign donor table", () => {
  const donor = (id, name, pledged, received, committed = pledged) => ({ key: `constituent:${id}`, kind: "constituent", constituentId: id, name,
    pledgedCents: pledged, receivedCents: received, committedCents: committed });
  const snapshot = (donors) => ({ ...saved, donorVersion: TRACKER_DONOR_VERSION, donors,
    ...Object.fromEntries(["pledgedCents", "receivedCents", "committedCents"].map((field) => [field, donors.reduce((total, row) => total + row[field], 0)])) });

  it("lists amounts by donor with search, sort and reconciled totals, without requests", () => {
    render(<FundraisingTrackerCard panel={panel} saved={snapshot([donor("10", "Avery Example", 100000, 25000), donor("20", "Jordan Sample", 0, 50000, 50000)])} />);
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("columnheader").map((node) => node.textContent)).toEqual(["Donor", "Pledged", "Received", "Committed"]);
    const avery = within(table).getByRole("row", { name: /Avery Example/ });
    expect(within(avery).getAllByRole("cell").map((node) => node.textContent)).toEqual(["$1,000", "$250", "$1,000"]);
    fireEvent.change(screen.getByLabelText("Sort donors"), { target: { value: "receivedCents" } });
    expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Jordan Sample");
    fireEvent.change(screen.getByLabelText("Find a donor"), { target: { value: "10" } });
    expect(within(table).queryByText("Jordan Sample")).not.toBeInTheDocument();
    expect(within(table).getByRole("row", { name: /All campaign giving/ })).toHaveTextContent("$1,000$750$1,500");
    expect(screen.getByText("1-1 of 1 entries")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Find a donor"), { target: { value: "not found" } });
    expect(screen.getByText("No donors match your search.")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("paginates locally and clamps the current page when updated results are shorter", () => {
    const donors = Array.from({ length: 30 }, (_, index) => donor(String(index + 1), `Donor ${String(index + 1).padStart(2, "0")}`, 0, 10000, 10000));
    const { rerender } = render(<FundraisingTrackerCard panel={panel} saved={snapshot(donors)} />);
    expect(screen.getByText("1-25 of 30 entries")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous donors" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Next donors" }));
    expect(screen.getByText("26-30 of 30 entries")).toBeInTheDocument();
    expect(screen.queryByText("Donor 01")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next donors" })).toBeDisabled();
    rerender(<FundraisingTrackerCard panel={panel} saved={snapshot(donors.slice(0, 3))} />);
    expect(screen.getByText("1-3 of 3 entries")).toBeInTheDocument();
    expect(screen.getByText("Donor 01")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("distinguishes missing details, refresh in progress, and a verified empty campaign", () => {
    const { rerender } = render(<FundraisingTrackerCard panel={panel} saved={saved} />);
    expect(screen.getByText(/Donor details have not been loaded/)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    rerender(<FundraisingTrackerCard panel={panel} saved={{ ...saved, pending: true }} />);
    expect(screen.getByText(/Donor details are loading/)).toBeInTheDocument();
    rerender(<FundraisingTrackerCard panel={panel} saved={snapshot([])} />);
    expect(screen.getByText(/No countable gifts were found/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Find a donor")).not.toBeInTheDocument();
  });

  it("masks anonymous identities and explains unavailable names without losing their giving", () => {
    render(<FundraisingTrackerCard panel={panel} saved={snapshot([
      { ...donor("10", "Private name", 0, 10000, 10000), kind: "anonymous" },
      { ...donor("20", "Not verified", 0, 25000, 25000), kind: "unavailable" },
    ])} />);
    expect(screen.getByText("Anonymous giving")).toBeInTheDocument();
    expect(screen.getByText("Donor unavailable")).toBeInTheDocument();
    expect(screen.queryByText("Private name")).not.toBeInTheDocument();
    expect(screen.queryByText(/ID 10/)).not.toBeInTheDocument();
    expect(screen.getByText(/Some donor names could not be loaded/)).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /All campaign giving/ })).getAllByRole("cell").map((node) => node.textContent)).toEqual(["$0", "$350", "$350"]);
  });
});
