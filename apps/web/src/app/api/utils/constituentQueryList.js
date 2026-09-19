import {
  createBlackbaudAdHocQueryJob,
  createBlackbaudQueryJob,
  getBlackbaudQueryJob,
  downloadBlackbaudQueryResultWithMetadata,
} from "./blackbaud";
import {
  getQueryJobId,
  getQueryJobStatus,
  getQueryResultUrl,
} from "./savedQueryExecution";
import { decodeResult, parseResultCsv } from "./dashboardQueryResults";
import {
  QUERY_RESULTS_LIMITS,
  isValidDashboardTableData,
} from "./dashboardConfiguration";
import { LEAD_COLUMN, parseListQuery } from "@/utils/listQueryConfiguration";
import { readCurrentLead } from "./listCurrentFundraiser";

export async function advanceQueryList({ job, user, origin, source }) {
  if (job.stage === "members") {
    const created =
      source.source === "query_json"
        ? await createBlackbaudAdHocQueryJob({
            userId: user.id,
            authUserId: user.id,
            origin,
            query: parseListQuery(source.queryJson),
          })
        : await createBlackbaudQueryJob({
            userId: user.id,
            authUserId: user.id,
            origin,
            queryId: source.queryId,
          });
    const id = getQueryJobId(created);
    if (!id) throw new Error("NXT did not return a query job ID.");
    job.queryJobId = id;
    job.stage = "query";
    job.queryStartedAt = new Date().toISOString();
    return { job, snapshot: null };
  }
  if (job.stage === "query") {
    if (Date.now() - Date.parse(job.queryStartedAt) > 30 * 60 * 1000)
      throw Object.assign(
        new Error(
          "The query job expired. Restart this refresh; your previous results are retained.",
        ),
        { status: 422 },
      );
    const result = await getBlackbaudQueryJob({
      userId: user.id,
      authUserId: user.id,
      origin,
      jobId: job.queryJobId,
    });
    const status = getQueryJobStatus(result);
    if (/(?:fail|cancel|error|declin)/i.test(status))
      throw Object.assign(
        new Error(
          "NXT could not execute this query. Check its definition and restart the refresh.",
        ),
        { status: 422 },
      );
    const url = getQueryResultUrl(result);
    if (!url || !/^(?:completed|complete|succeeded|success)$/i.test(status)) {
      job.message = "NXT is preparing the query output.";
      return { job, snapshot: null };
    }
    const file = await downloadBlackbaudQueryResultWithMetadata(url, {
      userId: user.id,
      authUserId: user.id,
      origin,
      maxBytes: QUERY_RESULTS_LIMITS.bytes,
      redirect: "error",
    });
    const table = parseResultCsv(decodeResult(file), {
      preserveTechnical: true,
    });
    if (source.leadFundraiser?.enabled && table.headers.includes(LEAD_COLUMN))
      throw Object.assign(
        new Error(
          `Rename the query's ${LEAD_COLUMN} output column to avoid a duplicate header.`,
        ),
        { status: 422 },
      );
    if (source.leadFundraiser?.enabled) {
      const index = table.headers.indexOf(source.leadFundraiser.systemIdColumn);
      if (index < 0 || table.rows.some((row) => !/^[1-9]\d*$/.test(row[index])))
        throw Object.assign(
          new Error(
            "The configured constituent system ID column is missing or contains invalid values. Check the query output mapping; no IDs were inferred.",
          ),
          { status: 422 },
        );
      job.people = [...new Set(table.rows.map((row) => row[index]))];
      job.identityIndex = index;
    }
    job.table = table;
    job.stage = source.leadFundraiser?.enabled ? "fundraisers" : "complete";
  }
  if (job.stage === "fundraisers")
    await enrichListLeads({ job, user, origin, source });
  if (job.stage !== "complete") return { job, snapshot: null };
  job.status = "complete";
  const table = job.table;
  const snapshot = {
    generatedAt: new Date().toISOString(),
    total: table.rows.length,
    headers: [
      ...table.headers,
      ...(source.leadFundraiser?.enabled ? [LEAD_COLUMN] : []),
    ],
    tableRows: table.rows.map((row) => [
      ...row,
      ...(source.leadFundraiser?.enabled
        ? [job.leads[row[job.identityIndex]]]
        : []),
    ]),
    leadAsOf: job.leadAsOf || null,
  };
  const displayedIndexes = snapshot.headers.flatMap((header, index) =>
    header.toLowerCase() === "qrecid" ? [] : [index],
  );
  if (
    !isValidDashboardTableData({
      headers: displayedIndexes.map((index) => snapshot.headers[index]),
      rows: snapshot.tableRows.map((row) =>
        displayedIndexes.map((index) => row[index]),
      ),
    })
  )
    throw Object.assign(
      new Error(
        "The enriched query output exceeds table limits. Reduce its selected fields or rows.",
      ),
      { status: 413 },
    );
  return { job, snapshot };
}

export async function enrichListLeads({ job, user, origin, source }) {
  job.leads ||= {};
  job.fundraiserNames ||= {};
  job.leadAsOf ||= new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
  }).format(new Date());
  const deadline = Date.now() + 15000;
  for (const constituentId of job.people.slice(
    job.profileOffset,
    job.profileOffset + 5,
  )) {
    if (Date.now() > deadline) break;
    const name = await readCurrentLead({
      user,
      origin,
      constituentId,
      types: source.leadFundraiser.assignmentTypes,
      asOf: job.leadAsOf,
      names: job.fundraiserNames,
    });
    job.leads[constituentId] = name;
    job.profileOffset += 1;
  }
  if (job.profileOffset === job.people.length) job.stage = "complete";
}
