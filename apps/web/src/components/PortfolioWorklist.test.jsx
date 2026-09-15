import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
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
const prioritySignals = new Map([
  [
    "60",
    {
      hasOpen: true,
      openCount: 1,
      amount: 1000,
      nextStep: "Later",
      dueDate: "2026-09-30",
    },
  ],
  [
    "61",
    {
      hasOpen: true,
      openCount: 1,
      amount: 9000,
      nextStep: "Call",
      dueDate: "2026-09-01",
    },
  ],
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
              <input aria-label={`Draft for ${person.name}`} defaultValue="" />
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
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const topNav = () =>
  within(screen.getByRole("navigation", { name: "Top portfolio pagination" }));
const firstPerson = () => screen.getAllByRole("article")[0].textContent;
const quickView = (name) =>
  within(
    screen.getByRole("group", { name: "Portfolio quick views" }),
  ).getByRole("button", { name });

describe("portfolio worklist", () => {
  it("filters a solicitor group before pagination while retaining Focus and sort", () => {
    render(<View />);
    expect(screen.queryByLabelText("Show group")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Organize by"), {
      target: { value: "solicitor" },
    });
    fireEvent.click(topNav().getByRole("button", { name: "Next" }));
    fireEvent.change(screen.getByLabelText("Show group"), {
      target: { value: "support" },
    });
    expect(topNav().getByText("Page 1 of 2")).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(25);
    expect(firstPerson()).toContain("Person 61");
    expect(quickView(/^All 31$/)).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Lead" }),
    ).not.toBeInTheDocument();
    fireEvent.click(topNav().getByRole("button", { name: "Next" }));
    expect(screen.getAllByRole("article")).toHaveLength(6);
    fireEvent.change(screen.getByLabelText("View"), {
      target: { value: "focus" },
    });
    expect(topNav().getByText("Page 2 of 2")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Sort by"), {
      target: { value: "pipeline" },
    });
    expect(screen.getByLabelText("Show group")).toHaveValue("support");
    expect(firstPerson()).toContain("Person 61");
    fireEvent.click(
      screen.getByRole("button", { name: "Show details for Person 61" }),
    );
    expect(
      screen.getByRole("button", { name: "Action for Person 61" }),
    ).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("scopes quick-view counts to the group and group counts to search and quick view", () => {
    render(<View />);
    fireEvent.change(screen.getByLabelText("Organize by"), {
      target: { value: "solicitor" },
    });
    fireEvent.change(screen.getByLabelText("Show group"), {
      target: { value: "support" },
    });
    expect(quickView(/^All 31$/)).toBeVisible();
    expect(quickView(/^Open opportunities 1$/)).toBeVisible();
    fireEvent.click(quickView(/^Open opportunities 1$/));
    const groups = within(screen.getByLabelText("Show group"));
    expect(
      groups.getByRole("option", { name: "All roles (1)" }),
    ).toBeInTheDocument();
    expect(
      groups.getByRole("option", { name: "Lead (0)" }),
    ).toBeInTheDocument();
    expect(
      groups.getByRole("option", { name: "Supporting (1)" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    fireEvent.click(quickView(/^All 31$/));
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Person 01" },
    });
    expect(quickView(/^All 0$/)).toBeVisible();
    expect(
      groups.getByRole("option", { name: "Lead (1)" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.getByText(/No constituents match this group/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Show all groups" }));
    expect(screen.getByRole("searchbox")).toHaveValue("Person 01");
    expect(firstPerson()).toContain("Person 01");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("selects categories, subcategories and Uncategorized independently", () => {
    render(
      <View
        categoryTiers={[
          {
            key: "category-1",
            title: "Planned giving",
            items: people.slice(0, 20),
          },
          {
            key: "category-2",
            title: "- Follow-up",
            hierarchyDepth: 1,
            items: people.slice(20, 30),
          },
          {
            key: "uncategorized",
            title: "Uncategorized",
            items: people.slice(30),
          },
          { key: "category-3", title: "Empty", items: [] },
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Organize by"), {
      target: { value: "category" },
    });
    fireEvent.change(screen.getByLabelText("Show group"), {
      target: { value: "category-1" },
    });
    expect(screen.getAllByRole("article")).toHaveLength(20);
    expect(
      screen.getByText(/Subcategories are separate groups\.$/),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("Show group"), {
      target: { value: "category-2" },
    });
    expect(screen.getAllByRole("article")).toHaveLength(10);
    expect(firstPerson()).toContain("Person 21");
    fireEvent.change(screen.getByLabelText("Show group"), {
      target: { value: "uncategorized" },
    });
    expect(quickView(/^All 31$/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Show group"), {
      target: { value: "category-3" },
    });
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Show all constituents" }),
    );
    expect(screen.getByLabelText("Show group")).toHaveValue("");
    expect(screen.getAllByRole("article")).toHaveLength(25);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps counts consistent for duplicate and out-of-portfolio group members", () => {
    render(
      <View
        categoryTiers={[
          { key: "one", title: "One", items: [...people, people[60]] },
          {
            key: "two",
            title: "Two",
            items: [
              people[60],
              { constituentId: "999", name: "Outside portfolio" },
            ],
          },
        ]}
      />,
    );
    fireEvent.change(screen.getByLabelText("Organize by"), {
      target: { value: "category" },
    });
    const groups = within(screen.getByLabelText("Show group"));
    expect(
      groups.getByRole("option", { name: "All categories (61)" }),
    ).toBeInTheDocument();
    expect(
      groups.getByRole("option", { name: "One (61)" }),
    ).toBeInTheDocument();
    expect(groups.getByRole("option", { name: "Two (0)" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Show group"), {
      target: { value: "two" },
    });
    expect(quickView(/^All 0$/)).toBeVisible();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("updates group membership without broadening a deleted group silently", () => {
    const { rerender } = render(<View />);
    fireEvent.change(screen.getByLabelText("Organize by"), {
      target: { value: "category" },
    });
    fireEvent.change(screen.getByLabelText("Show group"), {
      target: { value: "category" },
    });
    rerender(
      <View
        categoryTiers={[
          { key: "category", title: "Renamed", items: [people[60]] },
        ]}
      />,
    );
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByLabelText("Show group")).toHaveValue("category");
    expect(screen.getByRole("heading", { name: "Renamed" })).toBeVisible();
    rerender(
      <View
        categoryTiers={[
          { key: "replacement", title: "Replacement", items: people },
        ]}
      />,
    );
    expect(
      screen.getByRole("option", { name: "Unavailable group (0)" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show all groups" }));
    expect(screen.getAllByRole("article")).toHaveLength(25);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("clears group selection on grouping changes and new workspace visits, not in stored preferences", () => {
    const { rerender } = render(<View key="first" />);
    fireEvent.change(screen.getByLabelText("Organize by"), {
      target: { value: "solicitor" },
    });
    fireEvent.change(screen.getByLabelText("Show group"), {
      target: { value: "support" },
    });
    fireEvent.change(screen.getByLabelText("Organize by"), {
      target: { value: "category" },
    });
    expect(screen.getByLabelText("Show group")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Show group"), {
      target: { value: "category" },
    });
    expect(JSON.parse(localStorage.getItem(storageKey))).toEqual({
      density: "compact",
      quickView: "all",
      group: "category",
      sort: "open",
      pageSize: 25,
    });
    rerender(<View key="other" storageKey={portfolioViewKey(1, 3)} />);
    expect(screen.queryByLabelText("Show group")).not.toBeInTheDocument();
    rerender(<View key="return" />);
    expect(screen.getByLabelText("Organize by")).toHaveValue("category");
    expect(screen.getByLabelText("Show group")).toHaveValue("");
    fireEvent.change(screen.getByLabelText("Organize by"), {
      target: { value: "all" },
    });
    expect(screen.queryByLabelText("Show group")).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps an explicitly opened Focus card in view without scrolling on density changes", () => {
    render(<View />);
    const button = screen.getByRole("button", {
      name: "Show details for Person 61",
    });
    const scroll = vi.fn();
    button.scrollIntoView = scroll;
    fireEvent.click(button);
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("View"), {
      target: { value: "focus" },
    });
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(scroll).toHaveBeenCalledExactlyOnceWith({ block: "nearest" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("opens one card at a time in Focus without losing fields or fetching", () => {
    render(<View />);
    fireEvent.change(screen.getByLabelText("View"), {
      target: { value: "focus" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Show details for Person 61" }),
    );
    const draft = screen.getByRole("textbox", { name: "Draft for Person 61" });
    fireEvent.change(draft, { target: { value: "Keep this draft" } });
    fireEvent.click(
      screen.getByRole("button", { name: "Show details for Person 01" }),
    );
    expect(
      screen.getAllByRole("button", { name: /Hide details for/ }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Action for Person 01" }),
    ).toBeVisible();
    expect(draft).not.toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Show details for Person 61" }),
    );
    expect(draft).toBeVisible();
    expect(draft).toHaveValue("Keep this draft");
    fireEvent.click(screen.getByRole("button", { name: "Collapse details" }));
    expect(
      screen.getByRole("region", { name: "Portfolio worklist" }),
    ).toHaveFocus();
    expect(
      screen.queryByRole("button", { name: /Hide details for/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Show details for Person 61" }),
    );
    expect(draft).toHaveValue("Keep this draft");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps Compact multi-open and Detailed full-page behavior", () => {
    render(<View />);
    fireEvent.click(
      screen.getByRole("button", { name: "Show details for Person 61" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Show details for Person 01" }),
    );
    expect(
      screen.getAllByRole("button", { name: /Hide details for/ }),
    ).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Collapse details" }));
    expect(
      screen.queryByRole("button", { name: /Hide details for/ }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("View"), {
      target: { value: "detailed" },
    });
    expect(screen.getAllByRole("button", { name: /Action for/ })).toHaveLength(
      25,
    );
    expect(
      screen.queryByRole("button", { name: "Collapse details" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("View"), {
      target: { value: "compact" },
    });
    expect(
      screen.queryByRole("button", { name: /Action for/ }),
    ).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("keeps the last opened card when entering Focus without changing pages", () => {
    render(<View />);
    fireEvent.click(topNav().getByRole("button", { name: "Next" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Show details for Person 25" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Show details for Person 26" }),
    );
    fireEvent.change(screen.getByLabelText("View"), {
      target: { value: "focus" },
    });
    expect(topNav().getByText("Page 2 of 3")).toBeVisible();
    expect(
      screen.getAllByRole("button", { name: /Hide details for/ }),
    ).toHaveLength(1);
    expect(
      screen.getByRole("button", { name: "Hide details for Person 26" }),
    ).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("retains Focus expansion by constituent across paging, filters and grouping", () => {
    render(<View />);
    fireEvent.change(screen.getByLabelText("View"), {
      target: { value: "focus" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Show details for Person 61" }),
    );
    fireEvent.click(topNav().getByRole("button", { name: "Next" }));
    expect(
      screen.queryByRole("button", { name: /Hide details for/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Show details for Person 25" }),
    );
    fireEvent.click(topNav().getByRole("button", { name: "Previous" }));
    expect(
      screen.getByRole("button", { name: "Show details for Person 61" }),
    ).toHaveAttribute("aria-expanded", "false");
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Person 25" },
    });
    expect(
      screen.getByRole("button", { name: "Hide details for Person 25" }),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText("Organize by"), {
      target: { value: "solicitor" },
    });
    expect(
      screen.getByRole("button", { name: "Hide details for Person 25" }),
    ).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("prunes expansion when a constituent leaves the portfolio", () => {
    const { rerender } = render(<View />);
    fireEvent.click(
      screen.getByRole("button", { name: "Show details for Person 61" }),
    );
    rerender(<View people={people.slice(0, 60)} />);
    rerender(<View />);
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Person 61" },
    });
    expect(
      screen.getByRole("button", { name: "Show details for Person 61" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(fetch).not.toHaveBeenCalled();
  });
  it("remembers Focus only for its viewer/workspace, without storing expanded IDs", () => {
    const { rerender } = render(<View key="first" />);
    fireEvent.change(screen.getByLabelText("View"), {
      target: { value: "focus" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Show details for Person 61" }),
    );
    expect(JSON.parse(localStorage.getItem(storageKey))).toEqual({
      density: "focus",
      quickView: "all",
      group: "all",
      sort: "open",
      pageSize: 25,
    });
    rerender(<View key="other-viewer" storageKey={portfolioViewKey(3, 2)} />);
    expect(screen.getByLabelText("View")).toHaveValue("compact");
    rerender(
      <View key="other-workspace" storageKey={portfolioViewKey(1, 3)} />,
    );
    expect(screen.getByLabelText("View")).toHaveValue("compact");
    rerender(<View key="return" />);
    expect(screen.getByLabelText("View")).toHaveValue("focus");
    expect(
      screen.queryByRole("button", { name: /Hide details for/ }),
    ).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
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
  it.each(["due", "pipeline"])(
    "applies the %s priority sort before pagination and within groups without fetching",
    (sort) => {
      render(<View signals={prioritySignals} />);
      expect(firstPerson()).toContain("Person 60");
      fireEvent.click(topNav().getByRole("button", { name: "Next" }));
      fireEvent.change(screen.getByLabelText("Sort by"), {
        target: { value: sort },
      });
      expect(firstPerson()).toContain("Person 61");
      expect(topNav().getByText("Page 1 of 3")).toBeVisible();
      fireEvent.change(screen.getByRole("searchbox"), {
        target: { value: "Person 6" },
      });
      expect(screen.getAllByRole("article")).toHaveLength(2);
      expect(firstPerson()).toContain("Person 61");
      fireEvent.change(screen.getByLabelText("Organize by"), {
        target: { value: "solicitor" },
      });
      expect(screen.getByRole("heading", { name: "Supporting" })).toBeVisible();
      expect(firstPerson()).toContain("Person 61");
      fireEvent.click(quickView(/Open opportunities/));
      expect(firstPerson()).toContain("Person 61");
      expect(screen.getByLabelText("Sort by")).toHaveValue(sort);
      fireEvent.click(
        screen.getByRole("button", { name: "Show details for Person 61" }),
      );
      expect(
        screen.getByRole("button", { name: "Action for Person 61" }),
      ).toBeVisible();
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it.each(["due", "pipeline"])(
    "keeps %s order stable on background updates until Reapply sort",
    (sort) => {
      const { rerender } = render(<View signals={prioritySignals} />);
      fireEvent.change(screen.getByLabelText("Sort by"), {
        target: { value: sort },
      });
      const changed = new Map(prioritySignals);
      changed.set("60", {
        ...changed.get("60"),
        amount: 100000,
        dueDate: "2026-08-01",
      });
      rerender(<View signals={changed} />);
      expect(firstPerson()).toContain("Person 61");
      fireEvent.click(screen.getByRole("button", { name: "Reapply sort" }));
      expect(firstPerson()).toContain("Person 60");
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it.each(["due", "pipeline"])(
    "remembers the %s sort only for its viewer and workspace",
    (sort) => {
      const { rerender } = render(
        <View key="first" signals={prioritySignals} />,
      );
      fireEvent.change(screen.getByLabelText("Sort by"), {
        target: { value: sort },
      });
      expect(JSON.parse(localStorage.getItem(storageKey)).sort).toBe(sort);
      rerender(
        <View
          key="other-viewer"
          storageKey={portfolioViewKey(3, 2)}
          signals={prioritySignals}
        />,
      );
      expect(screen.getByLabelText("Sort by")).toHaveValue("open");
      rerender(
        <View
          key="other-workspace"
          storageKey={portfolioViewKey(1, 3)}
          signals={prioritySignals}
        />,
      );
      expect(screen.getByLabelText("Sort by")).toHaveValue("open");
      rerender(<View key="return" signals={prioritySignals} />);
      expect(screen.getByLabelText("Sort by")).toHaveValue(sort);
      expect(firstPerson()).toContain("Person 61");
      expect(fetch).not.toHaveBeenCalled();
    },
  );
  it("remembers view settings per viewer/workspace but not donor data or searches", () => {
    const { rerender } = render(<View key="first" />);
    fireEvent.change(screen.getByLabelText("Organize by"), {
      target: { value: "category" },
    });
    fireEvent.change(screen.getByLabelText("Per page"), {
      target: { value: "50" },
    });
    fireEvent.click(quickView(/Open opportunities/));
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Person 05" },
    });
    expect(JSON.parse(localStorage.getItem(storageKey))).toEqual({
      group: "category",
      pageSize: 50,
      sort: "open",
      density: "compact",
      quickView: "open",
    });
    rerender(<View key="second" storageKey={portfolioViewKey(1, 3)} />);
    expect(screen.getByLabelText("Organize by")).toHaveValue("all");
    expect(screen.getByLabelText("Per page")).toHaveValue("25");
    expect(quickView(/^All /)).toHaveAttribute("aria-pressed", "true");
    rerender(<View key="first-again" />);
    expect(screen.getByLabelText("Organize by")).toHaveValue("category");
    expect(screen.getByLabelText("Per page")).toHaveValue("50");
    expect(quickView(/Open opportunities/)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });
  it("filters the entire saved portfolio before pagination and grouping, with search-aware counts", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T16:00:00Z"));
    const saved = new Map(signals);
    saved.set("60", { nextStep: "Call", dueDate: "2026-09-15" });
    saved.set("61", {
      ...saved.get("61"),
      nextStep: "Visit",
      dueDate: "2026-09-10",
    });
    render(<View signals={saved} />);
    expect(quickView(/^All 61$/)).toHaveAttribute("aria-pressed", "true");
    expect(quickView(/^Follow-ups due 2$/)).toBeVisible();
    fireEvent.click(topNav().getByRole("button", { name: "Next" }));
    fireEvent.click(quickView(/Follow-ups due/));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(topNav().getByText("Page 1 of 1")).toBeVisible();
    expect(
      topNav().getByText("1-2 of 2 matches (61 in portfolio)"),
    ).toBeVisible();
    expect(screen.getByText(/Sep 15, 2026 \(Eastern\)/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Organize by"), {
      target: { value: "solicitor" },
    });
    expect(screen.getByRole("heading", { name: "Supporting" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Lead" }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "Person 60" },
    });
    expect(quickView(/^All 1$/)).toBeVisible();
    expect(quickView(/^Open opportunities 0$/)).toBeVisible();
    expect(quickView(/^Follow-ups due 1$/)).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    fireEvent.click(quickView(/Open opportunities/));
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Show all constituents" }),
    );
    expect(screen.getByRole("searchbox")).toHaveValue("");
    expect(quickView(/^All 61$/)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("article")).toHaveLength(25);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("counts people once even if they appear in multiple groups", () => {
    render(
      <View
        people={[...people, people[60]]}
        categoryTiers={[
          { key: "one", title: "One", items: people },
          { key: "two", title: "Two", items: [people[60]] },
        ]}
      />,
    );
    expect(quickView(/^All 61$/)).toBeVisible();
    expect(quickView(/^Open opportunities 1$/)).toBeVisible();
    fireEvent.change(screen.getByLabelText("Organize by"), {
      target: { value: "category" },
    });
    fireEvent.click(quickView(/Open opportunities/));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "One" })).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Two" }),
    ).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("updates due filters across Eastern midnight, not UTC midnight, without fetching", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-16T03:59:30Z"));
    render(
      <View
        signals={
          new Map([
            ["1", { nextStep: "Today", dueDate: "2026-09-15" }],
            ["2", { nextStep: "Tomorrow", dueDate: "2026-09-16" }],
          ])
        }
      />,
    );
    fireEvent.click(quickView(/^Follow-ups due 1$/));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    act(() => vi.advanceTimersByTime(60_000));
    expect(quickView(/^Follow-ups due 2$/)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByText(/Sep 16, 2026 \(Eastern\)/)).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("removes resolved follow-ups on saved-data updates and offers recovery from an empty filter", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-15T16:00:00Z"));
    const { rerender } = render(
      <View
        signals={new Map([["1", { nextStep: "Call", dueDate: "2026-09-15" }]])}
      />,
    );
    fireEvent.click(quickView(/^Follow-ups due 1$/));
    rerender(<View signals={new Map()} />);
    expect(quickView(/^Follow-ups due 0$/)).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /No constituents match this quick view in the saved data/,
      ),
    ).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Show all constituents" }),
    );
    expect(screen.getAllByRole("article")).toHaveLength(25);
    expect(fetch).not.toHaveBeenCalled();
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
  it("hides unavailable opportunities and shows a real next step without a timezone shift", () => {
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
      screen.queryByText("Opportunity data unavailable"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("0 saved open opportunities")).not.toBeInTheDocument();
    expect(screen.getByText("Due Sep 20, 2026")).toBeInTheDocument();
  });

  it.each([undefined, { openCount: 0 }, { openCount: null, nextStep: "  " }])("keeps an empty row quiet without suggesting no NXT activity exists: %j", (signal) => {
    render(<PortfolioCard person={people[0]} signal={signal} density="compact">Details</PortfolioCard>);
    expect(screen.getByText("Person 01")).toBeVisible();
    expect(screen.getByRole("button", { name: "Show details for Person 01" })).toBeVisible();
    expect(screen.queryByText(/unavailable|No saved next step|0 saved open|No due date|Last gift|Last action/)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows only available saved activity dates alongside real opportunities and steps", () => {
    render(<PortfolioCard person={{ ...people[0], savedActivity: {
      gift: { date: "2026-08-31", checkedAt: "2026-09-14T12:00:00Z" },
      action: { date: "2026-09-10", checkedAt: "2026-09-14T12:00:00Z" },
    } }} signal={{ hasOpen: true, openCount: 1, amount: 15000, nextStep: "Call donor" }} density="focus">Details</PortfolioCard>);
    expect(screen.getByText("Last gift (saved)")).toBeVisible();
    expect(screen.getByText("Aug 31, 2026")).toHaveAttribute("dateTime", "2026-08-31");
    expect(screen.getByText("Last action (saved)")).toBeVisible();
    expect(screen.getByText("Sep 10, 2026")).toBeVisible();
    expect(screen.getByText("Last gift (saved)").parentElement).toHaveAttribute("title", expect.stringContaining("Checked September 14, 2026"));
    expect(screen.getByText("1 saved open opportunity")).toBeVisible();
    expect(screen.getByText("$15,000")).toBeVisible();
    expect(screen.getByText("Call donor")).toBeVisible();
    expect(screen.queryByText("No due date")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show details for Person 01" }));
    expect(screen.getByText("Details")).toBeVisible();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not invent activity dates from fiscal-year, maintenance or narrative data", () => {
    render(<PortfolioCard person={{ ...people[0], lastGiftDate: "2026-08-31", latest_activity_at: "2026-09-10",
      savedActivity: { gift: { date: "2026-08-31" }, action: { date: "2099-01-01", checkedAt: "2026-09-14T12:00:00Z" } },
    }} density="compact">Details</PortfolioCard>);
    expect(screen.queryByText(/Last gift|Last action/)).not.toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
