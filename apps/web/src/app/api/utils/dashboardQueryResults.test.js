// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(), job: vi.fn(), download: vi.fn(), countDownload: vi.fn(),
  config: vi.fn(), sql: vi.fn(), snapshot: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: vi.fn() }));
vi.mock("@/app/api/utils/ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/getOrCreateUser", () => ({ default: vi.fn() }));
vi.mock("@/app/api/utils/sql", () => ({ default: mocks.sql }));
vi.mock("@/app/api/utils/reportCache", () => ({
  getCachedReportSnapshot: vi.fn(), saveReportSnapshot: mocks.snapshot,
  getReportCacheHeaders: vi.fn(), shouldBypassReportCache: vi.fn(),
}));
vi.mock("@/app/api/utils/blackbaud", async (importOriginal) => ({
  ...await importOriginal(),
  createBlackbaudQueryJob: mocks.create,
  getBlackbaudQueryJob: mocks.job,
  downloadBlackbaudQueryResultWithMetadata: mocks.download,
  downloadBlackbaudQueryResult: mocks.countDownload,
  getBlackbaudConfigIssues: mocks.config,
}));

import { runDashboardQueryResults } from "./dashboardQueryResults";
import { runDashboardQueryCount } from "./dashboardQueryCount";
import { QUERY_RESULTS_LIMITS, isValidDashboardTableData } from "./dashboardConfiguration";
import { BlackbaudQueryResultTooLargeError } from "./blackbaud";
import { executeSavedQueryCount, executeSavedQueryResults } from "@/app/api/reports/alumni-family-engagement/route";

const options = { user: { id: 7 }, origin: "https://example.test", queryId: "30971" };
const signedUrl = "https://results.example.test/private.csv?signature=not-real";
const csv = (content, contentType = "text/csv; charset=utf-8") => ({
  body: typeof content === "string" ? new TextEncoder().encode(content) : content,
  contentType,
});
const run = () => runDashboardQueryResults(options);

