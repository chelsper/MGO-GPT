import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import PortfolioWorklist, { PortfolioCard } from "./PortfolioWorklist";
import { portfolioViewKey } from "@/utils/portfolioWorklist";

const people = Array.from({ length: 61 }, (_, index) => ({
  constituentId: String(index + 1),
  name: `Person ${String(index + 1).padStart(2, "0")}`,
}));
const signals = new Map([
  ["61", { hasOpen: true, openCount: 1, amount: 3000 }],
]);
const storageKey = portfolioViewKey(1, 2);
function View(props) {
  return (
    <PortfolioWorklist
      people={people}
      roleTiers={[
        { key: "lead", title: "Lead", items: people.slice(0, 30) },
        { key: "support", title: "Supporting", items: people.slice(30) },
      ]}
      categoryTiers={[{ key: "category", title: "My category", items: people }]}
      signals={signals}
      storageKey={storageKey}
      matchesSearch={(person, search) =>
        person.name.toLowerCase().includes(search)
      }
      renderTier={(tier, density) => (
        <div key={tier.key}>
          <h2>{tier.title}</h2>
          {tier.items.map((person) => (
            <PortfolioCard
              key={person.constituentId}
              person={person}
              signal={(props.signals || signals).get(person.constituentId)}
              density={density}
            >
              <button type="button">Action for {person.name}</button>
            </PortfolioCard>
          ))}
        </div>
      )}
      {...props}
    />
  );
}
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const topNav = () =>
  within(screen.getByRole("navigation", { name: "Top portfolio pagination" }));
const firstPerson = () => screen.getAllByRole("article")[0].textContent;

describe("portfolio worklist", () => {
  it("defaults to compact, sorted, 25-row view and searches across all pages", () => {
    render(<View />);
    expect(screen.getAllByRole("article")).toHaveLength(25);
    expect(firstPerson()).toContain("Person 61");
    expect(
      screen.queryByRole("button", { name: "Action for Person 61" }),
    ).not.toBeInTheDocument();
    fireEvent.click(topNav().getByRole("button", { name: "Next" }));
    expect(topNav().getByText("Page 2 of 3")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("View"), {
      target: { value: "detailed" },
    });
    expect(topNav().getByText("Page 2 of 3")).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "person 01" },
    });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(firstPerson()).toContain("Person 01");
    expect(topNav().getByText("Page 1 of 1")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps NXT calls out of expansion, density, sorting, grouping, and paging", () => {
    render(<View />);
    const button = screen.getByRole("button", {
      name: "Show details for Person 61",
    });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("button", { name: "Action for Person 61" }),
    ).toBeVisible();
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.change(screen.getByLabelText("View"), {
      target: { value: "detailed" },
    });
    expect(
      screen.getByRole("button", { name: "Action for Person 61" }),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("Sort by"), {
      target: { value: "name" },
    });
    expect(firstPerson()).toContain("Person 01");
    fireEvent.change(screen.getByLabelText("Organize by"), {
      target: { value: "solicitor" },
    });
    fireEvent.change(screen.getByLabelText("Per page"), {
      target: { value: "50" },
    });
    expect(screen.getAllByRole("article")).toHaveLength(50);
    expect(
      screen.getByRole("heading", { name: "Supporting" }),
    ).toBeInTheDocument();
    fireEvent.click(topNav().getByRole("button", { name: "Next" }));
    expect(screen.getAllByRole("article")).toHaveLength(11);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("does not jump after background updates until the user reapplies sort", () => {
    const { rerender } = render(<View />);
    const changed = new Map([["3", { hasOpen: true, openCount: 5 }]]);
    rerender(<View signals={changed} />);
    expect(firstPerson()).toContain("Person 61");
    fireEvent.click(screen.getByRole("button", { name: "Reapply sort" }));
    expect(firstPerson()).toContain("Person 03");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("remembers view settings per viewer/workspace but not donor data or searches", () => {
    const { rerender } = render(<View key="first" />);
    fireEvent.change(screen.getByLabelText("Organize by"), {
      target: { value: "category" },
    });
    fireEvent.change(screen.getByLabelText("Per page"), {
      target: { value: "50" },
    });
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Person 05" },
    });
    expect(JSON.parse(localStorage.getItem(storageKey))).toEqual({
      group: "category",
      pageSize: 50,
      sort: "open",
      density: "compact",
    });
    rerender(<View key="second" storageKey={portfolioViewKey(1, 3)} />);
    expect(screen.getByLabelText("Organize by")).toHaveValue("all");
    expect(screen.getByLabelText("Per page")).toHaveValue("25");
    rerender(<View key="first-again" />);
    expect(screen.getByLabelText("Organize by")).toHaveValue("category");
    expect(screen.getByLabelText("Per page")).toHaveValue("50");
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });
  it("survives corrupted or unavailable local storage", () => {
    localStorage.setItem(storageKey, "invalid json");
    const { unmount } = render(<View />);
    expect(screen.getByLabelText("View")).toHaveValue("compact");
    unmount();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("Blocked");
    });
    render(<View />);
    fireEvent.change(screen.getByLabelText("Per page"), {
      target: { value: "50" },
    });
    expect(screen.getAllByRole("article")).toHaveLength(50);
  });
  it("shows an actionable empty search state", () => {
    render(<View />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "missing" },
    });
    expect(screen.getByText(/No constituents match/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getAllByRole("article")).toHaveLength(25);
  });
  it("does not mistake unavailable opportunities for none, and shows a date without a timezone shift", () => {
    render(
      <PortfolioCard
        person={people[0]}
        density="compact"
        signal={{ openCount: null, nextStep: "Call", dueDate: "2026-09-20" }}
      >
        Details
      </PortfolioCard>,
    );
    expect(
      screen.getByText("Opportunity data unavailable"),
    ).toBeInTheDocument();
    expect(screen.getByText("Due Sep 20, 2026")).toBeInTheDocument();
  });
});
