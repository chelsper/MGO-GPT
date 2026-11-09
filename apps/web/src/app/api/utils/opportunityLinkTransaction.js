import sql from "./sql";

// Use a separate statement after the lock so a waiting request gets a fresh
// READ COMMITTED snapshot, including the preceding request's new link.
export default function opportunityLinkTransaction(nxtId, statements) {
  return sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtextextended(${`opportunity-link:${nxtId}`}, 0))`,
    ...statements,
  ], { isolationLevel: "ReadCommitted" });
}
