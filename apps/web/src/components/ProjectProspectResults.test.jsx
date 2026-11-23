import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectProspectResults from "./ProjectProspectResults";
import { projectSource } from "@/utils/projectProspecting";
import { PROJECT_TAG_REQUEST_TIMEOUT_MS } from "@/utils/projectTagRequest";
const tag = { id: "55f50c08-3151-4d2d-81ef-881f7629b4a6", name: "Leadership interest" };
const report = { key: "list-project-center", title: "The Center Prospects", revision: "r1", canConfigure: true,
  dataConfiguration: { ...projectSource(), systemIdColumn: "System ID" } };
const snapshot = { generatedAt: "s1", headers: ["Name", "System ID"], tableRows: [["Fictional Avery", "123"], ["Fictional Blake", "456"]], total: 2 };
let tags, assignments, archivedIds;
const response = (payload, status = 200) => ({ ok: status === 200, status, json: async () => payload });
beforeEach(() => {
  tags = [tag]; assignments = []; archivedIds = [];
  vi.stubGlobal("fetch", vi.fn(async (url, options) => {
    if (options?.method === "POST") {
      const body = JSON.parse(options.body);
      if (body.action === "create") { tags = [...tags, { id: "new", name: body.name }]; return response({ tag: tags.at(-1), changed: 0 }); }
      if (body.action === "archive") archivedIds = [...new Set([...archivedIds, ...body.constituentIds])];
      if (body.action === "restore") archivedIds = archivedIds.filter(id => !body.constituentIds.includes(id));
      if (body.action === "apply") assignments = [...assignments, ...body.constituentIds.map(constituentId => ({ constituentId, tagId: body.tagId }))];
      if (body.action === "remove") assignments = assignments.filter(a => a.tagId !== body.tagId || !body.constituentIds.includes(a.constituentId));
      return response({ tag, changed: body.constituentIds.length });
    }
    return response({ revision: "r1", snapshotAt: "s1", tags, assignments, archivedIds });
  }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const open = async (props = {}) => {
  render(<ProjectProspectResults report={report} snapshot={snapshot} onReload={vi.fn()} {...props} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Export filtered CSV" })).not.toBeDisabled());
};
const selectAll = () => fireEvent.click(screen.getByRole("button", { name: "Select up to 100 people" }));
const chooseTag = () => fireEvent.change(screen.getByRole("combobox", { name: "Tag to apply or remove" }), { target: { value: tag.id } });
describe("project prospect tags UI", () => {
  it("defaults to equal-weight Prospect Ranking with primary-only household giving", async () => {
    assignments = [{ constituentId: "456", tagId: tag.id }];
    const headers = ["Name", "System ID", "Constituent ID", "Spouse ID", "Marital Status", "Head of Household", "Constituency", "Spouse Constituency", "Lifetime Giving", "Last Gift Amount", "Key Indicator"];
    await open({ snapshot: { ...snapshot, headers, total: 3, tableRows: [
      ["Fictional Spouse", "456", "L2", "L1", "Married", "No", "Friend", "Alumni Bachelor's Degree", "900000", "99999", "Individual"],
      ["Fictional Primary", "123", "L1", "L2", "Married", "Yes", "Trustee", "Friend", "100", "50", "Individual"],
      ["Fictional Organization", "789", "L3", "", "", "", "Corporation", "", "200", "75", "Organization"],
    ] } });
    expect(screen.getByRole("combobox", { name: "Sort by", exact: true })).toHaveValue("ranking");
    const table = screen.getByRole("table");
    const household = within(table).getAllByRole("row").find(row => row.textContent.includes("Fictional Primary"));
    const headings = within(table).getAllByRole("columnheader").map(h => h.textContent);
    const cells = within(household).getAllByRole("cell");
    expect(cells[headings.indexOf("Lifetime Giving")].textContent).toContain("100");
    expect(cells[headings.indexOf("Lifetime Giving")].textContent).not.toContain("900000");
    expect(cells[headings.indexOf("Last Gift Amount")].textContent).not.toContain("99999");
    expect(cells[headings.indexOf("Last Gift Amount")].textContent).toContain("Head of household: Fictional Primary");
    const score = within(household).getByText(/Prospect score:/).textContent;
    fireEvent.change(screen.getByRole("combobox", { name: "Filter by tag" }), { target: { value: tag.id } });
    expect(screen.getByText(score)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select constituent 123" })).toBeDisabled();
    expect(screen.getByRole("checkbox", { name: "Select constituent 456" })).toBeEnabled();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("exports all matching people in the selected order and preserves selection identity", async () => {
    const objectUrl = vi.fn(() => "blob:project-csv");
    vi.stubGlobal("URL", { createObjectURL: objectUrl, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Select constituent 123" }));
    fireEvent.change(screen.getByRole("combobox", { name: "Sort by", exact: true }), { target: { value: "name" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Sort direction" }), { target: { value: "descending" } });
    expect(screen.getByRole("checkbox", { name: "Select constituent 123" })).toBeChecked();
    expect(within(screen.getByRole("table")).getAllByRole("checkbox")[0]).toHaveAttribute("aria-label", "Select constituent 456");
    fireEvent.click(screen.getByRole("button", { name: "Export filtered CSV" }));
    const csv = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(objectUrl.mock.calls[0][0]); });
    expect(csv.indexOf("Fictional Blake")).toBeLessThan(csv.indexOf("Fictional Avery"));
    fireEvent.click(screen.getByRole("button", { name: "Reset sort" }));
    expect(screen.getByRole("combobox", { name: "Sort by", exact: true })).toHaveValue("ranking");
    expect(fetch).toHaveBeenCalledOnce();
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalled(), { timeout: 2000 });
  });
  it("keeps tag controls and the keyboard-scrollable results in the same workspace", async () => {
    await open();
    const workspace = screen.getByRole("region", { name: "Project list workspace" });
    expect(within(workspace).getByRole("group", { name: "Project tag controls" })).toBeInTheDocument();
    expect(within(workspace).getByRole("region", { name: "The Center Prospects table scroll area" })).toHaveAttribute("tabindex", "0");
    fireEvent.click(within(workspace).getByText("Archive / restore selected"));
    selectAll();
    screen.getByRole("button", { name: "Archive selected" }).focus();
    fireEvent.click(screen.getByRole("button", { name: "Archive selected" }));
    expect(screen.getByRole("region", { name: "Confirm project change" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("button", { name: "Archive selected" })).toHaveFocus();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("supports 100 source columns even when no name field can be identified", async () => {
    const headers = ["System ID", ...Array.from({ length: 99 }, (_, i) => `Field ${i}`)];
    await open({ snapshot: { ...snapshot, total: 1, headers, tableRows: [["123", ...headers.slice(1).map(() => "Value")]] } });
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Select constituent 123" })).not.toBeDisabled();
    expect(screen.getByText("Constituent 123", { exact: true })).toBeInTheDocument();
  });
  it("keeps wide saved project output visible and taggable with system IDs unchanged", async () => {
    const extra=Array.from({length:46},(_,i)=>`Installment field ${i}`);
    await open({snapshot:{...snapshot,headers:[...snapshot.headers,...extra],tableRows:snapshot.tableRows.map(row=>[...row,...extra.map(()=>"Fictional")])}});
    expect(screen.getByRole("table",{name:report.title})).toBeInTheDocument();
    expect(screen.queryByText("Not refreshed")).not.toBeInTheDocument();
    selectAll();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
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
  it("explains an empty filter without suggesting a query failure", async () => {
    await open(); fireEvent.change(screen.getByRole("searchbox"), { target: { value: "No matching person" } });
    expect(screen.getByText("No people match these filters. Your saved project list is unchanged.")).toBeInTheDocument();
    expect(screen.queryByText(/No rows returned/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show active people" }));
    expect(screen.getByText("Fictional Avery", { exact: true })).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("blocks edits when archive status cannot be loaded", async () => {
    fetch.mockResolvedValueOnce(response({ revision: "r1", snapshotAt: "s1", tags, assignments }));
    render(<ProjectProspectResults report={report} snapshot={snapshot} onReload={vi.fn()} />);
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Archive Fictional Avery", exact: true })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Export filtered CSV" })).toBeDisabled();
  });
  it("keeps checkbox identity correct after sorting the table", async () => {
    await open();
    const heading = screen.getByRole("button", { name: "People & tags" }); fireEvent.click(heading); fireEvent.click(heading);
    const checkboxes = within(screen.getByRole("table", { name: report.title })).getAllByRole("checkbox");
    expect(checkboxes[0]).toHaveAttribute("aria-label", "Select constituent 456");
    fireEvent.click(checkboxes[0]); chooseTag();
    fireEvent.click(screen.getByRole("button", { name: "Apply tag" }));
    await screen.findByText("1 constituent updated. Nothing changed in NXT.");
    expect(JSON.parse(fetch.mock.calls.find(([, options]) => options.method === "POST")[1].body).constituentIds).toEqual(["456"]);
  });
  it("shows one row per constituent while preserving alternate values, tags, search and export", async () => {
    assignments = [{ constituentId: "123", tagId: tag.id }];
    const objectUrl = vi.fn(() => "blob:project-csv");
    vi.stubGlobal("URL", { createObjectURL: objectUrl, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await open({ snapshot: { ...snapshot, headers: ["Name", "System ID", "Interest"], total: 4, tableRows: [
      ["Fictional Avery", "123", "Arts"], ["Fictional Avery", "456", "Research"],
      ["Fictional Avery", "123", "Science"], ["Fictional Avery", "123", "Arts"],
    ] } });
    const table = screen.getByRole("table", { name: report.title });
    expect(within(table).getAllByRole("checkbox")).toHaveLength(2);
    expect(screen.getByRole("heading", { name: "2 constituents" })).toBeInTheDocument();
    expect(screen.getByText("2 of 2 constituents shown")).toBeInTheDocument();
    expect(screen.getByText(/2 repeated query rows were combined/)).toBeInTheDocument();
    expect(within(table).getAllByText(tag.name)).toHaveLength(1);
    fireEvent.click(screen.getByText("+1 more"));
    expect(screen.getByRole("list", { name: "Additional Interest values" })).toHaveTextContent("Science");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Science" } });
    expect(screen.getByText("1 of 2 constituents shown")).toBeInTheDocument();
    expect(within(table).getByRole("checkbox")).toHaveAttribute("aria-label", "Select constituent 123");
    fireEvent.click(screen.getByRole("button", { name: "Export filtered CSV" }));
    const csv = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(objectUrl.mock.calls[0][0]); });
    expect(csv).toContain('"Fictional Avery","123","Arts\nScience","Leadership interest"');
    expect(csv.match(/Fictional Avery/g)).toHaveLength(1);
    expect(fetch).toHaveBeenCalledOnce();
    selectAll(); chooseTag(); fireEvent.click(screen.getByRole("button", { name: "Remove tag" }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove" }));
    await screen.findByText("1 constituent updated. Nothing changed in NXT.");
    expect(JSON.parse(fetch.mock.calls.find(([, options]) => options.method === "POST")[1].body).constituentIds).toEqual(["123"]);
    await waitFor(() => expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:project-csv"), { timeout: 2000 });
  });
  it("keeps grouped values and tag selection aligned after reordering columns and sorting", async () => {
    await open({ report: { ...report, dataConfiguration: { ...report.dataConfiguration,
      columns: [{ header: "System ID", visible: false }, { header: "Name", visible: true }, { header: "Interest", visible: true }] } },
      snapshot: { ...snapshot, headers: ["Name", "System ID", "Interest"], total: 4, tableRows: [
        ["Avery", "123", "Arts"], ["Blake", "456", "Research"],
        ["Avery", "123", "Science"], ["Blake", "456", "Health"],
      ] } });
    fireEvent.click(screen.getByRole("button", { name: "People & tags", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "People & tags", exact: true }));
    const first = within(screen.getByRole("table", { name: report.title })).getAllByRole("row")[1];
    expect(first).toHaveTextContent("Blake"); expect(first).toHaveTextContent("Research"); expect(first).toHaveTextContent("Health");
    expect(first).not.toHaveTextContent("Science");
    fireEvent.click(within(first).getByRole("checkbox")); chooseTag();
    fireEvent.click(screen.getByRole("button", { name: "Apply tag" }));
    await screen.findByText("1 constituent updated. Nothing changed in NXT.");
    expect(JSON.parse(fetch.mock.calls.find(([, options]) => options.method === "POST")[1].body).constituentIds).toEqual(["456"]);
  });
  it("leaves blank and invalid identities visible but unselectable", async () => {
    await open({ snapshot: { ...snapshot, total: 4, tableRows: [["", ""], ["", ""], ["Same name", "bad"], ["Same name", "bad"]] } });
    const boxes = within(screen.getByRole("table", { name: report.title })).getAllByRole("checkbox");
    expect(boxes).toHaveLength(4); boxes.forEach(box => expect(box).toBeDisabled());
    expect(screen.getByText("4 of 4 entries shown")).toBeInTheDocument();
  });
  it("paginates unique constituents rather than their repeated query rows", async () => {
    const people = Array.from({ length: 26 }, (_, i) => [`Person ${i}`, String(i + 1)]);
    await open({ snapshot: { ...snapshot, total: 52, tableRows: people.flatMap(row => [row, row]) } });
    expect(screen.getByText("Rows 1-25 of 26; page 1 of 2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    const last = within(screen.getByRole("table", { name: report.title })).getAllByRole("checkbox");
    expect(last).toHaveLength(1); expect(last[0]).toHaveAttribute("aria-label", "Select constituent 26");
    selectAll(); expect(screen.getByText("26 selected")).toBeInTheDocument();
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
  it("shows a stalled create, preserves the name, and reconciles by read without replaying", async () => {
    await open(); vi.useFakeTimers();
    fireEvent.click(screen.getByText("Create a tag"));
    fireEvent.change(screen.getByLabelText("New tag name"), { target: { value: "Board connections" } });
    let finish;
    fetch.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    fireEvent.click(screen.getByRole("button", { name: "Create tag" }));
    expect(screen.getByRole("button", { name: "Creating tag..." })).toBeDisabled();
    await act(async () => vi.advanceTimersByTimeAsync(PROJECT_TAG_REQUEST_TIMEOUT_MS));
    expect(screen.getByRole("alert")).toHaveTextContent(/may have finished.*Reload/);
    expect(screen.getByRole("button", { name: "Reload project" })).not.toBeDisabled();
    expect(screen.getByLabelText("New tag name")).toHaveValue("Board connections");
    tags.push({ ...tag, id: "late-tag", name: "Board connections" });
    await act(async () => finish(response({ tag: tags.at(-1), changed: 0 })));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Reload project" })));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(within(screen.getByRole("combobox", { name: "Tag to apply or remove" })).getByRole("option", { name: "Board connections" })).toBeInTheDocument();
    expect(fetch.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
  });
  it("distinguishes a confirmed save from a stalled follow-up read", async () => {
    await open(); vi.useFakeTimers(); selectAll(); chooseTag();
    fetch.mockResolvedValueOnce(response({ tag, changed: 2 })).mockImplementationOnce(() => new Promise(() => {}));
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Apply tag" })));
    expect(screen.getByText("Changes saved. Updating the list...")).toBeInTheDocument();
    await act(async () => vi.advanceTimersByTimeAsync(PROJECT_TAG_REQUEST_TIMEOUT_MS));
    expect(screen.getByRole("alert")).toHaveTextContent("Your changes were saved, but tags could not be reloaded.");
    expect(screen.queryByText("Changes saved. Updating the list...")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reload project" })).not.toBeDisabled();
    expect(fetch.mock.calls.filter(([, options]) => options.method === "POST")).toHaveLength(1);
  });
  it("archives one member reversibly, preserving tags and the unselected spouse", async () => {
    assignments = [{ constituentId: "123", tagId: tag.id }];
    await open({ snapshot: householdSnapshot });
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Archive Fictional Avery", exact: true }));
    expect(fetch).toHaveBeenCalledOnce();
    const confirmation = screen.getByRole("region", { name: "Confirm project change" });
    expect(confirmation).toHaveTextContent("1 constituent: Fictional Avery");
    fireEvent.click(within(confirmation).getByRole("button", { name: "Confirm archive" }));
    await screen.findByText("1 constituent updated. Nothing changed in NXT.");
    expect(screen.queryByText("Fictional Avery", { exact: true })).not.toBeInTheDocument();
    expect(screen.getByText("Fictional Blake", { exact: true })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Project status"), { target: { value: "archived" } });
    expect(within(screen.getByRole("table")).getByText(tag.name)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Restore Fictional Avery", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm restore" }));
    await waitFor(() => expect(archivedIds).toEqual([]));
    await waitFor(() => expect(screen.queryByRole("region", { name: "Confirm project change" })).not.toBeInTheDocument());
    fireEvent.change(screen.getByLabelText("Project status"), { target: { value: "active" } });
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(2);
    expect(assignments).toEqual([{ constituentId: "123", tagId: tag.id }]);
    expect(fetch.mock.calls.filter(([, o]) => o.method === "POST").map(([, o]) => JSON.parse(o.body))).toEqual([
      { action: "archive", constituentIds: ["123"], revision: "r1", snapshotAt: "s1" },
      { action: "restore", constituentIds: ["123"], revision: "r1", snapshotAt: "s1" },
    ]);
  });
  it("shows member tags and solicitors and removes only the named person's tag", async () => {
    assignments = [{ constituentId: "123", tagId: tag.id }, { constituentId: "456", tagId: tag.id }];
    await open({ snapshot: householdSnapshot });
    expect(screen.getByText("Saved solicitor assignment: Fictional MGO One")).toBeInTheDocument();
    expect(screen.getByText("Saved solicitor assignment: Fictional MGO Two")).toBeInTheDocument();
    selectAll(); chooseTag(); expect(screen.getByRole("button", { name: "Apply tag" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: `Remove ${tag.name} from Fictional Avery` }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel", exact: true }));
    expect(fetch).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: `Remove ${tag.name} from Fictional Avery` }));
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove" }));
    await screen.findByText("1 constituent updated. Nothing changed in NXT.");
    expect(assignments).toEqual([{ constituentId: "456", tagId: tag.id }]);
  });
  it("keeps spouse context out of filtered selections and exports and exports everyone separately", async () => {
    assignments = [{ constituentId: "123", tagId: tag.id }];
    const objectUrl = vi.fn(() => "blob:project-csv");
    vi.stubGlobal("URL", { createObjectURL: objectUrl, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await open({ snapshot: householdSnapshot });
    fireEvent.change(screen.getByLabelText("Filter by tag"), { target: { value: tag.id } });
    expect(screen.getByRole("checkbox", { name: "Select constituent 456" })).toBeDisabled();
    selectAll(); expect(screen.getByText("1 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Export filtered CSV" }));
    fireEvent.click(screen.getByText("Export everyone", { exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Export everyone CSV" }));
    const read = blob => new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blob); });
    const filteredCsv = await read(objectUrl.mock.calls[0][0]);
    const allCsv = await read(objectUrl.mock.calls[1][0]);
    expect(filteredCsv).toContain('"Tag: Leadership interest"');
    expect(filteredCsv).not.toContain('\r\n"Fictional Blake"');
    expect(allCsv).toContain('\r\n"Fictional Blake"');
    expect(allCsv).toContain('"Active","Yes"');
    expect(allCsv).toContain('"Active",""');
    expect(fetch).toHaveBeenCalledOnce();
  });
  it("includes archived people in everyone exports only when explicitly checked", async () => {
    archivedIds = ["456"];
    const objectUrl = vi.fn(() => "blob:archive-export");
    vi.stubGlobal("URL", { createObjectURL: objectUrl, revokeObjectURL: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    await open();
    fireEvent.click(screen.getByText("Export everyone", { exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Export everyone CSV" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Include archived people" }));
    fireEvent.click(screen.getByRole("button", { name: "Export everyone CSV" }));
    const read = blob => new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsText(blob); });
    expect(await read(objectUrl.mock.calls[0][0])).not.toContain('"Fictional Blake"');
    expect(await read(objectUrl.mock.calls[1][0])).toContain('"Fictional Blake","456","","","","Archived"');
    expect(fetch).toHaveBeenCalledOnce();
  });
});
const householdSnapshot = { ...snapshot,
  headers: [...snapshot.headers, "Constituent ID", "Spouse Constituent ID", "Marital Status", "Assigned Fundraisers Name"],
  tableRows: [["Fictional Avery", "123", "A-1", "B-2", "Married", "Fictional MGO One"],
    ["Fictional Blake", "456", "B-2", "A-1", "Alum married to alum", "Fictional MGO Two"]] };
