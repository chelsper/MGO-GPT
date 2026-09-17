# Developer Handoff

Reviewed September 17, 2026 against application commit
`7b8ebc6c0dc14edffccfb6a7199a00416065f64c`. This replaces the July handoff.
The application is in active production and handles sensitive donor data.
This records current behavior, not certification of every external configuration.

## Start Here

| Read | Purpose |
| --- | --- |
| [Developer setup](docs/developer-setup.md) | Toolchain, secrets, database initialization, and safe test boundaries |
| [Architecture and ownership](docs/architecture-and-data-ownership.md) | Code map, tables, permissions, and source of truth |
| [Metric definitions](docs/metrics-and-reporting.md) | Fundraising credit, high-value actions, coverage, snapshots, and pledges |
| [Acceptance and known gaps](docs/mgo-workflow-readiness.md) | Role-based acceptance checks and deferred work |
| [Release checklist](docs/production-deploy-checklist.md) | Publish and verify the intended commit safely |
| [Security notes](SECURITY.md) | Credentials, donor data, access, and incident handling |

## Verified Release Baseline

| Item | Baseline |
| --- | --- |
| Production | <https://www.jumgogpt.app> |
| Git repository / release branch | `chelsper/MGO-GPT`, `main` |
| Application source | `apps/web` |
| Hosting / project | Vercel, `chelspers-projects/mgo-gpt` |
| Database | Neon/Postgres through `DATABASE_URL` |
| Authentication | Auth.js/Okta plus separately configurable credentials sign-in |
| CRM | Blackbaud SKY API / Raiser's Edge NXT |
| Email | Resend |
| Deployed application SHA | `7b8ebc6c0dc14edffccfb6a7199a00416065f64c` |
| Deployment ID | `dpl_AjddVaohdqg9rAs3AVfDUuAdQWRN` |
| Release verification | `verify:prod` matched the SHA and assets on September 17, 2026 |
| Automated baseline | 2,614 tests in 232 files passed on September 17, 2026 |
| Other release checks | Typecheck, build, and release checks passed for this application release on September 16, 2026 |

These are dated observations. Re-run checks; do not assume this table always
describes production. This documentation update does not deploy application code.
Start new development from current `main`, not a historical Codex worktree branch.
`apps/mobile` and the root generated/mobile scaffold are not the production web app.

## What Is Working Now

- My Prospects supports Top Prospects ranking, drag/reorder controls, exports,
  and saved-data portfolio views with compact, detailed, and focus modes.
- Portfolio contacts appear from saved data; expanded on-screen details can run
  a bounded contact-only check. Giving, full summaries, and latest activity have
  distinct caches and refresh policies. Missing data is not evidence of no activity.
- Follow-ups & Discussion combines navigation while keeping reminders and team
  discussions separate. Discussion items can create additional next steps.
- Admins can edit selected MGO workspaces. The MGO receives fundraiser credit and
  the signed-in Admin remains the author. Executive-only acting views are read-only.
- Next Steps offers explicit planned versus completed NXT actions, durable
  one-submission-per-reminder receipts, and read-only recovery for known action IDs.
  Planned actions stay incomplete; complete/reschedule that same action in NXT.
- Standard constituency import uses live identity checks, explicit match decisions,
  duplicate checks, durable creation/write checkpoints, and verify-without-resend
  recovery. Clear new records can use the approved safe-additions workflow.
- Import outcomes have their own history, not Work Queue approvals. Ambiguous
  identity/write outcomes still require resolution inside the import workflow.
- Team Standings, configurable dashboards, pledge payments, and multi-MGO Top
  Prospect exports use their documented scopes and saved-data boundaries.

## Non-Negotiable Safety Rules

1. An NXT system record ID is not a Lookup ID. Never guess one from the other.
2. A timeout after a create request does not prove nothing was saved. Preserve
   receipts/checkpoints and verify the existing record before any retry.
3. Do not automatically retry non-idempotent CRM creates or clear their receipts.
4. Resolve permissions from the authenticated user and server-side workspace.
   A supplied workspace ID, report link, or visible button is not authorization.
5. Preserve the last good snapshot on refresh failure. Unknown is not zero.
6. Opening/sorting reports must not become an implicit full NXT refresh. Preserve
   request budgets, leases, cooldowns, and connection/workspace cache isolation.
