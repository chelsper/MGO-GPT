import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BOARD_MEMBERSHIP_RULE } from "@/utils/boardTrustees";
import TrusteeParticipationChart from "./TrusteeParticipationChart";
import styles from "./trustees.module.css";

afterEach(cleanup);
const giver = { cashCents: 100, commitmentCents: 0 };
const nonGiver = { cashCents: 0, commitmentCents: 0 };
function entry(year, trustees, overrides = {}) {
  return { source: { fiscalYear: year }, snapshot: {
    trustees, trusteeCount: trustees.length, refreshedAt: "2026-10-30T12:00:00Z",
    eligibility: { rule: BOARD_MEMBERSHIP_RULE, reviewCount: 0 }, ...overrides,
  } };
}
function chart(entries, props = {}) {
  return render(<TrusteeParticipationChart entries={entries} years={entries.map(row => row.source.fiscalYear)}
    selectedYear={2027} onSelectYear={vi.fn()} {...props} />);
}
const yearButton = year => screen.getByRole("button", { name: new RegExp(`^FY${String(year).slice(-2)}:`) });
const bar = year => yearButton(year).querySelector(`.${styles.chartBar}`);

it("shows chronological percentages and participant counts on a fixed 0-100% scale", () => {
  chart([entry(2027, [giver, nonGiver]), entry(2025, [giver, giver, giver, nonGiver]), entry(2026, [giver, nonGiver, nonGiver, nonGiver])]);
  expect(within(screen.getByRole("list")).getAllByRole("button").map(button => button.getAttribute("aria-label").slice(0, 4)))
    .toEqual(["FY25", "FY26", "FY27"]);
  expect(yearButton(2027)).toHaveAccessibleName(/participation, 50%, 1 of 2 eligible trustees.*Year to date/);
  expect(yearButton(2025)).toHaveAccessibleName(/Completed fiscal year/);
  expect(bar(2025)).toHaveStyle({ height: "75%", bottom: "0%" });
  expect(bar(2026)).toHaveStyle({ height: "25%", bottom: "0%" });
  expect(bar(2027)).toHaveStyle({ height: "50%", bottom: "0%" });
  expect(screen.getByText("YTD")).toBeVisible();
  expect(within(yearButton(2025)).getByText("3 of 4")).toBeVisible();
  expect(yearButton(2027)).toHaveAttribute("aria-pressed", "true");
  expect(screen.queryByText(/\$/)).not.toBeInTheDocument();
});

it("counts cash, pledges or planned gifts once per eligible trustee, not gift dollars", () => {
  chart([entry(2027, [giver, { cashCents: 0, commitmentCents: 100 }, { cashCents: 900000, commitmentCents: 500000 }, nonGiver])]);
  expect(yearButton(2027)).toHaveAccessibleName(/75%, 3 of 4 eligible trustees/);
  expect(screen.getByRole("status")).toHaveTextContent("FY27 participation: 75% (3 of 4 eligible trustees)");
  expect(screen.queryByRole("button", { name: "Cash giving", exact: true })).not.toBeInTheDocument();
});

it("uses each year's own denominator and unrounded rate for bar height", () => {
  chart([entry(2027, [giver, nonGiver, nonGiver]), entry(2026, [giver, nonGiver])]);
  expect(yearButton(2027)).toHaveAccessibleName(/33.3%, 1 of 3 eligible trustees/);
  expect(parseFloat(bar(2027).style.height)).toBeCloseTo(100 / 3, 8);
  expect(bar(2026)).toHaveStyle({ height: "50%" });
});

it("does not turn missing, obsolete, unresolved or incomplete data into zero participation", () => {
  chart([
    { source: { fiscalYear: 2027 } },
    entry(2026, [giver], { eligibility: { rule: "old", reviewCount: 0 } }),
    entry(2025, [giver], { eligibility: { rule: BOARD_MEMBERSHIP_RULE, reviewCount: 1 } }),
    entry(2024, [{ cashCents: null, commitmentCents: 0 }]),
    entry(2023, [giver], { trusteeCount: 2 }),
    entry(2022, []),
  ]);
  expect(yearButton(2027)).toHaveAccessibleName(/No saved data/);
  expect(yearButton(2026)).toHaveAccessibleName(/Refresh needed/);
  expect(yearButton(2025)).toHaveAccessibleName(/Eligibility review/);
  expect(yearButton(2024)).toHaveAccessibleName(/Giving incomplete/);
  expect(yearButton(2023)).toHaveAccessibleName(/Roster incomplete/);
  expect(yearButton(2022)).toHaveAccessibleName(/No eligible trustees/);
  for (let year = 2022; year <= 2027; year++) {
    expect(bar(year)).toBeNull();
    expect(yearButton(year)).not.toHaveAccessibleName(/%/);
  }
});

it("shows a true 0% for a complete nonparticipating roster and 100% for all participants", () => {
  chart([entry(2027, [nonGiver, { cashCents: -100, commitmentCents: 0 }]), entry(2026, [giver])]);
  expect(yearButton(2027)).toHaveAccessibleName(/0%, 0 of 2 eligible trustees/);
  expect(bar(2027)).toBeNull();
  expect(screen.getByRole("status")).toHaveTextContent("0% (0 of 2 eligible trustees)");
  expect(bar(2026)).toHaveStyle({ height: "100%" });
});

it("accepts positive giving in either summary when the other is missing or negative", () => {
  chart([entry(2027, [{ cashCents: null, commitmentCents: 100 }, { cashCents: 100, commitmentCents: null }, { cashCents: -100, commitmentCents: 10 }])]);
  expect(yearButton(2027)).toHaveAccessibleName(/100%, 3 of 3 eligible trustees/);
  expect(bar(2027)).toHaveStyle({ height: "100%" });
});

it("selects a year without altering participation and locks navigation during setup or refresh", () => {
  const select = vi.fn(), entries = [entry(2027, [giver]), entry(2028, [giver])];
  const { rerender } = chart(entries, { onSelectYear: select });
  fireEvent.click(yearButton(2028));
  expect(select).toHaveBeenCalledExactlyOnceWith(2028);
  expect(yearButton(2028)).toHaveAccessibleName(/Before fiscal year/);
  rerender(<TrusteeParticipationChart entries={entries} years={[2027, 2028]} selectedYear={2028} onSelectYear={select} disabled />);
  expect(yearButton(2028)).toHaveAttribute("aria-pressed", "true");
  expect(yearButton(2027)).toBeDisabled();
  fireEvent.click(yearButton(2027));
  expect(select).toHaveBeenCalledTimes(1);
});
