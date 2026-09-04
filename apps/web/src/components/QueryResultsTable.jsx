"use client";

import { useId, useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import { isValidDashboardTableData } from "@/app/api/utils/dashboardConfiguration";
import styles from "./reportDashboard.module.css";

const PAGE_SIZE = 25;

// Parse only explicit decimal amounts. Never evaluate CSV formulas or coerce blanks to zero.
function numericAmount(value) {
  const text = value.trim();
  const match = /^(\()?([-+])?\$?((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(\))?$/.exec(text);
  if (!match || Boolean(match[1]) !== Boolean(match[4]) || (match[1] && match[2])) return null;
  const amount = Number(`${match[1] ? "-" : match[2] || ""}${match[3].replaceAll(",", "")}`);
  return Number.isFinite(amount) && Math.abs(amount) <= Number.MAX_SAFE_INTEGER ? amount : null;
}

function displayCell(value, format) {
  if (format !== "number" && format !== "currency") return value;
  const amount = numericAmount(value);
  if (amount === null) return value;
  return amount.toLocaleString("en-US", format === "currency"
    ? { style: "currency", currency: "USD" }
    : { maximumFractionDigits: 20 });
}

export default function QueryResultsTable({ headers, rows, columnSettings = [], title = "Query results", disabled = false }) {
  const hintId = useId();
  const [sort, setSort] = useState(null);
  const [page, setPage] = useState(0);
  if (!isValidDashboardTableData({ headers, rows })) return <p className={styles.unknown}>Not refreshed</p>;

  const settings = new Map(columnSettings.map((column) => [column.header, column]));
  const columns = headers.map((header) => ({ header, ...settings.get(header) }));
  const ordered = rows.map((row, index) => ({ row, index }));
  // Index is a tie-breaker so equivalent values retain their original CSV order.
  if (sort && columns[sort.column]?.header === sort.header) {
    const format = columns[sort.column].format || "text";
    ordered.sort((a, b) => {
      const left = a.row[sort.column];
      const right = b.row[sort.column];
      const leftNumber = format === "text" ? null : numericAmount(left);
      const rightNumber = format === "text" ? null : numericAmount(right);
      const comparison = leftNumber !== null && rightNumber !== null
        ? leftNumber - rightNumber
        : leftNumber !== null ? -1 : rightNumber !== null ? 1 : left.localeCompare(right, "en-US");
      return comparison * (sort.direction === "ascending" ? 1 : -1) || a.index - b.index;
    });
  }
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = ordered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  function sortBy(column) {
    setSort({ column, header: headers[column], direction: sort?.column === column && sort.direction === "ascending" ? "descending" : "ascending" });
    setPage(0);
  }

  return (
    <div className={styles.queryResults}>
      <p id={hintId} className={styles.help}>Scroll across to see all columns. Select a column heading to sort.</p>
      <div className={styles.tableScroll} role="region" aria-label={`${title} table scroll area`} aria-describedby={hintId} tabIndex={0}>
        <table className={`${styles.table} ${styles.queryTable}`} aria-label={title}>
          <thead>
            <tr>{columns.map((column, index) => (
              <th key={column.header} scope="col" aria-sort={sort?.header === column.header ? sort.direction : "none"}>
                <button type="button" className={styles.sortButton} disabled={disabled} onClick={() => sortBy(index)}>
                  {column.label || column.header}
                  {sort?.header === column.header ? sort.direction === "ascending" ? <ArrowUp aria-hidden="true" size={14} /> : <ArrowDown aria-hidden="true" size={14} /> : null}
                </button>
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {visible.map(({ row, index }) => (
              <tr key={index}>{row.map((cell, column) => <td key={headers[column]}>{displayCell(cell, columns[column].format)}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length ? <p className={styles.help} role="status">No rows returned. This query completed successfully.</p> : (
        <div className={styles.pagination}>
          <p role="status">Rows {currentPage * PAGE_SIZE + 1}-{Math.min((currentPage + 1) * PAGE_SIZE, rows.length)} of {rows.length}; page {currentPage + 1} of {pageCount}</p>
          <div className={styles.tableActions}>
            <button type="button" className={styles.button} disabled={disabled || currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous page</button>
            <button type="button" className={styles.button} disabled={disabled || currentPage === pageCount - 1} onClick={() => setPage(currentPage + 1)}>Next page</button>
          </div>
        </div>
      )}
    </div>
  );
}
