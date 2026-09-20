import { createHash, randomUUID } from "node:crypto";
import { readListIdentity, readListPage } from "./constituentListProvider";
import { isQueryList } from "@/utils/listQueryConfiguration";
import { advanceQueryList, enrichListLeads } from "./constituentQueryList";
import { isValidDashboardTableData } from "./dashboardConfiguration";

export function listSnapshotKeys(report, origin) {
  const { columns, ...dataSource } = report.dataConfiguration;
  const hash = createHash("sha256")
    .update(JSON.stringify([origin, dataSource]))
    .digest("hex");
  const snapshot = `constituent-list-v1:${report.key}:${hash}`;
  return { snapshot, job: `${snapshot}:refresh` };
}

export function newListRefresh() {
  return {
    id: randomUUID(),
    status: "running",
    stage: "members",
    offset: 0,
    fields: [],
    rows: [],
    profileOffset: 0,
    retryAt: null,
  };
}

export async function advanceListRefresh({ job, user, origin, source }) {
  job.status = "running";
  job.message = "";
  job.retryAt = null;
  if (isQueryList(source))
    return advanceQueryList({ job, user, origin, source });
  if (job.stage === "members") {
    const page = await readListPage({
      user,
      origin,
      source,
      offset: job.offset,
    });
    if (
      job.expectedCount !== undefined &&
      page.count !== undefined &&
      job.expectedCount !== page.count
    )
      throw new Error(
        "List membership changed during pagination. The previous snapshot is retained.",
      );
    const ids = new Set(job.fields.map((field) => field.id));
    for (const field of page.fields) {
      if (ids.has(String(field.id)))
        throw new Error("Repeated custom field during pagination.");
      ids.add(String(field.id));
    }
    for (const field of page.fields) {
      job.fields.push({
        id: String(field.id),
        constituentId: String(field.parent_id),
        date: field.date || null,
        value:
          typeof field.value === "object"
            ? ""
            : String(field.value ?? field.description ?? ""),
      });
    }
    if (page.count !== undefined) job.expectedCount = page.count;
    job.offset = page.nextOffset;
    if (page.nextOffset === null) {
      job.stage = "names";
      job.people = [...new Set(job.fields.map((field) => field.constituentId))];
    }
  } else if (job.stage === "names") {
    for (const constituentId of job.people.slice(
      job.profileOffset,
      job.profileOffset + 5,
    )) {
      const person = await readListIdentity({ user, origin, constituentId });
      const fields = job.fields.filter(
        (field) => field.constituentId === constituentId,
      );
      job.rows.push({
        ...person,
        values: [
          ...new Set(fields.map((field) => field.value).filter(Boolean)),
        ],
        date:
          fields
            .map((field) => field.date)
            .filter(Boolean)
            .sort()[0] || null,
      });
      job.profileOffset += 1;
    }
  }
  if (
    job.stage === "names" &&
    job.profileOffset === job.people.length &&
    source.leadFundraiser?.enabled
  ) {
    job.stage = "fundraisers";
    job.profileOffset = 0;
  }
  if (job.stage === "fundraisers")
    await enrichListLeads({ job, user, origin, source });
  if (
    job.stage === "complete" ||
    (job.stage === "names" && job.profileOffset === job.people.length)
  ) {
    job.status = "complete";
    return {
      job,
      snapshot: {
        generatedAt: new Date().toISOString(),
        rows: job.rows
          .map((row) => ({
            ...row,
            ...(source.leadFundraiser?.enabled
              ? { leadFundraiser: job.leads[row.constituentId] }
              : {}),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        total: job.rows.length,
        leadAsOf: job.leadAsOf || null,
      },
    };
  }
  return { job, snapshot: null };
}

export function listRefreshStatus(saved) {
  const table = saved.job?.table;
  return {
    snapshot: saved.snapshot,
    queryOutput:
      saved.job?.status !== "complete" && isValidDashboardTableData(table)
        ? {
            headers: table.headers,
            tableRows: table.rows,
            total: table.rows.length,
            generatedAt: saved.job.queryOutputAt || null,
          }
        : null,
    refresh: saved.job
      ? {
          id: saved.job.id,
          status: saved.job.status,
          stage: saved.job.stage,
          checked:
            saved.job.stage === "members"
              ? saved.job.fields?.length || 0
              : saved.job.profileOffset || 0,
          total: saved.job.people?.length ?? null,
          busy: saved.job.leaseUntil > Date.now(),
          message: saved.job.message || "",
          retryAt: saved.job.retryAt || null,
        }
      : null,
  };
}
