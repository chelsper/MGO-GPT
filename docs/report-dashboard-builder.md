# Report Configuration And Dashboard Builder

## Editing Reports

Open Report Access & Configurations. Search/select one report, or choose Add report.

- Configure edits titles, descriptions, and supported panel settings.
- Access edits the audience independently of the configuration.
- Preview shows the draft layout and compatible saved values without running NXT queries.
- Switching reports/tabs retains drafts in memory. Leaving/reloading the page warns about unsaved work; drafts are not persisted across browser sessions.
- Save configuration and Save access update only their respective settings. Save all changes in Preview updates both. Saving never executes a query or replaces a query snapshot.
- Existing specialized reports retain their routes, access policies, calculations, and cache semantics. The Alumni dashboard retains its existing saved-query row definitions, IDs, and fingerprints.

## New Dashboards

New reports use the general dashboard builder and start disabled with no viewers. Create the report, select active viewers in Access, then enable it and save access. Administrators have no published-dashboard bypass; managers may use the configuration Preview while the draft is disabled.

Each panel has a title, half/full width, and a layout:

- Rows: a labeled vertical list with one value column.
- Table: labeled rows and columns; each cell has its own data source.
- Metric: a single prominent value.
- Query Results Table: one saved-query ID supplies all output rows and headers automatically. There are no manually defined row/column axes or numeric cells for this panel type.

Values use one of two explicit sources:

- Saved query row count (number only): enter the positive numeric saved NXT query system record ID. The app counts CSV data rows after the header, using the existing saved-query execution and download flow. It does not display the returned columns, sum/extract aggregate columns, or use job.row_count as the result. A donor count requires the saved query to return one row per constituent; duplicate rows will be counted. No NXT saved query is created or modified.
- Static value: enter a finite number, including zero or a decimal, with an optional note. Blank means unknown, not zero. Manual values show provenance separately from NXT query/frozen values. Changing labels/access does not change the static value's original update provenance.

Test query runs one saved query on explicit request by a report manager and returns a safe count only. It does not write snapshots or freeze a value. Failures do not reveal provider URLs or result data.

Current bounds: 12 panels, 100 values, at most 12 query-backed values per dashboard. Row/column removal asks for confirmation; layout switches never silently drop values.

## Query Results Tables

For a query such as PPC 2026-27 (system record ID `30971`), open a general dashboard or choose Add report, then **Add Output Query panel**. Enter the query ID and select **Load query preview**. The preview shows the columns and rows actually returned by NXT; for the supplied example these are PPC Member Name and Total Giving FY27. Do not create an individual dashboard row for each person. If the query was accidentally entered in a single numeric/count panel, choose **Show this query's rows and columns instead** to convert that draft panel. This feature is available in general dashboards; built-in specialized report editors remain unchanged.

The preview executes only on explicit request and is not written into report configuration or production snapshots. After saving, select viewers, enable the report, and refresh its data to create the shared snapshot. No Blackbaud saved query is created or modified. Aggregate output is shown as output, never mistaken for a donor count. Giving values are not recalculated or summed.

By default, cells display the returned CSV text. Optional per-header display settings rename labels or format numbers/currency; the original cell values remain in the snapshot. Sorting and pagination run locally and make no NXT calls. Changed query IDs cannot reuse an old table. Presentation and access edits preserve compatible cached results.

Tables contain constituent-level data. Managers must choose viewers deliberately: all selected viewers can see every returned column in the shared snapshot, regardless of their own NXT field permissions. Responses are private/no-store, previews require an active report manager, and published reports require the existing explicit allowlist. No query rows, signed download URLs, or tokens are logged.

Table limits: at most 4 query tables per dashboard, 1,000 result rows and 25 columns per table, 512 KiB downloaded CSV, and 2,000 characters per cell. Tables share the existing 12-query-source limit and two-query-per-batch refresh budget with count cells. Oversized, ambiguous, or malformed results fail rather than silently truncate or overwrite a valid snapshot. A header-only CSV is a valid empty result and is distinct from a missing snapshot. Count and table interpretations of the same query use separate execution/cache keys so they cannot be confused.

## Snapshots And Refresh

Ordinary dashboard GET requests are snapshot-only, even with refresh=1. POST Refresh data runs at most two unique saved queries per batch, sequentially. Continue refresh resumes remaining cells; successful cells from the same cycle are not rerun. Duplicate query IDs reuse their result within the refresh cycle.

Refreshable values are eligible for manual/daily refresh. Frozen values reuse a compatible successful count without NXT calls. To intentionally refresh a frozen result after changing the output of the same saved NXT query, make it refreshable, save, refresh successfully, then freeze it again.

Changing a cell source/query ID makes its old count incompatible; changing its label, position, panel width, access, or refresh policy does not invalidate its meaning. Failed queries retain compatible last-successful values and mark them stale. Missing values remain unknown. Concurrent snapshot writers use compare-and-swap, and refresh publication rechecks the configuration revision. Simultaneous refresh requests can still duplicate bounded NXT work; only one checkpoint is accepted.

Enabled general dashboards refresh when due (24 hours since the last batch). The existing hourly cron resumes pending/deferred batches. Built-in reports retain their existing 6 PM New York refresh window. Frozen-only/static-only dashboards do not execute queries. Disabled dashboards are skipped.

## Release Verification

Run the web test suite, typecheck, production build, and check:release. Inspect the editor at desktop and mobile widths with synthetic data. After deployment, use an explicitly selected test report to verify live NXT access/counts; do not alter existing saved-query IDs or frozen historical snapshots as part of release validation.

Schema changes are additive on report_configurations: configuration_kind (standard by default), active (false by default for new dashboards), and value_provenance. Existing built-in activation behavior is unchanged. New dashboard snapshots use their own report:dashboard: key namespace.
