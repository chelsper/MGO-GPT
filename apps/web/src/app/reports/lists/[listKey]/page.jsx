"use client";
import { useState } from "react";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import useConstituentList from "../useConstituentList";
import ListMembershipSearch from "@/components/ListMembershipSearch";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import styles from "@/components/reportConfigurationEditor.module.css";
import ListQueryResults from "@/components/ListQueryResults";
import { isQueryList, LEAD_COLUMN, orderedListColumns } from "@/utils/listQueryConfiguration";
import ListColumnEditor from "@/components/ListColumnEditor";
import { displayCell } from "@/components/QueryResultsTable";

export default function ConstituentListPage({ params }) {
  const { data, error, loading, refreshing, reload, refresh } =
    useConstituentList(params.listKey);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [localColumns, setLocalColumns] = useState(null);
  const report = data?.report;
  const snapshot = data?.snapshot;
  const job = data?.refresh;
  const customHeaders = ["Constituent", "Lookup ID", "Description", ...(snapshot?.leadAsOf ? [LEAD_COLUMN] : []), "Record"];
  const columns = orderedListColumns(customHeaders, localColumns && localColumns.revision === report?.revision ? localColumns.columns : report?.dataConfiguration?.columns || []);
  const displayed = columns.filter((column) => column.visible);
  const filtered = (snapshot?.rows || []).filter((row) =>
    `${row.name} ${row.lookupId} ${row.values.join(" ")}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 25) - 1),
  );
  const busy = refreshing || job?.busy;
  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <SharedReportHeader
          activeReportKey={params.listKey}
          title={report?.title || "Constituent list"}
          description={report?.description}
          backHref="/reports/lists"
          backLabel="Back to Lists"
          action={
            report && (
              <button
                className={styles.button}
                disabled={loading || busy}
                onClick={refresh}
              >
                {busy
                  ? "Refreshing list..."
                  : job && job.status !== "complete"
                    ? "Resume refresh"
                    : "Refresh list"}
              </button>
            )
          }
        />
        {loading && <p role="status">Loading saved list...</p>}
        {error && (
          <div role="alert" className={`${styles.notice} ${styles.error}`}>
            {error}
            <p>
              <button className={styles.button} onClick={reload}>
                Reload status
              </button>
            </p>
          </div>
        )}
        {report && (
          <div className={styles.stack}>
            <section
              className={styles.panel}
              aria-label="List source and refresh status"
            >
              <strong>
                {isQueryList(report.dataConfiguration) ? "NXT query output" : `${report.dataConfiguration.fieldCategory} / ${report.dataConfiguration.fieldDescription || "All descriptions"}`}
              </strong>
              <p className={styles.muted}>
                NXT indexing can lag by about 30 minutes. Opening this
                page never refreshes NXT; use Refresh list when needed.
              </p>
              <p>
                {snapshot
                  ? `Last complete refresh: ${new Date(snapshot.generatedAt).toLocaleString()}`
                  : "No saved list yet. Refresh once and keep this page open until it finishes."}
              </p>
              {snapshot?.leadAsOf && <p className={styles.muted}>Current lead fundraiser assignments checked as of {snapshot.leadAsOf} (Eastern). Not a live lookup.</p>}
              {job && job.status !== "complete" && (
                <div role="status">
                  <strong>
                    {job.stage === "query" ? "Waiting for NXT query output" : job.stage === "fundraisers" ? `${job.checked} of ${job.total} current fundraiser assignments checked` : job.stage === "members"
                      ? `${job.checked} matching custom fields checked`
                      : `${job.checked} of ${job.total} constituent names checked`}
                  </strong>
                  <p>
                    {job.message ||
                      "Refreshing in small batches. Leaving this page pauses after the current batch. Saved results remain available."}
                  </p>
                  {job.retryAt && (
                    <p>
                      Resume after {new Date(job.retryAt).toLocaleTimeString()}.
                    </p>
                  )}
                  <button
                    className={styles.button}
                    disabled={refreshing}
                    onClick={reload}
                  >
                    Reload status
                  </button>
                </div>
              )}
              {job?.status === "paused" && (
                <p>
                  <button
                    className={styles.button}
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "Restart this unfinished refresh? Your last complete saved list will remain available. No constituent records will be changed.",
                        )
                      )
                        refresh(true);
                    }}
                  >
                    Restart unfinished refresh
                  </button>
                </p>
              )}
            </section>
            {report.canManageMembers && (
              <ListMembershipSearch
                key={`${report.key}:${report.revision}`}
                report={report}
              />
            )}
            {snapshot?.tableRows && <ListQueryResults key={`${report.revision}:${snapshot.generatedAt}`} snapshot={snapshot} defaults={report.dataConfiguration.columns || []} title={report.title} />}
            {snapshot && !snapshot.tableRows && (
              <section className={styles.card} aria-label="Saved list members">
                <div className={styles.toolbar}>
                  <h2 className={styles.listTitle}>
                    {snapshot.total} constituents
                  </h2>
                  <label className={`${styles.field} ${styles.search}`}>
                    Search saved list
                    <input
                      type="search"
                      value={search}
                      onChange={(event) => {
                        setSearch(event.target.value);
                        setPage(0);
                      }}
                      placeholder="Name, lookup ID, or description"
                    />
                  </label>
                </div>
                <ListColumnEditor headers={customHeaders} value={columns} onChange={(next) => setLocalColumns({ revision: report.revision, columns: next })} />
                {!displayed.length && <p>No columns selected. Open Display columns to show them again.</p>}
                <div style={{ overflowX: "auto" }}>
                  <table
                    style={{
                      width: "100%",
                      borderCollapse: "collapse",
                      minWidth: 550,
                    }}
                  >
                    <thead>
                      <tr>
                        {displayed.map((column) => (
                          <th
                            key={column.header}
                            scope="col"
                            style={{ textAlign: "left", padding: 12 }}
                          >
                            {column.label || column.header}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered
                        .slice(currentPage * 25, currentPage * 25 + 25)
                        .map((row) => (
                          <tr
                            key={row.constituentId}
                            style={{ borderTop: "1px solid #dbe3ee" }}
                          >
                            {displayed.map((column) => <td key={column.header} style={{ padding: 12 }}>
                              {column.header === "Record" ? <a
                                className={styles.button}
                                href={buildBlackbaudConstituentProfileUrl(
                                  row.constituentId,
                                )}
                                target="_blank"
                                rel="noreferrer"
                              >
                                Open NXT
                              </a> : displayCell(String({ Constituent: row.name, "Lookup ID": row.lookupId, Description: row.values.join(", "), [LEAD_COLUMN]: row.leadFundraiser }[column.header] || ""), column.format)}
                            </td>)}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
                {!filtered.length && (
                  <p>
                    {search
                      ? "No saved members match this search."
                      : "No constituents matched at the last complete refresh."}
                  </p>
                )}
                {filtered.length > 25 && (
                  <nav
                    className={styles.toolbar}
                    aria-label="List pages"
                    style={{ marginTop: 20 }}
                  >
                    <button
                      className={styles.button}
                      disabled={currentPage === 0}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      Previous
                    </button>
                    <span>
                      Page {currentPage + 1} of{" "}
                      {Math.ceil(filtered.length / 25)}
                    </span>
                    <button
                      className={styles.button}
                      disabled={(currentPage + 1) * 25 >= filtered.length}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Next
                    </button>
                  </nav>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
