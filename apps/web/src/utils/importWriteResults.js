function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return value;
}

export function importWritePlanKey(writes) {
  return JSON.stringify(stable(writes || []));
}

// Older retries saved only the latest attempt in results. Fold the history
// first so a successful earlier change is never replayed or forgotten.
export function getImportWriteResults(audit) {
  const results = new Map();
  for (const attempt of [...(Array.isArray(audit?.attempts) ? audit.attempts : []), { results: audit?.results }]) {
    for (const result of Array.isArray(attempt?.results) ? attempt.results : []) {
      if (Number.isInteger(result?.writeIndex)) results.set(result.writeIndex, result);
    }
  }
  return [...results.values()].sort((a, b) => a.writeIndex - b.writeIndex);
}

export function hasImportWriteHistory(row) {
  return Boolean(row?.applied_at || row?.appliedAt ||
    ["Applying", "Applied", "Failed"].includes(row?.status) ||
    getImportWriteResults(row?.blackbaud_result || row?.blackbaudResult).length);
}

export function importWriteCanRetry(result) {
  if (result?.status !== "failed" || result.retrySafe === false) return false;
  // Legacy non-idempotent failures need evidence of rejection, not just the
  // absence of a timeout message. Profile/name PATCHes do not create records.
  if (result.retrySafe === undefined && !["constituent_name", "constituent_profile"].includes(result.type)) {
    return /\bBlackbaud (400|401|403|404|409|422|429)\b/i.test(result.message || "");
  }
  return true;
}

export function hasImportRetryHold(audit) {
  return getImportWriteResults(audit).some((result) =>
    ["started", "unconfirmed"].includes(result.status) ||
    (result.status === "failed" && !importWriteCanRetry(result)));
}
