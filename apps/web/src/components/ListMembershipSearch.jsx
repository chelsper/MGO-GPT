import { useEffect, useRef, useState } from "react";
import { buildBlackbaudConstituentProfileUrl } from "@/utils/blackbaudLinks";
import styles from "./reportConfigurationEditor.module.css";

export default function ListMembershipSearch({ report }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [error, setError] = useState("");
  const [searched, setSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [states, setStates] = useState({});
  const [value, setValue] = useState("");
  const searchController = useRef(null);
  const writes = useRef(new Set());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      searchController.current?.abort();
    };
  }, []);
  async function search(event) {
    event.preventDefault();
    if (query.trim().length < 2) return;
    searchController.current?.abort();
    const current = new AbortController();
    searchController.current = current;
    setSearching(true);
    setError("");
    setResults([]);
    setSearched(false);
    try {
      const response = await fetch(
        `/api/blackbaud/constituents/search?q=${encodeURIComponent(query.trim())}`,
        { signal: current.signal },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "NXT search unavailable.");
      if (!current.signal.aborted) {
        setResults(payload.results || []);
        setError(payload.warning || "");
        setSearched(true);
      }
    } catch (failure) {
      if (!current.signal.aborted) setError(failure.message);
    } finally {
      if (!current.signal.aborted) setSearching(false);
    }
  }
  async function add(person, verifyOnly = false) {
    const constituentId = String(
      person.blackbaudConstituentId || person.blackbaudRecordId || "",
    );
    if (writes.current.has(constituentId)) return;
    const description =
      report.dataConfiguration.fieldDescription || value.trim();
    if (
      !verifyOnly &&
      !window.confirm(
        `Add ${person.name} to ${report.title}? This adds the NXT custom field ${report.dataConfiguration.fieldCategory} with value "${description}". It does not create or merge a constituent.`,
      )
    )
      return;
    writes.current.add(constituentId);
    setStates((current) => ({
      ...current,
      [constituentId]: { status: "sending", message: "Checking NXT..." },
    }));
    try {
      const response = await fetch(
        `/api/reports/lists/${encodeURIComponent(report.key)}/membership`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            constituentId,
            action: verifyOnly ? "verify" : "add",
            value: description,
            revision: report.revision,
          }),
        },
      );
      const payload = await response.json();
      if (!response.ok) {
        const failure = new Error(
          payload.error || "Could not verify this addition.",
        );
        failure.safeToCorrect =
          !verifyOnly && [400, 422].includes(response.status);
        throw failure;
      }
      if (mounted.current)
        setStates((current) => ({ ...current, [constituentId]: payload }));
    } catch (failure) {
      if (mounted.current)
        setStates((current) => ({
          ...current,
          [constituentId]: {
            status: failure.safeToCorrect ? "invalid" : "needs_verification",
            message: failure.safeToCorrect
              ? failure.message
              : `${failure.message} Check status before making any changes in NXT.`,
          },
        }));
    } finally {
      writes.current.delete(constituentId);
    }
  }
  const configuredValue = report.dataConfiguration.fieldDescription;
  return (
    <details className={`${styles.card} ${styles.sourceList}`}>
      <summary>Add a constituent to this list</summary>
      <p className={styles.muted}>
        Adds the configured NXT custom field to an existing constituent only.
        Existing fields are not replaced, and uncertain writes are not
        automatically retried.
      </p>
      <p>
        <strong>{report.dataConfiguration.fieldCategory}</strong>
        {configuredValue ? ` / ${configuredValue}` : " / Any description"}
      </p>
      {!configuredValue && (
        <label className={styles.field}>
          Description to add
          <input
            value={value}
            maxLength={200}
            onChange={(event) => setValue(event.target.value)}
          />
          <small>
            Enter an existing NXT code-table description, or a text value. It
            will be saved on the selected record.
          </small>
        </label>
      )}
      <form
        className={styles.toolbar}
        onSubmit={search}
        style={{ marginTop: 16 }}
      >
        <label className={`${styles.field} ${styles.picker}`}>
          Find an NXT constituent
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name or lookup ID"
          />
        </label>
        <button
          className={styles.button}
          disabled={searching || query.trim().length < 2}
        >
          {searching ? "Searching..." : "Search NXT"}
        </button>
      </form>
      {error && (
        <p role="alert" className={styles.notice}>
          {error}
        </p>
      )}
      {searched && !results.length && (
        <p>No matching constituents. Try a different name or lookup ID.</p>
      )}
      <div className={styles.stack}>
        {results.map((person, index) => {
          const id = String(
            person.blackbaudConstituentId || person.blackbaudRecordId || "",
          );
          const state = states[id];
          const confirmed = ["added", "already_present"].includes(
            state?.status,
          );
          const uncertain = state?.status === "needs_verification";
          return (
            <article className={styles.row} key={id || index}>
              <div className={styles.sectionHeading}>
                <div>
                  <strong>{person.name}</strong>
                  <p className={styles.muted}>
                    Lookup ID: {person.lookupId || "Unavailable"}
                  </p>
                </div>
                <div className={styles.sectionHeading}>
                  {id && (
                    <a
                      className={styles.button}
                      href={buildBlackbaudConstituentProfileUrl(id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open NXT record
                    </a>
                  )}
                  {id && (
                    <button
                      type="button"
                      className={styles.button}
                      disabled={
                        confirmed ||
                        state?.status === "sending" ||
                        (!uncertain && !configuredValue && !value.trim())
                      }
                      onClick={() => add(person, uncertain)}
                    >
                      {confirmed
                        ? "Confirmed in NXT"
                        : state?.status === "sending"
                          ? "Checking..."
                          : uncertain
                            ? "Check status"
                            : "Add to list"}
                    </button>
                  )}
                </div>
              </div>
              {state?.message && (
                <p className={styles.notice} role="status">
                  {state.message}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </details>
  );
}