describe("dashboard saved-query result tables", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.config.mockReturnValue([]);
    mocks.create.mockResolvedValue({ id: "job-30971" });
    mocks.job.mockResolvedValue({ status: "Completed", row_count: 9999, sas_uri: signedUrl });
    mocks.download.mockResolvedValue(csv("ID,Name,Amount\n0001,Example,0\n"));
    for (const method of ["error", "warn", "log"]) vi.spyOn(console, method).mockImplementation(() => {});
  });
  afterEach(() => {
    expect(console.error).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
    expect(console.log).not.toHaveBeenCalled();
    expect(mocks.sql).not.toHaveBeenCalled();
    expect(mocks.snapshot).not.toHaveBeenCalled();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns every actual CSV column and text cell, never a count or job URL", async () => {
    mocks.download.mockResolvedValue(csv(
      '\uFEFF ID , Name ,Amount,Zero,Note,Empty\r\n0001,"Example, Name","$1,234.00",0,"line 1\r\nline ""2""",\r\n0002,  Keep spaces  ,$0.00,00,,',
    ));
    const result = await run();
    expect(result).toEqual({
      headers: ["ID", "Name", "Amount", "Zero", "Note", "Empty"],
      rows: [
        ["0001", "Example, Name", "$1,234.00", "0", 'line 1\r\nline "2"', ""],
        ["0002", "  Keep spaces  ", "$0.00", "00", "", ""],
      ],
      dataSource: "query-results-csv-v1",
      queryJobRowCount: 9999,
    });
    expect(isValidDashboardTableData(result)).toBe(true);
    expect(mocks.create).toHaveBeenCalledWith({ userId: 7, authUserId: 7, origin: options.origin, queryId: "30971" });
    expect(mocks.download).toHaveBeenCalledWith(signedUrl, {
      userId: 7, authUserId: 7, origin: options.origin, maxBytes: QUERY_RESULTS_LIMITS.bytes,
    });
    expect(mocks.countDownload).not.toHaveBeenCalled();
  });

  it.each(["ID,Name", "ID,Name\n", "ID,Name\r\n", '"ID","Name"\r'])
    ("accepts header-only CSV without fabricating a row: %s", async (content) => {
      mocks.download.mockResolvedValue(csv(content));
      expect(await run()).toMatchObject({ headers: ["ID", "Name"], rows: [] });
    });

  it("preserves blank records, empty cells, and exact-case headers", async () => {
    mocks.download.mockResolvedValue(csv("Name,name\n,\n0,\n"));
    expect(await run()).toMatchObject({ headers: ["Name", "name"], rows: [["", ""], ["0", ""]] });
    mocks.download.mockResolvedValue(csv("Name\n\n0\n"));
    expect(await run()).toMatchObject({ rows: [[""], ["0"]] });
    mocks.download.mockResolvedValue(csv("[Constituent]\n0"));
    expect(await run()).toMatchObject({ headers: ["[Constituent]"] });
  });

  it.each([
    "", " \n\t", '\uFEFF', '{"rows":[]}', '[1,2]', "<html>private</html>",
    "<!DOCTYPE html><body>private</body>", "PK\u0003\u0004xlsx", "ID\n\u0000",
    'ID,Name\n1,"unfinished', 'ID,Name\n1,un"escaped', 'ID,Name\n1,"closed"extra',
    'ID,Name\n1,"closed" ', "ID,Name\n1", "ID,Name\n1,Name,extra", "ID,Name\n\n",
    ",Name\n1,2", "ID, \n1,2", "ID,ID\n1,2", " ID ,ID \n1,2",
  ])("rejects empty, mislabeled or malformed data without disclosing content: %s", async (content) => {
    mocks.download.mockResolvedValue(csv(content));
    await expect(run()).rejects.toMatchObject({ status: 502 });
  });

  it.each([
    null, "", "text/plain", "application/json", "text/html", "application/octet-stream",
    "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip", "text/csvish", "application/json; name=result.csv",
  ])("requires the actual CSV MIME even when the body is valid CSV: %s", async (contentType) => {
    mocks.download.mockResolvedValue(csv("ID\n0", contentType));
    await expect(run()).rejects.toMatchObject({ status: 502, message: expect.stringContaining("CSV result file") });
  });

  it.each(["text/csv", 'Text/CSV; CHARSET="UTF-8"', "application/csv", "text/x-csv", "application/x-csv"])
    ("accepts explicit CSV MIME: %s", async (contentType) => {
      mocks.download.mockResolvedValue(csv("ID\n0", contentType));
      expect(await run()).toMatchObject({ rows: [["0"]] });
    });

  it("decodes declared charsets before parsing, including split-width text and BOM", async () => {
    mocks.download.mockResolvedValue(csv(Uint8Array.from([78,97,109,101,10,99,97,102,233]), "text/csv; charset=windows-1252"));
    expect(await run()).toMatchObject({ headers: ["Name"], rows: [["caf\u00e9"]] });
    mocks.download.mockResolvedValue(csv(new Uint8Array(Buffer.from('\uFEFFName,Amount\nExample,$0.00', "utf16le")), 'text/csv; charset="utf-16le"'));
    expect(await run()).toMatchObject({ headers: ["Name", "Amount"], rows: [["Example", "$0.00"]] });
  });

  it("joins streamed byte chunks before charset decoding in the complete result flow", async () => {
    const blackbaud = await vi.importActual("./blackbaud");
    mocks.download.mockImplementation(blackbaud.downloadBlackbaudQueryResultWithMetadata);
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("Name,Amount\n"));
        controller.enqueue(Uint8Array.of(0xe2));
        controller.enqueue(Uint8Array.of(0x82));
        controller.enqueue(Uint8Array.of(0xac));
        controller.enqueue(new TextEncoder().encode(",$0.00\n"));
        controller.close();
      },
    });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(body, { headers: { "Content-Type": "text/csv; charset=utf-8" } })));
    expect(await run()).toMatchObject({ headers: ["Name", "Amount"], rows: [["\u20ac", "$0.00"]] });
  });

  it.each(["text/csv; charset=unknown", "text/csv; charset=", 'text/csv; charset="utf-8', "text/csv; charset=utf-8; charset=utf-16le"])
    ("rejects unsupported or ambiguous charset: %s", async (contentType) => {
      mocks.download.mockResolvedValue(csv("Name\n0", contentType));
      await expect(run()).rejects.toMatchObject({ status: 502, message: expect.stringMatching(/charset/) });
    });

  it.each([
    [Uint8Array.from([78,10,0xc3,0x28]), "text/csv"],
    [Uint8Array.from([78,0,10,0,65]), "text/csv; charset=utf-16le"],
  ])("uses fatal text decoding instead of replacement characters", async (body, contentType) => {
    mocks.download.mockResolvedValue(csv(body, contentType));
    await expect(run()).rejects.toMatchObject({ status: 502, message: expect.stringContaining("encoding") });
  });

  it.each([
    ["rows", () => "ID\n" + Array(QUERY_RESULTS_LIMITS.rows + 1).fill("0").join("\n")],
    ["columns", () => Array.from({ length: QUERY_RESULTS_LIMITS.columns + 1 }, (_, i) => `H${i}`).join(",")],
    ["cells", () => "ID\n" + "x".repeat(QUERY_RESULTS_LIMITS.cellCharacters + 1)],
    ["headers", () => "x".repeat(201)],
    ["bytes", () => new Uint8Array(QUERY_RESULTS_LIMITS.bytes + 1)],
  ])("fails safely at the %s cap without truncation", async (dimension, content) => {
    mocks.download.mockResolvedValue(csv(content()));
    await expect(run()).rejects.toMatchObject({ status: 413, message: expect.stringContaining("No results were truncated") });
  });

  it("accepts exactly the row, column, cell and header caps", async () => {
    mocks.download.mockResolvedValue(csv("ID\n" + Array(QUERY_RESULTS_LIMITS.rows).fill("0").join("\n")));
    expect((await run()).rows).toHaveLength(QUERY_RESULTS_LIMITS.rows);
    const headers = Array.from({ length: QUERY_RESULTS_LIMITS.columns }, (_, i) => `H${i}`);
    headers[0] = "H".repeat(200);
    const cells = headers.map(() => "x".repeat(QUERY_RESULTS_LIMITS.cellCharacters));
    mocks.download.mockResolvedValue(csv(headers.join(",") + "\n" + cells.join(",")));
    expect(await run()).toMatchObject({ headers, rows: [cells] });
  });

  it("accepts exactly the byte cap, but not one byte beyond it", async () => {
    const content = "H\n" + ("x".repeat(1999) + "\n").repeat(262) + "x".repeat(286);
    expect(new TextEncoder().encode(content)).toHaveLength(QUERY_RESULTS_LIMITS.bytes);
    mocks.download.mockResolvedValue(csv(content));
    expect((await run()).rows).toHaveLength(263);
    mocks.download.mockResolvedValue(csv(content + "x"));
    await expect(run()).rejects.toMatchObject({ status: 413 });
  });

  it("uses the schema's serialized table cap after charset expansion", async () => {
    const body = new Uint8Array(Buffer.from("H\n" + ("\xa1".repeat(2000) + "\n").repeat(180), "latin1"));
    expect(body.byteLength).toBeLessThan(QUERY_RESULTS_LIMITS.bytes);
    mocks.download.mockResolvedValue(csv(body, "text/csv; charset=shift_jis"));
    const error = await run().then(() => null, (failure) => failure);
    expect(error).toMatchObject({ status: 413, message: expect.stringContaining("table size") });
  });

  it("maps streaming overflow to a user-safe limit error", async () => {
    mocks.download.mockRejectedValue(new BlackbaudQueryResultTooLargeError(QUERY_RESULTS_LIMITS.bytes));
    await expect(run()).rejects.toMatchObject({ status: 413, message: expect.stringContaining("524288 bytes") });
  });

  it.each([undefined, null, "", " ", -1, 1.5, "invalid", Number.MAX_SAFE_INTEGER + 1])
    ("uses null for missing or invalid job row counts: %s", async (rowCount) => {
      mocks.job.mockResolvedValue({ status: "Completed", row_count: rowCount, sas_uri: signedUrl });
      expect((await run()).queryJobRowCount).toBeNull();
    });

  it("preserves metadata zero and supports nested result URL/count aliases", async () => {
    mocks.job.mockResolvedValue({ state: "Succeeded", result: { readUrl: signedUrl, rowCount: "0" } });
    expect((await run()).queryJobRowCount).toBe(0);
    expect(mocks.download).toHaveBeenCalledWith(signedUrl, expect.any(Object));
  });

  it("polls queued jobs before downloading the completed file", async () => {
    vi.useFakeTimers();
    mocks.create.mockResolvedValue({ job_id: "job-30971" });
    mocks.job.mockResolvedValueOnce({ status: "Running" });
    const pending = run();
    await vi.advanceTimersByTimeAsync(1500);
    expect((await pending).rows).toHaveLength(1);
    expect(mocks.job).toHaveBeenCalledTimes(2);
    expect(mocks.job).toHaveBeenCalledWith({ userId: 7, authUserId: 7, origin: options.origin, jobId: "job-30971" });
    expect(mocks.download).toHaveBeenCalledTimes(1);
  });

  it("times out without downloading or exposing query status", async () => {
    vi.useFakeTimers();
    mocks.job.mockResolvedValue({ status: "Running private" });
    const assertion = expect(run()).rejects.toMatchObject({ status: 502, message: expect.not.stringContaining("private") });
    await vi.advanceTimersByTimeAsync(90000);
    await assertion;
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it.each(["create", "job", "download", "config"])("sanitizes %s failures in the public runner", async (step) => {
    const error = Object.assign(new Error("donor token https://private.example"), { status: 401 });
    if (step === "config") mocks.config.mockImplementation(() => { throw error; });
    else mocks[step].mockRejectedValue(error);
    await expect(run()).rejects.toMatchObject({ status: 502, message: "Could not retrieve the saved query results. No report snapshot was changed." });
  });

  it("also sanitizes failures for callers of the separate result reader", async () => {
    mocks.create.mockRejectedValue(new Error("donor token https://private.example"));
    await expect(executeSavedQueryResults(options)).rejects.toThrow("Could not retrieve the saved query results. No report snapshot was changed.");
  });

  it.each(["missing-id", "missing-file", "failed"])("fails closed on %s without a download", async (failure) => {
    if (failure === "missing-id") mocks.create.mockResolvedValue({});
    if (failure === "missing-file") mocks.job.mockResolvedValue({ status: "Completed" });
    if (failure === "failed") mocks.job.mockResolvedValue({ status: "Failed donor token https://private.example" });
    await expect(run()).rejects.toMatchObject({ status: 502, message: expect.not.stringMatching(/donor|token|private/) });
    expect(mocks.download).not.toHaveBeenCalled();
  });

  it.each([null, undefined, "", "0", "1.5", "abc", [], {}, true, -1])("validates query IDs before execution: %s", async (queryId) => {
    await expect(runDashboardQueryResults({ ...options, queryId })).rejects.toMatchObject({ status: 400 });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("does not execute when Blackbaud is not configured", async () => {
    mocks.config.mockReturnValue(["private configuration details"]);
    await expect(run()).rejects.toMatchObject({ status: 502 });
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("leaves alumni and dashboard count callers on the old downloader without table caps", async () => {
    mocks.countDownload.mockResolvedValue("ID\n" + Array(1001).fill("0").join("\n"));
    expect(await executeSavedQueryCount({ ...options, label: "regression" })).toEqual({ total: 1001, polls: 1, queryJobRowCount: 9999 });
    expect(await runDashboardQueryCount(options)).toEqual({ value: 1001, countSource: "strict-csv-row-count-v1", queryJobRowCount: 9999 });
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.countDownload).toHaveBeenCalledWith(signedUrl, { userId: 7, authUserId: 7, origin: options.origin });
  });
});
