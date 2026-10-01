// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  BlackbaudQueryResultTooLargeError,
  streamBlackbaudQueryResultWithMetadata,
} from "./blackbaud";
import { decodeResult, parseResultCsv } from "./dashboardQueryResults";
import {
  deduplicateSocietyConstituentCsv,
  readSocietyConstituentQueryResult,
} from "./societyConstituentQueryResult";
import {
  constituentQueryOutput,
  societyQuerySettings,
} from "../../../../test/societyQueryFixture";
import {
  constituentHouseholdsFromQuery,
  letterPeriod,
  mergeSocietyLetterCohorts,
} from "@/utils/societyLetters";
import { getDefaultGivingSocietyConfigurations } from "./givingSocietyDefinitions";
import { advanceQueryList } from "./constituentQueryList";

vi.mock("./blackbaud", () => ({
  downloadBlackbaudQueryResultWithMetadata: vi.fn(),
  streamBlackbaudQueryResultWithMetadata: vi.fn(),
  getBlackbaudQueryJob: vi.fn(),
  createBlackbaudQueryJob: vi.fn(),
  createBlackbaudAdHocQueryJob: vi.fn(),
  BlackbaudQueryResultTooLargeError: class extends Error {},
}));
const settings = () => ({
  ...societyQuerySettings().societySources[0],
  sourceMode: "constituents",
  querySocietyKey: "presidents_society",
});
const quote = (value) => `"${String(value).replaceAll('"', '""')}"`;
function csv(records, columns = settings().columns) {
  const output = constituentQueryOutput(records, columns);
  return [output.headers, ...output.tableRows]
    .map((row) => row.map(quote).join(","))
    .join("\r\n");
}
const file = (content) => ({
  body: new TextEncoder().encode(content),
  contentType: "text/csv; charset=utf-8",
});
function mockStreamFile(value) {
  streamBlackbaudQueryResultWithMetadata.mockImplementation(
    async (_url, _options, createConsumer) => {
      const consumer = createConsumer(value);
      for (let i = 0; i < value.body.length; i += 65536)
        consumer.write(value.body.subarray(i, i + 65536));
      return { result: consumer.finish() };
    },
  );
}
const context = { userId: 1, authUserId: 1, origin: "https://example.org" };
const hierarchy = getDefaultGivingSocietyConfigurations()
  .filter((d) => ["presidents_society", "order_of_the_dolphin"].includes(d.key))
  .sort((a, b) => a.displayOrder - b.displayOrder);
const period = letterPeriod(societyQuerySettings(), "2026-09-24");
const households = (table, config = settings()) =>
  constituentHouseholdsFromQuery(
    { headers: table.headers, tableRows: table.rows, metadata: table.metadata },
    config,
    hierarchy,
    period,
  );

beforeEach(() => vi.resetAllMocks());

