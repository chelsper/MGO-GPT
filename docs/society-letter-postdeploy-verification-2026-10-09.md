# Society Letter Post-Deployment Verification

Verified October 9, 2026, after JU application release `b03bcc8f60d9f3451efccfa921239a36b6b213d2`. No live appeals, letters, approvals, settings, or deployments were changed during the original read-only audit. NXT verification was limited to nine GET requests for the configured appeals and the affected household. No token refresh or automatic retries were performed. The separately authorized fix deployment is recorded below.

## Finding And Fix

The final NXT readiness check required every used merge field to be nonempty, while the document renderer correctly permits blank `address_line_2` and `country`. A template using either optional field could render and receive approval, then become stuck before its appeal updates.

Four regression scenarios reproduced this mismatch: each optional field in readiness, and continuation of approved Word/PDF letters. The fix shares the renderer's optional-field classification with the final readiness check. Required merge fields, current preferred-address matching, ownership, restrictions, consent, spouse links, prior appeals, and the exact saved approval remain unchanged. Nine new cases cover the repair plus required-field negative checks. Mocked repeated continuation assigns each spouse exactly once and does not regenerate the document or approval.

This is a preventative fix, not another explanation for the affected production letter: neither current production template uses the optional standalone address fields. The fix was deployed to JU on October 9, 2026, after the additional clean-release checks below.

## Verification Results

- Full default suite: 6,264 tests passed; 210 existing opt-in tests skipped.
- Society workflow suite: 1,117 tests passed; 19 opt-in tests skipped in that run.
- All 17 society-letter database checks passed separately using isolated in-memory PGlite, never the production database. Native multi-process PostgreSQL behavior was not retested.
- Typecheck, production build, and whitespace checks passed.
- Read-only JU database verification found all 10 active saved documents present and matching their approved byte lengths and SHA-256 hashes.
- Both current saved templates rendered fictional individual, household, and organization letters, six documents total, without changing templates or donor data.
- The current membership was approximately 18.7 hours old, with no source/policy readiness blocker at verification time. This is a point-in-time result, not an extension of the freshness window.
- All four configured letter-sent/exclusion appeals matched active, unique NXT catalog entries by lookup code, exact description, and system ID.
- Allana Forte and Brian Branch's saved household passed the current read-only NXT checks for its approved letter. Neither record had the saved letter's appeal assignment at verification time. No attempt was made to add one.
- Current JU production PDF configuration was enabled with a batch limit of 10. A fresh hosted conversion was **not** performed: Vercel redacted the saved production access credentials when read locally. This follow-up does not establish that the converter currently accepts those credentials. Existing local PDF validation/combination tests passed, but they are not a substitute for that protected hosted check.

## Verified JU Release

- Application commit: `765de1130e9de3ba41d2d6a0eb088f8fd3d2f84b`; deployment: `dpl_4reoVpUL8f6k5p47dqtCVDkmpS5b`; live site: `https://www.jumgogpt.app`.
- Only the four intended application/test files and this verification note were committed. No Git push was used. Unrelated worktree changes were preserved and excluded from deployment.
- The clean test archive passed all 6,264 default tests, all 17 isolated database tests, typecheck, and production build. The fresh upload archive matched all 1,215 tracked web files from the tested archive. Its 1,338-file manifest contained all five changed files, no untracked extras, and no real environment files.
- The candidate was pinned to JU project `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`, effective root `apps/web`, and deployed without switching the live domain. Hosted build and candidate smoke checks passed. The prior live release was reverified before explicit promotion.
- Live smoke checks and `verify:prod` confirmed the expected commit/deployment, page shells, assets, and unauthenticated API/download rejection. No authenticated letter processing, appeal submissions, query refreshes, or sends were used as smoke tests.
- Before/after comparison confirmed only JU's production deployment identity changed. The conference sandbox remained on `dpl_GeiPFGgbaBEYVvM2HW2GeD3TcK2t`. Project settings, cron schedules, PDF settings, and all other project deployment identities were unchanged.
- No schema, dependency, environment, or converter-service changes were required. The existing optional `canvas` build warning remained non-blocking. The hosted-converter credential limitation documented above remains outstanding; this release did not claim a fresh live conversion test.
- Previous JU / rollback target: `dpl_77L22mMWACyPSVdkWv35T6EM9qwu`, application commit `b03bcc8f60d9f3451efccfa921239a36b6b213d2`. Reload the browser before continuing an existing approved batch; this fix alone does not require another document or approval.
- Release evidence: `/tmp/ju-letter-optional-` files `release-tests.log`, `database.log`, `typecheck.log`, `build.log`, `dry.json`, `candidate.json`, `deploy.log`, `candidate-smoke.log`, `promote.log`, `live-smoke.log`, `verify-prod.log`, and `project-verification.log`.

## Next Checks

1. On an explicitly authorized continuation of one existing approved household, verify both applicable constituent appeals, their date and compact comments, and the resulting download. Reconcile an uncertain response instead of repeating a POST. Do not recreate the letter to test it.
2. Make the fictional hosted-PDF check a release gate inside an approved protected environment that already has the deployment's credentials. Do not expose secrets or add a public diagnostic endpoint. No recurring job was created by this audit or release.

Passing local tests and read-only checks cannot guarantee NXT write permissions, provider validation, availability, or later record changes. Preserve the existing stop-and-resume behavior rather than bypassing those protections.

## Evidence

Local logs, not release inputs:

- `/tmp/ju-letter-postdeploy-optional-red.log`: four reproduced optional-field failures before the repair.
- `/tmp/ju-letter-postdeploy-audit-tests.log`: focused workflow verification after the repair.
- `/tmp/ju-letter-postdeploy-full-tests.log`: complete default test suite.
- `/tmp/ju-letter-postdeploy-audit-database.log`: isolated database checks.
- `/tmp/ju-letter-postdeploy-typecheck.log` and `/tmp/ju-letter-postdeploy-build.log`.
- `/tmp/ju-letter-postdeploy-audit-live.log`: sanitized read-only production/NXT verification.
- `/tmp/ju-letter-postdeploy-pdf.log`: current PDF configuration and credential-redaction limitation.

The temporary diagnostic script uses read-only database transactions and a bounded GET-only NXT adapter. App database/transport imports are replaced with throwing guards. Rendered samples contain fictional recipients only; production document bytes and credentials were not printed or saved as audit output.
