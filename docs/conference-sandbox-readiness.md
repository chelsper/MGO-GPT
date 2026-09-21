# Conference Sandbox Readiness

Reviewed September 21, 2026. This is the recommended preparation sequence, not
an assertion that a duplicate environment or safety mode has been provisioned.
Production stays connected to its current NXT instance.

## 1. Add An Environment Safety Boundary

Before connecting the duplicate, implement and test deployment-level controls:

- Identify the environment prominently for administrators: Production versus
  Conference Sandbox, with an expected NXT environment identifier.
- Verify the authorized NXT environment and reject an unexpected connection.
  An OAuth environment-selection hint alone is not a security boundary.
- Start the conference copy read-only. Enable only the approved sandbox write
  demonstrations after environment verification; cover every write route, not
  only imports or the new reminder action flow.
- Disable outbound email by default, then optionally allow only approved test
  recipients. A sender-name change is not an email safety control.
- Leave scheduled jobs off initially and validate the effective deployed cron
  manifest before enabling a small, bounded refresh schedule.

These controls are not yet universal in the app. The current OAuth callback saves
the connection and attempts portfolio bootstrap, so connection itself is not a
neutral configuration change. Current source: `api/blackbaud/callback/route.js`.
There is no global dry-run protection for all existing routes.

## 2. Duplicate Code, Not Production Data

Use a separate hosting project, domain, fresh Neon database, and independent
authentication, cron, and Blackbaud secrets. Do not point a preview project at the
production database or copy the production environment-variable set wholesale.
Configure production and sandbox deployment triggers separately so a conference
edit cannot accidentally ship to the production project.

Do not copy users' sessions, OAuth tokens, donor caches, import files, pending
jobs, NXT IDs, write receipts, notifications, or audit data into the demo. Start
with named test users and synthetic donor records. An independent database is
required because organization settings are a singleton, not tenant isolation.

Register the duplicate's exact OAuth callback and authorize the sandbox through
an approved Blackbaud account. Prefer a dedicated demo developer application when
available. An application can connect to multiple environments, so changing the
client ID alone does not prove isolation. See Blackbaud's official
[authorization documentation](https://developer.blackbaud.com/skyapi/docs/authorization)
and [application/environment model](https://developer.blackbaud.com/skyapi/docs/applications).

## 3. Rebind Configuration Deliberately

- Set organization name, logo, visible fundraiser terminology, and approved login
  users. Organization branding does not change authentication domain policy.
- Map each demo fundraiser to the sandbox system ID, not production Lookup IDs.
- Recreate or select sandbox queries and validate record type, returned fields,
  exact system-ID mapping, custom-field categories, descriptions, and write values.
  Query 12033 and other JU identifiers are not portable guarantees.
- Use the existing report layout transfer to copy structure only. Reconnect
  metrics/data sources and select viewers in the sandbox. Do not copy snapshots
  or silently publish new report audiences.
- Leave institution-specific built-ins disabled or out of the demonstration until
  their dependencies are verified. Fiscal year/timezone/currency and some query
  contracts remain release-managed; this is not yet a universal onboarding wizard.

See [developer setup](developer-setup.md),
[organization configuration](organization-configuration.md), and
[report builder](report-dashboard-builder.md).

## 4. Prepare A Small, Reliable Demonstration

Use a few synthetic constituents with clear examples: an open opportunity, a
recent gift/action, a pledge with upcoming and overdue payments, and a next step
with a team discussion. Publish a small starter Metric Library and create a
default dashboard. Prepare one clean new-import row and one deliberate duplicate.

Refresh saved results once before rehearsal. Demonstrate ordinary navigation from
saved results; do not force every portfolio/report to refresh while presenting.
Never replace stale/unavailable results with invented live values. Keep a clearly
labeled recording or screenshots of the synthetic demo as a connectivity backup.

## 5. Rehearse, Verify, Freeze

Test MGO, Admin acting for an MGO, Advancement Services, and Executive views.
Check report audiences, default dashboard navigation, branding, empty states,
duplicate protection, and mobile layouts. Verify approved sandbox writes in that
same NXT environment, including receipt recovery without resending a create.

Record the exact deployment SHA, test evidence, expected environment, approved
demo record IDs, and rollback release. Freeze new feature work 48-72 hours before
the conference; only fix presentation blockers. Do not schedule synthetic-data
resets that can affect production or erase evidence of uncertain writes.
