// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ account: vi.fn(), connection: vi.fn(), api: vi.fn(), execute: vi.fn() }));
vi.mock("./sql", () => ({ default: vi.fn(() => { throw new Error("Live SQL forbidden"); }) }));
vi.mock("./reportRefresh", () => ({ getReportRefreshUser: mocks.account }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: mocks.api, getBlackbaudConnection: mocks.connection }));
vi.mock("./savedQueryExecution", () => ({ executeSavedQueryResults: mocks.execute }));
import { aggregateBoardCsv, boardTransport, inspectBoardQuery, publicBoardState, readBoardState, refreshBoardYear } from "./boardTrustees";
import { BOARD_DEFAULT_SOURCES, BOARD_INITIAL_SOURCE, boardParticipation, suggestBoardColumns, validateBoardSource } from "@/utils/boardTrustees";
import { boardQueryFixture } from "../../../../test/boardQueryFixture";

const source = BOARD_INITIAL_SOURCE;
const csv = rows => `Name,Total Gifts FY27 (Cash),Total Pledges or Planned Gifts FY27,QRECID,Constituency Code,Constituency Date From,Constituency Date To\n${rows ? rows.split("\n").map(row => `${row},Trustee,,`).join("\n") : ""}`;
const aggregate = (rows, count) => aggregateBoardCsv(csv(rows), source, count);
beforeEach(() => { vi.clearAllMocks(); mocks.account.mockResolvedValue({ id: 7, role: "advancement_services" }); mocks.connection.mockResolvedValue({ connected_at: "2026-10-01" }); });

