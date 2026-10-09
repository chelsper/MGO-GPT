# Society Letter Post-Deployment Verification

Verified October 9, 2026, after JU application release `b03bcc8f60d9f3451efccfa921239a36b6b213d2`. No live appeals, letters, approvals, settings, or deployments were changed during this follow-up. NXT verification was limited to nine GET requests for the configured appeals and the affected household. No token refresh or automatic retries were performed.

## Finding And Local Fix

The final NXT readiness check required every used merge field to be nonempty, while the document renderer correctly permits blank `address_line_2` and `country`. A template using either optional field could render and receive approval, then become stuck before its appeal updates.

Four regression scenarios reproduced this mismatch: each optional field in readiness, and continuation of approved Word/PDF letters. The fix shares the renderer's optional-field classification with the final readiness check. Required merge fields, current preferred-address matching, ownership, restrictions, consent, spouse links, prior appeals, and the exact saved approval remain unchanged. Nine new cases cover the repair plus required-field negative checks. Mocked repeated continuation assigns each spouse exactly once and does not regenerate the document or approval.

This is a preventative fix, not another explanation for the affected production letter: neither current production template uses the optional standalone address fields. The fix is local and **not deployed**.

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

## Next Checks

1. Deploy the narrow optional-field fix through the existing JU-only clean-release process after authorization. Leave sandbox and existing approved records unchanged.
2. On an explicitly authorized continuation of one existing approved household, verify both applicable constituent appeals, their date and compact comments, and the resulting download. Reconcile an uncertain response instead of repeating a POST. Do not recreate the letter to test it.
3. Make the fictional hosted-PDF check a release gate inside an approved protected environment that already has the deployment's credentials. Do not expose secrets or add a public diagnostic endpoint. No recurring job or deployment was created by this audit.

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