describe("constituent-ID society result deduplication", () => {
  it("processes a production-sized repeated result before applying unique-record limits", async () => {
    const content = csv(
      Array.from({ length: 41273 }, (_, i) => ({
        constituentId: String(100 + (i % 148)),
        spouseId: "",
        address1: "A".repeat(100),
      })),
    );
    expect(file(content).body.byteLength).toBeGreaterThan(512 * 1024);
    mockStreamFile(file(content));
    const table = await readSocietyConstituentQueryResult(
      "https://example.org/result.csv",
      context,
      settings(),
      41273,
    );
    expect(table.rows).toHaveLength(148);
    expect(table.metadata.deduplication).toEqual({
      rawRows: 41273,
      uniqueConstituents: 148,
      repeatedRows: 41125,
      varyingOutputFields: [],
    });
    expect(streamBlackbaudQueryResultWithMetadata).toHaveBeenCalledWith(
      "https://example.org/result.csv",
      { ...context, maxBytes: 64 * 1024 * 1024, redirect: "error" },
      expect.any(Function),
    );
  });
  it("ignores unused changing outputs but never merges different people with the same name", () => {
    const columns = { ...settings().columns, unused: "Constituency Code" };
    const table = deduplicateSocietyConstituentCsv(
      csv(
        [
          { constituentId: "10", unused: "Alumnus" },
          { constituentId: "10", unused: "Parent" },
          {
            constituentId: "20",
            addressee: "Example 10",
            salutation: "Example 10",
          },
        ],
        columns,
      ),
      settings(),
    );
    expect(table.rows).toHaveLength(2);
    expect(table.headers).not.toContain("Constituency Code");
    expect(table.metadata.deduplication.varyingOutputFields).toEqual([
      "Constituency Code",
    ]);
    expect(JSON.stringify(table)).not.toContain("Alumnus");
  });
  it("retains distinct email choices and consistent postal data without selecting an email", () => {
    const table = deduplicateSocietyConstituentCsv(
      csv([
        { constituentId: "10", spouseId: "11", email: "b@example.org" },
        { constituentId: "10", spouseId: "11", email: "a@example.org" },
        { constituentId: "10", spouseId: "11", email: "b@example.org" },
        { constituentId: "10", spouseId: "11", email: "" },
        { constituentId: "11", spouseId: "10" },
        { constituentId: "20", spouseId: "" },
      ]),
      settings(),
    );
    expect(table.rows).toHaveLength(3);
    expect(table.metadata.emailCandidates).toEqual({
      10: ["a@example.org", "b@example.org"],
    });
    expect(table.rows[0][table.headers.indexOf(settings().columns.email)]).toBe(
      "",
    );
    const groups = households(table);
    expect(groups).toHaveLength(2);
    expect(
      groups.find((g) => g.householdId === "10").recipientCandidates[0],
    ).toMatchObject({
      email: "",
      emailCandidates: ["a@example.org", "b@example.org"],
      address: "123 Example Street\nJacksonville, FL 32211",
    });
    expect(groups.find((g) => g.householdId === "20").members).toEqual(["20"]);
  });
  it("retains the sole nonblank email value regardless of input order", () => {
    for (const emails of [
      ["", "a@example.org"],
      ["a@example.org", ""],
    ]) {
      const table = deduplicateSocietyConstituentCsv(
        csv(emails.map((email) => ({ constituentId: "10", email }))),
        settings(),
      );
      expect(
        table.rows[0][table.headers.indexOf(settings().columns.email)],
      ).toBe("a@example.org");
      expect(table.metadata.emailCandidates).toEqual({});
    }
  });
  it.each(["spouseId", "addressee", "salutation", "address1", "city"])(
    "rejects conflicting %s rather than taking the first row",
    (field) => {
      const change = field === "spouseId" ? "30" : "Different";
      expect(() =>
        deduplicateSocietyConstituentCsv(
          csv([
            { constituentId: "10", spouseId: "11" },
            { constituentId: "10", spouseId: "11", [field]: change },
          ]),
          settings(),
        ),
      ).toThrow(/conflicting/);
    },
  );
  it("rejects conflicting mapped name fields", () => {
    const config = settings();
    config.columns.firstName = "First Name";
    expect(() =>
      deduplicateSocietyConstituentCsv(
        csv(
          [
            { constituentId: "10", firstName: "Alex" },
            { constituentId: "10", firstName: "Taylor" },
          ],
          config.columns,
        ),
        config,
      ),
    ).toThrow(/conflicting/);
  });
  it.each(["", "0", "0010", "bad", "99999999999999999999"])(
    "does not infer invalid system ID %s",
    (constituentId) => {
      expect(() =>
        deduplicateSocietyConstituentCsv(csv([{ constituentId }]), settings()),
      ).toThrow(/System Record ID/);
    },
  );
  it("rejects self-links, conflicting spouse groups and aliasing identity to email", () => {
    expect(() =>
      deduplicateSocietyConstituentCsv(
        csv([{ constituentId: "10", spouseId: "10" }]),
        settings(),
      ),
    ).toThrow(/System Record ID/);
    const table = deduplicateSocietyConstituentCsv(
      csv([
        { constituentId: "10", spouseId: "11" },
        { constituentId: "11", spouseId: "20" },
      ]),
      settings(),
    );
    expect(() => households(table)).toThrow(/conflicting spouse/);
    const config = settings();
    config.columns.email = config.columns.constituentId;
    expect(() => deduplicateSocietyConstituentCsv(csv(), config)).toThrow(
      /email output column/,
    );
  });
  it("rejects too many unique IDs, email values, raw rows, or compacted bytes", () => {
    expect(() =>
      deduplicateSocietyConstituentCsv(
        csv(
          Array.from({ length: 1001 }, (_, i) => ({
            constituentId: String(i + 1),
          })),
        ),
        settings(),
      ),
    ).toThrow(/1,000 unique/);
    expect(() =>
      deduplicateSocietyConstituentCsv(
        csv(
          Array.from({ length: 21 }, (_, i) => ({
            constituentId: "10",
            email: `test${i}@example.org`,
          })),
        ),
        settings(),
      ),
    ).toThrow(/20 email/);
    expect(() =>
      deduplicateSocietyConstituentCsv(
        csv(Array.from({ length: 100001 }, () => ({ constituentId: "10" }))),
        settings(),
      ),
    ).toThrow(/100000 rows/);
    expect(() =>
      deduplicateSocietyConstituentCsv(
        csv(
          Array.from({ length: 1000 }, (_, i) => ({
            constituentId: String(i + 1),
            address1: "a".repeat(1000),
          })),
        ),
        settings(),
      ),
    ).toThrow(/512 KB/);
  });
  it("rejects malformed rows even after valid repeated records, duplicate headers and missing mapping", () => {
    expect(() =>
      deduplicateSocietyConstituentCsv(
        `${csv([{ constituentId: "10" }])}\r\n"broken`,
        settings(),
      ),
    ).toThrow(/malformed CSV/);
    expect(() =>
      deduplicateSocietyConstituentCsv(
        "System Record ID,System Record ID\n10,10",
        settings(),
      ),
    ).toThrow(/unique/);
    expect(() =>
      deduplicateSocietyConstituentCsv("Other\n10", settings()),
    ).toThrow(/not returned/);
  });
  it("reports download bounds clearly and preserves MIME/encoding checks", async () => {
    streamBlackbaudQueryResultWithMetadata.mockRejectedValueOnce(
      new BlackbaudQueryResultTooLargeError(),
    );
    await expect(
      readSocietyConstituentQueryResult("url", context, settings(), 0),
    ).rejects.toMatchObject({
      status: 413,
      message: expect.stringMatching(/64 MB.*No partial/),
    });
    mockStreamFile({
      ...file(csv()),
      contentType: "text/html",
    });
    await expect(
      readSocietyConstituentQueryResult("url", context, settings(), 0),
    ).rejects.toThrow(/CSV result/);
    mockStreamFile({
      ...file(csv()),
      body: Uint8Array.of(0xc3),
    });
    await expect(
      readSocietyConstituentQueryResult("url", context, settings(), 0),
    ).rejects.toThrow(/encoding/);
  });
  it("checks completed NXT row count before returning a compacted table", async () => {
    mockStreamFile(
      file(csv([{ constituentId: "10" }, { constituentId: "10" }])),
    );
    await expect(
      readSocietyConstituentQueryResult("url", context, settings(), 3),
    ).rejects.toThrow(/completed row count/);
    const table = await readSocietyConstituentQueryResult(
      "url",
      context,
      settings(),
      "2",
    );
    expect(table.rows).toHaveLength(1);
  });
  it("does not raise the normal report limits", () => {
    const content = csv(
      Array.from({ length: 1001 }, () => ({ constituentId: "10" })),
    );
    expect(() => parseResultCsv(content)).toThrow(/1000 rows/);
    expect(() =>
      decodeResult({ body: new Uint8Array(524289), contentType: "text/csv" }),
    ).toThrow(/524288 bytes/);
  });
  it("carries only compacted rows and metadata through the query job", async () => {
    const { getBlackbaudQueryJob } = await import("./blackbaud");
    getBlackbaudQueryJob.mockResolvedValue({
      status: "Completed",
      sas_uri: "https://example.org/file",
      row_count: 2,
    });
    mockStreamFile(
      file(
        csv([
          { constituentId: "10", email: "a@example.org" },
          { constituentId: "10", email: "b@example.org" },
        ]),
      ),
    );
    const result = await advanceQueryList({
      job: {
        stage: "query",
        queryJobId: "existing",
        queryStartedAt: new Date().toISOString(),
      },
      user: { id: 1 },
      origin: context.origin,
      source: { leadFundraiser: { enabled: false } },
      readResult: (url, options, job) =>
        readSocietyConstituentQueryResult(
          url,
          options,
          settings(),
          job.row_count,
        ),
    });
    expect(result.snapshot.total).toBe(1);
    expect(result.snapshot.metadata.emailCandidates[10]).toHaveLength(2);
    expect(result.job.table.rows).toHaveLength(1);
  });
  it("unions email choices across societies while preserving the highest tier", () => {
    const upper = households(
      deduplicateSocietyConstituentCsv(
        csv([{ constituentId: "10", spouseId: "11", email: "a@example.org" }]),
        settings(),
      ),
    );
    const lowerConfig = {
      ...settings(),
      querySocietyKey: "order_of_the_dolphin",
    };
    const lower = households(
      deduplicateSocietyConstituentCsv(
        csv([{ constituentId: "10", spouseId: "11", email: "b@example.org" }]),
        lowerConfig,
      ),
      lowerConfig,
    );
    const result = mergeSocietyLetterCohorts(
      [
        { societyKey: "presidents_society", queryId: "31049", rows: upper },
        { societyKey: "order_of_the_dolphin", queryId: "31043", rows: lower },
      ],
      hierarchy,
      period,
    );
    expect(result).toHaveLength(1);
    expect(result[0].societyKey).toBe("presidents_society");
    expect(result[0].recipientCandidates[0]).toMatchObject({
      email: "",
      emailCandidates: ["a@example.org", "b@example.org"],
    });
    expect(upper[0].recipientCandidates[0].email).toBe("a@example.org");
  });
});