describe("Trustee summary identity and financial safety", () => {
  it("uses output aliases to distinguish repeated NXT summary field names", () => {
    const result = inspectBoardQuery(boardQueryFixture(), source, source);
    expect(result.fields).toEqual(Object.values(source.columns));
    expect(result.suggested).toEqual(source.columns);
    expect(result.credit).toEqual({ soft: "Both", matching: "Both" });
    expect(result.warnings[0]).toContain("service ended");
  });
  it("preserves zero-giving trustees, separate same-name people, negative adjustments, and counts duplicate IDs only once", () => {
    const result = aggregate('Trustee A,"$1,000.25",4000,1\nTrustee A,1000.25,4000,1\nTrustee A,0,0,2\nTrustee C,(10.20),0,3', 4);
    expect(result).toMatchObject({ trusteeCount: 3, cashCents: 99005, commitmentCents: 400000, rawRows: 4, duplicateRows: 1, missingAmountCount: 0 });
    expect(result.trustees.map(row => row.id)).toEqual(["1", "2", "3"]);
    expect(boardParticipation(result)).toEqual({ total: 3, participants: 1, unknown: 0, rate: 1 / 3 });
  });
  it.each(BOARD_DEFAULT_SOURCES)("validates $fiscalYear query $queryId against its own identity, aliases and annual dates", preset => {
    const query = { ...boardQueryFixture(preset.fiscalYear), id: Number(preset.queryId), name: preset.queryName };
    query.select_fields[1].user_alias = preset.columns.cash;
    query.select_fields[2].user_alias = preset.columns.commitments;
    expect(inspectBoardQuery(query, preset, preset).suggested).toEqual(preset.columns);
    const result = aggregateBoardCsv(csv("Trustee A,100,0,1\nTrustee B,0,500,2")
      .replaceAll("FY27", `FY${String(preset.fiscalYear).slice(-2)}`), preset, 2);
    expect(result).toMatchObject({ cashCents: 10000, commitmentCents: 50000 });
    expect(boardParticipation(result)).toMatchObject({ participants: 2, total: 2, rate: 1 });
    query.summary_fields[0].filter_fields[0].filter_values = [`7/1/${preset.fiscalYear}`, `6/30/${preset.fiscalYear + 1}`];
    expect(() => inspectBoardQuery(query, preset, preset)).toThrow("Gift Date");
  });
  it("never treats a blank amount as zero or publishes a misleading complete total", () => {
    const result = aggregate("Trustee A,,400,1\nTrustee B,100,0,2", 2);
    expect(result).toMatchObject({ cashCents: null, commitmentCents: 40000, missingAmountCount: 1 });
    expect(result.trustees[0].cashCents).toBeNull();
    expect(boardParticipation(result)).toMatchObject({ participants: 2, unknown: 0, rate: 1 });
  });
  it("counts repeated pledge-only trustees once while preserving their separate credit total", () => {
    const result = aggregate("Pledge Trustee,0,400,1\nPledge Trustee,0,400,1\nZero Trustee,0,0,2", 3);
    expect(result).toMatchObject({ trusteeCount: 2, duplicateRows: 1, cashCents: 0, commitmentCents: 40000 });
    expect(boardParticipation(result)).toEqual({ total: 2, participants: 1, unknown: 0, rate: .5 });
  });
  it.each(["Trustee A,1,0,1\nTrustee A,2,0,1", "Trustee A,1,0,1\nTrustee B,1,0,1", "Trustee A,,0,1\nTrustee A,0,0,1"])("rejects conflicts rather than combining constituent summaries", rows => {
    expect(() => aggregate(rows, 2)).toThrow("conflicting");
  });
  it.each(["Trustee A,NaN,0,1", "Trustee A,1e6,0,1", "Trustee A,1.999,0,1", "Trustee A,10,0,", ",10,0,1"])("rejects invalid amounts or identities: %s", row => {
    expect(() => aggregate(row, 1)).toThrow();
  });
  it("requires complete results and identities without truncating or guessing", () => {
    expect(aggregate("", 0)).toMatchObject({ trusteeCount: 0, cashCents: 0, commitmentCents: 0 });
    expect(() => aggregate("", null)).toThrow("row count");
    expect(() => aggregate("Trustee A,1,2,1", 2)).toThrow("row counts");
    expect(() => aggregateBoardCsv(csv("Trustee A,1,2,1").replace("QRECID", "Lookup ID"), source, 1)).toThrow("record ID");
    expect(() => aggregate("Trustee A,90071992547409,0,1\nTrustee B,90071992547409,0,2", 2)).toThrow("range");
    expect(() => aggregate(Array.from({ length: 2001 }, (_, index) => `Trustee ${index},1,0,${index + 1}`).join("\n"), 2001)).toThrow("2,000");
  });
  it("validates year, query, unique mappings and conservative suggestions", () => {
    expect(validateBoardSource(source)).toEqual(source);
    expect(() => validateBoardSource({ ...source, fiscalYear: 27 })).toThrow("fiscal year");
    expect(() => validateBoardSource({ ...source, queryId: "../31092" })).toThrow("record ID");
    expect(() => validateBoardSource({ ...source, columns: { ...source.columns, commitments: source.columns.cash } })).toThrow("distinct");
    expect(suggestBoardColumns(["Name", "Total Gifts FY27 (Cash)", "Other FY27 Cash", "Total Pledges or Planned Gifts FY26"], 2027)).toEqual({ name: "Name", cash: "", commitments: "", code: "", start: "", end: "" });
  });
  it("rejects prompted or non-constituent queries and unaliased repeated summary names", () => {
    expect(() => inspectBoardQuery({ ...boardQueryFixture(), type: "Gift" }, source)).toThrow("Constituent");
    expect(() => inspectBoardQuery({ ...boardQueryFixture(), has_ask_fields: true }, source)).toThrow("prompted");
    const metadata = boardQueryFixture(); metadata.select_fields.forEach(field => delete field.user_alias);
    expect(() => inspectBoardQuery(metadata, source)).toThrow("distinct output aliases");
  });
  it("rejects wrong-year, missing, or OR-expanded annual date filters", () => {
    const wrongYear = boardQueryFixture(2026);
    expect(() => inspectBoardQuery(wrongYear, source, source)).toThrow("July 1, 2026");
    const noDates = boardQueryFixture(); noDates.summary_fields[1].filter_fields = [];
    expect(() => inspectBoardQuery(noDates, source, source)).toThrow("Gift Date");
    const orDates = boardQueryFixture(); orDates.summary_fields[0].filter_fields.push({ compare_type: "Or" });
    expect(() => inspectBoardQuery(orDates, source, source)).toThrow("Gift Date");
  });
  it("requires service columns and dates from the same constituency group", () => {
    const missing = boardQueryFixture(); missing.select_fields.pop();
    expect(() => inspectBoardQuery(missing, source, source)).toThrow("Add Constituency Code");
    const unrelated = boardQueryFixture(); unrelated.select_fields.at(-1).query_field.node_path[0].id = "unrelated";
    expect(() => inspectBoardQuery(unrelated, source, source)).toThrow("same constituency output group");
    const wrongDate = boardQueryFixture(); wrongDate.select_fields.at(-1).query_field.value_type = "Text";
    expect(() => inspectBoardQuery(wrongDate, source, source)).toThrow("own Date From");
  });
  it("filters service before giving and participation, consolidating multiple code rows without counting money twice", () => {
    const header = csv("");
    const result = aggregateBoardCsv(header + [
      "Open Trustee,100,0,1,Trustee,2020,",
      "Open Trustee,100,0,1,Trustee-Former,2025,",
      "Six Months,200,500,2,Trustee,2020,12/31/2026",
      "Six Months,200,500,2,Trustee,2020,12/31/2026",
      "Short Service,9000,0,3,Trustee,2020,12/30/2026",
      "Old Trustee,10000,10000,4,Trustee,2000,2008",
      "Former Only,20000,20000,5,Trustee-Former,2000,",
      "Zero Giving,0,0,6,Trustee,,",
    ].join("\n"), source, 8);
    expect(result).toMatchObject({ trusteeCount: 3, cashCents: 30000, commitmentCents: 50000, duplicateRows: 2,
      eligibility: { candidateCount: 6, includedCount: 3, excludedCount: 3, reviewCount: 0, openAndFormerCount: 1 } });
    expect(result.trustees.map(row => row.id).sort()).toEqual(["1", "2", "6"]);
    expect(boardParticipation(result).rate).toBe(2 / 3);
    expect(result.eligibility.excluded.map(row => row.id).sort()).toEqual(["3", "4", "5"]);
  });
  it("retains confirmed names but withholds totals and rates for uncertain eligibility", () => {
    const result = aggregateBoardCsv(csv("") + "Known Trustee,100,0,1,Trustee,2020,\nUncertain Trustee,500,1000,2,Trustee,,1/31/2027", source, 2);
    expect(result).toMatchObject({ trusteeCount: 1, cashCents: null, commitmentCents: null, eligibility: { reviewCount: 1, excludedCount: 0 } });
    expect(boardParticipation(result).rate).toBeNull();
    expect(result.eligibility.needsReview[0]).toMatchObject({ name: "Uncertain Trustee", status: "review" });
  });
  it("excludes later joiners from historical giving and participation even with a blank end date", () => {
    const historical = BOARD_DEFAULT_SOURCES.find(item => item.fiscalYear === 2017);
    const result = aggregateBoardCsv(csv("").replaceAll("FY27", "FY17") + [
      "Serving Trustee,100,200,1,Trustee,2010,",
      "Non-Giving Trustee,0,0,2,Trustee,2010,",
      "Future Joiner,9000,9000,3,Trustee,7/1/2017,",
      "Future Joiner,9000,9000,3,Trustee-Former,2026,",
    ].join("\n"), historical, 4);
    expect(result).toMatchObject({ trusteeCount: 2, cashCents: 10000, commitmentCents: 20000,
      eligibility: { candidateCount: 3, excludedCount: 1, reviewCount: 0 } });
    expect(boardParticipation(result)).toMatchObject({ total: 2, participants: 1, rate: .5 });
    expect(result.eligibility.excluded[0]).toMatchObject({ id: "3", reason: "Trustee service began after this fiscal year" });
  });
  it.each([2022, 2023, 2024])("applies Barry's May 2023 start before FY%s giving totals and participation", fiscalYear => {
    const historical = BOARD_DEFAULT_SOURCES.find(item => item.fiscalYear === fiscalYear);
    const result = aggregateBoardCsv(csv("").replaceAll("FY27", `FY${String(fiscalYear).slice(-2)}`) + [
      "Barry A. Gleichenhaus,9000,5000,1,Trustee,5/1/2023,",
      "Cash Trustee,1000,0,2,Trustee,2010,",
      "Pledge Trustee,0,200,3,Trustee,2010,",
      "Zero Giving Trustee,0,0,4,Trustee,2010,",
    ].join("\n"), historical, 4);
    if (fiscalYear < 2024) {
      expect(result).toMatchObject({ trusteeCount: 3, cashCents: 100000, commitmentCents: 20000,
        eligibility: { excludedCount: 1, reviewCount: 0 } });
      expect(result.trustees.some(row => row.id === "1")).toBe(false);
      expect(result.eligibility.excluded[0]).toMatchObject({ id: "1", name: "Barry A. Gleichenhaus" });
      expect(boardParticipation(result)).toMatchObject({ total: 3, participants: 2, rate: 2 / 3 });
    } else {
      expect(result).toMatchObject({ trusteeCount: 4, cashCents: 1000000, commitmentCents: 520000,
        eligibility: { excludedCount: 0, reviewCount: 0 } });
      expect(boardParticipation(result)).toMatchObject({ total: 4, participants: 3, rate: .75 });
    }
  });
});

