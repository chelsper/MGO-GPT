import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectProspectViews from "./ProjectProspectViews";
import { projectViewStorageKey } from "@/utils/projectProspectViews";
const value = { mode: "any", tagIds: ["a"], status: "active", groupSpouses: true, sort: { key: "ranking", direction: "descending" } };
const key = projectViewStorageKey("staff1", "project1");
const existing = [{ id: "v1", name: "Interest", settings: value }];
const seed = (views = existing, storageKey = key) => localStorage.setItem(storageKey, JSON.stringify({ version: 1, views }));
const props = { viewerId: "staff1", projectKey: "project1", value, tags: [{id: "a"}], sortOptions: [{key: "ranking"}], onApply: vi.fn() };
function open(overrides = {}) { const result = render(<ProjectProspectViews {...props} {...overrides} />); fireEvent.click(screen.getByText(/My saved views/)); return result; }
beforeEach(() => { localStorage.clear(); props.onApply.mockReset(); });
afterEach(() => vi.restoreAllMocks());
describe("project saved views", () => {
  it("saves only preferences and applies only on explicit request", () => {
    open({ value: { ...value, search: "Not saved", selected: ["123"] } });
    fireEvent.change(screen.getByLabelText("New view name"), { target: { value: "My priority list" } });
    fireEvent.click(screen.getByText("Save current view"));
    expect(props.onApply).not.toHaveBeenCalled();
    const stored = JSON.parse(localStorage.getItem(key)).views;
    expect(stored[0].settings).toEqual(value);
    fireEvent.click(screen.getByText("Apply view"));
    expect(props.onApply).toHaveBeenCalledWith(value);
  });
  it("does not overwrite duplicate names or delete without confirmation", () => {
    seed(); open();
    fireEvent.change(screen.getByLabelText("New view name"), { target: { value: "interest" } });
    fireEvent.click(screen.getByText("Save current view"));
    expect(screen.getByRole("status")).toHaveTextContent("already has that name");
    fireEvent.change(screen.getByLabelText("Saved view"), { target: { value: "v1" } });
    fireEvent.click(screen.getByText("Delete view"));
    expect(JSON.parse(localStorage.getItem(key)).views).toHaveLength(1);
    fireEvent.click(screen.getByText("Keep view"));
    expect(JSON.parse(localStorage.getItem(key)).views).toHaveLength(1);
    fireEvent.click(screen.getByText("Delete view")); fireEvent.click(screen.getByText("Confirm delete view"));
    expect(JSON.parse(localStorage.getItem(key)).views).toEqual([]);
  });
  it("keeps other users' and projects' views separate", () => {
    seed(existing, projectViewStorageKey("staff2", "project1")); seed(existing, projectViewStorageKey("staff1", "project2")); open();
    expect(screen.queryByRole("option", { name: "Interest" })).not.toBeInTheDocument();
  });
  it.each([{ tags: [] }, { sortOptions: [] }])("blocks stale view filters instead of broadening results %#", overrides => {
    seed(); open(overrides); fireEvent.change(screen.getByLabelText("Saved view"), { target: { value: "v1" } }); fireEvent.click(screen.getByText("Apply view"));
    expect(props.onApply).not.toHaveBeenCalled(); expect(screen.getByRole("status")).toHaveTextContent("no longer");
  });
  it("keeps normal list use available when browser storage is blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); }); open();
    expect(screen.getByRole("status")).toHaveTextContent("filter and sort the list normally");
    expect(screen.getByText("Save current view")).toBeDisabled();
  });
  it("reports failed storage writes without claiming success", () => {
    open(); vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
    fireEvent.change(screen.getByLabelText("New view name"), { target: { value: "My list" } }); fireEvent.click(screen.getByText("Save current view"));
    expect(screen.getByRole("status")).toHaveTextContent("could not be saved"); expect(localStorage.getItem(key)).toBeNull();
  });
  it("reads the latest views before saving rather than replacing another tab's work", () => {
    open(); seed(); fireEvent.change(screen.getByLabelText("New view name"), { target: { value: "Second" } }); fireEvent.click(screen.getByText("Save current view"));
    expect(JSON.parse(localStorage.getItem(key)).views.map(v => v.name)).toEqual(["Interest", "Second"]);
  });
});
