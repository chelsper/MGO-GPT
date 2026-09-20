import { useState } from "react";
import { Search } from "lucide-react";
import QueryResultsTable from "./QueryResultsTable";
import ListColumnEditor from "./ListColumnEditor";
import { orderedListColumns } from "@/utils/listQueryConfiguration";
import styles from "./listReport.module.css";

export default function ListQueryResults({
  snapshot,
  defaults = [],
  title,
  preview = false,
}) {
  const [settings, setSettings] = useState(defaults);
  const [search, setSearch] = useState("");
  const columns = orderedListColumns(snapshot.headers, settings);
  const indexes = columns.map((column) =>
    snapshot.headers.indexOf(column.header),
  );
  const rows = snapshot.tableRows
    .filter((row) =>
      row.some((cell) =>
        cell.toLowerCase().includes(search.trim().toLowerCase()),
      ),
    )
    .map((row) => indexes.map((index) => row[index]));
  return (
    <section
      className={styles.results}
      aria-label={preview ? "Query output preview" : "Saved query output"}
    >
      <div className={styles.resultsHeader}>
        <div>
          <h2>{snapshot.total} results</h2>
          <p>
            {search.trim() ? (
              `${rows.length} matching your search`
            ) : (
              <>
                <span className={styles.desktopHint}>
                  Select a column heading to sort
                </span>
                <span className={styles.mobileHint}>
                  Swipe the table to see all columns
                </span>
              </>
            )}
          </p>
        </div>
        <div className={styles.tools}>
          <label className={styles.search}>
            <span className={styles.srOnly}>
              {preview ? "Search query preview" : "Search saved output"}
            </span>
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              placeholder="Search this list"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <ListColumnEditor
            headers={snapshot.headers}
            value={settings}
            onChange={setSettings}
            compact
          />
        </div>
      </div>
      <div className={styles.tableBody}>
        <QueryResultsTable
          headers={columns.map((column) => column.header)}
          rows={rows}
          columnSettings={columns}
          title={title}
          compact
        />
      </div>
    </section>
  );
}
