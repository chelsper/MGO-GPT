// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("./ensureAppSchema", () => ({ default: vi.fn() }));
vi.mock("./sql", () => ({ default: vi.fn() }));
vi.mock("./blackbaud", async (original) => ({
  ...(await original()),
  getBlackbaudQueryJob: vi.fn(),
  createBlackbaudQueryJob: vi.fn(),
}));
import { getBlackbaudQueryJob, createBlackbaudQueryJob } from "./blackbaud";
import { advanceQueryList } from "./constituentQueryList";
import { getQueryJobMetadataRowCount } from "./savedQueryExecution";
import {
  deduplicateSocietyConstituentCsv,
  readSocietyConstituentQueryResult,
  SOCIETY_CONSTITUENT_RESULT_LIMITS,
} from "./societyConstituentQueryResult";
import {
  constituentQueryOutput,
  societyQuerySettings,
} from "../../../../test/societyQueryFixture";

const url = "https://query-results.example/letters.csv?signature=not-real";
const context = { userId: 1, origin: "https://example.org" };
const config = () => societyQuerySettings().societySources[0];
const bytes = (text) => new TextEncoder().encode(text);
const csvRow = (values) =>
  values.map((v) => `"${String(v).replaceAll('"', '""')}"`).join(",");
const csv = (records, columns = config().columns) => {
  const output = constituentQueryOutput(records, columns);
  return [output.headers, ...output.tableRows].map(csvRow).join("\r\n");
};
let fetchMock;
function responseFromChunks(
  chunks,
  contentType = "text/csv; charset=utf-8",
  headers = {},
) {
  const iterator = chunks[Symbol.iterator]();
  const reader = {
    read: vi.fn(async () => iterator.next()),
    cancel: vi.fn(async () => {}),
    releaseLock: vi.fn(),
  };
  const body = {
    getReader: vi.fn(() => reader),
    cancel: vi.fn(async () => {}),
  };
  const response = {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "Content-Type": contentType, ...headers }),
    body,
    arrayBuffer: vi.fn(),
    text: vi.fn(),
  };
  fetchMock.mockResolvedValue(response);
  return { reader, body, response };
}
const read = (count, settings = config()) =>
  readSocietyConstituentQueryResult(url, context, settings, count);

