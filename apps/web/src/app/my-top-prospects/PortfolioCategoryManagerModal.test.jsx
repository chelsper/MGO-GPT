import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import PortfolioCategoryManagerModal from "./PortfolioCategoryManagerModal";

const categories = [
  { id: 1, name: "Science", sort_order: 0 },
  { id: 2, name: "Marine", parent_category_id: 1, sort_order: 0 },
  { id: 3, name: "Research", parent_category_id: 2, sort_order: 0 },
  { id: 4, name: "Scholarships", sort_order: 1 },
];
beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function mount(overrides = {}) {
  const props = { categories, onClose: vi.fn(), onCreate: vi.fn(), onRename: vi.fn(),
    onDelete: vi.fn(), onChangeParent: vi.fn(), onMoveCategory: vi.fn(), ...overrides };
  render(<PortfolioCategoryManagerModal {...props} />);
  return props;
}

it("excludes self and descendants as parents and keeps sibling reorder boundaries", () => {
  const props = mount();
  const parents = screen.getAllByLabelText("Parent category");
  expect(within(parents[0]).getAllByRole("option").map(option => option.textContent))
    .toEqual(["Top level", "Scholarships"]);
  expect(within(parents[1]).getAllByRole("option").map(option => option.textContent))
    .toEqual(["Top level", "Science", "Scholarships"]);
  fireEvent.change(parents[0], { target: { value: "4" } });
  expect(props.onChangeParent).toHaveBeenCalledWith(categories[0], "4");
  const up = screen.getAllByRole("button", { name: "Move up" });
  const down = screen.getAllByRole("button", { name: "Move down" });
  expect(up[0]).toBeDisabled();
  expect(up[1]).toBeDisabled();
  expect(down[1]).toBeDisabled();
  expect(down[3]).toBeDisabled();
  fireEvent.click(down[0]);
  expect(props.onMoveCategory).toHaveBeenCalledWith(categories[0], "down");
  expect(fetch).not.toHaveBeenCalled();
});

it("preserves a new category draft on failure and clears it only after success", async () => {
  const onCreate = vi.fn().mockRejectedValueOnce(new Error("Save unavailable")).mockResolvedValueOnce({ id: 5 });
  mount({ onCreate });
  const input = screen.getByLabelText("New category");
  fireEvent.change(input, { target: { value: "  Visits  " } });
  fireEvent.click(screen.getByRole("button", { name: "Create category" }));
  await screen.findByText("Save unavailable");
  expect(input).toHaveValue("  Visits  ");
  fireEvent.click(screen.getByRole("button", { name: "Create category" }));
  await waitFor(() => expect(input).toHaveValue(""));
  expect(onCreate.mock.calls).toEqual([["Visits"], ["Visits"]]);
  expect(fetch).not.toHaveBeenCalled();
});

it("preserves a rename draft when the parent mutation fails", async () => {
  const onRename = vi.fn().mockRejectedValue(new Error("Rename unavailable"));
  mount({ onRename });
  fireEvent.click(screen.getAllByRole("button", { name: "Rename" })[0]);
  fireEvent.change(screen.getByLabelText("Rename Science"), { target: { value: "  Sciences  " } });
  fireEvent.click(screen.getByRole("button", { name: "Save" }));
  await screen.findByText("Rename unavailable");
  expect(screen.getByLabelText("Rename Science")).toHaveValue("  Sciences  ");
  expect(onRename).toHaveBeenCalledWith(categories[0], "Sciences");
});

it("requires confirmation before delegating deletion without making an NXT request", () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const props = mount();
  fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
  expect(props.onDelete).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
  expect(props.onDelete).toHaveBeenCalledExactlyOnceWith(categories[0]);
  expect(fetch).not.toHaveBeenCalled();
});
