# Developer Setup

Reviewed September 17, 2026 for application commit `7b8ebc6`. This describes the
current setup, not a newly implemented sandbox or provisioning script.

## Toolchain And First Checks

The release was tested with Node `20.19.1` and npm `10.8.2`. These describe the
baseline; the repo does not yet pin a complete developer runtime. Agree on runtime
upgrades in a separate tested change rather than upgrading major versions at setup.

Start from a fresh checkout of current `main`. The production package and lockfile
are in `apps/web`; the root package is not the web app.

```bash
cd apps/web
npm ci
npm test
npm run typecheck
npm run build
npm run check:release
```

Vitest uses `vitest.config.ts`, jsdom, and `test/setupTests.ts`. The suite includes
API, domain, and real-component tests; external services are mocked. On September
17, 2026 it passed 2,614 tests in 232 files. Do not inject production secrets into
the test process. Passing tests do not verify live NXT permissions or responses.

The optional `scripts/check-portfolio-activity-postgres.mjs` requires a provisioned
disposable PostgreSQL Unix socket under `/tmp` or `/private/tmp`, `psql`, and
`ACTIVITY_TEST_PGHOST` (optional `ACTIVITY_TEST_PGPORT` and `ACTIVITY_TEST_PSQL`).
It creates/removes its own synthetic schema. It is not a general database seed,
does not use the app's Neon connection, and must not target production.

## Running The App Safely

1. Have the owner provision an isolated development Neon database and approved
   non-production authentication. The runtime uses the Neon HTTP/serverless driver;
   an arbitrary local PostgreSQL URL is not a drop-in full-app replacement.
2. Use `apps/web/.env.example` as a variable-name inventory and populate an ignored
   environment file through approved secret management. Check existing `.env`,
   `.env.local`, mode-specific files, and shell overrides before starting; an old
   override can select the wrong database. Never print their values.
3. Keep production database URLs, NXT tokens, cron secrets, email credentials, and
   callback URIs out of development. Donor database clones require explicit access
   and sanitization approval. There is no global dry-run protection for all routes.
4. Configure the minimum variables below. `AUTH_ALLOW_CREDENTIALS=false` is the
   SSO-only choice; the example currently contains `true`, and code enables
   credentials unless the value is exactly `false`. Authentication changes in a
   shared environment require owner approval.
5. Run `npm run dev` from `apps/web`. The configured port is 4000; the dev server
   binds `0.0.0.0`. For local-only work use
   `npm run dev -- --host 127.0.0.1`; do not expose the server publicly.
6. Use an approved test account and validate its application role. An accepted email
   domain alone does not provision a workspace user. Invitations, existing users,
   and bootstrap settings govern admission.

There is no complete checked-in synthetic dataset, NXT simulator, staging bootstrap,
or automated clean-room setup test. Those are follow-on deliverables. A new developer
should record exact setup blockers instead of substituting production resources.

## Environment Inventory

Names only; never add values or OAuth tokens to this document.

