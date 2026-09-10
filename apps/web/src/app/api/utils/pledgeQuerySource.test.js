import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ sky: vi.fn(), download: vi.fn() }));
vi.mock("./blackbaud", () => ({ blackbaudApiFetch: mocks.sky, downloadBlackbaudQueryResultWithMetadata: mocks.download }));
import { advancePledgeDiscovery, parsePledgeQueryManifest, pledgeQueryResultUrl, pledgeQueryTransport, PLEDGE_QUERY_MAX_BYTES } from "./pledgeQuerySource";

const file = (csv, contentType = "text/csv; charset=windows-1252") => ({ httpStatus: 200, contentType, body: new TextEncoder().encode(csv) });
const store = () => ({ saveJob: vi.fn(), discover: vi.fn(), counts: vi.fn(async () => ({ total: 1 })) });
beforeEach(() => vi.clearAllMocks());

describe("query 12033 gift manifest", () => {
  it("deduplicates installment rows using only QRECID, never lookup, constituent, or installment IDs", () => {
    const csv = "Constituent ID,Gift ID,Installment System Record ID,QRECID\r\n900,123,456,789\r\n900,123,457,789\r\n";
    expect(parsePledgeQueryManifest(file(csv), 2)).toEqual({ ids: ["789"], rowCount: 2 });
  });
  it("matches the verified live output shape: 394 rows may represent 69 pledges", () => {
    const rows = Array.from({ length: 394 }, (_, i) => `"Gift, with commas",${i + 1},${i % 69 + 1}`);
    const result = parsePledgeQueryManifest(file(`Gift Type,Installment Number,QRECID\n${rows.join("\n")}`), 394);
    expect(result.ids).toHaveLength(69);
    expect(result.rowCount).toBe(394);
  });
  it("accepts a header-only verified empty result and UTF-8 BOM", () => {
    expect(parsePledgeQueryManifest(file("\uFEFFQRECID\r\n", "text/csv; charset=utf-8"), 0)).toEqual({ ids: [], rowCount: 0 });
  });
  it("decodes the actual Windows-1252 result charset without corrupting unrelated donor text", () => {
    const response = file("Name,QRECID\nRenX,9");
    response.body[15] = 0xe9;
    expect(parsePledgeQueryManifest(response, 1).ids).toEqual(["9"]);
  });
  it.each([
    ["Total Records\n69", 1, "query_missing_gift_system_id"],
    ["Gift ID,Constituent ID\n123,456", 1, "query_missing_gift_system_id"],
    ["QRECID,qrecid\n1,2", 1, "query_ambiguous_headers"],
    ["Name,QRECID\n\"unclosed,1", 1, "query_malformed_csv"],
    ["QRECID\n1,2", 1, "query_malformed_csv"],
    ["QRECID\nabc", 1, "query_invalid_gift_id"],
    ["Name,QRECID\nTest,", 1, "query_invalid_gift_id"],
    ["QRECID\n1", 2, "query_row_count_mismatch"],
    ["QRECID\n1", null, "query_row_count_mismatch"],
    ["QRECID\n1", "1oops", "query_row_count_mismatch"],
    ["<html>Forbidden</html>", 1, "query_not_csv"],
    ['{"error":"Forbidden"}', 1, "query_not_csv"],
    ["", 0, "query_not_csv"],
  ])("rejects unverified CSV without an ID-column fallback (%s)", (csv, count, code) => {
    expect(() => parsePledgeQueryManifest(file(csv), count)).toThrow(expect.objectContaining({ pledgeCode: code }));
  });
  it.each(["text/html", "application/json", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"])("rejects non-CSV response type %s", (type) => {
    expect(() => parsePledgeQueryManifest(file("QRECID\n1", type), 1)).toThrow();
  });
  it("fails closed on oversized files and invalid byte encodings", () => {
    expect(() => parsePledgeQueryManifest({ ...file(""), body: new Uint8Array(PLEDGE_QUERY_MAX_BYTES + 1) }, 0)).toThrow();
    expect(() => parsePledgeQueryManifest({ ...file("", "text/csv; charset=utf-8"), body: new Uint8Array([0xff]) }, 0)).toThrow();
  });
  it("accepts the verified Blackbaud signed-file host without changing its signature", () => {
    const uri = "https://nsa-pusa01.app.blackbaud.net/results.csv?sv=2025&sig=abc%2Bdef%2Fghi%3D";
    expect(pledgeQueryResultUrl(uri)).toBe(uri);
  });
  it.each(["http://results.blob.core.windows.net/result", "https://other.example/file", "https://user:secret@api.sky.blackbaud.com/file", "https://results.blob.core.windows.net.evil.example/file", "https://nsa-pusa01.app.blackbaud.net.evil.example/file", "https://other.app.blackbaud.net/file", "https://nsa-pusa01.app.blackbaud.net:8443/file", "https://nsa-pusa01.app.blackbaud.net/file#fragment", "https://user:secret@nsa-pusa01.app.blackbaud.net/file", "https://nested.account.blob.core.windows.net/file", "https://127.0.0.1/file", undefined])("rejects unsafe result locations", (uri) => {
    expect(() => pledgeQueryResultUrl(uri)).toThrow();
  });
});

