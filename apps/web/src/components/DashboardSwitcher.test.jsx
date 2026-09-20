import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, expect, it, vi } from "vitest";
import SharedReportHeader from "@/app/reports/SharedReportHeader";

const alumni = { key: "alumni-family-engagement", title: "Engagement", canView: true };
const custom = { key: "campaign", title: "Campaign", configurationSchema: "query-count-dashboard-v1", canView: true, active: true };
function Location() { const { pathname } = useLocation(); return <output aria-label="Location">{pathname}</output>; }
function mount(props = {}) {
  return render(<MemoryRouter initialEntries={["/reports/alumni-family-engagement"]}>
    <Location />
    <SharedReportHeader title="Engagement" activeReportKey={alumni.key} reportSection="dashboards" accessibleReports={[alumni, custom]} {...props} />
  </MemoryRouter>);
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("groups the section, selects the current dashboard, and switches without a refresh", () => {
  const fetch = vi.spyOn(globalThis, "fetch");
  mount();
  expect(screen.getByRole("link", { name: "My Dashboards", exact: true })).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Back to My Dashboards" })).toHaveAttribute("href", "/reports/dashboards");
  const select = screen.getByRole("combobox", { name: "Dashboard" });
  expect(select).toHaveValue(alumni.key);
  fireEvent.change(select, { target: { value: "campaign" } });
  expect(screen.getByLabelText("Location")).toHaveTextContent("/reports/dashboards/campaign");
  expect(fetch).not.toHaveBeenCalled();
});

it("keeps the existing Alumni URL available from custom dashboards", () => {
  mount({ title: "Campaign", activeReportKey: custom.key });
  expect(screen.getByRole("combobox")).toHaveValue(custom.key);
  fireEvent.change(screen.getByRole("combobox"), { target: { value: alumni.key } });
  expect(screen.getByLabelText("Location")).toHaveTextContent("/reports/alumni-family-engagement");
});

it("never adds inaccessible or disabled dashboard choices", () => {
  mount({ accessibleReports: [custom, { ...alumni, canView: false }, { ...custom, key: "draft", title: "Draft", active: false }] });
  expect(screen.getByRole("combobox")).toHaveValue("");
  expect(screen.queryByRole("option", { name: "Engagement" })).not.toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Draft" })).not.toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Campaign" })).toBeInTheDocument();
});

it("disables switching during layout editing and hides the control without choices", () => {
  const view = mount({ dashboardSwitchDisabled: true });
  expect(screen.getByRole("combobox")).toBeDisabled();
  expect(screen.getByRole("combobox")).toHaveAccessibleDescription(/Finish or cancel arranging/);
  view.unmount();
  mount({ accessibleReports: [] });
  expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Back to My Dashboards" })).toHaveAttribute("href", "/reports/dashboards");
});
