# Prospect Lifecycle

## Location and access

Reports > Opportunity Pipeline > Prospect Lifecycle. The report inherits Opportunity Pipeline access and is read-only. It supports assignment fiscal-year cohorts, fundraiser and progress filters, search, expandable timelines, and CSV export of all matching cycles across pages.

## Sources and meaning

- Assignment snapshots come from `prospect_pool_assignment_audits`. The app assignment timestamp and requested MGOGPT identification date are distinct. A saved sync result does not imply a fresh NXT verification.
- `prospect_lifecycle_assignments` and `prospect_lifecycle_outcomes` retain history independently of pool rows. Database triggers capture new assignment audits, distinct outcome selections, sync results, outcome clearing, and pool removal. Reassignments create separate cycles.
- The initial backfill includes the latest saved outcome only, labelled as a historical snapshot. Earlier overwritten outcomes cannot be reconstructed. New selections are retained after this schema is installed.
- Actions combine confirmed app-created NXT action receipts and the saved Team Standings action snapshot. The latter must carry `actionIdentityVersion: 1`, explicit constituent system IDs, and a valid saved date window. Refresh Team Standings through its normal workflow after release to populate that metadata. Older ambiguous IDs are not used.
- Action attribution matches constituent and assigned fundraiser IDs, not the person entering the action. Planned actions, completed actions, and unknown completion status remain distinct. The first recorded completed action is not necessarily the first-ever contact.
- Giving reuses the active, connection-scoped, published society giving generation. Pending pages and other connections are not read. Gift history outside its saved date window can be missing.
- Direct cash/payment gift types contribute to known monetary receipts. Pledges and other types remain timeline activity, not received revenue. Soft credits are excluded. Gift IDs count once in report totals even when joint assignments overlap; conflicting duplicates are excluded.
- Giving is associated activity, not fundraiser credit or evidence that outreach caused the gift. Calendar-day activity on a reassignment date belongs to the new assignment.

Opening, reloading, filtering, and exporting make no NXT calls or writes. Missing data is not treated as proof of no activity. Core reads fail rather than display truncated totals above 10,000 saved assignments, outcomes, or actions; giving can be independently unavailable.

## Release and verification

The additive schema is installed by `ensureAppSchema`. It does not alter NXT or create custom fields. Existing assignment/outcome workflows continue to perform those writes.

Unit and UI tests cover exact identity joins, reassignment boundaries, action completion, deduplication, coverage, outcome clearing, CSV escaping, permissions, and error privacy. `prospectLifecycle.integration.test.js` runs against a disposable PostgreSQL schema only when `LIFECYCLE_TEST_PG_SOCKET` is set. It verifies triggers, history retention, safe backfill, and actual reader SQL. Never point this test at production.

Before comparing staff performance, validate the saved action and gift coverage. Recommended follow-on reporting: 30/60/90-day outreach aging, assignment-to-qualified conversion, and linked opportunity-to-gift progression. Broader historical coverage should be added through bounded background ingestion, not live per-prospect requests on report load.
