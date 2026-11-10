import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectProspectResults from "./ProjectProspectResults";
import { projectSource } from "@/utils/projectProspecting";
const tag = { id: "55f50c08-3151-4d2d-81ef-881f7629b4a6", name: "Leadership interest" };
const report = { key: "list-project-center", title: "The Center Prospects", revision: "r1", canConfigure: true,
  dataConfiguration: { ...projectSource(), systemIdColumn: "System ID" } };
const snapshot = { generatedAt: "s1", headers: ["Name", "System ID"], tableRows: [["Fictional Avery", "123"], ["Fictional Blake", "456"]], total: 2 };
let tags, assignments;
const response = (payload, status = 200) => ({ ok: status === 200, status, json: async () => payload });
beforeEach(() => {
  tags = [tag]; assignments = [];
  vi.stubGlobal("fetch", vi.fn(async (url, options) => {
    if (options?.method === "POST") {
      const body = JSON.parse(options.body);
      if (body.action === "create") { tags = [...tags, { id: "new", name: body.name }]; return response({ tag: tags.at(-1), changed: 0 }); }
      assignments = body.action === "apply" ? body.constituentIds.map(constituentId => ({ constituentId, tagId: body.tagId })) : [];
      return response({ tag, changed: body.constituentIds.length });
    }
    return response({ revision: "r1", snapshotAt: "s1", tags, assignments });
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const open = async (props = {}) => {
  render(<ProjectProspectResults report={report} snapshot={snapshot} onReload={vi.fn()} {...props} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Export filtered CSV" })).not.toBeDisabled());
};
const selectAll = () => fireEvent.click(screen.getByRole("button", { name: "Select up to 100 people" }));
const chooseTag = () => fireEvent.change(screen.getByRole("combobox", { name: "Tag to apply or remove" }), { target: { value: tag.id } });
describe("project prospect tags UI", () => {
  it("opens with only a local read, bulk applies a tag, clears selection and filters", async () => {
    await open(); expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][0]).toBe("/api/reports/lists/list-project-center/tags");
    selectAll(); chooseTag(); fireEvent.click(screen.getByRole("button", { name: "Apply tag" }));
    await screen.findByText("2 constituents updated. Nothing changed in NXT.");
    expect(screen.getByText("0 selected")).toBeInTheDocument();
    const body = JSON.parse(fetch.mock.calls.find(([, options]) => options.method === "POST")[1].body);
    expect(body).toMatchObject({ constituentIds: ["123", "456"], snapshotAt: "s1", revision: "r1", action: "apply" });
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by tag" }), { target: { value: "__untagged" } });
    expect(screen.queryByText("Fictional Avery")).not.toBeInTheDocument();
  });
  it("creates tags, retains their names naturally and selects the new tag", async () => {
    await open(); fireEvent.click(screen.getByText("Create a tag"));
    fireEvent.change(screen.getByLabelText("New tag name"), { target: { value: " Board  connections " } });
    fireEvent.click(screen.getByRole("button", { name: "Create tag" }));
    await screen.findByText('Tag "Board connections" is ready to use.');
    expect(screen.getByRole("combobox", { name: "Tag to apply or remove" })).toHaveValue("new");
  });
  it("exports the filtered visible columns plus saved tags without additional API calls", async () => {
    assignments = [{ constituentId: "123", tagId: tag.id }];
    const objectUrl = vi.fn(() => "blob:project-csv");
    vi.stubGlobal("URL", { createObjectURL: objectUrl, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await open({ report: { ...report, dataConfiguration: { ...report.dataConfiguration, columns: [{ header: "System ID", visible: false }] } } });
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by tag" }), { target: { value: tag.id } });
    fireEvent.click(screen.getByRole("button", { name: "Export filtered CSV" }));
    const csv = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsText(objectUrl.mock.calls[0][0]); });
    expect(csv).toContain('"Name","Project tags"');
    expect(csv).toContain('"Fictional Avery","Leadership interest"');
    expect(csv).not.toContain("Blake"); expect(csv).not.toContain("System ID");
    expect(click).toHaveBeenCalledOnce(); expect(fetch).toHaveBeenCalledOnce();
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:project-csv"), { timeout: 2000 });
  });
  it("searches before selecting and clears selection if the filter changes", async () => {
    await open(); selectAll();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Avery" } });
    expect(screen.getByText("0 selected")).toBeInTheDocument(); selectAll();
    expect(screen.getByText("1 selected")).toBeInTheDocument();
  });
  it("keeps checkbox identity correct after sorting the table", async () => {
    await open();
    const heading = screen.getByRole("button", { name: "Name" }); fireEvent.click(heading); fireEvent.click(heading);
    const checkboxes = within(screen.getByRole("table", { name: report.title })).getAllByRole("checkbox");
    expect(checkboxes[0]).toHaveAttribute("aria-label", "Select constituent 456");
    fireEvent.click(checkboxes[0]); chooseTag();
    fireEvent.click(screen.getByRole("button", { name: "Apply tag" }));
    await screen.findByText("1 constituent updated. Nothing changed in NXT.");
    expect(JSON.parse(fetch.mock.calls.find(([, options]) => options.method === "POST")[1].body).constituentIds).toEqual(["456"]);
  });
  it("blocks tagging without mapping while preserving the query output", async () => {
    await open({ report: { ...report, dataConfiguration: projectSource() } });
    expect(screen.getByText("Fictional Avery")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select up to 100 people" })).toBeDisabled();
    expect(screen.getByRole("link", { name: "Project settings" })).toHaveAttribute("href", "/report-configurations?report=list-project-center");
  });
  it("preserves an empty successful query and offers no selections", async () => {
    await open({ snapshot: { ...snapshot, total: 0, tableRows: [] } });
    expect(screen.getByText(/No rows returned. This query completed successfully./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select up to 100 people" })).toBeDisabled();
  });
  it("recovers a failed save without stranding the user on a reload loop", async () => {
    const onReload = vi.fn(); await open({ onReload }); selectAll(); chooseTag();
    fetch.mockResolvedValueOnce(response({ error: "Settings changed" }, 409));
    fireEvent.click(screen.getByRole("button", { name: "Apply tag" }));
    await screen.findByRole("alert"); expect(screen.getByRole("button", { name: "Apply tag" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reload project" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(onReload).toHaveBeenCalledOnce(); expect(screen.getByRole("button", { name: "Select up to 100 people" })).not.toBeDisabled();
  });
  it("does not double-submit while a tag save is pending", async () => {
    await open(); selectAll(); chooseTag(); let resolve;
    fetch.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const button = screen.getByRole("button", { name: "Apply tag" }); fireEvent.click(button); fireEvent.click(button);
    expect(fetch.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
    await act(async () => resolve(response({ tag, changed: 2 })));
  });
});
