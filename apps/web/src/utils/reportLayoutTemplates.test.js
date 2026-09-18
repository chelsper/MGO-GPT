import { describe, expect, it } from "vitest";
import { validateDashboardConfiguration } from "@/app/api/utils/dashboardConfiguration";
import { buildReportLayoutTemplate, createReportStarter, parseReportLayoutTemplate, REPORT_LAYOUT_MAX_BYTES } from "./reportLayoutTemplates";

const draft = (kind = "query_results") => ({ title: "Engagement", description: "Shared report layout", dataConfiguration: createReportStarter(kind) });
const template = (kind) => buildReportLayoutTemplate(draft(kind));

describe("report layout transfer boundary", () => {
  it("projects only layout fields and drops data, connections, access, and metadata", () => {
    const source = draft();
    source.specificUserIds = [71];
    source.active = true;
    source.key = "production-report";
    source.snapshot = { names: ["Private donor"] };
    source.credentials = "secret";
    Object.assign(source.dataConfiguration.panels[0], { queryId: "12033", refreshPolicy: "frozen", columnSettings: [{ header: "Private header", label: "Private label" }], snapshot: { rows: [["Private donor"]] } });
    const exported = buildReportLayoutTemplate(source);
    expect(exported).toEqual({ format: "fundraising-report-layout", version: 1, title: source.title, description: source.description, panels: [{ key: "results", title: "Query results", layout: "query_results", width: "full" }] });
    const imported = parseReportLayoutTemplate(JSON.stringify(exported));
    expect(imported).toMatchObject({ active: false, specificUserIds: [], visibility: "specific_users", dataConfiguration: { panels: [{ queryId: "", refreshPolicy: "refreshable", columnSettings: [] }] } });
    expect(validateDashboardConfiguration(imported.dataConfiguration)).toMatch(/query system record ID/);
    expect(source.dataConfiguration.panels[0].queryId).toBe("12033");
  });

  it.each(["static", "query_count"])("clears %s values and notes while keeping layout dimensions", (kind) => {
    const source = draft(kind);
    source.dataConfiguration.panels[0].values.forEach((cell) => Object.assign(cell, { queryId: "4455", staticValue: 55000, note: "Confidential", refreshPolicy: "frozen" }));
    const imported = parseReportLayoutTemplate(JSON.stringify(buildReportLayoutTemplate(source)));
    expect(imported.dataConfiguration.panels[0].rows).toEqual(source.dataConfiguration.panels[0].rows);
    for (const cell of imported.dataConfiguration.panels[0].values) expect(cell).toMatchObject({ queryId: "", staticValue: null, note: "", refreshPolicy: "refreshable" });
    expect(JSON.stringify(buildReportLayoutTemplate(source))).not.toMatch(/4455|55000|Confidential|frozen/);
  });

  it.each([
    (value) => { value.active = true; },
    (value) => { value.specificUserIds = [1]; },
    (value) => { value.reportKey = "existing-report"; },
    (value) => { value.snapshot = {}; },
    (value) => { value.panels[0].queryId = "12033"; },
    (value) => { value.panels[0].columnSettings = []; },
    (value) => { value.panels[0].values[0].staticValue = 100; },
    (value) => { value.panels[0].values[0].note = "private"; },
    (value) => { value.panels[0].rows[0].extra = "private"; },
  ])("rejects non-layout fields instead of silently accepting them", (change) => {
    const value = template("static");
    change(value);
    expect(() => parseReportLayoutTemplate(JSON.stringify(value))).toThrow();
  });

  it.each([
    null, [], {}, { format: "fundraising-report-layout", version: 2 },
    { ...template(), panels: [null] },
    { ...template(), panels: ["unexpected"] },
    { ...template(), panels: Array(13).fill(template().panels[0]) },
    { ...template(), panels: [{ ...template().panels[0], width: "giant" }] },
    { ...template(), title: "x".repeat(121) },
  ])("rejects malformed or incompatible templates", (value) => {
    expect(() => parseReportLayoutTemplate(JSON.stringify(value))).toThrow();
  });

  it("rejects invalid references and duplicate keys using the dashboard schema", () => {
    const value = template("static");
    value.panels[0].values[0].rowKey = "missing";
    expect(() => parseReportLayoutTemplate(JSON.stringify(value))).toThrow(/row/);
    const duplicate = template();
    duplicate.panels.push(duplicate.panels[0]);
    expect(() => parseReportLayoutTemplate(JSON.stringify(duplicate))).toThrow(/unique/);
  });

  it("rejects prototype-bearing and oversized input, counting UTF-8 bytes", () => {
    expect(() => parseReportLayoutTemplate('{"__proto__":{"active":true}}')).toThrow();
    expect({}.active).toBeUndefined();
    expect(() => parseReportLayoutTemplate("x".repeat(REPORT_LAYOUT_MAX_BYTES + 1))).toThrow(/128 KB/);
    expect(() => parseReportLayoutTemplate("\u00e9".repeat(REPORT_LAYOUT_MAX_BYTES / 2 + 1))).toThrow(/128 KB/);
    expect(() => parseReportLayoutTemplate("not JSON")).toThrow(/not valid JSON/);
  });

  it("supports every layout including rows and preserves panel order and width", () => {
    const source = draft("static");
    const rows = createReportStarter("query_count").panels[0];
    Object.assign(rows, { key: "rows", layout: "rows", title: "Rows" });
    source.dataConfiguration.panels.push(rows, createReportStarter("query_results").panels[0]);
    const imported = parseReportLayoutTemplate(JSON.stringify(buildReportLayoutTemplate(source), null, 2));
    expect(imported.dataConfiguration.panels.map((panel) => [panel.layout, panel.width])).toEqual([["table", "full"], ["rows", "half"], ["query_results", "full"]]);
  });

  it("produces independent starter drafts and rejects unknown starters", () => {
    const first = createReportStarter("static");
    first.panels[0].title = "Changed";
    expect(createReportStarter("static").panels[0].title).toBe("Period comparison");
    expect(validateDashboardConfiguration(createReportStarter("static"))).toBe("");
    expect(() => createReportStarter("unknown")).toThrow();
  });
});