7. Completing an app reminder is not evidence that an NXT action happened;
   resolving a discussion is also a separate operation.
8. Do not use production donor writes, imports, deletes, or forced failures as
   routine tests. Agree on the exact record and operation before a live write.

## Workflow Documentation

| Area | Detailed contract |
| --- | --- |
| Follow-ups and NXT action receipts | [follow-ups-workspace.md](docs/follow-ups-workspace.md) |
| Admin integration-health page (deployed after the baseline) | [integration-health.md](docs/integration-health.md) |
| Focused UX consistency pass (local, awaiting deployment) | [ux-consistency.md](docs/ux-consistency.md) |
| Portfolio display, contacts, activity pilot | [portfolio-worklist.md](docs/portfolio-worklist.md) |
| Giving cache and overnight maintenance | [portfolio-giving-cache.md](docs/portfolio-giving-cache.md) |
| Standard import and duplicate recovery | [quick-constituent-import.md](docs/quick-constituent-import.md) |
| App/NXT fields and identity rules | [blackbaud-field-mapping.md](docs/blackbaud-field-mapping.md) |
| Pledge query 12033 | [pledge-payments.md](docs/pledge-payments.md) |
| Report builder and shared audiences | [report-dashboard-builder.md](docs/report-dashboard-builder.md) |
| Top Prospect exports | [top-prospect-exports.md](docs/top-prospect-exports.md) |
| Ranking | [prospect-ranking.md](docs/prospect-ranking.md) |
| Work Queue versus history | [submission-review-policy.md](docs/submission-review-policy.md) |

## Access And Ownership Transfer

The product owner and institutional IT should record primary and backup owners
in an approved access register. Do not put secrets here.

- GitHub: development access, release approvers, and branch controls.
- Vercel: project root, domains/DNS, deployments, logs, environment scopes,
  cron configuration, billing, and rollback authority.
- Neon: database roles, development database, backup retention, restore authority,
  and a witnessed restore test.
- Okta: approved callbacks, app assignments, test users, and domain policy.
- Blackbaud: developer application, tenant authorization, API access, callback,
  saved query owners, fundraiser mappings, and scheduled-refresh connection owner.
- Resend: sending domain, verified sender, intended recipients, and billing.
- Named product owner for metric definitions and authorized live acceptance tests.

Access transfer, external branch protections, staging availability, and restoration
have NOT been verified by this documentation pass. Confirm them with the owners;
do not infer ownership or adequate recovery from a successful deployment.

## Suggested First Developer Work

1. Reproduce setup and tests without production data; record missing provisioning
   steps. A complete synthetic sandbox/seed is not yet checked in.
2. Run the acceptance matrix with MGO, Admin-acting-as-MGO, Executive, and Advancement
   Services test accounts. Record expected and observed results, not just a pass.
3. Agree on unresolved definitions before changing calculations, especially
   completed-only high-value actions and multi-fundraiser credit aggregation.
4. Add staging, CI, and recovery work as an explicit project. They are not delivered
   by this handoff package.
5. Refactor incrementally behind tests, starting with My Prospects and shared NXT
   write boundaries. Avoid a rewrite or broad schema cleanup.

## Known Limits

- Family Import remains deferred even though scaffold/routes exist.
- No universal NXT change feed or webhook-based contact invalidation is implemented.
- Latest-activity enrichment is opt-in and budgeted, not an all-workspace real-time
  guarantee. A backlog can take multiple nights.
- Standard import and pledge refresh continuation still depends on explicit browser
  workflow actions; saved checkpoints survive leaving the page.
- Organization settings are a singleton, not multi-tenant isolation. Some fiscal
  dates, queries, labels, and formatting remain institution-specific.
- Schema initialization uses `ensureAppSchema()`, not a versioned migration runner.
- There is no checked-in `.github` CI workflow or general browser end-to-end runner.
  Existing tests mock external services; they do not certify a live tenant's
  permissions, indexing, custom table values, or all production paths.
- Root and web Vercel manifests differ. Verify the effective project root and
  deployed cron list before changing schedules; do not merge them blindly.
- Detailed limitations and acceptance evidence are in
  [mgo-workflow-readiness.md](docs/mgo-workflow-readiness.md).

When changing behavior, update its source-linked contract, tests, and relevant
handoff section in the same change. Keep runtime facts distinct from proposals.
