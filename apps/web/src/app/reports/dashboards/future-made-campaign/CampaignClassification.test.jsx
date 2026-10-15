import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import CampaignClassification from "./CampaignClassification";

function fixture({ total = 10000, philanthropic = 7000, investment = 3000 } = {}) {
  return { runId: "saved", effectiveCents: total, segments: {
    committed: { status: "ready", cents: total },
    received: { status: "ready", cents: 8000 },
    classification: { status: "ready", philanthropicCents: philanthropic, investmentCents: investment,
      philanthropicReceivedCents: 5000, investmentReceivedCents: 3000 },
  } };
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("shows complementary shares from saved amounts, never adding investment to the campaign", () => {
  render(<CampaignClassification data={fixture()} />);
  const chart = screen.getByRole("img");
  expect(chart).toHaveAccessibleName("Committed campaign composition: Philanthropic $70.00 (70%); Comprehensive Investment $30.00 (30%). Total $100.00.");
  const bars = chart.querySelectorAll('[aria-hidden="true"] > span');
  expect(bars[0]).toHaveStyle({ width: "70%" });
  expect(bars[1]).toHaveStyle({ width: "30%" });
  expect(screen.getByRole("button", { name: "Committed" })).toHaveAttribute("aria-pressed", "true");
  const table = screen.getByRole("table", { name: "Campaign investment and philanthropic totals" });
  expect(screen.getByRole("region", { name: "Exact campaign category amounts" })).toHaveAttribute("tabindex", "0");
  expect(within(table).getAllByRole("row")[1]).toHaveTextContent("Comprehensive Investment$30.00$30.00");
  expect(within(table).getAllByRole("row")[2]).toHaveTextContent("Philanthropic$70.00$50.00");
});

it("switches only the local chart view without requests or edits to saved data", () => {
  const data = fixture(), before = JSON.stringify(data), fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  render(<CampaignClassification data={data} />);
  fireEvent.click(screen.getByRole("button", { name: "Received to date" }));
  expect(screen.getByRole("img")).toHaveAccessibleName("Received to date campaign composition: Philanthropic $50.00 (62.5%); Comprehensive Investment $30.00 (37.5%). Total $80.00.");
  expect(screen.getByRole("button", { name: "Received to date" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Committed" })).toHaveAttribute("aria-pressed", "false");
  fireEvent.click(screen.getByRole("button", { name: "Committed" }));
  expect(screen.getByRole("img")).toHaveAccessibleName(/Total \$100.00/);
  expect(JSON.stringify(data)).toBe(before);
  expect(fetch).not.toHaveBeenCalled();
});

it.each(["snapshot", "classification"])("does not chart unconfigured %s amounts", missing => {
  const data = fixture();
  if (missing === "snapshot") data.runId = null;
  else data.segments.classification.status = "source_needed";
  render(<CampaignClassification data={data} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.getByText(/They are not assumed to be zero/)).toBeInTheDocument();
});

it("disables unavailable Received and safely falls back if refreshed data removes that view", () => {
  const data = fixture();
  const { rerender } = render(<CampaignClassification data={data} />);
  fireEvent.click(screen.getByRole("button", { name: "Received to date" }));
  const withoutReceived = { ...data, segments: { ...data.segments, received: { status: "source_needed", cents: null } } };
  rerender(<CampaignClassification data={withoutReceived} />);
  expect(screen.getByRole("button", { name: "Received to date" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Committed" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("img")).toHaveAccessibleName(/^Committed campaign composition/);
  expect(screen.queryByRole("columnheader", { name: "Received to date" })).not.toBeInTheDocument();
  expect(screen.getByText(/needs saved pledge-balance data/)).toBeInTheDocument();
});

it("keeps legacy recognition separate from a configured committed metric", () => {
  const data = fixture();
  data.segments.committed = { status: "definition_needed", cents: null };
  render(<CampaignClassification data={data} />);
  expect(screen.getByRole("img")).toHaveAccessibleName(/^Campaign recognition campaign composition/);
  expect(screen.getByRole("button", { name: "Campaign recognition" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByRole("button", { name: "Committed" })).not.toBeInTheDocument();
});

it("shows verified zeros without fabricating percentage shares", () => {
  render(<CampaignClassification data={fixture({ total: 0, philanthropic: 0, investment: 0 })} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText(/total is \$0.00; there is no proportional breakdown/)).toBeInTheDocument();
  expect(within(screen.getByRole("table")).getAllByText("$0.00")).toHaveLength(2);
});

it.each([
  { total: 10000, philanthropic: 10000, investment: 0, shares: ["100%", "0%"] },
  { total: 10000, philanthropic: 0, investment: 10000, shares: ["0%", "100%"] },
  { total: 3, philanthropic: 1, investment: 2, shares: ["33.3%", "66.7%"] },
  { total: 2000, philanthropic: 137, investment: 1863, shares: ["6.9%", "93.1%"] },
  { total: 10000, philanthropic: 1, investment: 9999, shares: ["<0.1%", ">99.9%"] },
])("labels accurate shares without disguising zero or small categories: $shares", ({ shares, ...amounts }) => {
  render(<CampaignClassification data={fixture(amounts)} />);
  const name = screen.getByRole("img").getAttribute("aria-label");
  expect(name).toContain(`(${shares[0]})`);
  expect(name).toContain(`(${shares[1]})`);
});

it.each([
  { total: -100, philanthropic: -200, investment: 100 },
  { total: 100, philanthropic: -100, investment: 200 },
  { total: 0, philanthropic: -100, investment: 100 },
])("preserves negative amounts instead of clamping them into a chart: %j", amounts => {
  render(<CampaignClassification data={fixture(amounts)} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText(/includes a negative amount/)).toBeInTheDocument();
  expect(screen.getByRole("table")).toHaveTextContent(/-\$/);
});

it.each([null, undefined, NaN, Infinity, 1.5, "7000", Number.MAX_SAFE_INTEGER + 1])("does not coerce an invalid category amount (%s) to a financial value", amount => {
  const data = fixture();
  data.segments.classification.philanthropicCents = amount;
  render(<CampaignClassification data={data} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText(/Some category amounts are unavailable/)).toBeInTheDocument();
  expect(screen.getByRole("table")).toHaveTextContent("Not loaded");
});

it("declines a chart when categories do not reconcile rather than silently changing the total", () => {
  render(<CampaignClassification data={fixture({ total: 9999 })} />);
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText(/do not match the campaign total/)).toBeInTheDocument();
  expect(screen.getByRole("table")).toHaveTextContent("$70.00");
});

it("checks Received independently and keeps exact signed amounts visible", () => {
  const data = fixture();
  data.segments.received.cents = -100;
  data.segments.classification.philanthropicReceivedCents = -3100;
  render(<CampaignClassification data={data} />);
  expect(screen.getByRole("img")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Received to date" }));
  expect(screen.queryByRole("img")).not.toBeInTheDocument();
  expect(screen.getByText(/includes a negative amount/)).toBeInTheDocument();
  expect(screen.getByRole("table")).toHaveTextContent("-$31.00");
});

it("updates percentages when the existing snapshot refresh changes amounts", () => {
  const { rerender } = render(<CampaignClassification data={{ ...fixture(), runId: null }} />);
  rerender(<CampaignClassification data={fixture()} />);
  expect(screen.getByRole("img")).toHaveAccessibleName(/\(70%\)/);
  rerender(<CampaignClassification data={fixture({ philanthropic: 6000, investment: 4000 })} />);
  expect(screen.getByRole("img")).toHaveAccessibleName(/\(60%\)/);
});
