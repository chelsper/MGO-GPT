import { beforeEach, expect, it, vi } from "vitest";
vi.mock("./blackbaud", () => ({
  createBlackbaudAdHocQueryJob: vi.fn(),
  createBlackbaudQueryJob: vi.fn(),
  getBlackbaudQueryJob: vi.fn(),
  downloadBlackbaudQueryResultWithMetadata: vi.fn(),
  BlackbaudQueryResultTooLargeError: class extends Error {},
  getBlackbaudConfigIssues: vi.fn(),
}));
vi.mock("./listCurrentFundraiser", () => ({ readCurrentLead: vi.fn() }));
import {
  createBlackbaudAdHocQueryJob,
  createBlackbaudQueryJob,
  getBlackbaudQueryJob,
  downloadBlackbaudQueryResultWithMetadata,
  BlackbaudQueryResultTooLargeError,
} from "./blackbaud";
import { readCurrentLead } from "./listCurrentFundraiser";
import { advanceQueryList } from "./constituentQueryList";
import { listSnapshotKeys, newListRefresh, listRefreshStatus } from "./constituentListRefresh";
import { LIST_QUERY_LIMITS } from "@/utils/listQueryConfiguration";
import query from "@/utils/futureMadeQueryTemplate.json";
const source = {
  version: 1,
  source: "query_json",
  fieldCategory: "",
  fieldDescription: "",
  queryJson: JSON.stringify(query),
};
const args = () => ({
  user: { id: 1 },
  origin: "https://example.test",
  source: structuredClone(source),
  job: newListRefresh(),
});
const csv = (text) => ({
  body: Uint8Array.from(new TextEncoder().encode(text)),
  contentType: "text/csv",
});
beforeEach(() => {
  vi.clearAllMocks();
  createBlackbaudAdHocQueryJob.mockResolvedValue({ id: "job-1" });
  createBlackbaudQueryJob.mockResolvedValue({ id: "saved-job" });
  getBlackbaudQueryJob.mockResolvedValue({
    status: "Completed",
    read_url: "https://example.test/result.csv",
  });
  downloadBlackbaudQueryResultWithMetadata.mockResolvedValue(
    csv(
      "Constituent system record ID,Name,Amount\n100,Example,250\n100,Example,500\n101,Other,0\n",
    ),
  );
  readCurrentLead.mockResolvedValue("Current Fundraiser");
});
it("executes the definition once, preserves all output and rows, and makes no per-person calls when enrichment is off", async () => {
  const ctx = args();
  expect((await advanceQueryList(ctx)).snapshot).toBeNull();
  getBlackbaudQueryJob.mockResolvedValueOnce({ status: "Running" });
  expect((await advanceQueryList(ctx)).snapshot).toBeNull();
  const { snapshot } = await advanceQueryList(ctx);
  expect(snapshot.total).toBe(3);
  expect(snapshot.headers).toEqual([
    "Constituent system record ID",
    "Name",
    "Amount",
  ]);
  expect(snapshot.tableRows[0]).toEqual(["100", "Example", "250"]);
  expect(createBlackbaudAdHocQueryJob).toHaveBeenCalledTimes(1);
  expect(
    createBlackbaudAdHocQueryJob.mock.calls[0][0].query,
  ).not.toHaveProperty("others_can_modify");
  expect(readCurrentLead).not.toHaveBeenCalled();
});
it("publishes a larger constituent query without truncation or per-person calls", async () => {
  const ctx = args();
  const rows = Array.from({ length: 1810 }, (_, i) => `${i + 1},Fictional ${i},${"x".repeat(350)}`);
  const output = csv(`System Record ID,Name,Details\n${rows.join("\n")}`);
  expect(output.body.byteLength).toBeGreaterThan(524288);
  downloadBlackbaudQueryResultWithMetadata.mockResolvedValue(output);
  await advanceQueryList(ctx);
  const { snapshot } = await advanceQueryList(ctx);
  expect(snapshot.total).toBe(1810);
  expect(snapshot.tableRows.at(-1)[0]).toBe("1810");
  expect(downloadBlackbaudQueryResultWithMetadata).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ maxBytes: LIST_QUERY_LIMITS.bytes, redirect: "error" }));
  expect(readCurrentLead).not.toHaveBeenCalled();
  const pending = listRefreshStatus({ snapshot: null, job: { ...ctx.job, status: "needs_configuration" } });
  expect(pending.queryOutput.tableRows).toHaveLength(1810);
});
it.each(["download", "decode", "rows"])("identifies %s size limits without truncation or fake connection errors", async (kind) => {
  const ctx = args();
  if (kind === "download") downloadBlackbaudQueryResultWithMetadata.mockRejectedValue(new BlackbaudQueryResultTooLargeError());
  if (kind === "decode") downloadBlackbaudQueryResultWithMetadata.mockResolvedValue({ body: new Uint8Array(LIST_QUERY_LIMITS.bytes + 1), contentType: "text/csv" });
  if (kind === "rows") downloadBlackbaudQueryResultWithMetadata.mockResolvedValue(csv(`Name\n${Array(5001).fill("Fictional").join("\n")}`));
  await advanceQueryList(ctx);
  await expect(advanceQueryList(ctx)).rejects.toMatchObject({ status: 413, code: "LIST_QUERY_TOO_LARGE", restartRequired: true, message: expect.stringContaining("previous list is unchanged") });
  expect(ctx.job.table).toBeUndefined();
});
it("supports saved IDs and separately verifies current leads by explicit system ID, deduplicating repeated query rows", async () => {
  const ctx = args();
  ctx.source = {
    ...source,
    source: "saved_query",
    queryId: "123",
    leadFundraiser: {
      enabled: true,
      systemIdColumn: "Constituent system record ID",
      assignmentTypes: ["Lead Solicitor"],
    },
  };
  await advanceQueryList(ctx);
  const { snapshot } = await advanceQueryList(ctx);
  expect(createBlackbaudQueryJob).toHaveBeenCalledWith(
    expect.objectContaining({ queryId: "123" }),
  );
  expect(readCurrentLead).toHaveBeenCalledTimes(2);
  expect(snapshot.tableRows[0].at(-1)).toBe("Current Fundraiser");
  expect(snapshot.tableRows[1].at(-1)).toBe("Current Fundraiser");
});
it("passes a negative NXT query ID unchanged without changing constituent identity rules", async () => {
  const ctx=args();
  ctx.source={version:1,source:"saved_query",queryId:"-672096",fieldCategory:"",fieldDescription:""};
  await advanceQueryList(ctx);
  const {snapshot}=await advanceQueryList(ctx);
  expect(createBlackbaudQueryJob).toHaveBeenCalledOnce();
  expect(createBlackbaudQueryJob).toHaveBeenCalledWith(expect.objectContaining({queryId:"-672096"}));
  expect(snapshot.tableRows[0][0]).toBe("100");
  expect(readCurrentLead).not.toHaveBeenCalled();
});
it("retains all 48 columns of a wide saved query, including its technical identity, without per-person reads", async () => {
  const ctx=args();
  ctx.source={version:1,source:"saved_query",queryId:"-672096",fieldCategory:"",fieldDescription:""};
  const headers=["System Record ID",...Array.from({length:46},(_,i)=>`Field ${i}`),"QRECID"];
  const values=["101",...Array(46).fill("Fictional"),"999"];
  downloadBlackbaudQueryResultWithMetadata.mockResolvedValue(csv(`${headers.join(",")}\n${values.join(",")}`));
  await advanceQueryList(ctx);
  const {snapshot}=await advanceQueryList(ctx);
  expect(snapshot.headers).toEqual(headers);
  expect(snapshot.tableRows).toEqual([values]);
  expect(snapshot.total).toBe(1);
  expect(readCurrentLead).not.toHaveBeenCalled();
});
it("rejects output wider than 100 columns rather than publishing a truncated list", async () => {
  const ctx=args();
  downloadBlackbaudQueryResultWithMetadata.mockResolvedValue(csv(`${Array.from({length:101},(_,i)=>`Field ${i}`).join(",")}\n${Array(101).fill("Fictional").join(",")}`));
  await advanceQueryList(ctx);
  await expect(advanceQueryList(ctx)).rejects.toMatchObject({status:413});
  expect(ctx.job.table).toBeUndefined();
});
it.each([
  "Lookup ID,QRECID,Name\n100,101,Example",
  "Constituent system record ID,Name\n,Example",
  "Constituent system record ID,Name\nExample,Example",
  "Constituent system record ID,Current lead fundraiser\n100,Another",
])(
  "retains valid output for mapping review without inferring IDs or publishing a complete snapshot: %s",
  async (content) => {
    const ctx = args();
    ctx.source.leadFundraiser = {
      enabled: true,
      systemIdColumn: "Constituent system record ID",
      assignmentTypes: ["Lead Solicitor"],
    };
    await advanceQueryList(ctx);
    downloadBlackbaudQueryResultWithMetadata.mockResolvedValueOnce(
      csv(content),
    );
    const result = await advanceQueryList(ctx);
    expect(result.snapshot).toBeNull();
    expect(result.job).toMatchObject({
      status: "needs_configuration",
      stage: "mapping",
      retryAt: null,
    });
    expect(result.job.table.rows).toHaveLength(1);
    expect(result.job.queryOutputAt).toBeTruthy();
    expect(result.job.people).toBeUndefined();
    expect(readCurrentLead).not.toHaveBeenCalled();
  },
);
it("allows first output discovery without mapping and can use the retained table after a correction", async () => {
  const ctx = args();
  ctx.source.leadFundraiser = {
    enabled: true,
    systemIdColumn: "",
    assignmentTypes: ["Lead Solicitor"],
  };
  await advanceQueryList(ctx);
  expect((await advanceQueryList(ctx)).job.status).toBe("needs_configuration");
  expect(readCurrentLead).not.toHaveBeenCalled();
  ctx.source.leadFundraiser.systemIdColumn = "Constituent system record ID";
  const result = await advanceQueryList(ctx);
  expect(result.job.status).toBe("complete");
  expect(result.snapshot.total).toBe(3);
  expect(downloadBlackbaudQueryResultWithMetadata).toHaveBeenCalledTimes(1);
  expect(getBlackbaudQueryJob).toHaveBeenCalledTimes(1);
  expect(readCurrentLead).toHaveBeenCalledTimes(2);
});
it("does not expose malformed output as a preview or publish it", async () => {
  for (const content of [
    "Name,Name\nExample,Another",
    "Name,Amount\nExample",
    "<html>Error</html>",
  ]) {
    const ctx = args();
    ctx.source.leadFundraiser = {
      enabled: true,
      systemIdColumn: "Constituent system record ID",
      assignmentTypes: ["Lead Solicitor"],
    };
    await advanceQueryList(ctx);
    downloadBlackbaudQueryResultWithMetadata.mockResolvedValueOnce(
      csv(content),
    );
    await expect(advanceQueryList(ctx)).rejects.toThrow();
    expect(ctx.job.table).toBeUndefined();
  }
  expect(readCurrentLead).not.toHaveBeenCalled();
});
it("checkpoints successful lead reads and resumes without re-executing the query", async () => {
  const ctx = args();
  ctx.source.leadFundraiser = {
    enabled: true,
    systemIdColumn: "Constituent system record ID",
    assignmentTypes: ["Lead Solicitor"],
  };
  await advanceQueryList(ctx);
  readCurrentLead
    .mockResolvedValueOnce("First")
    .mockRejectedValueOnce(new Error("429"));
  await expect(advanceQueryList(ctx)).rejects.toThrow("429");
  expect(ctx.job.profileOffset).toBe(1);
  expect(ctx.job.stage).toBe("fundraisers");
  const { snapshot } = await advanceQueryList(ctx);
  expect(snapshot.tableRows[0].at(-1)).toBe("First");
  expect(downloadBlackbaudQueryResultWithMetadata).toHaveBeenCalledTimes(1);
  expect(createBlackbaudAdHocQueryJob).toHaveBeenCalledTimes(1);
});
it("keeps display-only edits on the same saved snapshot but isolates changed query definitions and enrichment", () => {
  const report = { key: "list-demo", dataConfiguration: source };
  const key = listSnapshotKeys(report, "origin");
  expect(
    listSnapshotKeys(
      {
        ...report,
        dataConfiguration: {
          ...source,
          columns: [{ header: "Name", visible: false }],
        },
      },
      "origin",
    ),
  ).toEqual(key);
  expect(
    listSnapshotKeys(
      { ...report, dataConfiguration: { ...source, queryJson: "different" } },
      "origin",
    ),
  ).not.toEqual(key);
});
it("publishes a verified zero-row output, fails expired or failed jobs without restarting them", async () => {
  const ctx = args();
  await advanceQueryList(ctx);
  downloadBlackbaudQueryResultWithMetadata.mockResolvedValueOnce(
    csv("Name,Amount\n"),
  );
  expect((await advanceQueryList(ctx)).snapshot.total).toBe(0);
  const failed = args();
  await advanceQueryList(failed);
  getBlackbaudQueryJob.mockResolvedValueOnce({ status: "Failed" });
  await expect(advanceQueryList(failed)).rejects.toMatchObject({
    code: "LIST_QUERY_FAILED",
    restartRequired: true,
  });
  failed.job.queryStartedAt = "2000-01-01";
  const callsBeforeExpiryCheck = getBlackbaudQueryJob.mock.calls.length;
  await expect(advanceQueryList(failed)).rejects.toMatchObject({
    code: "LIST_QUERY_EXPIRED",
    restartRequired: true,
  });
  expect(getBlackbaudQueryJob).toHaveBeenCalledTimes(callsBeforeExpiryCheck);
});
