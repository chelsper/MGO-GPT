"use client";
import { useState } from "react";
import SharedReportHeader from "@/app/reports/SharedReportHeader";
import useConstituentList from "../useConstituentList";
import ListMembershipSearch from "@/components/ListMembershipSearch";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import styles from "@/components/reportConfigurationEditor.module.css";
import ListQueryResults from "@/components/ListQueryResults";
import ListRefreshStatus, {
  ListRefreshDetails,
} from "@/components/ListRefreshStatus";
import listStyles from "@/components/listReport.module.css";
import {
  LEAD_COLUMN,
  orderedListColumns,
} from "@/utils/listQueryConfiguration";
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
  const needsConfiguration = job?.status === "needs_configuration";
  const needsRestart = job?.status === "needs_restart";
  const queryOutput = data?.queryOutput;
  const preview = queryOutput && (
    <ListQueryResults
      key={`${report?.revision}:${queryOutput.generatedAt}`}
      snapshot={queryOutput}
      defaults={report?.dataConfiguration?.columns || []}
      title={`${report?.title || "List"}: query output preview`}
      preview
    />
  );
  const customHeaders = [
    "Constituent",
    "Lookup ID",
    "Description",
    ...(snapshot?.leadAsOf ? [LEAD_COLUMN] : []),
    "Record",
  ];
  const columns = orderedListColumns(
    customHeaders,
    localColumns && localColumns.revision === report?.revision
      ? localColumns.columns
      : report?.dataConfiguration?.columns || [],
  );
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
  function restartRefresh() {
    if (
      window.confirm(
        "Start a new read-only query refresh? Your last complete saved list will remain available. No constituent records will be changed.",
      )
    )
      refresh(true);
  }
  return (
    <main className={`${styles.page} ${listStyles.page}`}>
      <div className={styles.container}>
        <SharedReportHeader
          activeReportKey={params.listKey}
          title={report?.title || "Constituent list"}
          description={report?.description}
          backHref="/reports/lists"
          backLabel="Back to Lists"
          action={
            report &&
            (needsConfiguration ? (
              report.canConfigure && (
                <a className={styles.button} href="/report-configurations">
                  List settings
                </a>
              )
            ) : (
              <button
                className={styles.button}
                disabled={loading || busy}
                onClick={needsRestart ? restartRefresh : refresh}
              >
                {needsRestart
                  ? "Restart refresh"
                  : busy
                    ? "Refreshing list..."
                    : job && job.status !== "complete"
                      ? "Resume refresh"
                      : "Refresh list"}
              </button>
            ))
          }
        />
        {loading && <p role="status">Loading saved list...</p>}
        {error && !report && (
          <div role="alert" className={`${styles.notice} ${styles.error}`}>
            This list could not be loaded. Try again or contact your
            administrator if it remains unavailable.
            <p>
              <button className={styles.button} onClick={reload}>
                Reload status
              </button>
            </p>
          </div>
        )}
        {report && (
          <div className={styles.stack}>
            <ListRefreshStatus
              snapshot={snapshot}
              queryOutput={queryOutput}
              job={job}
              refreshing={refreshing}
              error={error}
            />
            {!snapshot && !queryOutput && (
              <section className={listStyles.empty}>
                <h2>{busy ? "Preparing your list" : "No saved list yet"}</h2>
                <p>
                  {busy
                    ? "Your results will appear here when ready."
                    : needsConfiguration
                      ? "An administrator needs to finish setting up this list."
                      : "Use the refresh button above to retrieve the latest results."}
                </p>
              </section>
            )}
            {!snapshot && preview}
            {snapshot?.tableRows && (
              <ListQueryResults
                key={`${report.revision}:${snapshot.generatedAt}`}
                snapshot={snapshot}
                defaults={report.dataConfiguration.columns || []}
                title={report.title}
              />
            )}
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
                <ListColumnEditor
                  headers={customHeaders}
                  value={columns}
                  onChange={(next) =>
                    setLocalColumns({
                      revision: report.revision,
                      columns: next,
                    })
                  }
                />
                {!displayed.length && (
                  <p>
                    No columns selected. Open Display columns to show them
                    again.
                  </p>
                )}
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
                            {displayed.map((column) => (
                              <td key={column.header} style={{ padding: 12 }}>
                                {column.header === "Record" ? (
                                  <a
                                    className={styles.button}
                                    href={buildBlackbaudConstituentProfileUrl(
                                      row.constituentId,
                                    )}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    Open NXT
                                  </a>
                                ) : (
                                  displayCell(
                                    String(
                                      {
                                        Constituent: row.name,
                                        "Lookup ID": row.lookupId,
                                        Description: row.values.join(", "),
                                        [LEAD_COLUMN]: row.leadFundraiser,
                                      }[column.header] || "",
                                    ),
                                    column.format,
                                  )
                                )}
                              </td>
                            ))}
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
            {report.canManageMembers && (
              <ListMembershipSearch
                key={`${report.key}:${report.revision}`}
                report={report}
                compact
              />
            )}
            <ListRefreshDetails
              report={report}
              snapshot={snapshot}
              queryOutput={queryOutput}
              job={job}
              busy={busy}
              refreshing={refreshing}
              error={error}
              reload={reload}
              refresh={refresh}
            >
              {snapshot && preview && (
                <details className={styles.panel}>
                  <summary>View newer query output preview</summary>
                  {preview}
                </details>
              )}
            </ListRefreshDetails>
          </div>
        )}
      </div>
    </main>
  );
}
