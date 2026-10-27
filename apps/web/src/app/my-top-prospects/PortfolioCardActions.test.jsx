import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import PortfolioCardActions from "./PortfolioCardActions";

const person = { constituentId: "100", lookupId: "500", name: "Fictional Donor" };
const topProspect = { id: 12, prospect_name: person.name };
let props;
beforeEach(() => {
  props = {
    person, fundraiserLabel: "Gift Officer", topProspect,
    onOpenPortfolioNextStep: vi.fn(), onOpenPortfolioDiscussion: vi.fn(),
    onOpenPortfolioLogAction: vi.fn(),
    onOpenPortfolioOpportunity: vi.fn(),
    onAddToTopProspects: vi.fn(), onRemoveFromTopProspects: vi.fn(),
    onRemoveSolicitorAssignment: vi.fn(), allowSolicitorAssignmentRemoval: true,
  };
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const trigger = () => screen.getByRole("button", { name: "More actions for Fictional Donor" });
const open = () => fireEvent.click(trigger());

it("shows two quick actions and reveals secondary actions only on request without fetching", () => {
  render(<PortfolioCardActions {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Log action" }));
  expect(props.onOpenPortfolioLogAction).toHaveBeenCalledExactlyOnceWith(person);
  expect(screen.queryByRole("button", { name: "Add opportunity" })).not.toBeInTheDocument();
  expect(trigger()).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(screen.getByRole("button", { name: "Set next step" }));
  expect(props.onOpenPortfolioNextStep).toHaveBeenCalledExactlyOnceWith(person);
  open();
  expect(trigger()).toHaveAttribute("aria-expanded", "true");
  expect(document.getElementById(trigger().getAttribute("aria-controls"))).toBeVisible();
  expect(screen.getByRole("button", { name: "Add opportunity" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Team discussion" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Remove me as Gift Officer" }).parentElement).toHaveClass("portfolio-actions__assignment");
  expect(props.onRemoveSolicitorAssignment).not.toHaveBeenCalled();
  expect(fetch).not.toHaveBeenCalled();
});

it.each([
  ["Add opportunity", "onOpenPortfolioOpportunity", person],
  ["Team discussion", "onOpenPortfolioDiscussion", person],
  ["Add to Top Prospects", "onAddToTopProspects", person],
  ["Remove from Top Prospects", "onRemoveFromTopProspects", topProspect],
  ["Remove me as Gift Officer", "onRemoveSolicitorAssignment", person],
])("reuses the %s handler once with its original record", (label, handler, record) => {
  render(<PortfolioCardActions {...props} isTopProspect={label === "Remove from Top Prospects"} />);
  open();
  fireEvent.click(screen.getByRole("button", { name: label }));
  expect(props[handler]).toHaveBeenCalledExactlyOnceWith(record);
  expect(trigger()).toHaveAttribute("aria-expanded", "false");
  expect(trigger()).toHaveFocus();
  expect(fetch).not.toHaveBeenCalled();
});

it("does not steal focus from a dialog opened by the action", () => {
  const handler = () => screen.getByLabelText("Dialog draft").focus();
  render(<><PortfolioCardActions {...props} onOpenPortfolioDiscussion={handler} /><input aria-label="Dialog draft" /></>);
  open();
  fireEvent.click(screen.getByRole("button", { name: "Team discussion" }));
  expect(screen.getByLabelText("Dialog draft")).toHaveFocus();
  expect(trigger()).toHaveAttribute("aria-expanded", "false");
});

it("supports Escape with focus return, outside clicks, and tabbing out without trapping focus", () => {
  render(<><PortfolioCardActions {...props} /><button>Outside</button></>);
  open();
  const discussion = screen.getByRole("button", { name: "Team discussion" });
  act(() => discussion.focus());
  expect(trigger()).toHaveAttribute("aria-expanded", "true");
  fireEvent.keyDown(discussion, { key: "Escape" });
  expect(trigger()).toHaveFocus();
  expect(trigger()).toHaveAttribute("aria-expanded", "false");
  open();
  fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
  expect(trigger()).toHaveAttribute("aria-expanded", "false");
  open();
  act(() => screen.getByRole("button", { name: "Outside" }).focus());
  expect(trigger()).toHaveAttribute("aria-expanded", "false");
  expect(screen.getByRole("button", { name: "Outside" })).toHaveFocus();
});

it("closes the previous disclosure when another card receives focus", () => {
  render(<><PortfolioCardActions {...props} /><PortfolioCardActions {...props} person={{ ...person, constituentId: "101", name: "Another Donor" }} /></>);
  open();
  const another = screen.getByRole("button", { name: "More actions for Another Donor" });
  act(() => another.focus());
  fireEvent.click(another);
  expect(trigger()).toHaveAttribute("aria-expanded", "false");
  expect(another).toHaveAttribute("aria-expanded", "true");
  expect(screen.getAllByRole("button", { name: "Team discussion" })).toHaveLength(1);
});

it("hides all writes in read-only mode, including an already-open disclosure", () => {
  const { rerender } = render(<PortfolioCardActions {...props} />);
  open();
  rerender(<PortfolioCardActions {...props} isReadOnly />);
  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  rerender(<PortfolioCardActions {...props} />);
  expect(trigger()).toHaveAttribute("aria-expanded", "false");
});

it("keeps assignment removal unavailable when that permission is absent", () => {
  render(<PortfolioCardActions {...props} allowSolicitorAssignmentRemoval={false} />);
  open();
  expect(screen.queryByRole("button", { name: /Remove me/ })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Team discussion" })).toBeEnabled();
});

it.each([
  ["Adding...", { isAdding: true }, "onAddToTopProspects"],
  ["Removing...", { isTopProspect: true, isRemovingFromTopProspects: true }, "onRemoveFromTopProspects"],
  ["Remove from Top Prospects", { isTopProspect: true, topProspect: null }, "onRemoveFromTopProspects"],
  ["Removing...", { isRemovingSolicitorAssignment: true, removingSolicitorConstituentId: "100" }, "onRemoveSolicitorAssignment"],
  ["Remove me as Gift Officer", { isRemovingSolicitorAssignment: true, removingSolicitorConstituentId: "101" }, "onRemoveSolicitorAssignment"],
])("preserves pending and missing-record protection for %s", (label, overrides, handler) => {
  render(<PortfolioCardActions {...props} {...overrides} />);
  open();
  const button = screen.getByRole("button", { name: label });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(props[handler]).not.toHaveBeenCalled();
  expect(trigger()).toHaveAttribute("aria-expanded", "true");
});

it("does not leave no-op buttons enabled when a handler is unavailable", () => {
  render(<PortfolioCardActions person={person} fundraiserLabel="Gift Officer" allowSolicitorAssignmentRemoval />);
  expect(screen.getByRole("button", { name: "Set next step" })).toBeDisabled();
  open();
  const panel = within(document.getElementById(trigger().getAttribute("aria-controls")));
  expect(panel.getAllByRole("button").every(button => button.disabled)).toBe(true);
});

it("opens upward when the menu would be below the viewport and adapts on resize", () => {
  vi.stubGlobal("innerHeight", 800);
  const bounds = { top: 710, bottom: 754 };
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(() => bounds);
  vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(222);
  render(<PortfolioCardActions {...props} />);
  open();
  const panel = document.getElementById(trigger().getAttribute("aria-controls"));
  expect(panel).toHaveClass("portfolio-actions__panel--above");
  expect(panel).toHaveStyle({ maxHeight: "320px" });
  bounds.top = 20;
  bounds.bottom = 64;
  fireEvent(window, new Event("resize"));
  expect(panel).not.toHaveClass("portfolio-actions__panel--above");
  expect(trigger()).toHaveAttribute("aria-expanded", "true");
});
