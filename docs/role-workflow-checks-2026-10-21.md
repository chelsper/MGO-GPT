# Role And Workflow Regression Checks

## Run Before An Authorized Release

From `apps/web`, with dependencies already installed:

```sh
npm run test:workflows
npm run typecheck
npm run build
```

`test:workflows` runs an explicit manifest of component, API, permission, and
service tests. It removes inherited credentials and provider configuration, does
not load `.env` files, and blocks unmocked fetch/HTTP/TLS/socket calls in test
workers. A blocked call fails the test even if application error handling catches
it. Fixtures are fictional; no live NXT update, import, email, appeal, or mailing
status is part of this command.

The command fails on a test failure, missing or empty required suite, skipped or
todo assertion, interrupted run, missing report, or unexpected network attempt.
It deletes its previous report before starting and writes fresh evidence to
`apps/web/.vitest/workflows/report.json` (ignored by Git). Do not use a partial run
or skip a required test to claim the workflow gate passed.

The manifest is `apps/web/test/workflows/manifest.mjs`. Keep new role or workflow
regressions in that manifest; update paths when files move. Gate-validation tests
verify that incomplete results cannot produce a passing summary.

## Covered Contracts

| Area | Expected behavior and protected boundary |
| --- | --- |
| Login | Real Auth.js Okta route with simulated identity metadata; CSRF/PKCE, unsolicited callback rejection, account policies, and role aliases. No live JU login is performed. |
| Workspace/portfolio | MGO owns their workspace; Admin may edit a selected MGO; Executive delegated view is read-only. Forged roles/workspace IDs do not grant authority. Saved grouping, paging, search, and work-queue interactions remain usable. |
| Pipeline | Authorized viewers see all owners. Admin edits/archives; MGO edits only their own or jointly owned opportunities. Advancement Services alone does not gain pipeline edit authority. The actual editor is connected to real routes, report-access checks, ownership validation and synchronization orchestration, with simulated account/storage/NXT boundaries. |
| Pipeline recovery | One simulated PATCH updates all linked copies. Stale edits require reload; uncertain writes remain pending and verify without resubmission. Archives retain records. This does not test actual SQL atomicity. |
| Imports | Admin/Advancement Services entry and API checks; MGO denied even with forged reviewer workspace. Primary contact recovery, per-step checkpoints, ambiguous creates, and partial-failure behavior. |
| Stewardship assistance | Solicitor requests remain workspace-bound; staff management uses the signed-in Admin/Advancement Services identity. Stale versions, forged fields, changed workspaces, and cross-site submissions are rejected. |
| Society letters | Review and recovery controls, CSV generation/tracking, selected completed-letter downloads, combined PDF generation, appeal/finalization safeguards, and stale-release guidance. Export is not mailing or appeal consent. Provider/converter calls are simulated. |
| Dashboards | Configured report audiences and personal-dashboard ownership are enforced by the server, not only hidden controls. Saved views do not silently refresh NXT. |

## Reproduced And Fixed

The workspace resolver previously decoded every browser cookie without handling
malformed encoding. One damaged unrelated cookie could throw `URIError` and break
workspace-backed requests. It now decodes only the workspace-selection value,
handles invalid encoding without throwing, and rejects IDs outside JavaScript's
safe integer range. Role and ownership checks are unchanged. Regression tests also
retain the existing refusal to edit when a selected workspace is unavailable.

## Verification And Limits

October 21, 2026 local result: **1,202 tests passed in 54 files; none skipped**.
This includes 56 new workspace, connected-editor/cross-layer pipeline, and
gate-validation tests. Typecheck, production build, release worktree check, and
whitespace checks passed. The workflow gate finished in approximately 20 seconds.

These are repeatable offline regression checks, not a general browser E2E suite
or certification of production. They do not verify live Okta policies, actual NXT
permissions/availability, the hosted PDF converter, email delivery, or production
database transactions. Disposable-PostgreSQL and hosted-converter suites retain
their separate prerequisites and are not silently counted as passing here.

The command is available locally and documented in the release checklist; it is
not yet a remotely enforced CI/branch-protection rule. A passing result does not
authorize deployment. After a separately approved release, verify its exact SHA
and perform read-only signed-in smoke checks. Any real external write requires a
specific authorized test record and action.

The initial test implementation did not deploy or change production. The separate
authorized release is recorded below.

## Authorized Production Release

October 21, 2026: deployed commit
`81e53fb510c3eb01e60c0de252f87cf4f9f1be3a` to JU as deployment
`dpl_Aq13DuD9kqJiCTWwKD18fLRVqMh2`. Production is
<https://www.jumgogpt.app>.

- Re-ran all 1,202 workflow tests with no skips, typecheck, release worktree, and
  whitespace checks before release. Vercel's clean install and production build
  passed from a verified Git archive, excluding unrelated local work.
- Verified candidate access checks before promotion, then confirmed the exact
  production SHA, deployment ID, and assets. The existing signed-in session
  opened My Dashboards on the new release without reauthentication.
- Anonymous export, upload, transcription, and diagnostics requests remained
  denied. The retired generic proxy returned 410. Sign-in, session discovery, and
  Okta provider discovery remained available; no fresh live Okta exchange ran.
- Older and current unique deployment URLs retained Vercel authentication.
  Existing JU protection, environment, runtime/build settings, and all five cron
  schedules were unchanged. No scheduled job was manually invoked.
- The synthetic previous-release session stayed on the previous secure release
  under existing skew protection. Explicit latest-deployment routing worked;
  automatic convergence of already-open tabs is not claimed.

No schema, donor record, NXT record, email, appeal, mailing status, or user
permission was changed, and no live data refresh or Git push was performed.
Live provider writes and production database transactions remain outside this
smoke check. An unrelated project's deployment metadata changed concurrently;
release commands targeted only JU and did not modify that project.