describe("Saved fiscal-year snapshots", () => {
  function fixture() {
    const oldYear = { source: { ...source, fiscalYear: 2026, queryId: "30000", queryName: "FY26 trustees" }, snapshot: { trustees: [{ id: "99", name: "Former trustee" }], cashCents: 100 } };
    const db = vi.fn().mockResolvedValueOnce([{ payload: { revision: "before", years: [oldYear] } }]).mockResolvedValue([{ report_key: "saved" }]);
    const transport = { metadata: vi.fn().mockImplementation(async () => boardQueryFixture()), execute: vi.fn().mockResolvedValue({ body: new TextEncoder().encode(csv("Current trustee,100,200,1")), contentType: "text/csv", queryJobRowCount: 1 }) };
    return { oldYear, db, transport, input: source, revision: "before", user: { id: 3 } };
  }
  it("updates only the requested year, preserving past trustees and totals", async () => {
    const f = fixture(); const state = await refreshBoardYear(f);
    expect(state.years).toHaveLength(2);
    expect(state.years[1]).toEqual(f.oldYear);
    expect(state.years[0]).toMatchObject({ source, snapshot: { cashCents: 10000, commitmentCents: 20000, trusteeCount: 1 } });
    expect(publicBoardState(state).years[0]).not.toHaveProperty("updatedBy");
    expect(f.transport.metadata).toHaveBeenCalledTimes(2);
    expect(f.db).toHaveBeenCalledTimes(2);
  });
  it("preserves all other years and their saved mappings when refreshing an eleven-year report", async () => {
    const f = fixture();
    const years = BOARD_DEFAULT_SOURCES.map(item => ({ source: item, snapshot: { marker: item.fiscalYear } }));
    f.db.mockReset().mockResolvedValueOnce([{ payload: { revision: "before", years } }]).mockResolvedValue([{ report_key: "saved" }]);
    const state = await refreshBoardYear(f);
    expect(state.years).toHaveLength(11);
    expect(state.years.slice(1)).toEqual(years.slice(1));
    expect(state.years[0].snapshot).toMatchObject({ trusteeCount: 1, cashCents: 10000 });
  });
  it("upgrades legacy three-column mappings but cannot bypass the new eligibility rule", async () => {
    const f = fixture(); const { name, cash, commitments } = source.columns;
    const state = await refreshBoardYear({ ...f, input: { ...source, columns: { name, cash, commitments } } });
    expect(state.years[0].source.columns).toEqual(source.columns);
    expect(state.years[0].snapshot.eligibility.includedCount).toBe(1);
    const g = fixture(); const metadata = boardQueryFixture(); metadata.select_fields = metadata.select_fields.slice(0, 3);
    g.transport.metadata.mockResolvedValue(metadata);
    await expect(refreshBoardYear(g)).rejects.toThrow("Add Constituency Code");
    expect(g.transport.execute).not.toHaveBeenCalled(); expect(g.db).toHaveBeenCalledTimes(1);
  });
  it("rejects stale revisions and a query already assigned to another year before running NXT", async () => {
    const f = fixture(); await expect(refreshBoardYear({ ...f, revision: "old" })).rejects.toMatchObject({ status: 409 });
    expect(f.transport.execute).not.toHaveBeenCalled();
    const g = fixture(); await expect(refreshBoardYear({ ...g, input: { ...source, queryId: "30000" } })).rejects.toThrow("separate query");
    expect(g.transport.metadata).not.toHaveBeenCalled();
  });
  it("keeps every year's saved data on provider, incomplete download, or mid-refresh definition failures", async () => {
    const f = fixture(); f.transport.execute.mockRejectedValue(new Error("provider unavailable"));
    await expect(refreshBoardYear(f)).rejects.toThrow(); expect(f.db).toHaveBeenCalledTimes(1);
    const g = fixture(); g.transport.execute.mockResolvedValue({ body: new TextEncoder().encode(csv("Trustee,1,0,1")), contentType: "text/csv", queryJobRowCount: 2 });
    await expect(refreshBoardYear(g)).rejects.toThrow("row counts"); expect(g.db).toHaveBeenCalledTimes(1);
    const h = fixture(); h.transport.metadata.mockResolvedValueOnce(boardQueryFixture()).mockResolvedValueOnce({ ...boardQueryFixture(), gift_processing_options: { soft_credit_option: "Donor" } });
    await expect(refreshBoardYear(h)).rejects.toThrow("definition changed"); expect(h.db).toHaveBeenCalledTimes(1);
  });
  it("creates safely and refuses to overwrite a concurrent winner", async () => {
    expect(await readBoardState(vi.fn().mockResolvedValue([]))).toEqual({ revision: null, years: [] });
    const f = fixture(); f.db.mockReset().mockResolvedValueOnce([]).mockResolvedValue([{ report_key: "saved" }]);
    await refreshBoardYear({ ...f, revision: null });
    expect(f.db.mock.calls[1][0].join("")).toContain("ON CONFLICT (report_key) DO NOTHING");
    const g = fixture(); g.db.mockReset().mockResolvedValueOnce([{ payload: { revision: "before", years: [] } }]).mockResolvedValue([]);
    await expect(refreshBoardYear(g)).rejects.toThrow("Another refresh");
  });
  it("uses only the shared reporting identity and read-only query operations", async () => {
    const transport = await boardTransport("https://app.example", "31092");
    await transport.metadata(); await transport.execute();
    expect(mocks.api).toHaveBeenCalledWith("/query/queries/31092", expect.objectContaining({ userId: 7, authUserId: 7, maxRetries: 0 }));
    expect(mocks.api.mock.calls[0][1]).not.toHaveProperty("method");
    expect(mocks.execute).toHaveBeenCalledWith(expect.objectContaining({ queryId: "31092", maxBytes: 4194304 }));
    mocks.account.mockResolvedValue({ id: 9, role: "mgo" });
    await expect(boardTransport("https://app.example", "31092")).rejects.toMatchObject({ status: 409 });
  });
});
