import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { STANDARD_REPORT_DEFINITIONS, getStandardReportMetadata, getDashboardReportMetadata } from "@/app/api/utils/reportRegistry";
import ReportConfigurationEditor, { buildReportConfigurationPatch, createReportDraft } from "./ReportConfigurationEditor";

vi.mock("./ReportDashboardBuilder", () => ({ default: () => <div>Dashboard panel builder</div> }));
vi.mock("./ReportDashboardPanels", () => ({ default: () => <div>Dashboard preview</div> }));

const builtin = (key) => {
  const definition = STANDARD_REPORT_DEFINITIONS.find((item) => item.key === key);
  return { ...definition, ...getStandardReportMetadata(definition), visibility: "specific_users", specificUserIds: [1], dataConfiguration: null, canView: true };
};
const dashboard = () => ({ ...getDashboardReportMetadata("dashboard-test"), key: "dashboard-test", title: "Engagement", description: "Shared counts", visibility: "specific_users", specificUserIds: [1], active: false, canView: false, dataConfiguration: { version: 1, panels: [] } });
const users = [{ id: 1, name: "Reviewer One", email: "one@example.test", role: "reviewer" }, { id: 2, name: "Fundraiser Two", email: "two@example.test", role: "mgo" }];
const jsonResponse = (payload, ok = true) => ({ ok, json: async () => payload });

beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe("report configuration save contracts", () => {
  it("sends configuration without access and access without configuration", () => {
    const report = dashboard();
    const draft = createReportDraft(report);
    expect(buildReportConfigurationPatch(report, draft, "Configure")).toEqual({ reportKey: report.key, title: report.title, description: report.description, dataConfiguration: report.dataConfiguration });
    expect(buildReportConfigurationPatch(report, draft, "Access")).toEqual({ reportKey: report.key, visibility: "specific_users", specificUserIds: [1], active: false });
  });
  it("does not send unsupported built-in data configuration or activation", () => {
    const report = builtin("future-made-phase-ii");
    const patch = buildReportConfigurationPatch(report, createReportDraft(report), "Preview");
    expect(patch).not.toHaveProperty("active");
    expect(patch).not.toHaveProperty("dataConfiguration");
  });
});

describe("single-report editor", () => {
  it("shows one report and retains drafts across report and tab changes without fetching", () => {
    const first = builtin("future-made-phase-ii");
    const second = builtin("executive-team-standings");
    render(<ReportConfigurationEditor initialConfigurations={[first, second]} users={users} />);
    fireEvent.change(screen.getByLabelText("Report title"), { target: { value: "Working title" } });
    fireEvent.click(screen.getByRole("tab", { name: "Access" }));
    expect(screen.queryByLabelText("Report title")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Fundraiser Two/ }));
    fireEvent.change(screen.getByLabelText("Selected report"), { target: { value: second.key } });
    fireEvent.click(screen.getByRole("tab", { name: "Configure" }));
    expect(screen.getByLabelText("Report title")).toHaveValue(second.title);
    fireEvent.change(screen.getByLabelText("Selected report"), { target: { value: first.key } });
    expect(screen.getByLabelText("Report title")).toHaveValue("Working title");
    fireEvent.click(screen.getByRole("tab", { name: /Access/ }));
    expect(screen.getByRole("checkbox", { name: /Fundraiser Two/ })).toBeChecked();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("saves access without erasing unsaved configuration", async () => {
    const report = dashboard();
    fetch.mockResolvedValue(jsonResponse({ configuration: { ...report, specificUserIds: [1, 2] } }));
    render(<ReportConfigurationEditor initialConfigurations={[report]} users={users} />);
    fireEvent.change(screen.getByLabelText("Report title"), { target: { value: "Not saved yet" } });
    fireEvent.click(screen.getByRole("tab", { name: "Access" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Fundraiser Two/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save access" }));
    await screen.findByText(/Access settings saved/);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ reportKey: report.key, visibility: "specific_users", specificUserIds: [1, 2], active: false });
    fireEvent.click(screen.getByRole("tab", { name: /Configure/ }));
    expect(screen.getByLabelText("Report title")).toHaveValue("Not saved yet");
    expect(screen.getByRole("button", { name: "Save configuration" })).toBeEnabled();
  });

  it("retains access changes when only configuration is saved", async () => {
    const report = dashboard();
    fetch.mockResolvedValue(jsonResponse({ configuration: { ...report, title: "New title" } }));
    render(<ReportConfigurationEditor initialConfigurations={[report]} users={users} />);
    fireEvent.click(screen.getByRole("tab", { name: "Access" }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Fundraiser Two/ }));
    fireEvent.click(screen.getByRole("tab", { name: "Configure" }));
    fireEvent.change(screen.getByLabelText("Report title"), { target: { value: "New title" } });
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
    await screen.findByText(/Configuration saved/);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty("specificUserIds");
    fireEvent.click(screen.getByRole("tab", { name: /Access/ }));
    expect(screen.getByRole("checkbox", { name: /Fundraiser Two/ })).toBeChecked();
    expect(screen.getByRole("button", { name: "Save access" })).toBeEnabled();
  });

  it("creates a disabled report before offering access settings", async () => {
    const saved = { ...dashboard(), title: "New engagement report", specificUserIds: [] };
    fetch.mockResolvedValue(jsonResponse({ configuration: saved }));
    render(<ReportConfigurationEditor initialConfigurations={[builtin("future-made-phase-ii")]} users={users} />);
    fireEvent.click(screen.getByRole("button", { name: "Add report" }));
    fireEvent.click(screen.getByRole("tab", { name: "Access" }));
    expect(screen.getByText(/Save this report in Configure first/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create disabled report" })).toBeDisabled();
    fireEvent.click(screen.getByRole("tab", { name: "Configure" }));
    fireEvent.change(screen.getByLabelText("Report title"), { target: { value: saved.title } });
    fireEvent.click(screen.getByRole("button", { name: "Create disabled report" }));
    await screen.findByText(/Report created as a disabled draft/);
    expect(fetch.mock.calls[0][1].method).toBe("POST");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ title: saved.title, description: "", dataConfiguration: { version: 1, panels: [] } });
    expect(screen.getByRole("checkbox", { name: /Enable this report/ })).not.toBeChecked();
  });

  it("keeps failed saves editable and reports validation failures", async () => {
    fetch.mockResolvedValue(jsonResponse({ error: "Database unavailable" }, false));
    render(<ReportConfigurationEditor initialConfigurations={[dashboard()]} users={users} />);
    fireEvent.change(screen.getByLabelText("Report title"), { target: { value: "Keep my draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Database unavailable");
    expect(screen.getByLabelText("Report title")).toHaveValue("Keep my draft");
    expect(screen.getByRole("button", { name: "Save configuration" })).toBeEnabled();
    fireEvent.change(screen.getByLabelText("Report title"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save configuration" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter a report title");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("loads only a snapshot for preview and supports keyboard tabs", async () => {
    fetch.mockResolvedValue(jsonResponse({ snapshot: null }));
    render(<ReportConfigurationEditor initialConfigurations={[dashboard()]} users={users} />);
    fireEvent.keyDown(screen.getByRole("tab", { name: "Configure" }), { key: "End" });
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    expect(fetch.mock.calls[0][0]).toBe("/api/reports/dashboards/dashboard-test?preview=1");
    expect(fetch.mock.calls[0][1]).not.toHaveProperty("method", "POST");
  });
});
