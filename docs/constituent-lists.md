# Constituent Lists

## Query Output and Display Columns

Lists now support `custom_field`, `saved_query`, and `query_json` sources. In
Setup > Report Access & Configurations, select a list or Add list. Choose a saved
query system record ID or paste a Dynamic constituent query definition (type 18).
The Future. Made. Phase II editor has an explicit **Use supplied Future. Made.
query** draft button containing the definition supplied September 19, 2026.
These tenant-specific IDs are not defaults for other lists or organizations.

Saving does not execute, create, or edit an NXT query. An explicit list refresh
executes an asynchronous read-only query and preserves its result columns and
rows. It does not replace them with the old four-column layout. CSV must be
complete and valid, with at most 1,000 rows, 25 columns and 512 KB; overflow is
rejected, never truncated. Existing complete results survive refresh failures.
All authorized viewers can access every returned field; hiding a column is not
a security control. Query-definition sharing flags do not grant app access.

After the first refresh, **Load returned output fields** in configuration reads
only saved data: the unfinished query output preview, if available, otherwise
the complete snapshot. Choose visible columns, labels, text/number/USD format,
and order, then save shared defaults. Display-only edits reuse the same snapshot
and never execute NXT. **Display columns** on the list adjusts this visit only.
New output fields appear by default; obsolete column settings are ignored.

### Reader Presentation

The list places saved results first in a bordered, horizontally scrollable table.
Search and the compact **Columns** menu share one toolbar. Show/hide choices are
immediate; rename, format and reorder controls are in a secondary disclosure.
These are visit-only choices and do not fetch NXT or change shared defaults.
Keyboard users can close the column menu with Escape. Mobile readers receive a
horizontal-scroll hint; the page itself does not widen to fit the table.

A small status line shows the saved timestamp in Eastern time and active refresh
progress. Technical provider messages, output headers, setup guidance, and repair
controls appear only in a collapsed **List settings & status** section for users
with `canConfigure`. Other readers never see those diagnostic elements. Incomplete
first-time query output is still labeled **Fundraiser details pending**, and a
failed refresh retains a brief **Showing saved results. Refresh paused.** status.
This presentation does not claim incomplete data is complete or live. When a
complete snapshot exists it remains the main table; a newer unfinished preview
is available only within the administrator details. Membership search remains
available below the results with the existing confirmation and write safeguards.

### Current Lead Fundraiser

Enable the separate current-lead option and enter exact NXT assignment type names
(default: Lead Solicitor and Lead Fundraiser). Query lists require an explicit
output header for the **constituent system record ID**. Include this field in the
query output; it can be hidden from the display. The app does not infer identity
from a name, Lookup ID, arbitrary numeric field ID, gift ID, or unconfigured
QRECID. The supplied six field IDs are not assumed to include this identity.

The ID mapping can be left blank for the first refresh. Once a complete, valid
CSV has arrived, its fields and rows are saved before optional fundraiser lookup.
A missing/invalid mapping or generated-column collision stops at
`needs_configuration`, not a timed provider retry. The list shows a clearly
labeled **Query output preview** and the exact returned field names. No IDs are
guessed and no fundraiser lookups occur until mapping validates. The last
complete snapshot is never replaced by this preview; malformed/oversized CSV is
never exposed as a valid preview either.

In configuration, load the returned fields and choose the constituent system
record ID from the dropdown, then save and refresh. Confirm the chosen field's
meaning in NXT: being numeric alone is insufficient. A configured field absent
from the output remains visibly unresolved rather than silently replaced.
Returned options are scoped to the saved query definition; unsaved source
changes cannot reuse unrelated fields. Generated lead names are not ID options.
Changing source or enrichment mapping uses a separate cache key and requires an
explicit new refresh; changing display settings alone does not.

Opening the preview and loading fields do not execute NXT. Start/continue stop
on an unresolved mapping. For a saved-query-ID source, **Refresh query output**
explicitly re-runs the query after confirmation, allowing recovery when output
fields were edited in NXT without changing the saved query's ID. Existing
cooldown, lease, access and revision protections still apply.

