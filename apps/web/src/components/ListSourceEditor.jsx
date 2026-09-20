import { useEffect, useRef, useState } from "react";
import styles from "./reportConfigurationEditor.module.css";
import ListColumnEditor from "./ListColumnEditor";
import {
  isQueryList,
  LEAD_COLUMN,
  listOutputSourceKey,
  parseListQuery,
} from "@/utils/listQueryConfiguration";
import futureMadeQuery from "@/utils/futureMadeQueryTemplate.json";

export default function ListSourceEditor({ value, onChange, reportKey }) {
  const [catalog, setCatalog] = useState({ categories: [], values: [] });
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [outputFields, setOutputFields] = useState(null);
  const sourceKey = listOutputSourceKey(value);
  const headers =
    sourceKey &&
    outputFields?.sourceKey === sourceKey &&
    outputFields?.reportKey === reportKey
      ? outputFields.headers
      : [];
  const lead = value.leadFundraiser || {
    enabled: false,
    systemIdColumn: "",
    assignmentTypes: ["Lead Solicitor", "Lead Fundraiser"],
  };
  const query = isQueryList(value);
  async function loadColumns() {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setNotice("");
    try {
      const response = await fetch(
        `/api/reports/lists/${encodeURIComponent(reportKey)}`,
        { cache: "no-store", signal: current.signal },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "Could not load saved columns.");
      if (current.signal.aborted) return;
      if (
        !sourceKey ||
        sourceKey !== listOutputSourceKey(payload.report?.dataConfiguration)
      )
        throw new Error(
          "These source changes have not been saved. Save the source and refresh the list before loading its returned fields.",
        );
      const savedHeaders =
        payload.queryOutput?.headers ||
        payload.snapshot?.headers?.filter(
          (header) => !(payload.snapshot.leadAsOf && header === LEAD_COLUMN),
        ) ||
        (payload.snapshot
          ? ["Constituent", "Lookup ID", "Description", "Record"]
          : []);
      setOutputFields({ sourceKey, reportKey, headers: savedHeaders });
      setNotice(
        savedHeaders.length
          ? "Returned output fields loaded. Choose the constituent system ID field if using current lead fundraiser, then save. No ID field was selected automatically."
          : "No saved output yet. Save and refresh the list first; fundraiser lookup will wait until you select an ID field.",
      );
    } catch (error) {
      if (!current.signal.aborted) setNotice(error.message);
    } finally {
      if (!current.signal.aborted) setLoading(false);
    }
  }
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
      {reportKey === "future-made-phase-ii" && (
        <div className={styles.notice}>
          <p>
            The existing saved list stays unchanged until you save these
            settings and refresh. Your supplied query definition is available
            below; its field IDs are specific to your NXT environment.
          </p>
          <button
            type="button"
            className={styles.button}
            onClick={() => {
              const { queryId, ...base } = value;
              onChange({
                ...base,
                source: "query_json",
                queryJson: JSON.stringify(futureMadeQuery, null, 2),
                columns: [],
                leadFundraiser: { ...lead, enabled: false, systemIdColumn: "" },
              });
            }}
          >
            Use supplied Future. Made. query
          </button>
        </div>
      )}
      <label className={styles.field}>
        List source
        <select
          value={value.source}
          onChange={(event) => {
            const { queryJson, queryId, ...base } = value;
            const source = event.target.value;
            onChange({
              ...base,
              source,
              ...(source === "query_json"
                ? { queryJson: queryJson || "" }
                : source === "saved_query"
                  ? { queryId: queryId || "" }
                  : {}),
            });
          }}
        >
          <option value="custom_field">NXT custom field</option>
          <option value="query_json">Paste NXT query JSON</option>
          <option value="saved_query">Saved NXT query ID</option>
        </select>
      </label>
      {value.source === "query_json" && (
        <>
          <label className={styles.field}>
            NXT query JSON
            <textarea
              rows={12}
              maxLength={64000}
              spellCheck={false}
              value={value.queryJson || ""}
              onChange={(event) =>
                onChange({ ...value, queryJson: event.target.value })
              }
            />
          </label>
          <div>
            <button
              type="button"
              className={styles.button}
              onClick={() => {
                try {
                  const parsed = parseListQuery(value.queryJson);
                  setNotice(
                    `Valid constituent query: ${parsed.select_fields.length} output fields. Save, then refresh the list to retrieve column names and values.`,
                  );
                } catch (error) {
                  setNotice(error.message);
                }
              }}
            >
              Check JSON
            </button>
          </div>
        </>
      )}
      {value.source === "saved_query" && (
        <label className={styles.field}>
          Saved query system record ID
          <input
            inputMode="numeric"
            value={value.queryId || ""}
            onChange={(event) =>
              onChange({ ...value, queryId: event.target.value })
            }
          />
        </label>
      )}
      {query && (
        <p className={styles.notice}>
          The query's output is displayed as returned, not replaced by fixed
          columns. Pasted JSON runs a read-only query; it does not create or
          edit a saved query in NXT. Maximum 1,000 rows, 25 result columns, and
          512 KB; oversized output is rejected, never silently truncated. All
          authorized viewers can access all returned data.
        </p>
      )}
      <div className={styles.notice}>
        {query
          ? "Optional Add constituent settings: this code is separate from the query and must match its membership filter. Leave the category blank for a read-only list. Other query filters can still exclude an added constituent. "
          : ""}
        Membership follows an NXT custom field, not a local tag. A category
        alone includes all values in that category. Adding a description narrows
        the list to that exact value. Saving configuration does not read or
        change any constituent.
      </div>
      <label className={styles.choice}>
        <input
          type="checkbox"
          checked={lead.enabled}
          onChange={(event) =>
            onChange({
              ...value,
              leadFundraiser: { ...lead, enabled: event.target.checked },
            })
          }
        />
        Include current lead fundraiser
      </label>
      <p className={styles.muted}>
        Only active lead assignments within their start/end dates are included,
        as of the last complete refresh. Multiple current leads are shown
        together. Lookup runs in small refresh batches, never when opening or
        sorting a list.
      </p>
      {lead.enabled && (
        <div className={styles.grid}>
          {query && (
            <label className={styles.field}>
              Constituent system record ID output header
              <select
                aria-label="Constituent system record ID output header"
                value={lead.systemIdColumn}
                onChange={(event) =>
                  onChange({
                    ...value,
                    leadFundraiser: {
                      ...lead,
                      systemIdColumn: event.target.value,
                    },
                  })
                }
              >
                <option value="">
                  Choose the constituent system record ID column
                </option>
                {lead.systemIdColumn &&
                  !headers.includes(lead.systemIdColumn) && (
                    <option value={lead.systemIdColumn} disabled>
                      {lead.systemIdColumn} (
                      {headers.length
                        ? "not in returned fields"
                        : "load fields to verify"}
                      )
                    </option>
                  )}
                {headers.map((header) => (
                  <option key={header} value={header}>
                    {header}
                  </option>
                ))}
              </select>
              <small>
                Load returned output fields below, then choose the constituent
                system ID, not Lookup ID, gift ID, or fundraiser name. Verify
                the field's meaning in NXT; numeric values alone do not prove it
                is a constituent system ID. Include this field in query output;
                it may be hidden from display. If it is missing, update the
                query and refresh. Fundraiser lookup waits for valid mapping.
              </small>
            </label>
          )}
          <label className={styles.field}>
            Lead assignment types (comma separated)
            <input
              value={lead.assignmentTypes.join(", ")}
              onChange={(event) =>
                onChange({
                  ...value,
                  leadFundraiser: {
                    ...lead,
                    assignmentTypes: event.target.value
                      .split(",")
                      .map((item) => item.trim()),
                  },
                })
              }
            />
            <small>
              Exact NXT role names. Secondary and historical assignments are
              excluded.
            </small>
          </label>
        </div>
      )}
      {reportKey && reportKey !== "__new-report-draft__" && (
        <div>
          <button
            type="button"
            className={styles.button}
            disabled={loading}
            onClick={loadColumns}
          >
            Load returned output fields
          </button>
        </div>
      )}
      <ListColumnEditor
        headers={[...headers, ...(lead.enabled ? [LEAD_COLUMN] : [])]}
        value={value.columns || []}
        onChange={(columns) => onChange({ ...value, columns })}
        allowAdd
      />
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
