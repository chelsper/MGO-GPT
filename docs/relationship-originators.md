# Relationship Originator

## Staff workflow

- Open a constituent in My Portfolio, Top Prospects, or Find a Constituent, then expand **Relationship originator**.
- An MGO can record only themselves, using their verified active NXT fundraiser identity. Choose the introduction date, not necessarily today's entry date. Saving writes the name and date to the existing NXT constituent custom field named **Relationship Originator**. It does not change portfolio assignments.
- An existing originator can only be corrected by an Admin in this app. Corrections require a reason and retain an app audit record. Existing NXT comments are preserved. NXT itself must still enforce its own user permissions; this app cannot prohibit edits made directly there.
- **Reports > Team Standings > Relationships that started with you** displays FY and lifetime constituent counts and received giving. Use **Refresh originator metrics** to update the saved snapshot. Opening the report does not run NXT reads.
- There is one originator per constituent, not per household. Organizations can also be originated. Credit remains independent of portfolio reassignment. This is attribution, not proof of causation or a claim that a newly tagged record is a newly created NXT constituent.

## Metric policy

The user approved one originator with Admin corrections and giving from the introduction date forward.

- FY counts: distinct verified constituent system IDs whose custom-field date falls in the organization's current FY through today. Lifetime counts: all verified introductions through today.
- FY giving: direct received revenue during this FY from all verified originated relationships, on or after each relationship's introduction date. Lifetime giving: direct received revenue from introduction through today.
- No soft-credit duplication, unpaid pledges, planned-gift commitments, gift-in-kind, or deleted/voided gifts. Received gift types follow the application's received-revenue vocabulary, with explicit validation and gift-ID deduplication. Negative received adjustments represented as amounts remain signed. Unknown financial data prevents publishing an incomplete snapshot.
- Missing dates, multiple originator fields, and ambiguous/unmatched fundraiser names are excluded and disclosed as unresolved records. Admins get NXT links to resolve them. Never substitute `date_added`, expected dates, or portfolio assignment dates for the introduction date.
- These metrics are separate from the existing standings rank and solicitor-credit totals. Do not add the two attribution measures together as organization revenue.

## NXT prerequisites

The existing category must be **Text** or **Table**. A Table field must already contain the linked fundraiser's exact NXT name. The app will not create categories or table entries automatically. Other types fail closed rather than guessing a payload.

The MGO profile must link to the correct active NXT fundraiser system ID. Existing NXT values are matched by unique exact normalized names against linked fundraiser identities and app names, without fuzzy matching. Confirmed app writes additionally retain stable local user identity tied to the same NXT custom-field ID, value and date.

The category-filtered all-constituents custom-field endpoint avoids scanning unrelated constituents. Read pagination validates response shape, counts when returned, next-link host/path and loop bounds. Gifts are filtered to each verified constituent and introduction-to-today dates.

## Reliability and access

`relationship_originator_changes` stores immutable prior fields, actor, owner, introduction date and correction reason, with a partial unique index preventing more than one unresolved write per constituent across users. Read NXT before and after claiming; submit one POST/PATCH without transport retries; confirm with a read. A timeout or rejected/uncertain provider response remains locked. **Check NXT** verifies without resending. Never clear an unresolved claim or re-POST merely because a read is empty; visibility may lag. If it cannot reconcile, an Admin/developer must investigate the provider result and retained receipt before deciding how to recover.

No provider-side atomic compare-and-swap exists here. A concurrent edit directly in NXT can race the app's final read. The post-write verification detects conflicting fields but cannot make two systems transactional. Do not promise exactly-once remote behavior.

The endpoints enforce active authentication, MGO/Admin editing permissions, server-selected identity, Admin-only correction and same-origin JSON writes. Read-only executive workspaces do not show the editor. Team metrics use existing Team Standings report access and the configured shared Admin/Advancement Services report connection, never the requesting MGO's more restricted connection. That reporting account must have complete access to the relevant constituents and gifts. Only Admins receive unresolved constituent IDs in the report.

Report refresh has a shared expiring lock, a 90-second/80-read budget, bounded pagination and existing Blackbaud cooldown protection. Gift checks can reuse complete connection-scoped results for up to 24 hours. Failed/incomplete refreshes retain the previous complete snapshot. This first version refreshes explicitly; it does not add another overnight job or run on portfolio visits. Large cohorts may need a later resumable background refresh instead of raising request ceilings.

## Verification and release

Unit/component tests cover date boundaries, self-only claims, Admin corrections, stale forms, duplicate/ambiguous data, typed custom fields, pagination, uncertain-write recovery, preserved snapshots, access checks and no live reads on normal report visits. An opt-in disposable PostgreSQL test validates migrations, audit preservation, unique claims and refresh locks. It never reads `DATABASE_URL` or contacts NXT.

Before production acceptance, verify the JU category type/table values and one approved test constituent's NXT field/date, then refresh metrics and compare with NXT. Local testing does not make production record changes. No production deployment is implied by implementation.

### Local verification, October 6, 2026

- Full regression run: 444 test files and 5,854 tests passed; 174 tests skipped. After the final scoped-field validation and route tests were added, the focused service/route run passed all 26 tests.
- Final production build, typecheck, release checks and `git diff --check` passed.
- Four disposable PostgreSQL integration tests remain unverified: local `initdb` could not allocate shared memory on this machine. No production database was substituted.
- No live NXT records were changed during verification. The subsequent JU deployment is recorded in [the release notes](ju-relationship-originator-release-2026-10-06.md). Live NXT write acceptance and the disposable database tests remain outstanding.