describe("checkpointed query execution", () => {
  it("uses the existing execute-by-ID flow and never rewrites query filters", async () => {
    const query = pledgeQueryTransport({ userId: 1, authUserId: 1, origin: "https://app.example" });
    await query.metadata();
    await query.create();
    await query.poll("query-job");
    await query.download("https://results.blob.core.windows.net/result.csv?sig=private");
    expect(mocks.sky).toHaveBeenCalledTimes(3);
    expect(mocks.sky.mock.calls[0][0]).toMatch(/\/queries\/12033$/);
    const [endpoint, options] = mocks.sky.mock.calls[1];
    expect(endpoint).toMatch(/\/queries\/executebyid$/);
    expect(options).toMatchObject({ maxRetries: 0, timeoutMs: 12000, method: "POST", userId: 1, authUserId: 1,
      searchParams: { product: "RE", module: "None", include_read_url: "OnceCompleted" },
      body: { id: 12033, ux_mode: "Asynchronous", output_format: "Csv", formatting_mode: "UI", sql_generation_mode: "Query" } });
    expect(Object.keys(options.body)).toHaveLength(5);
    expect(mocks.download).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ maxBytes: PLEDGE_QUERY_MAX_BYTES, redirect: "error" }));
  });
  it("validates Gift query type before submission without retaining or changing criteria", async () => {
    const query = { metadata: vi.fn(async () => ({ id: 12033, type: "Gift", can_execute: true, filter_fields: ["unchanged private metadata"] })) };
    const result = await advancePledgeDiscovery({ queryStage: "metadata" }, store(), query, Date.now);
    expect(result).toEqual({ queryStage: "create" });
    query.metadata.mockResolvedValueOnce({ id: 12033, type: "Constituent" });
    await expect(advancePledgeDiscovery({ queryStage: "metadata" }, store(), query, Date.now)).rejects.toThrow();
  });
  it("polls once per invocation and can resume the same long-running query", async () => {
    const query = { poll: vi.fn(async () => ({ id: "query-job", status: "Running" })) };
    const original = { queryStage: "poll", queryJobId: "query-job", pollCount: 0 };
    let job = await advancePledgeDiscovery(original, store(), query, () => 1000);
    expect(query.poll).toHaveBeenCalledOnce();
    expect(job.nextPollAt).toBe(new Date(4000).toISOString());
    job.pollCount = 29;
    await expect(advancePledgeDiscovery(job, store(), query, Date.now)).rejects.toThrow(expect.objectContaining({ pledgeCode: "query_still_running" }));
    query.poll.mockResolvedValueOnce({ id: "query-job", status: "Completed" });
    expect((await advancePledgeDiscovery(job, store(), query, Date.now)).queryStage).toBe("download");
  });
});
