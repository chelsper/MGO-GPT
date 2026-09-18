import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReportConfigurationEditor from "./ReportConfigurationEditor";
import ReportLayoutTransfer from "./ReportLayoutTransfer";
import { getDashboardReportMetadata, getStandardReportMetadata, STANDARD_REPORT_DEFINITIONS } from "@/app/api/utils/reportRegistry";
import { buildReportLayoutTemplate, createReportStarter, REPORT_LAYOUT_MAX_BYTES } from "@/utils/reportLayoutTemplates";

const report = () => ({ ...getDashboardReportMetadata("dashboard-existing"), key: "dashboard-existing", title: "Existing dashboard", description: "Saved description", active: true, visibility: "specific_users", specificUserIds: [1], dataConfiguration: createReportStarter("static") });
const users = [{ id: 1, name: "Reviewer", email: "reviewer@example.test", role: "reviewer" }];
const layoutFile = (kind = "query_results", patch = {}) => ({ size: 1000, text: async () => JSON.stringify(buildReportLayoutTemplate({ ...report(), title: "Transferred layout", dataConfiguration: createReportStarter(kind) })), ...patch });
async function chooseLayout(file = layoutFile()) {
  fireEvent.click(screen.getByText("Reuse a report layout", { selector: "summary" }));
  fireEvent.change(screen.getByLabelText("Choose a report layout file"), { target: { files: [file] } });
  await screen.findByRole("button", { name: "Open as new draft" });
}
beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("guided report setup", () => {
  it("starts with a suggested layout without fetching or changing an existing report", () => {
    render(<ReportConfigurationEditor initialConfigurations={[report()]} users={users} />);
    fireEvent.click(screen.getByRole("button", { name: "Add report" }));
    fireEvent.click(screen.getByRole("button", { name: /Query results list/ }));
    expect(screen.getByLabelText("Panel title")).toHaveValue("Query results");
    expect(screen.getByText("0 of 1 query IDs entered. IDs are not verified here.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Load query preview" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Selected report"), { target: { value: "dashboard-existing" } });
    expect(screen.getByLabelText("Report title")).toHaveValue("Existing dashboard");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("makes guide steps keyboard-accessible and does not claim query verification", () => {
    render(<ReportConfigurationEditor initialConfigurations={[]} users={users} />);
    fireEvent.click(screen.getByRole("button", { name: "Add report" }));
    fireEvent.click(screen.getByRole("button", { name: /Key metric/ }));
    fireEvent.change(screen.getByLabelText("Query ID"), { target: { value: "9090" } });
    expect(screen.getByText("1 of 1 query IDs entered. IDs are not verified here.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /3 Review layout/ }));
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Preview" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("button", { name: /4 Choose viewers/ }));
    expect(screen.getByText(/Save this report in Configure first/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("requires explicit import, remapping, creation, and access; never patches the source", async () => {
    const existing = report();
    render(<ReportConfigurationEditor initialConfigurations={[existing]} users={users} />);
    fireEvent.change(screen.getByLabelText("Report title"), { target: { value: "Keep source draft" } });
    await chooseLayout();
    expect(screen.getByLabelText("Report title")).toHaveValue("Keep source draft");
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open as new draft" }));
    expect(screen.getByLabelText("Report title")).toHaveValue("Transferred layout");
    expect(screen.getByLabelText("Report title")).toHaveFocus();
    expect(screen.getByLabelText("Query ID")).toHaveValue("");
    fireEvent.click(screen.getByRole("button", { name: "Create disabled report" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/positive numeric/);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Query ID"), { target: { value: "890" } });
    const saved = { ...existing, key: "dashboard-new", title: "Transferred layout", active: false, specificUserIds: [], dataConfiguration: createReportStarter("query_results") };
    saved.dataConfiguration.panels[0].queryId = "890";
    fetch.mockResolvedValue({ ok: true, json: async () => ({ configuration: saved }) });
    fireEvent.click(screen.getByRole("button", { name: "Create disabled report" }));
    await screen.findByText(/Report created as a disabled draft/);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, options] = fetch.mock.calls[0];
    expect(url).toBe("/api/reports/configurations");
    expect(options.method).toBe("POST");
    const payload = JSON.parse(options.body);
    expect(Object.keys(payload).sort()).toEqual(["dataConfiguration", "description", "title"]);
    expect(payload.dataConfiguration.panels[0].queryId).toBe("890");
    expect(screen.getByRole("checkbox", { name: /Enable this report/ })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: /Reviewer/ })).not.toBeChecked();
    fireEvent.change(screen.getByLabelText("Selected report"), { target: { value: existing.key } });
    fireEvent.click(screen.getByRole("tab", { name: /Configure/ }));
    expect(screen.getByLabelText("Report title")).toHaveValue("Keep source draft");
  });

  it("requires confirmation before replacing an unsaved new draft", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<ReportConfigurationEditor initialConfigurations={[]} users={users} />);
    fireEvent.click(screen.getByRole("button", { name: "Add report" }));
    fireEvent.change(screen.getByLabelText("Report title"), { target: { value: "Keep this draft" } });
    await chooseLayout(layoutFile("static"));
    fireEvent.click(screen.getByRole("button", { name: "Open as new draft" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Report title")).toHaveValue("Keep this draft");
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole("button", { name: "Open as new draft" }));
    expect(screen.getByLabelText("Report title")).toHaveValue("Transferred layout");
    expect(screen.getByText(/2 manual values are blank/)).toBeInTheDocument();
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps built-in calculations outside layout transfer", () => {
    const definition = STANDARD_REPORT_DEFINITIONS[0];
    render(<ReportConfigurationEditor initialConfigurations={[{ ...definition, ...getStandardReportMetadata(definition), specificUserIds: [] }]} users={users} />);
    fireEvent.click(screen.getByText("Reuse a report layout", { selector: "summary" }));
    expect(screen.getByRole("button", { name: "Download layout" })).toBeDisabled();
    expect(screen.queryByRole("region", { name: "Report setup guide" })).not.toBeInTheDocument();
    expect(screen.getByText(/Built-in report: presentation/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe("layout file controls", () => {
  it("downloads only allowlisted draft layout fields without saving", async () => {
    const createUrl = vi.fn(() => "blob:layout");
    vi.stubGlobal("URL", { createObjectURL: createUrl, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    render(<ReportLayoutTransfer draft={report()} onImport={vi.fn()} />);
    fireEvent.click(screen.getByText("Reuse a report layout", { selector: "summary" }));
    fireEvent.click(screen.getByRole("button", { name: "Download layout" }));
    expect(click).toHaveBeenCalledOnce();
    const blob = createUrl.mock.calls[0][0];
    const content = await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blob); });
    expect(JSON.parse(content)).toEqual(buildReportLayoutTemplate(report()));
    expect(content).not.toMatch(/specificUserIds|staticValue|queryId|active/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects oversize files before reading, then allows retry without mutation", async () => {
    const onImport = vi.fn();
    const read = vi.fn();
    render(<ReportLayoutTransfer draft={report()} onImport={onImport} />);
    fireEvent.click(screen.getByText("Reuse a report layout", { selector: "summary" }));
    fireEvent.change(screen.getByLabelText("Choose a report layout file"), { target: { files: [{ size: REPORT_LAYOUT_MAX_BYTES + 1, text: read }] } });
    expect(screen.getByRole("alert")).toHaveTextContent("128 KB");
    expect(read).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Choose a report layout file"), { target: { files: [layoutFile("static", { text: async () => "not json" })] } });
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("not valid JSON"));
    expect(screen.queryByRole("button", { name: "Open as new draft" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Choose a report layout file"), { target: { files: [layoutFile()] } });
    await screen.findByRole("button", { name: "Open as new draft" });
    expect(onImport).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("ignores an older file read and respects the saving lock", async () => {
    let finish;
    const onImport = vi.fn();
    const { rerender } = render(<ReportLayoutTransfer draft={report()} onImport={onImport} />);
    fireEvent.click(screen.getByText("Reuse a report layout", { selector: "summary" }));
    fireEvent.change(screen.getByLabelText("Choose a report layout file"), { target: { files: [layoutFile("static", { text: () => new Promise((resolve) => { finish = resolve; }) })] } });
    fireEvent.change(screen.getByLabelText("Choose a report layout file"), { target: { files: [layoutFile()] } });
    await screen.findByRole("button", { name: "Open as new draft" });
    finish("bad old file");
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    rerender(<ReportLayoutTransfer draft={report()} onImport={onImport} disabled />);
    expect(screen.getByRole("button", { name: "Open as new draft" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Download layout" })).toBeDisabled();
    expect(screen.getByLabelText("Choose a report layout file")).toBeDisabled();
    expect(onImport).not.toHaveBeenCalled();
  });
});