Refresh reads the [single-constituent fundraiser assignments endpoint](https://developer.sky.blackbaud.com/api#api=56b76470069a0509c8f1c5b3&operation=ListConstituentFundraiserAssignmentsSingleConstituent)
with `include_inactive=false`, verifies the returned constituent IDs, and excludes
future, ended, and explicitly inactive assignments. It selects exact lead role
labels, retains all current leads, and resolves names once per distinct fundraiser
per refresh. Dates are compared as calendar dates in the report's Eastern time
context. A blank is a verified absence, not a swallowed API error. Failed reads
pause publication, retaining the last complete snapshot. Progress checkpoints
limit work to five constituents or roughly 15 seconds between constituents per
request. No assignment lookup runs during opening, sorting, or column changes.

The Add constituent custom-field category/value is configured separately. The
app never converts opaque query filters into writes. Leave the category empty
for a read-only query list. If enabled, the existing idempotent membership writer
is reused; extra query filters or NXT indexing lag may exclude a newly added
constituent from the result until conditions are met.

Existing Future. Made. access and legacy output remain unchanged until a manager
saves the new source settings. Its old URL then uses the new list viewer. The old
scheduled query refresh is skipped and the hardcoded membership writer refuses
outdated requests. Configured lists refresh explicitly; no new schedule or data
migration is introduced. Old snapshots are not relabeled as a different source.

## Setup and Compatibility

Reports now groups constituent lists under **Lists** (`/reports/lists`). The existing
Future. Made. Phase II report remains at its original URL with its existing query,
access rules, membership action, and refresh behavior until its new list source
settings are explicitly saved. It is not silently migrated.
Retired custom-field count reports are not re-enabled. My Dashboards now groups
the existing engagement and configured dashboards separately from Lists. The
administrator Metric Library now registers their existing saved sources for reuse;
personal dashboard composition remains future work. See `report-dashboard-builder.md`.

Admin and Advancement Services use **Setup > Report Access & Configurations >
Add list**. Configure a title, an existing NXT constituent custom-field category,
and an optional description/value. A blank description includes all values for
the category; a supplied value uses exact case-insensitive trimmed matching.
These are not constituent codes, comments, local tags, or fuzzy-name searches.

New lists are disabled drafts. Save, select active viewers in Access, then enable.
Even administrators must be explicitly selected to view members. Selected Admin,
Advancement Services, and Executive viewers can add members. Other selected users
can view and explicitly refresh. Disabling a list does not delete NXT fields.
Settings use revision checks to prevent overwriting concurrent changes.

## Read and Refresh Contract

- Configuration uses existing `report_configurations`, kind `constituent_list`,
  schema `constituent-list-v1`; no schema migration or credentials in configuration.
- GET, navigation, search, pagination, and configuration preview are saved-data-only.
  Loading NXT category choices is a separate explicit button.
- Custom-field list refresh uses filtered `GET /constituent/v1/constituents/customfields`
  with `category`, optional `value`, `include_count`, limit 100, and offset.
- Blackbaud documents average indexing latency of roughly 30 minutes for this
  endpoint. Newly added membership may be verified on the record before appearing
  in a refreshed list. Never describe this report as live.
- Each refresh request reads one field page or up to five constituent identities.
  Requests use the shared Blackbaud quota guard, 10-second timeouts and no retries.
  The page continues bounded batches while open; leaving pauses after the batch.
- Validation checks response shape, IDs, criteria, total consistency, duplicate
  field IDs, and pagination origin/path/offset. Maximum 10,000 matching fields.
- Only complete results, including a verified empty list, replace the last good
  snapshot. Names must be verified before publication. Errors retain saved data.
- Existing snapshot/lease primitives provide atomic publication and durable
  checkpoints; active leases, cooldowns and late responses cannot publish twice.
  Configuration or access changes are rechecked after provider reads.
- Resume continues a checkpoint. Restart unfinished refresh is available for a
  paused run (after any provider cooldown) if membership changed during paging.
  Restart discards only in-progress work, never the last complete snapshot.

### Expired Query Recovery

Query attempts older than 30 minutes, and explicit failed/cancelled NXT query
jobs, require a new attempt rather than repeated polling. They expose
`needs_restart` and **Restart refresh**, with confirmation that saved results
remain available and no constituent records will change. GET derives expiry
from saved timestamps without calling NXT or modifying the job. It removes only
the legacy cooldown attached to the app's own expiry message; real provider
backoff and active leases still block a restart.

Continue requests never recreate an expired job. An explicit start (including
Resume from an older client) or restart creates a fresh attempt under the same
revision/lease protections. There is no automatic restart loop. Retained output
awaiting an ID mapping and fundraiser checkpoints are not expired by this
query-phase limit. Invalid mapping still stops safely at `needs_configuration`.

## Membership Writes

The new generic-list action writes an existing constituent custom field only:
`POST /constituent/v1/constituents/customfields` with `parent_id`, `category`,
`value`, date and a bounded audit comment. It does not create/merge constituents,
replace existing fields, or create code-table entries. Only Text and Code Table
categories currently support in-app additions. Read-only lists may use other
categories.

Before writing, authenticate the active user, check explicit access and role,
reject cross-origin requests, require the current configuration revision, read
the constituent's complete custom fields, validate the live category/value, and
recheck access. An existing matching field is a no-op.

A durable category-wide receipt in `report_snapshots_cache` protects overlapping
category-only and value-filtered lists. A compare-and-swap claim precedes the
single POST. Unknown outcomes are never resent. A different value can be added
only after the prior receipt's value is verified on the NXT record. Token-guarded
receipt updates prevent older responses overwriting newer submissions. This
guards this app's new list actions, not simultaneous edits from other NXT clients
or the unchanged legacy Future. Made. Phase II action.

Read-back verifies membership. Uncertain responses expose **Check status**, not
another Add. Pre-write validation errors allow correction. A persisted receipt
without a verifiable field remains held for manual NXT investigation; do not
delete receipts to force a resend without investigating the original request.

## Acceptance Checks

Automated tests cover explicit access, settings revisions, saved-only reads,
bounded refresh, quota pauses, failed publication, duplicate-write holds,
category overlap, read-back, and correction of input errors. Local previews use
synthetic data and intercept every fetch; no production NXT writes are tests.

Before enabling a production list, use an explicitly authorized sandbox record
to check the chosen category type, exact value, permissions and delayed indexing.
Preserve the legacy list until the new definition's complete membership has been
compared with the existing query. Do not copy production data, tokens, snapshots,
or receipts into a conference sandbox.

Official API reference:
[Custom field list (all constituents)](https://developer.sky.blackbaud.com/api#api=56b76470069a0509c8f1c5b3&operation=ListConstituentCustomFieldsAllConstituents),
[Custom field create](https://developer.sky.blackbaud.com/api#api=56b76470069a0509c8f1c5b3&operation=CreateConstituentCustomField).