| Group | Variables | Purpose / caution |
| --- | --- | --- |
| Application | `DATABASE_URL`, `AUTH_SECRET` | Isolated Neon DB and environment-specific auth secret |
| Admission | `WORKSPACE_EMAIL_DOMAIN`, `WORKSPACE_BOOTSTRAP_ADMIN_EMAIL`, `WORKSPACE_BOOTSTRAP_ADMIN_EMAILS` | Domain defaults to `ju.edu`; bootstrap entries are privileged provisioning |
| Login | `OKTA_CLIENT_ID`, `OKTA_CLIENT_SECRET`, `OKTA_ISSUER`, `AUTH_ALLOW_CREDENTIALS`, `AUTH_DEBUG` | Approved Okta app/callbacks; keep debug disabled in production |
| Blackbaud | `BLACKBAUD_CLIENT_ID`, `BLACKBAUD_CLIENT_SECRET`, `BLACKBAUD_SUBSCRIPTION_KEY`, `BLACKBAUD_REDIRECT_URI`, `BLACKBAUD_SCOPES` | Separate user connections persist after OAuth; app keys alone do not grant CRM access |
| Built-in query | `BLACKBAUD_FUTURE_MADE_PHASE_TWO_QUERY_ID`, `BLACKBAUD_FUTURE_MADE_PHASE_TWO_QUERY_NAME` | Inspect its route/configuration before changing a saved query |
| Email | `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `SUBMISSIONS_RECIPIENT_EMAIL` | Approved test recipients; do not assume a dry-run email mode |
| Scheduled jobs | `CRON_SECRET`, fallback `REPORT_REFRESH_CRON_SECRET`, `REPORT_REFRESH_USER_ID` or `REPORT_REFRESH_USER_EMAIL` | Actual connection owner and cron authorization; not public client settings |
| Overnight activity | `PORTFOLIO_ACTIVITY_ENROLLMENT_MODE`, `PORTFOLIO_ACTIVITY_WORKSPACE_IDS`, `PORTFOLIO_ACTIVITY_EXCLUDED_WORKSPACE_IDS`, `PORTFOLIO_ACTIVITY_ORIGIN` | Modes: `allowlist` (default), `active_mgos`, `disabled`. IDs are internal workspace IDs, not fundraiser IDs. Exact canonical HTTPS origin required. Exclusions apply to both enabled modes; malformed exclusions fail closed. See portfolio worklist runbook. |
| Deployment checks | `VERIFY_DEPLOY_URL`, `EXPECTED_COMMIT_SHA` | Verification target/version, not authentication |
| Generated integration | `ANYTHING_PROJECT_TOKEN`, `CORS_ORIGINS`, `NEXT_PUBLIC_CREATE_*`, `NEXT_PUBLIC_PROJECT_GROUP_ID` | Compatibility plumbing; inspect callers before removing/configuring |

The example file is incomplete for newer worker controls; use this inventory and
the workflow docs together. `NEXT_PUBLIC_*` may reach the browser and must never
contain secrets. Defaults and optionality vary by feature. Do not copy all production
variables into every environment.

Okta and NXT callback configurations are separate. Confirm the approved origin and
provider callback with the owner. The NXT example uses `/api/blackbaud/callback`;
Auth.js uses `/api/auth` as its base. Do not improvise preview allowlists or widen
permissions to work around setup failures.

## Database Lifecycle

- `src/app/api/utils/sql.js` reads `DATABASE_URL` using `@neondatabase/serverless`.
- Authenticated routes commonly call `ensureAppSchema()`. It runs additive DDL and
  compatibility updates, cached within a worker, not versioned migrations. Auth
  persistence also uses the custom Auth.js adapter.
- Even a nominally read-only page can initialize/change database schema. Never use
  production as a convenient local setup target.
- There is no documented general seed or full restore command. Obtain a disposable
  database rather than manually editing live users, connections, imports, or receipts.
- Schema rollout, backups, and restoration need an owner-reviewed procedure before
  structural changes. Code rollback does not undo database or NXT writes.

## Common Setup Failures

| Symptom | First checks |
| --- | --- |
| Login unavailable | DB/auth configuration, approved callback, admitted test user, auth mode |
| Signed in but NXT inaccessible | Authorizing connection, API access, workspace fundraiser mapping; Okta login is not NXT authorization |
| Reads throttled | Honor saved cooldown/checkpoints; do not repeatedly refresh every portfolio or reconnect |
| Action exists but is unverified | Inspect saved receipt and use read-only verification; never create another as a diagnostic |
| Empty/stale report | Check saved snapshot and refresh outcome before changing the query or treating unknown as zero |
| Unexpected build settings | Current directory, web lockfile, effective Vercel root, ignored environment overrides |

Use [the release checklist](production-deploy-checklist.md) for deployment. Local
setup does not authorize a production deploy or live CRM write.
