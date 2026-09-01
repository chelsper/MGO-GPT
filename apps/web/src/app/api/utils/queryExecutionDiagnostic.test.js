import { describe, expect, it } from "vitest";

import {
  reconcileQueryResultCounts,
  summarizeQueryJobResponse,
  summarizeQueryResultFile,
} from "./queryExecutionDiagnostic";

const encode = (value) => new TextEncoder().encode(value);

describe("query execution diagnostics", () => {
  it("reports only safe job metadata and never result URLs", () => {
    const summary = summarizeQueryJobResponse({
      httpStatus: 202,
      payload: {
        id: "job-30976",
        status: "queued",
        sas_uri: "https://secret.example/result?signature=unsafe",
        result_uri: "https://secret.example/result-uri",
      },
    });

    expect(summary).toEqual({
      httpStatus: 202,
      jobId: "job-30976",
      jobStatus: "queued",
      rowCount: null,
      topLevelFieldNames: ["id", "result_uri", "sas_uri", "status"],
      urlFieldPresence: {
        sas_uri: true,
        result_uri: true,
        read_url: false,
        download_url: false,
      },
    });
    expect(JSON.stringify(summary)).not.toContain("secret.example");
  });

  it("parses a CSV response only when the response identifies itself as CSV", () => {
    const summary = summarizeQueryResultFile({
      httpStatus: 200,
      contentType: "text/csv; charset=utf-8",
      contentLength: "32",
      body: encode("Constituent ID,Name\n101,Ada\n102,Bo\n"),
    });

    expect(summary.parser).toBe("csv");
    expect(summary.parsedDataRowCount).toBe(2);
    expect(summary.charset).toBe("utf-8");
    expect(summary.contentBeginsLike).toBe("csv");
    expect(summary.safePreview).not.toContain("Ada");
    expect(summary.safePreview).not.toContain("101");
  });

  it("does not treat JSON as CSV", () => {
    const summary = summarizeQueryResultFile({
      httpStatus: 200,
      contentType: "application/json; charset=utf-8",
      contentLength: "16",
      body: encode('{"value":[101]}'),
    });

    expect(summary.parser).toBe("json_shape_only");
    expect(summary.jsonShape).toBe("object");
    expect(summary.parsedDataRowCount).toBeNull();
  });

  it("compares row counts only when both sources provide a count", () => {
    expect(
      reconcileQueryResultCounts({
        jobRowCount: 133,
        parsedDataRowCount: 133,
      }),
    ).toMatchObject({
      jobRowCount: 133,
      parsedDataRowCount: 133,
      countsAgree: true,
      comparisonAvailable: true,
      parsedCountEndpoint: "sas_uri",
    });

    expect(
      reconcileQueryResultCounts({
        jobRowCount: 133,
        parsedDataRowCount: null,
      }),
    ).toMatchObject({
      countsAgree: null,
      comparisonAvailable: false,
      parsedCountEndpoint: null,
    });
  });
});
