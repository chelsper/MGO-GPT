import { useState } from "react";
import QueryResultsTable from "./QueryResultsTable";
import ListColumnEditor from "./ListColumnEditor";
import { orderedListColumns } from "@/utils/listQueryConfiguration";
import styles from "./reportConfigurationEditor.module.css";

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
      className={styles.stack}
      aria-label={preview ? "Query output preview" : "Saved query output"}
    >
      {preview && (
        <p className={styles.notice}>
          Query output preview. Current lead fundraiser lookup is not complete.
          These are the returned query values, not a complete refreshed list.
          Any last complete saved list remains unchanged.
        </p>
      )}
      <div className={styles.toolbar}>
        <h2>{snapshot.total} query rows</h2>
        <label className={styles.field}>
          {preview ? "Search query preview" : "Search saved output"}
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
      </div>
      <ListColumnEditor
        headers={snapshot.headers}
        value={settings}
        onChange={setSettings}
      />
      <p className={styles.muted}>
        Column changes here apply to this visit. Set shared defaults in Report
        Access &amp; Configurations.
        {!preview &&
          snapshot.leadAsOf &&
          " A blank current-lead cell means no matching current lead assignment was found at refresh."}
      </p>
      <QueryResultsTable
        headers={columns.map((column) => column.header)}
        rows={rows}
        columnSettings={columns}
        title={title}
      />
    </section>
  );
}
