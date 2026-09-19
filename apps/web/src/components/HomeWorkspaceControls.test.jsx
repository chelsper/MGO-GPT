import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HomeWorkspaceControls from "./HomeWorkspaceControls";

const profile = { id: 7, role: "admin", name: "Test Admin", active: true };
const mgo = { id: 9, role: "mgo", name: "Selected MGO", active: true };
const executive = { id: 10, role: "executive", name: "Selected Executive", active: true };
const defaults = { profile, isReviewer: false, actingUser: null, workspaceResolved: true, mgoUsers: [profile, mgo, executive] };
const expand = container => fireEvent.click(container.querySelector("summary"));

describe("Home workspace controls", () => {
  it.each(["mgo", "executive", "advancement_services", null])("does not add Admin controls for %s", role => {
    const { container } = render(<HomeWorkspaceControls {...defaults} profile={{ ...profile, role }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it.each(["admin", "mgo,admin"])("starts collapsed with the selected view visible for %s", role => {
    const { container } = render(<HomeWorkspaceControls {...defaults} profile={{ ...profile, role }} isReviewer />);
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(container.querySelector("summary")).toHaveTextContent("WorkspaceAdvancement ServicesChange workspace");
    expect(screen.getByRole("button", { name: "MGO" })).not.toBeVisible();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    expand(container);
    expect(screen.getByRole("button", { name: "Advancement Services" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "MGO" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("keeps acting identity and attribution visible when switching controls are collapsed", () => {
    const { container } = render(<HomeWorkspaceControls {...defaults} actingUser={mgo} />);
    expect(container.querySelector("summary")).toHaveTextContent("MGO: Selected MGO");
    const notice = screen.getByText(/Editing as Admin/);
    expect(notice).toBeVisible();
    expect(notice).toHaveTextContent("Actions credit Selected MGO and record you as the person who entered them.");
    expect(notice.closest("details")).toBeNull();
  });

  it.each([executive, { ...mgo, active: false }, { ...mgo, role: "unknown" }])("never advertises editing in an unsupported workspace ($role/$active)", actingUser => {
    render(<HomeWorkspaceControls {...defaults} actingUser={actingUser} />);
    expect(screen.getByText(/This workspace is read-only/)).toBeVisible();
    expect(screen.queryByText(/Editing as Admin/)).not.toBeInTheDocument();
  });

  it("keeps opening, closing, and reselecting the current view free of side effects", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const onViewModeChange = vi.fn(), onActingWorkspaceChange = vi.fn();
    try {
      const { container } = render(<HomeWorkspaceControls {...defaults} onViewModeChange={onViewModeChange} onActingWorkspaceChange={onActingWorkspaceChange} />);
      expand(container);
      const active = screen.getByRole("button", { name: "MGO", exact: true });
      expect(active).toBeDisabled();
      fireEvent.click(active);
      expand(container);
      expect(container.querySelector("details")).not.toHaveAttribute("open");
      expect(onViewModeChange).not.toHaveBeenCalled();
      expect(onActingWorkspaceChange).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally { fetchSpy.mockRestore(); }
  });

  it.each([false, true])("uses the existing view callback only after a different view is chosen (reviewer: %s)", isReviewer => {
    const onViewModeChange = vi.fn();
    const { container } = render(<HomeWorkspaceControls {...defaults} isReviewer={isReviewer} onViewModeChange={onViewModeChange} />);
    expand(container);
    fireEvent.click(screen.getByRole("button", { name: isReviewer ? "MGO" : "Advancement Services", exact: true }));
    expect(onViewModeChange).toHaveBeenCalledExactlyOnceWith(isReviewer ? "mgo" : "reviewer");
  });

  it("preserves eligible workspace choices and the explicit return-to-self option", () => {
    const onActingWorkspaceChange = vi.fn();
    const { container } = render(<HomeWorkspaceControls {...defaults}
      mgoUsers={[...defaults.mgoUsers, { id: 11, role: "advancement_services", name: "Not viewable" }]}
      onActingWorkspaceChange={onActingWorkspaceChange} />);
    expand(container);
    const select = screen.getByRole("combobox", { name: "Work in a workspace" });
    expect(within(select).getAllByRole("option").map(option => option.textContent)).toEqual(["My workspace", "Selected MGO", "Selected Executive (Executive)"]);
    fireEvent.change(select, { target: { value: "9" } });
    expect(onActingWorkspaceChange).toHaveBeenLastCalledWith("9");
    fireEvent.change(select, { target: { value: "7" } });
    expect(onActingWorkspaceChange).toHaveBeenLastCalledWith("7");
  });

  it.each([false, true])("does not imply My workspace while the current workspace is unverified (failed: %s)", workspaceFailed => {
    const { container } = render(<HomeWorkspaceControls {...defaults} workspaceResolved={false} workspaceFailed={workspaceFailed} />);
    expect(container.querySelector("summary")).not.toHaveTextContent("My workspace");
    expect(container.querySelector("summary")).toHaveTextContent(workspaceFailed ? "Could not verify workspace" : "Loading workspace...");
    if (workspaceFailed) expect(screen.getByRole("alert")).toBeVisible();
    expand(container);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("does not advertise stale acting data as verified after a failed read", () => {
    const { container } = render(<HomeWorkspaceControls {...defaults} actingUser={mgo} workspaceFailed />);
    expect(screen.getByRole("alert")).toBeVisible();
    expect(container.querySelector("summary")).not.toHaveTextContent(mgo.name);
    expect(screen.queryByText(/Editing as Admin/)).not.toBeInTheDocument();
  });

  it.each(["usersPending", "usersFailed"])("preserves the confirmed selected person if the workspace list is unavailable (%s)", flag => {
    const { container } = render(<HomeWorkspaceControls {...defaults} actingUser={mgo} mgoUsers={[]} {...{ [flag]: true }} />);
    expect(container.querySelector("summary")).toHaveTextContent("Selected MGO");
    expand(container);
    expect(screen.getByRole("combobox")).toHaveValue("9");
    expect(screen.getByRole("combobox")).toBeDisabled();
    expect(screen.getByText(flag === "usersFailed" ? /workspace list could not load/ : /Loading available workspaces/)).toBeVisible();
  });
});
