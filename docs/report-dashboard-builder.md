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

Values use one of two explicit sources:

- Saved query count: enter the positive numeric saved NXT query system record ID. The app counts CSV data rows after the header, using the existing saved-query execution and download flow. It does not sum/extract aggregate columns or use job.row_count as the result. A donor count requires the saved query to return one row per constituent; duplicate rows will be counted. No NXT saved query is created or modified.
- Static value: enter a finite number, including zero or a decimal, with an optional note. Blank means unknown, not zero. Manual values show provenance separately from NXT query/frozen values. Changing labels/access does not change the static value's original update provenance.

Test query runs one saved query on explicit request by a report manager and returns a safe count only. It does not write snapshots or freeze a value. Failures do not reveal provider URLs or result data.

Current bounds: 12 panels, 100 values, at most 12 query-backed values per dashboard. Row/column removal asks for confirmation; layout switches never silently drop values.

## Snapshots And Refresh

Ordinary dashboard GET requests are snapshot-only, even with refresh=1. POST Refresh data runs at most two unique saved queries per batch, sequentially. Continue refresh resumes remaining cells; successful cells from the same cycle are not rerun. Duplicate query IDs reuse their result within the refresh cycle.

Refreshable values are eligible for manual/daily refresh. Frozen values reuse a compatible successful count without NXT calls. To intentionally refresh a frozen result after changing the output of the same saved NXT query, make it refreshable, save, refresh successfully, then freeze it again.

Changing a cell source/query ID makes its old count incompatible; changing its label, position, panel width, access, or refresh policy does not invalidate its meaning. Failed queries retain compatible last-successful values and mark them stale. Missing values remain unknown. Concurrent snapshot writers use compare-and-swap, and refresh publication rechecks the configuration revision. Simultaneous refresh requests can still duplicate bounded NXT work; only one checkpoint is accepted.

Enabled general dashboards refresh when due (24 hours since the last batch). The existing hourly cron resumes pending/deferred batches. Built-in reports retain their existing 6 PM New York refresh window. Frozen-only/static-only dashboards do not execute queries. Disabled dashboards are skipped.

## Release Verification

Run the web test suite, typecheck, production build, and check:release. Inspect the editor at desktop and mobile widths with synthetic data. After deployment, use an explicitly selected test report to verify live NXT access/counts; do not alter existing saved-query IDs or frozen historical snapshots as part of release validation.

Schema changes are additive on report_configurations: configuration_kind (standard by default), active (false by default for new dashboards), and value_provenance. Existing built-in activation behavior is unchanged. New dashboard snapshots use their own report:dashboard: key namespace.
