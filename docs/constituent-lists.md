# Constituent Lists

## Setup and Compatibility

Reports now groups constituent lists under **Lists** (`/reports/lists`). The existing
Future. Made. Phase II report remains at its original URL with its existing query,
access rules, membership action, and refresh behavior. It is not silently migrated.
Retired custom-field count reports are not re-enabled. My Dashboards is separate
future work.

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
- Manual refresh uses filtered `GET /constituent/v1/constituents/customfields`
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
