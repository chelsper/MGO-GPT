# Organization Configuration

Roadmap step 5, phase 1, September 17, 2026. Production release approved after
UX release `9b7b9af62170d996eac88220a3d3e7ecdff04ca9`. Confirm the deployed SHA
using the release checklist. This is the safe configuration foundation, not completion of all
fiscal-year, timezone, currency, or query customization work.

## Connected Behavior

| Source | Active consumers and boundaries |
| --- | --- |
| Institution profile application name, short name, terminology | Shared AppShell header, navigation drawer, account role labels, and view-switch labels. Permission role keys stay unchanged. Other page copy, document titles, exports, and legacy forms are not universally relabeled. |
| Notification inbox and sender display name | Existing email consumers are preserved. Verified sender address and authentication policy remain environment-controlled. Documented email domains do not change sign-in access. |
| Release-managed reporting policy | Shared default profile values, standings period construction, pledge query ID/type/system-ID header validation, and saved active-pledge display constants. July 1, Eastern time, USD, Gift query 12033, QRECID remain unchanged. |
| Stored timezone, fiscal start, currency, date format | Retained as previous preferences, visibly disabled in the profile form. Server rejects changes. Active reporting rules are shown separately; saving branding does not activate these preferences. |

The shell adds one local, authenticated settings read with a five-minute client
freshness window, no timer, no focus refetch, and no retry. A successful profile
save updates that client's shell cache immediately. Other sessions receive new
labels on their next eligible fetch, not by push. Failed branding reads use
existing defaults without blocking navigation. No additional NXT calls, full
portfolio hydration, or report refresh is introduced.

Source map:
- [Runtime policy](../apps/web/src/utils/organizationRuntimePolicy.js)
- [Profile normalization and validation](../apps/web/src/utils/organizationSettings.js)
- [Store and audit transaction](../apps/web/src/app/api/utils/organizationSettings.js)
- [Management route](../apps/web/src/app/api/admin/organization-settings/route.js)
- [Settings UI](../apps/web/src/app/organization-configurations/page.jsx)
- [Standings periods](../apps/web/src/utils/standingsPeriods.js)
- [Pledge query boundary](../apps/web/src/app/api/utils/pledgeQuerySource.js)

## Safe Saves And History

Existing management access remains Admin or Advancement Services, resolved from
the authenticated account, not a supplied workspace or actor ID. Management
responses are private/no-store. Query/field-mapping keys cannot be smuggled through
the institution-profile API; labels are bounded single-line text, not HTML.

GET returns a precise microsecond `revision`. PUT requires `expectedRevision`.
An atomic conditional UPDATE plus audit INSERT uses that revision; a competing
writer receives 409 and no audit row. The revision advances even for same-tick
writes. An audit failure rolls back the profile change. Unchanged saves create no
audit noise. Calendar/currency/date-format edits are rejected before mutation.

The additive `organization_settings_audits` table stores authenticated actor ID,
normalized before/after values, changed fields, and timestamp. The history API
returns only the latest ten entries' field names, actor display name, and date,
not email values or full settings. Earlier edits are not backfilled. This is an
application audit trail, not a tamper-proof external ledger; database access and
retention policy still require institutional ownership. Other settings routes,
including giving societies, are not covered by this new profile audit protocol.

Conflicts and uncertain responses preserve the current draft and require explicit
reload before retry. Reload asks before discarding profile edits, retains giving
society edits, and preserves the profile draft on failed/incomplete responses.
Edits are in memory, not durable recovery across browser termination.

## Remaining Step 5 Work

Do not change the central policy constant to onboard another institution yet.
Its version is descriptive; it is not stamped into every historical snapshot.
The next phase must cover these dependencies before enabling editable policies:

1. Inventory and migrate all remaining consumers, including `currentFyGiving.js`,
   `advancementQueue.js`, `nextStepWorklist.js`, `prospectExport.js`, activity-budget
   SQL and schema defaults, cron gates, giving-society-specific periods, dashboard
   helpers, currency formatting, export headings, and legacy UI labels. Decide
   deliberately which dates use reporting timezone versus viewer-local time.
2. Persist the policy/period definition with new report snapshots and checkpoints.
   Define compatibility for old versions. Viewing old reports must retain their
   original periods, currency meaning, and query scope, not reinterpret them under
   a newly selected setting. Currency changes are not FX conversion.
3. Add an explicit staged query/field-mapping validation flow: authenticated query
   metadata, expected record type, complete output, exact system-ID header, and
   documented fields. Preserve existing safe-host, size, pagination, identity,
   manifest, and resume checks. Missing mappings must not trigger an all-gifts scan.
4. Review cache/checkpoint isolation, query provenance, refresh ownership, and an
   explicit audited activation/migration action. No implicit NXT refresh or report
   recalculation from saving a profile. Test concurrent old/new deployments and
   rollback before enabling policy edits.

The deployment is still a singleton organization, not tenant isolation. The
incoming developers own the separately deferred safe development/release setup;
this phase does not deliver staging, CI, a migration runner, or a restore system.
Family Import remains deferred.

## Verification And Release

September 17 local verification: 2,685 tests in 240 files, typecheck, production
build, release worktree guard, and whitespace checks passed.

Local checks cover authorization, unknown keys, protected fields, stale/racing
revisions, no-op saves, sanitized errors, failed-save drafts, explicit reload,
audit history projection, and shared-shell labels. The existing standings and
pledge suites still verify the current calendar and query boundaries.

A disposable synthetic Postgres database exercised the actual CTE and additive
DDL: successful audit commit, microsecond revisions, concurrent writers, and
injected audit-failure rollback. Actual UI components with synthetic responses
and built CSS were checked at 1280px and 390px, with no horizontal overflow and
keyboard-operable audit details. No production settings or NXT records were changed.

Before deployment, rerun the full suite, typecheck, build, and release checks.
The additive table follows the existing serialized `ensureAppSchema()` path.
Verify it can be provisioned under the deployment's DB role, then use the normal
exact-SHA deployment verification. A read-only smoke check should show the active
rules and disabled fields. A live settings mutation is separate acceptance, not
required as a deployment smoke test.

App rollback leaves the audit table and saved settings in place. An older app
version does not enforce this revision/audit protocol, so suspend settings edits
during a rollback or mixed-version release. Do not drop audit history as part of
an app rollback. No reporting data migration is part of this phase.
