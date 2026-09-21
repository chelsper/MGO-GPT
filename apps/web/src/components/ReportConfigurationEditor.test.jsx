import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { STANDARD_REPORT_DEFINITIONS, getStandardReportMetadata, getDashboardReportMetadata } from "@/app/api/utils/reportRegistry";
import ReportConfigurationEditor, { buildReportConfigurationPatch, createReportDraft } from "./ReportConfigurationEditor";
import { listMetadata } from "@/utils/constituentLists";

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
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("report configuration save contracts", () => {
  it("enables legacy list data settings without changing legacy access policy or activation", () => {
    const report = builtin("future-made-phase-ii");
    const draft = createReportDraft(report);
    draft.dataConfiguration.fieldCategory = "Configured membership";
    const patch = buildReportConfigurationPatch(report, draft, "Configure");
    expect(patch.dataConfiguration).toMatchObject({ version: 1, fieldDescription: "Future. Made. Phase II" });
    expect(patch).not.toHaveProperty("configurationSchema");
    expect(patch).not.toHaveProperty("active");
    expect(patch).not.toHaveProperty("visibility");
  });
  it("does not migrate the legacy query when only its title is changed", () => {
    const report = builtin("future-made-phase-ii");
    const draft = { ...createReportDraft(report), title: "New display title" };
    const patch = buildReportConfigurationPatch(report, draft, "Configure");
    expect(patch.title).toBe("New display title");
    expect(patch).not.toHaveProperty("dataConfiguration");
  });
  it("sends configuration without access and access without configuration", () => {
    const report = dashboard();
    const draft = createReportDraft(report);
    expect(buildReportConfigurationPatch(report, draft, "Configure")).toEqual({ reportKey: report.key, title: report.title, description: report.description, dataConfiguration: report.dataConfiguration });
    expect(buildReportConfigurationPatch(report, draft, "Access")).toEqual({ reportKey: report.key, visibility: "specific_users", specificUserIds: [1], active: false });
  });
  it("does not send unsupported built-in data configuration or activation", () => {
    const report = builtin("executive-team-standings");
    const patch = buildReportConfigurationPatch(report, createReportDraft(report), "Preview");
    expect(patch).not.toHaveProperty("active");
    expect(patch).not.toHaveProperty("dataConfiguration");
  });
});

describe("single-report editor", () => {
  it("creates a disabled custom-field list without reading NXT and previews its exact criteria", async () => {
    const saved = { ...listMetadata("list-demo"), title: "Interests", description: "", active: false, specificUserIds: [], dataConfiguration: { version: 1, source: "custom_field", fieldCategory: "Interests", fieldDescription: "" }, revision: "1" };
    fetch.mockResolvedValue(jsonResponse({ configuration: saved }));
    render(<ReportConfigurationEditor initialConfigurations={[]} users={users} />);
    fireEvent.click(screen.getByRole("button", { name: "Add list" }));
    fireEvent.change(screen.getByLabelText("List title"), { target: { value: "Interests" } });
    fireEvent.change(screen.getByLabelText(/^NXT custom field category/), { target: { value: "Interests" } });
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Create disabled list" }));
    await screen.findByText(/List created as a disabled draft/);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ configurationSchema: "constituent-list-v1", dataConfiguration: saved.dataConfiguration });
    expect(screen.getByRole("checkbox", { name: /Enable this report/ })).not.toBeChecked();
    fireEvent.click(screen.getByRole("tab", { name: "Preview" }));
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: "Delete report" })).not.toBeInTheDocument();
  });

  it("returns to Setup Hub and retains the unsaved-change warning without autosaving", () => {
    const report = dashboard();
    const { unmount } = render(<ReportConfigurationEditor initialConfigurations={[report]} users={users} />);
    expect(screen.getByRole("link", { name: "Back to Setup Hub" })).toHaveAttribute("href", "/setup");
    expect(screen.getByRole("link", { name: "Metric Library" })).toHaveAttribute("href", "/report-configurations/metrics");
    expect(screen.queryByRole("link", { name: /Back to dashboard/ })).not.toBeInTheDocument();
    const clean = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(clean);
    expect(clean.defaultPrevented).toBe(false);
    fireEvent.change(screen.getByLabelText("Report title"), { target: { value: "Unsaved report title" } });
    const dirty = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirty);
    expect(dirty.defaultPrevented).toBe(true);
    expect(screen.getByLabelText("Report title")).toHaveValue("Unsaved report title");
    expect(fetch).not.toHaveBeenCalled();
    unmount();
    const afterLeaving = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(afterLeaving);
    expect(afterLeaving.defaultPrevented).toBe(false);
  });

  it("provides the same return destination when no reports exist yet", () => {
    render(<ReportConfigurationEditor initialConfigurations={[]} users={users} />);
    expect(screen.getByRole("link", { name: "Back to Setup Hub" })).toHaveAttribute("href", "/setup");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shows one report and retains drafts across report and tab changes without fetching", () => {
    const first = builtin("future-made-phase-ii");
    const second = builtin("executive-team-standings");
    render(<ReportConfigurationEditor initialConfigurations={[first, second]} users={users} />);
    fireEvent.change(screen.getByLabelText("List title"), { target: { value: "Working title" } });
    fireEvent.click(screen.getByRole("tab", { name: "Access" }));
    expect(screen.queryByLabelText("Report title")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: /Fundraiser Two/ }));
    fireEvent.change(screen.getByLabelText("Selected report"), { target: { value: second.key } });
    fireEvent.click(screen.getByRole("tab", { name: "Configure" }));
    expect(screen.getByLabelText("Report title")).toHaveValue(second.title);
    fireEvent.change(screen.getByLabelText("Selected report"), { target: { value: first.key } });
    expect(screen.getByLabelText("List title")).toHaveValue("Working title");
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

  it("permanently deletes only user-created reports after confirmation", async () => {
    const report = dashboard();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fetch.mockResolvedValue(
      jsonResponse({
        deletedReportKey: report.key,
        message: "Report and its saved snapshot were deleted.",
      }),
    );
    render(
      <ReportConfigurationEditor
        initialConfigurations={[report, builtin("future-made-phase-ii")]}
        users={users}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Delete report" }));
    expect(
      await screen.findByText("Report and its saved snapshot were deleted."),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith(
      "/api/reports/configurations",
      expect.objectContaining({
        method: "DELETE",
        body: JSON.stringify({ reportKey: report.key }),
      }),
    );
    expect(screen.queryByRole("button", { name: "Delete report" })).not.toBeInTheDocument();
  });
});