beforeEach(() => {
  vi.resetAllMocks();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  expect(console.error).not.toHaveBeenCalled();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("streamed society query consolidation", () => {
  it.each([
    [{ row_count: 2 }, 2],
    [{ rowCount: "2" }, 2],
    [{ result: { rowCount: "0" } }, 0],
    [{ total_rows: " 2 " }, 2],
    [{ row_count: false }, null],
    [{ row_count: [] }, null],
    [{ row_count: "0x10" }, null],
    [{ row_count: "1e2" }, null],
    [{ row_count: -1 }, null],
    [{ row_count: 1.5 }, null],
    [{}, null],
  ])(
    "normalizes completed row-count metadata without coercing invalid values: %j",
    (job, expected) => {
      expect(getQueryJobMetadataRowCount(job)).toBe(expected);
    },
  );
  it("reads more than 12 MB without buffering the file and keeps all unique records", async () => {
    const settings = config();
    Object.assign(settings.columns, {
      keyIndicator: "Key indicator",
      contactType: "Contact type",
      contactFirstName: "Contact first name",
    });
    const output = constituentQueryOutput(
      Array.from({ length: 296 }, (_, i) => ({
        constituentId: String(100 + (i % 148)),
        spouseId: "",
        address1: "A".repeat(500),
        email: i < 148 ? "first@example.org" : "second@example.org",
        keyIndicator: "Organization",
        contactType: i < 148 ? "Main contact" : "Society letter contact",
        contactFirstName: i < 148 ? "Alex" : "Jamie",
      })),
      settings.columns,
    );
    const lines = output.tableRows.map(csvRow);
    let transferred = 0;
    function* chunks() {
      yield bytes(csvRow(output.headers) + "\r\n");
      for (let i = 0; i < 41273; i += 100) {
        const chunk = bytes(
          Array.from(
            { length: Math.min(100, 41273 - i) },
            (_, j) => lines[(i + j) % lines.length],
          ).join("\r\n") + "\r\n",
        );
        transferred += chunk.length;
        yield chunk;
      }
    }
    const { reader, response } = responseFromChunks(chunks());
    const table = await read(41273, settings);
    expect(transferred).toBeGreaterThan(12 * 1024 * 1024);
    expect(table.rows).toHaveLength(148);
    expect(table.metadata.deduplication).toEqual({
      rawRows: 41273,
      uniqueConstituents: 148,
      repeatedRows: 41125,
      varyingOutputFields: [
        "Contact first name",
        "Contact type",
        settings.columns.email,
      ].sort(),
    });
    expect(table.metadata.emailCandidates[100]).toEqual([
      "first@example.org",
      "second@example.org",
    ]);
    expect(table.metadata.organizationContacts[100].contacts).toHaveLength(2);
    expect(Buffer.byteLength(JSON.stringify(table))).toBeLessThan(512 * 1024);
    expect(response.arrayBuffer).not.toHaveBeenCalled();
    expect(response.text).not.toHaveBeenCalled();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
    expect(reader.cancel).not.toHaveBeenCalled();
  });

  it.each([1, 2, 3, 7, 65536])(
    "preserves UTF-8, BOM, quoted newlines and escaped quotes in %s-byte chunks",
    async (size) => {
      const content =
        "\uFEFF" +
        csv([
          {
            constituentId: "10",
            spouseId: "11",
            addressee: 'Jos\u00e9 "Jo", Example',
            address1: "Line 1\r\nLine 2",
          },
          { constituentId: "11", spouseId: "10" },
        ]);
      const raw = bytes(content);
      responseFromChunks(
        (function* () {
          for (let i = 0; i < raw.length; i += size)
            yield raw.subarray(i, i + size);
        })(),
      );
      expect(await read(2)).toEqual(
        deduplicateSocietyConstituentCsv(content, config()),
      );
    },
  );
  it.each(["utf-16le", "windows-1252"])(
    "preserves declared %s encoding across single-byte boundaries",
    async (charset) => {
      const content = csv([{ constituentId: "10", addressee: "Caf\u00e9" }]);
      const raw = Buffer.from(
        content,
        charset === "utf-16le" ? "utf16le" : "latin1",
      );
      responseFromChunks(
        Array.from(raw, (byte) => Uint8Array.of(byte)),
        `text/csv; charset=${charset}`,
      );
      expect(await read(1)).toEqual(
        deduplicateSocietyConstituentCsv(content, config()),
      );
    },
  );
  it("rejects an incomplete final encoded character instead of publishing processed rows", async () => {
    responseFromChunks([
      bytes(csv([{ constituentId: "10" }]) + "\r\n"),
      Uint8Array.of(0xc3),
    ]);
    await expect(read(1)).rejects.toThrow(/encoding/);
  });
  it.each([
    "text/html",
    "text/csv; charset=unknown",
    "text/csv; charset=utf-8; charset=utf-16le",
  ])("rejects MIME/charset %s before reading donor rows", async (type) => {
    const { reader, body } = responseFromChunks([bytes(csv())], type);
    await expect(read(1)).rejects.toThrow(/CSV|charset/);
    expect(reader.read).not.toHaveBeenCalled();
    expect(body.cancel).toHaveBeenCalledOnce();
  });
  it.each([
    undefined,
    null,
    "",
    " ",
    false,
    true,
    -1,
    0.5,
    "1e2",
    "invalid",
    Number.MAX_SAFE_INTEGER + 1,
  ])(
    "requires a valid completed row count before downloading: %s",
    async (count) => {
      await expect(read(count)).rejects.toThrow(/completed row count/);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );
  it("refuses an excessive expected row count without downloading", async () => {
    await expect(read(100001)).rejects.toThrow(/100,000 raw/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("accepts a header-only file only when NXT confirms zero rows", async () => {
    responseFromChunks([bytes(csv([]))]);
    expect((await read(0)).rows).toEqual([]);
    responseFromChunks([bytes(csv([]))]);
    await expect(read(1)).rejects.toThrow(/completed row count/);
  });
  it("does not attach a partial table to a query job when EOF disagrees with NXT", async () => {
    responseFromChunks([
      bytes(csv([{ constituentId: "10" }, { constituentId: "10" }])),
    ]);
    getBlackbaudQueryJob.mockResolvedValue({
      status: "Completed",
      sas_uri: url,
      row_count: 3,
    });
    const job = {
      stage: "query",
      queryJobId: "saved-job",
      queryStartedAt: new Date().toISOString(),
    };
    await expect(
      advanceQueryList({
        job,
        user: { id: 1 },
        origin: context.origin,
        source: { leadFundraiser: { enabled: false } },
        readResult: (url, ctx, result) =>
          readSocietyConstituentQueryResult(
            url,
            ctx,
            config(),
            getQueryJobMetadataRowCount(result),
          ),
      }),
    ).rejects.toThrow(/completed row count/);
    expect(job.stage).toBe("query");
    expect(job.table).toBeUndefined();
    expect(createBlackbaudQueryJob).not.toHaveBeenCalled();
  });
  it("stops on conflicting identities before reading the rest of the file", async () => {
    const { reader } = responseFromChunks([
      bytes(
        csv([
          { constituentId: "10", spouseId: "11" },
          { constituentId: "10", spouseId: "12" },
        ]) + "\r\n",
      ),
      bytes("unread"),
    ]);
    await expect(read(2)).rejects.toThrow(/conflicting spouse/);
    expect(reader.read).toHaveBeenCalledOnce();
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
  });
  it("cancels truncated CSV or a midstream network failure without returning a table", async () => {
    responseFromChunks([
      bytes(csv([{ constituentId: "10" }]) + '\r\n"unfinished'),
    ]);
    await expect(read(2)).rejects.toThrow(/malformed CSV/);
    const { reader } = responseFromChunks([
      bytes(csv([{ constituentId: "10" }]) + "\r\n"),
    ]);
    reader.read.mockRejectedValueOnce(new Error("connection failed"));
    await expect(read(1)).rejects.toThrow("connection failed");
    expect(reader.cancel).toHaveBeenCalledOnce();
    expect(reader.releaseLock).toHaveBeenCalledOnce();
  });
  it("keeps timeout protection active while waiting for another chunk", async () => {
    vi.useFakeTimers();
    const { reader } = responseFromChunks([]);
    reader.read.mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fetchMock.mock.calls[0][1].signal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          );
        }),
    );
    const result = expect(
      readSocietyConstituentQueryResult(
        url,
        { ...context, timeoutMs: 1000 },
        config(),
        1,
      ),
    ).rejects.toThrow(/timed out/);
    await vi.advanceTimersByTimeAsync(1000);
    await result;
    expect(reader.cancel).toHaveBeenCalledOnce();
  });
  it("rejects a declared oversized transfer before reading", async () => {
    const { reader, body } = responseFromChunks([], "text/csv", {
      "Content-Length": String(SOCIETY_CONSTITUENT_RESULT_LIMITS.bytes + 1),
    });
    await expect(read(1)).rejects.toMatchObject({
      status: 413,
      message: expect.stringMatching(/64 MB.*No partial/),
    });
    expect(reader.read).not.toHaveBeenCalled();
    expect(body.cancel).toHaveBeenCalledOnce();
  });
  it.each([429, 403, 500])(
    "retains HTTP %s and Retry-After without parsing an error page as CSV",
    async (status) => {
      fetchMock.mockResolvedValue(
        new Response("untrusted response", {
          status,
          headers: { "Retry-After": "60", "Content-Type": "text/html" },
        }),
      );
      await expect(read(1)).rejects.toMatchObject({
        httpStatus: status,
        retryAfterMs: 60000,
      });
    },
  );
});
