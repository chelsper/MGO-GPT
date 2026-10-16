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

The existing category must be **Text** or **Table**. A Table field must already contain the linked fundraiser's NXT display name or a unique first-and-last-name form from that verified NXT record. The exact display-name entry is preferred. A shorter entry is checked against the other linked fundraiser identities, including inactive ones, before any write claim. The app will not create categories or table entries automatically. Other types fail closed rather than guessing a payload.

The MGO profile must link to the correct active NXT fundraiser system ID. Existing NXT values are matched by unique exact normalized names against linked fundraiser identities (display and structured first/last names) and app names, without fuzzy matching. An arbitrary app name is not accepted as an alternative when saving. Confirmed app writes additionally retain stable local user identity tied to the same NXT custom-field ID, value and date.

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

### Name-matching fix, October 16, 2026

Deployed to JU on October 16; release verification is recorded below. Read-only JU checks confirmed the
reported failure: the linked fundraiser display name is `Kaye R. Glover`, while
the existing CodeTableEntry option is `Kaye Glover`. The old exact-display-name
check failed before creating a local write claim or submitting a custom field.
The new matching logic selects the existing shorter option using NXT's
structured first/last names. Four other linked fundraiser identities were
checked read-only, with no collision. No donor, table configuration, assignment,
metric snapshot, or authentication credential was changed.

Shorter-name collision checks are bounded to 20 other linked identities and a
20-second read-reservation budget; transport calls use the existing 8-second
budgeted timeout and no retries. Unavailable identities, duplicate names, or
exceeded bounds stop before a write. Text fields retain the verified display
name, existing exact-name table matches avoid the additional lookups, and
confirmed receipts retain the selected app owner and exact NXT table value.
Report refresh recognizes the same verified name forms and flags ambiguous
attribution rather than assigning credit to multiple people.

Verification: 70 focused model/service/route/component tests passed, including
10 new regression cases. Full suite: 6,812 passed and 266 opt-in tests skipped;
a separate local campaign PostgreSQL run passed 74 of those skipped tests,
leaving 192 existing optional/external-service checks unrun. Typecheck,
production build, release guard, and scoped whitespace checks passed. The four
opt-in originator PostgreSQL tests and a live approved constituent write were
not run; claim/schema/write sequencing is unchanged.

Evidence: `/private/tmp/ju-originator-name-*` and the read-only diagnostic script
`/private/tmp/ju-originator-identity-check.mjs`. The diagnostic exercised the
new model with live metadata, not a constituent save.

A follow-up read-only roster audit checked all five active MGOs. Scott's NXT
display name `Scott M. Bacon` also differs from the table option `Scott Bacon`.
The new model matches both Scott and Kaye without collisions. Erica, Gretchen,
and Leslie already have matching names. Two inactive profiles lack linked NXT
IDs and were not treated as active dashboards. Seven NXT GETs and no writes
were used; individual MGO connections and write permissions were not tested.

### October 16 Release Verification

The user authorized deployment after the all-MGO audit. Released source:
`b7b8beb9956f4ab219cf168aa9e75e243200cb79`; JU deployment:
`dpl_2QPJ8Jticept8sC8shEhorGreBWU`, hosted at
`mgo-n2ta09yuu-chelspers-projects.vercel.app`. Rollback target:
`dpl_3eh7FBVegjPCHcgVz9gAv1DHoA5J`, source
`6ea358acf9121db2aa106ced588fd2b69d66f66f`.

Fresh release checks passed: all 70 focused originator tests; full regression
6,886 passed and 192 existing optional/external-service skips, including all 74
isolated campaign PostgreSQL checks; typecheck, local and hosted production
builds, release worktree guard, and scoped whitespace checks. No skip was added.
The four optional originator PostgreSQL checks and live write acceptance remain
unrun. No schema or durable-claim sequence changed.

The committed archive contained 1,415 hash-verified upload files and excluded
unrelated local work. The production candidate passed version, page, asset, and
unauthenticated GET/POST guards before promotion. Those checks passed again on
`www.jumgogpt.app`, and the standard production verifier confirmed the exact
source SHA and deployment ID. Portfolio, constituent lookup, standings, and
campaign pages returned successfully. No authenticated constituent save or
report refresh was attempted; personal NXT permissions were not tested.

JU project settings and all five cron schedules remained unchanged, with cron
hosts following the new deployment. Sandbox and every other Vercel project
were unchanged. No Git push, NXT write, table edit, credential change, or mailing
operation was performed. This documentation update is separate from deployed
application source. Evidence: `/private/tmp/ju-originator-deploy-*`,
`/private/tmp/ju-originator-release-*`, and
`/private/tmp/ju-originator-{candidate,live}-smoke.log`.
