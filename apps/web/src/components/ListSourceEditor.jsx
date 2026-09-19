import { useEffect, useRef, useState } from "react";
import styles from "./reportConfigurationEditor.module.css";

export default function ListSourceEditor({ value, onChange }) {
  const [catalog, setCatalog] = useState({ categories: [], values: [] });
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const controller = useRef(null);
  useEffect(() => () => controller.current?.abort(), []);
  async function load() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setNotice("");
    try {
      const params = new URLSearchParams();
      if (value.fieldCategory) params.set("category", value.fieldCategory);
      const response = await fetch(
        `/api/reports/custom-field-options?${params}`,
        { signal: current.signal },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Could not load NXT choices.");
      if (!current.signal.aborted) {
        setCatalog(payload);
        setNotice(
          payload.notice ||
            "NXT choices loaded. Choose an exact category and, optionally, a description.",
        );
      }
    } catch (error) {
      if (!current.signal.aborted) setNotice(error.message);
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }
  return (
    <section className={styles.stack} aria-label="List membership source">
      <div className={styles.notice}>
        Membership follows an NXT custom field, not a local tag. A category
        alone includes all values in that category. Adding a description narrows
        the list to that exact value. Saving configuration does not read or
        change any constituent.
      </div>
      <div className={styles.grid}>
        <label className={styles.field}>
          NXT custom field category
          <input
            list="list-category-options"
            maxLength={200}
            value={value.fieldCategory}
            onChange={(event) =>
              onChange({
                ...value,
                fieldCategory: event.target.value,
                fieldDescription: "",
              })
            }
          />
          <datalist id="list-category-options">
            {(catalog.categories || []).map((category) => (
              <option key={category.name} value={category.name} />
            ))}
          </datalist>
          <small>
            Select a loaded choice or enter the exact existing NXT category.
          </small>
        </label>
        <label className={styles.field}>
          Description / value (optional)
          <input
            list="list-value-options"
            maxLength={200}
            value={value.fieldDescription}
            onChange={(event) =>
              onChange({ ...value, fieldDescription: event.target.value })
            }
          />
          <datalist id="list-value-options">
            {(catalog.values || [])
              .filter(
                (item) =>
                  item.category.toLowerCase() ===
                  value.fieldCategory.toLowerCase(),
              )
              .map((item) => (
                <option key={item.value} value={item.value} />
              ))}
          </datalist>
          <small>
            Leave blank to include every value. Text and Code Table categories
            support adding members here; other types remain view-only.
          </small>
        </label>
      </div>
      <div>
        <button
          type="button"
          className={styles.button}
          disabled={loading}
          onClick={load}
        >
          {loading ? "Loading choices..." : "Load NXT choices"}
        </button>
      </div>
      {notice && (
        <p role="status" className={styles.notice}>
          {notice}
        </p>
      )}
    </section>
  );
}
