import { useState } from "react";
import { orderedListColumns } from "@/utils/listQueryConfiguration";
import styles from "./reportConfigurationEditor.module.css";

export default function ListColumnEditor({
  headers = [],
  value = [],
  onChange,
  allowAdd = false,
}) {
  const [header, setHeader] = useState("");
  const columns = orderedListColumns(
    [...new Set([...headers, ...value.map((column) => column.header)])],
    value,
  );
  function change(index, patch) {
    onChange(
      columns.map((column, position) =>
        position === index ? { ...column, ...patch } : column,
      ),
    );
  }
  function move(index, offset) {
    const next = [...columns];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    onChange(next);
  }
  return (
    <details className={styles.card}>
      <summary>Display columns</summary>
      <p className={styles.muted}>
        Show, rename, format, and reorder returned columns. Hiding a column is
        not an access restriction. These changes do not run NXT.
      </p>
      <div className={styles.stack}>
        {columns.map((column, index) => (
          <div className={styles.toolbar} key={column.header}>
            <label className={styles.choice}>
              <input
                type="checkbox"
                checked={column.visible}
                onChange={(event) =>
                  change(index, { visible: event.target.checked })
                }
              />
              {column.header}
            </label>
            <label className={styles.field}>
              Column label
              <input
                maxLength={200}
                aria-label={`Label for ${column.header}`}
                value={column.label}
                onChange={(event) =>
                  change(index, { label: event.target.value })
                }
              />
            </label>
            <label className={styles.field}>
              Format
              <select
                aria-label={`Format for ${column.header}`}
                value={column.format}
                onChange={(event) =>
                  change(index, { format: event.target.value })
                }
              >
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="currency">Currency (USD)</option>
              </select>
            </label>
            <button
              type="button"
              className={styles.button}
              aria-label={`Move ${column.header} up`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            >
              Up
            </button>
            <button
              type="button"
              className={styles.button}
              aria-label={`Move ${column.header} down`}
              disabled={index === columns.length - 1}
              onClick={() => move(index, 1)}
            >
              Down
            </button>
          </div>
        ))}
        {!columns.length && (
          <p>
            Refresh the saved list once, then load its returned columns here. Or
            enter an exact output header below.
          </p>
        )}
        {allowAdd && (
          <div className={styles.toolbar}>
            <label className={styles.field}>
              Exact output header
              <input
                value={header}
                maxLength={200}
                onChange={(event) => setHeader(event.target.value)}
              />
            </label>
            <button
              type="button"
              className={styles.button}
              disabled={
                !header.trim() ||
                columns.length >= 25 ||
                columns.some((column) => column.header === header.trim())
              }
              onClick={() => {
                onChange([
                  ...columns,
                  {
                    header: header.trim(),
                    label: header.trim(),
                    visible: true,
                    format: "text",
                  },
                ]);
                setHeader("");
              }}
            >
              Add column setting
            </button>
          </div>
        )}
      </div>
    </details>
  );
}
