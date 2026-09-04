import { useState } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DASHBOARD_LIMITS,
  QUERY_RESULTS_LIMITS,
  validateDashboardConfiguration,
} from "@/app/api/utils/dashboardConfiguration";
import ReportDashboardBuilder from "./ReportDashboardBuilder";
import ReportDashboardPanels from "./ReportDashboardPanels";

const empty = { version: 1, panels: [] };
const json = (payload, ok = true) => ({ ok, json: async () => payload });
let latest, changes;

function Editor({ initial = empty, disabled = false, snapshot = null }) {
  const [value, setValue] = useState(initial);
  latest = value;
  return (
    <>
      <ReportDashboardBuilder
        value={value}
        disabled={disabled}
        onChange={(next) => {
          changes(next);
          setValue(next);
        }}
      />
      <ReportDashboardPanels configuration={value} snapshot={snapshot} />
    </>
  );
}

function startPanel() {
  fireEvent.click(
    screen.getByRole("button", { name: "Add number/count panel" }),
  );
}

function setQuery(queryId = "123") {
  fireEvent.change(screen.getByLabelText("Value source"), {
    target: { value: "query_count" },
  });
  fireEvent.change(screen.getByLabelText("Query ID"), {
    target: { value: queryId },
  });
}

beforeEach(() => {
  changes = vi.fn();
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal(
    "confirm",
    vi.fn(() => false),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ReportDashboardBuilder", () => {
  it("creates a valid panel and edits source, static zero, labels, width and note without a network request", () => {
    render(<Editor />);
    startPanel();
    const key = latest.panels[0].values[0].key;
    expect(validateDashboardConfiguration(latest)).toBe("");
    setQuery();
    fireEvent.change(screen.getByLabelText("Refresh policy"), {
      target: { value: "frozen" },
    });
    expect(latest.panels[0].values[0]).toMatchObject({
      key,
      source: "query_count",
      queryId: "123",
      refreshPolicy: "frozen",
    });
    fireEvent.change(screen.getByLabelText("Value source"), {
      target: { value: "static" },
    });
    fireEvent.change(
      screen.getByLabelText("Static value", { selector: "input" }),
      { target: { value: "0" } },
    );
    fireEvent.change(screen.getByLabelText("Panel title"), {
      target: { value: "Engagement" },
    });
    fireEvent.change(screen.getByLabelText("Row 1 label"), {
      target: { value: "Households" },
    });
    fireEvent.change(screen.getByLabelText("Column 1 label"), {
      target: { value: "FY26" },
    });
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Manually verified" },
    });
    fireEvent.change(screen.getByLabelText("Panel width"), {
      target: { value: "full" },
    });
    expect(latest.panels[0]).toMatchObject({
      title: "Engagement",
      width: "full",
      rows: [{ label: "Households" }],
      columns: [{ label: "FY26" }],
      values: [
        { key, source: "static", staticValue: 0, note: "Manually verified" },
      ],
    });
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(validateDashboardConfiguration(latest)).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("keeps a blank static value unknown instead of coercing it to zero", () => {
    render(<Editor />);
    startPanel();
    const input = screen.getByLabelText("Static value", { selector: "input" });
    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.change(input, { target: { value: "" } });
    expect(latest.panels[0].values[0].staticValue).toBeNull();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.getByText("Not refreshed")).toBeInTheDocument();
  });

  it("preserves cell keys on layout changes and blocks destructive narrowing without executing queries", () => {
    render(<Editor />);
    startPanel();
    setQuery();
    const singleValue = structuredClone(latest.panels[0].values);
    fireEvent.change(screen.getByLabelText("Layout"), {
      target: { value: "metric" },
    });
    expect(screen.getByRole("button", { name: "Add row" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add column" })).toBeDisabled();
    expect(latest.panels[0].values).toEqual(singleValue);
    fireEvent.change(screen.getByLabelText("Layout"), {
      target: { value: "table" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    fireEvent.click(screen.getByRole("button", { name: "Add column" }));
    const original = structuredClone(latest.panels[0].values);
    for (const layout of ["metric", "rows"]) {
      expect(
        within(screen.getByLabelText("Layout")).getByRole("option", {
          name: layout === "metric" ? "Metric" : "Rows",
        }),
      ).toBeDisabled();
      fireEvent.change(screen.getByLabelText("Layout"), {
        target: { value: layout },
      });
      expect(latest.panels[0].layout).toBe("table");
      expect(latest.panels[0].values).toEqual(original);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("removes only the selected dimension's cells and cannot remove the last row or column", () => {
    render(<Editor />);
    startPanel();
    expect(screen.getByRole("button", { name: "Remove row 1" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Remove column 1" }),
    ).toBeDisabled();
    const retained = latest.panels[0].values[0].key;
    fireEvent.change(screen.getByLabelText("Layout"), {
      target: { value: "table" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    fireEvent.click(screen.getByRole("button", { name: "Add column" }));
    expect(latest.panels[0].values).toHaveLength(4);
    expect(new Set(latest.panels[0].values.map((cell) => cell.key)).size).toBe(
      4,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove row 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove column 2" }));
    expect(latest.panels[0].values).toHaveLength(1);
    expect(latest.panels[0].values[0].key).toBe(retained);
    expect(validateDashboardConfiguration(latest)).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Remove panel" }));
    expect(latest.panels).toEqual([]);
    expect(confirm).not.toHaveBeenCalled();
  });

  it("requires confirmation to remove zero, query, or noted values and preserves the draft on cancel", () => {
    render(<Editor />);
    startPanel();
    fireEvent.change(
      screen.getByLabelText("Static value", { selector: "input" }),
      { target: { value: "0" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove panel" }));
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("1 populated value"),
    );
    expect(latest.panels[0].values[0].staticValue).toBe(0);
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove row 1" }));
    expect(latest.panels[0].rows).toHaveLength(2);
    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove row 1" }));
    expect(latest.panels[0].rows).toHaveLength(1);
    setQuery();
    fireEvent.change(screen.getByLabelText("Layout"), {
      target: { value: "table" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add column" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove column 1" }));
    expect(latest.panels[0].columns).toHaveLength(2);
    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove column 1" }));
    expect(latest.panels[0].columns).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Note"), {
      target: { value: "Keep this note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Remove panel" }));
    expect(latest.panels).toHaveLength(1);
    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove panel" }));
    expect(latest.panels).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("tests only after a click and keeps a zero test result separate from preview and configuration", async () => {
    fetch.mockResolvedValue(
      json({
        queryId: "123",
        value: 0,
        donor: "DO NOT DISPLAY",
        url: "https://private.invalid",
      }),
    );
    render(<Editor />);
    startPanel();
    setQuery();
    expect(
      screen.getByText(
        /shows only the number of CSV data rows.*does not display the query's returned columns.*aggregate row counts as 1/,
      ),
    ).toBeInTheDocument();
    const before = structuredClone(latest);
    const calls = changes.mock.calls.length;
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Test query" }));
    expect(
      await screen.findByText("Test count: 0. Not saved to the dashboard."),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledWith(
      "/api/reports/dashboards/test-query",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queryId: "123" }),
      }),
    );
    expect(latest).toEqual(before);
    expect(changes).toHaveBeenCalledTimes(calls);
    expect(screen.getByText("Not refreshed")).toBeInTheDocument();
    expect(
      screen.queryByText(/DO NOT DISPLAY|private.invalid/),
    ).not.toBeInTheDocument();
  });

  it("hides old test feedback and ignores an in-flight response when the query changes", async () => {
    let resolve;
    fetch.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    render(<Editor />);
    startPanel();
    setQuery();
    fireEvent.click(screen.getByRole("button", { name: "Test query" }));
    expect(
      screen.getByRole("button", { name: "Testing query..." }),
    ).toBeDisabled();
    const signal = fetch.mock.calls[0][1].signal;
    fireEvent.change(screen.getByLabelText("Query ID"), {
      target: { value: "456" },
    });
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(json({ queryId: "123", value: 99 })));
    expect(screen.queryByText(/Test count:/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test query" })).toBeEnabled();
    fetch.mockResolvedValue(json({ queryId: "456", value: 7 }));
    fireEvent.click(screen.getByRole("button", { name: "Test query" }));
    expect(await screen.findByText(/Test count: 7/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Query ID"), {
      target: { value: "789" },
    });
    expect(screen.queryByText(/Test count:/)).not.toBeInTheDocument();
  });

  it.each([
    json({ error: "Sensitive URL: https://private.invalid" }, false),
    json({ queryId: "123", value: null }),
    json({ queryId: "123", value: "0" }),
    json({ queryId: "456", value: 8 }),
    json({ queryId: "123", value: -1 }),
  ])("shows safe feedback for failed or malformed tests", async (result) => {
    fetch.mockResolvedValue(result);
    render(<Editor />);
    startPanel();
    setQuery();
    fireEvent.click(screen.getByRole("button", { name: "Test query" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Could not test this query",
    );
    expect(
      screen.queryByText(/Sensitive URL|Test count:/),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test query" })).toBeEnabled();
  });

  it("validates IDs before testing and enforces the query count limit", () => {
    render(<Editor />);
    startPanel();
    setQuery("bad-id");
    expect(screen.getByRole("button", { name: "Test query" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Query ID"), {
      target: { value: "123" },
    });
    for (let index = 1; index < DASHBOARD_LIMITS.queries; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Add row" }));
      fireEvent.change(screen.getAllByLabelText("Value source")[index], {
        target: { value: "query_count" },
      });
    }
    fireEvent.click(screen.getByRole("button", { name: "Add row" }));
    const finalSource =
      screen.getAllByLabelText("Value source")[DASHBOARD_LIMITS.queries];
    expect(
      within(finalSource).getByRole("option", {
        name: "Saved query row count (number only)",
      }),
    ).toBeDisabled();
    fireEvent.change(finalSource, { target: { value: "query_count" } });
    expect(latest.panels[0].values[DASHBOARD_LIMITS.queries].source).toBe(
      "static",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("honors disabled for every edit and test button", () => {
    const initial = {
      version: 1,
      panels: [
        {
          key: "p",
          title: "Panel",
          layout: "rows",
          width: "half",
          rows: [{ key: "r", label: "Row" }],
          columns: [{ key: "c", label: "Count" }],
          values: [
            {
              key: "v",
              rowKey: "r",
              columnKey: "c",
              source: "query_count",
              queryId: "123",
            },
          ],
        },
      ],
    };
    const { container } = render(<Editor initial={initial} disabled />);
    for (const element of container.querySelectorAll(
      "button, input, select, textarea",
    ))
      expect(element).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Test query" }));
    expect(changes).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("repairs legacy dimensionless metrics before emitting a draft without replacing their value", () => {
    const initial = {
      version: 1,
      panels: [
        {
          key: "p",
          title: "Metric",
          layout: "metric",
          width: "half",
          rows: [],
          columns: [],
          values: [
            {
              key: "v",
              rowKey: "",
              columnKey: "",
              source: "static",
              staticValue: 0,
            },
          ],
        },
      ],
    };
    render(<Editor initial={initial} />);
    fireEvent.change(
      screen.getByLabelText("Static value", { selector: "input" }),
      { target: { value: "42" } },
    );
    expect(latest.panels[0].values).toHaveLength(1);
    expect(latest.panels[0].values[0]).toMatchObject({
      key: "v",
      staticValue: 42,
    });
    expect(latest.panels[0].rows).toHaveLength(1);
    expect(latest.panels[0].columns).toHaveLength(1);
    expect(validateDashboardConfiguration(latest)).toBe("");
    fireEvent.change(screen.getByLabelText("Layout"), {
      target: { value: "table" },
    });
    expect(latest.panels[0].values[0]).toMatchObject({
      key: "v",
      staticValue: 42,
    });
    expect(validateDashboardConfiguration(latest)).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("creates metrics with exactly one row and column and prevents removing either", () => {
    render(<Editor />);
    startPanel();
    fireEvent.change(screen.getByLabelText("Layout"), {
      target: { value: "metric" },
    });
    expect(latest.panels[0].rows).toHaveLength(1);
    expect(latest.panels[0].columns).toHaveLength(1);
    expect(latest.panels[0].values).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Remove row 1" })).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Remove column 1" }),
    ).toBeDisabled();
    expect(validateDashboardConfiguration(latest)).toBe("");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("enforces the panel and cell limits before adding more content", () => {
    const makePanel = (index, count = 1) => ({
      key: `p${index}`,
      title: `Panel ${index}`,
      layout: "rows",
      width: "half",
      rows: Array.from({ length: count }, (_, row) => ({
        key: `r${row}`,
        label: `Row ${row}`,
      })),
      columns: [{ key: "c", label: "Count" }],
      values: Array.from({ length: count }, (_, row) => ({
        key: `v${index}-${row}`,
        rowKey: `r${row}`,
        columnKey: "c",
        source: "static",
        staticValue: null,
      })),
    });
    const { unmount } = render(
      <Editor
        initial={{
          version: 1,
          panels: Array.from({ length: DASHBOARD_LIMITS.panels }, (_, index) =>
            makePanel(index),
          ),
        }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Add number/count panel" }),
    ).toBeDisabled();
    unmount();
    render(
      <Editor
        initial={{
          version: 1,
          panels: [makePanel(1, DASHBOARD_LIMITS.values)],
        }}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Add number/count panel" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add row" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add column" })).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });
});

const queryTable = (patch = {}) => ({
  key: "results",
  title: "Synthetic results",
  layout: "query_results",
  width: "full",
  queryId: "777",
  refreshPolicy: "refreshable",
  columnSettings: [],
  rows: [],
  columns: [],
  values: [],
  ...patch,
});
const previewPayload = (patch = {}) => ({
  queryId: "777",
  headers: ["Name", "Amount"],
  rows: [["Example Person", "$1,250.0000"]],
  dataSource: "query-results-csv-v1",
  queryJobRowCount: 1,
  testedAt: "2026-09-04T12:00:00Z",
  ...patch,
});
const queryInitial = (patch = {}) => ({
  version: 1,
  panels: [queryTable(patch)],
});

describe("ReportDashboardBuilder query tables", () => {
  it("converts a single query row count into an Output Query panel without running it", () => {
    render(<Editor />);
    startPanel();
    setQuery("30971");

    const convert = screen.getByRole("button", {
      name: "Show this query's rows and columns instead",
    });
    fireEvent.click(convert);
    expect(latest.panels[0]).toMatchObject({
      layout: "rows",
      values: [{ queryId: "30971" }],
    });

    confirm.mockReturnValueOnce(true);
    fireEvent.click(convert);
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("Output Query panel"),
    );
    expect(latest.panels[0]).toMatchObject({
      title: "Output Query",
      layout: "query_results",
      width: "half",
      queryId: "30971",
      refreshPolicy: "refreshable",
      columnSettings: [],
      rows: [],
      columns: [],
      values: [],
    });
    expect(validateDashboardConfiguration(latest)).toBe("");
    expect(
      screen.getByRole("button", { name: "Load query preview" }),
    ).toBeEnabled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("adds a distinct blank-ID panel without converting a numeric panel, and edits metadata without requests", () => {
    render(<Editor />);
    startPanel();
    setQuery("123");
    const numeric = structuredClone(latest.panels[0]);
    expect(
      within(screen.getByLabelText("Layout")).queryByRole("option", {
        name: /query results/i,
      }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Add Output Query panel" }),
    );
    expect(latest.panels[0]).toEqual(numeric);
    expect(latest.panels[1]).toMatchObject({
      layout: "query_results",
      queryId: "",
      refreshPolicy: "refreshable",
      columnSettings: [],
      rows: [],
      columns: [],
      values: [],
    });
    const editor = within(screen.getByRole("region", { name: "Edit panel 2" }));
    expect(
      editor.getByRole("button", { name: "Load query preview" }),
    ).toBeDisabled();
    expect(
      editor.queryByRole("button", { name: "Add row" }),
    ).not.toBeInTheDocument();
    expect(
      editor.queryByRole("button", { name: "Add column" }),
    ).not.toBeInTheDocument();
    expect(editor.queryByLabelText("Value source")).not.toBeInTheDocument();
    expect(editor.queryByLabelText("Layout")).not.toBeInTheDocument();
    const input = editor.getByLabelText("Query ID");
    input.focus();
    fireEvent.change(input, { target: { value: "777" } });
    expect(input).toHaveFocus();
    fireEvent.change(editor.getByLabelText("Panel title"), {
      target: { value: "Donor rows" },
    });
    fireEvent.change(editor.getByLabelText("Panel width"), {
      target: { value: "half" },
    });
    fireEvent.change(editor.getByLabelText("Refresh policy"), {
      target: { value: "frozen" },
    });
    expect(latest.panels[1]).toMatchObject({
      title: "Donor rows",
      width: "half",
      queryId: "777",
      refreshPolicy: "frozen",
    });
    expect(validateDashboardConfiguration(latest)).toBe("");
    expect(
      editor.getByText(
        /Shared reports expose displayed query columns.*donor information.*selected viewers/,
      ),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("loads only on click and never stores preview headers/rows in configuration or the dashboard preview", async () => {
    fetch.mockResolvedValue(json(previewPayload()));
    render(<Editor initial={queryInitial()} />);
    const original = structuredClone(latest);
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Load query preview" }));
    const table = await screen.findByRole("table", {
      name: "Synthetic results preview",
    });
    expect(
      within(table)
        .getAllByRole("cell")
        .map((cell) => cell.textContent),
    ).toEqual(["Example Person", "$1,250.0000"]);
    expect(fetch).toHaveBeenCalledWith(
      "/api/reports/dashboards/test-query-results",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queryId: "777" }),
      }),
    );
    expect(latest).toEqual(original);
    expect(changes).not.toHaveBeenCalled();
    expect(screen.getByText("Not refreshed")).toBeInTheDocument();
    expect(
      screen.queryByRole("table", { name: "Synthetic results" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Query preview only. Not saved to the dashboard."),
    ).toBeInTheDocument();
    expect(latest.panels[0]).not.toHaveProperty("headers");
    expect(latest.panels[0]).not.toHaveProperty("testedAt");
  });

  it("keeps exact-header display settings separate from data and does not reload for presentation or policy edits", async () => {
    fetch.mockResolvedValue(json(previewPayload()));
    render(<Editor initial={queryInitial()} />);
    fireEvent.click(screen.getByRole("button", { name: "Load query preview" }));
    await screen.findByRole("table");
    fireEvent.click(screen.getByText("Column display settings (optional)"));
    fireEvent.change(screen.getByLabelText("Display label for Amount"), {
      target: { value: "Gift total" },
    });
    fireEvent.change(screen.getByLabelText("Format for Amount"), {
      target: { value: "currency" },
    });
    fireEvent.change(screen.getByLabelText("Panel title"), {
      target: { value: "Gift results" },
    });
    fireEvent.change(screen.getByLabelText("Refresh policy"), {
      target: { value: "frozen" },
    });
    expect(latest.panels[0]).toMatchObject({
      columnSettings: [
        { header: "Amount", label: "Gift total", format: "currency" },
      ],
      rows: [],
      columns: [],
      values: [],
    });
    expect(
      screen.getByRole("columnheader", { name: "Gift total" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "$1,250.00" })).toBeInTheDocument();
    expect(validateDashboardConfiguration(latest)).toBe("");
    fireEvent.click(
      screen.getByRole("button", { name: "Reset display settings for Amount" }),
    );
    expect(latest.panels[0].columnSettings).toEqual([]);
    expect(
      screen.getByRole("cell", { name: "$1,250.0000" }),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("hides QRECID in previews by default and saves an explicit visibility override", async () => {
    fetch.mockResolvedValue(
      json(
        previewPayload({
          headers: ["Name", "Amount", "QRECID"],
          rows: [["Example Person", "$1,250.0000", "242718"]],
        }),
      ),
    );
    render(<Editor initial={queryInitial()} />);
    fireEvent.click(screen.getByRole("button", { name: "Load query preview" }));
    await screen.findByRole("table");
    expect(screen.queryByText("242718")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Column display settings (optional)"));
    const visibility = screen.getByLabelText("Show column QRECID");
    expect(visibility).not.toBeChecked();
    fireEvent.click(visibility);
    expect(latest.panels[0].columnSettings).toContainEqual({
      header: "QRECID",
      label: "",
      format: "text",
      visible: true,
    });
    expect(screen.getByText("242718")).toBeInTheDocument();
    expect(validateDashboardConfiguration(latest)).toBe("");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("confirms changing an ID with saved settings, preserves on cancel, and clears preview/settings on acceptance", async () => {
    fetch.mockResolvedValue(json(previewPayload()));
    render(
      <Editor
        initial={queryInitial({
          columnSettings: [
            { header: "Amount", label: "Prior gift", format: "text" },
          ],
        })}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Load query preview" }));
    await screen.findByRole("table");
    fireEvent.change(screen.getByLabelText("Query ID"), {
      target: { value: "888" },
    });
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("reset its column display settings"),
    );
    expect(latest.panels[0].queryId).toBe("777");
    expect(screen.getByRole("table")).toBeInTheDocument();
    confirm.mockReturnValueOnce(true);
    fireEvent.change(screen.getByLabelText("Query ID"), {
      target: { value: "888" },
    });
    expect(latest.panels[0]).toMatchObject({
      queryId: "888",
      columnSettings: [],
    });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Column display settings (optional)"),
    ).not.toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("aborts ID changes and ignores old responses even after starting a new preview", async () => {
    let first, second;
    fetch
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            first = resolve;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            second = resolve;
          }),
      );
    render(<Editor initial={queryInitial()} />);
    fireEvent.click(screen.getByRole("button", { name: "Load query preview" }));
    const signal = fetch.mock.calls[0][1].signal;
    expect(
      screen.getByRole("button", { name: "Loading query preview..." }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Query ID"), {
      target: { value: "888" },
    });
    expect(signal.aborted).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Load query preview" }));
    await act(async () => first(json(previewPayload())));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Loading query preview..." }),
    ).toBeDisabled();
    await act(async () =>
      second(
        json(previewPayload({ queryId: "888", rows: [["New Person", "0"]] })),
      ),
    );
    expect(
      screen.getByRole("cell", { name: "New Person" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("Example Person")).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Query ID"), {
      target: { value: "999" },
    });
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("requires confirmation for even blank table removal and aborts requests on removal", async () => {
    let resolve;
    fetch.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { unmount } = render(
      <Editor initial={queryInitial({ queryId: "" })} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Remove panel" }));
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("Remove query table"),
    );
    expect(latest.panels).toHaveLength(1);
    unmount();
    render(<Editor initial={queryInitial()} />);
    fireEvent.click(screen.getByRole("button", { name: "Load query preview" }));
    const signal = fetch.mock.calls[0][1].signal;
    fireEvent.click(screen.getByRole("button", { name: "Remove panel" }));
    expect(signal.aborted).toBe(false);
    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole("button", { name: "Remove panel" }));
    expect(latest.panels).toEqual([]);
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(json(previewPayload())));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("retains the last successful local preview on failure without exposing raw errors", async () => {
    fetch
      .mockResolvedValueOnce(json(previewPayload()))
      .mockResolvedValueOnce(json({ error: "private@example.invalid" }, false));
    render(<Editor initial={queryInitial()} />);
    fireEvent.click(screen.getByRole("button", { name: "Load query preview" }));
    await screen.findByRole("table");
    fireEvent.click(screen.getByRole("button", { name: "Load query preview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Showing the last successful preview",
    );
    expect(
      screen.getByRole("cell", { name: "Example Person" }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/private@example/)).not.toBeInTheDocument();
    expect(changes).not.toHaveBeenCalled();
  });

  it.each([
    [
      413,
      "Query results must not exceed 1000 rows. Narrow the saved query in NXT and try again. No results were truncated.",
    ],
    [502, "NXT must return a CSV result file for this table."],
    [502, "NXT returned an unsupported charset or invalid CSV text encoding."],
    [403, "Only report managers can test saved queries."],
  ])(
    "shows sanitized endpoint error details for status %s",
    async (status, message) => {
      fetch.mockResolvedValue({ ...json({ error: message }, false), status });
      render(<Editor initial={queryInitial()} />);
      fireEvent.click(
        screen.getByRole("button", { name: "Load query preview" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(
        screen.getByRole("button", { name: "Load query preview" }),
      ).toBeEnabled();
      expect(changes).not.toHaveBeenCalled();
    },
  );

  it("caps supported endpoint messages and renders them as text, never HTML", async () => {
    const message = `<img src=x onerror=alert(1)>${"a".repeat(600)}`;
    fetch.mockResolvedValue({
      ...json({ error: message }, false),
      status: 502,
    });
    const { container } = render(<Editor initial={queryInitial()} />);
    fireEvent.click(screen.getByRole("button", { name: "Load query preview" }));
    expect((await screen.findByRole("alert")).textContent).toBe(
      message.slice(0, 500),
    );
    expect(container.querySelector("img")).toBeNull();
  });

  it("does not expose network exception text or unsupported status payloads", async () => {
    fetch
      .mockRejectedValueOnce(new Error("private network detail"))
      .mockResolvedValueOnce({
        ...json({ error: "private server detail" }, false),
        status: 500,
      });
    render(<Editor initial={queryInitial()} />);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      fireEvent.click(
        screen.getByRole("button", { name: "Load query preview" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not load this query preview",
      );
      expect(screen.queryByText(/private .* detail/)).not.toBeInTheDocument();
    }
  });

  it.each([
    { queryId: "888" },
    { dataSource: "unexpected" },
    { headers: ["Name", "Name"] },
    { rows: null },
    { rows: [["Example", 12]] },
    { rows: [["Only one column"]] },
    { rows: [["x".repeat(2001), "0"]] },
    { rows: Array.from({ length: 1001 }, () => ["Example", "0"]) },
  ])(
    "rejects wrong-source, malformed and oversized preview data",
    async (patch) => {
      fetch.mockResolvedValue(json(previewPayload(patch)));
      render(<Editor initial={queryInitial()} />);
      fireEvent.click(
        screen.getByRole("button", { name: "Load query preview" }),
      );
      expect(await screen.findByRole("alert")).toHaveTextContent(
        "Could not load this query preview",
      );
      expect(screen.queryByRole("table")).not.toBeInTheDocument();
      expect(changes).not.toHaveBeenCalled();
    },
  );

  it("validates IDs, honors disabled state, and aborts a pending preview when disabled", async () => {
    let resolve;
    fetch.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { rerender, container } = render(
      <Editor initial={queryInitial({ queryId: "not-an-id" })} />,
    );
    expect(screen.getByLabelText("Query ID")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "Load query preview" }));
    expect(fetch).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Query ID"), {
      target: { value: "777" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Load query preview" }));
    const signal = fetch.mock.calls[0][1].signal;
    changes.mockClear();
    rerender(<Editor disabled />);
    expect(signal.aborted).toBe(true);
    for (const element of container.querySelectorAll("button, input, select"))
      expect(element).toBeDisabled();
    await act(async () => resolve(json(previewPayload())));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(changes).not.toHaveBeenCalled();
  });

  it("limits query tables to four independently of numeric values and total panels", () => {
    render(<Editor />);
    for (let i = 0; i < QUERY_RESULTS_LIMITS.panels; i += 1)
      fireEvent.click(
        screen.getByRole("button", { name: "Add Output Query panel" }),
      );
    expect(
      screen.getByRole("button", { name: "Add Output Query panel" }),
    ).toBeDisabled();
    expect(latest.panels).toHaveLength(4);
    expect(
      screen.getByRole("button", { name: "Add number/count panel" }),
    ).toBeEnabled();
    expect(
      screen.getByText(/4\/12 saved-query sources; 4\/4 query tables/),
    ).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("shares the twelve-query budget with numeric cells and frees it after table removal", () => {
    const numeric = {
      key: "numeric",
      title: "Counts",
      layout: "rows",
      width: "half",
      columns: [{ key: "c", label: "Count" }],
      rows: Array.from({ length: 12 }, (_, i) => ({
        key: `r${i}`,
        label: `Row ${i}`,
      })),
      values: Array.from({ length: 12 }, (_, i) => ({
        key: `v${i}`,
        rowKey: `r${i}`,
        columnKey: "c",
        source: i < 11 ? "query_count" : "static",
        queryId: "123",
        staticValue: null,
      })),
    };
    render(<Editor initial={{ version: 1, panels: [numeric] }} />);
    fireEvent.click(
      screen.getByRole("button", { name: "Add Output Query panel" }),
    );
    const source = screen.getAllByLabelText("Value source")[11];
    expect(
      within(source).getByRole("option", {
        name: "Saved query row count (number only)",
      }),
    ).toBeDisabled();
    fireEvent.change(source, { target: { value: "query_count" } });
    expect(latest.panels[0].values[11].source).toBe("static");
    expect(
      screen.getByRole("button", { name: "Add Output Query panel" }),
    ).toBeDisabled();
    confirm.mockReturnValueOnce(true);
    fireEvent.click(
      within(screen.getByRole("region", { name: "Edit panel 2" })).getByRole(
        "button",
        { name: "Remove panel" },
      ),
    );
    expect(
      within(source).getByRole("option", {
        name: "Saved query row count (number only)",
      }),
    ).toBeEnabled();
    fireEvent.change(source, { target: { value: "query_count" } });
    expect(
      screen.getByRole("button", { name: "Add Output Query panel" }),
    ).toBeDisabled();
    expect(fetch).not.toHaveBeenCalled();
  });
});
