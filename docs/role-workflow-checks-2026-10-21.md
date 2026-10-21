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

No deployment, schema change, production setting, donor data, mailing status, or
external record was changed by this test work.
