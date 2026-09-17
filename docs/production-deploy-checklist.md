# Production Deploy Checklist

Reviewed September 17, 2026. Use for an explicitly authorized `jumgogpt.app`
release. Documentation changes alone do not imply permission to deploy.

## 1. Confirm Scope And Environment

- Review `git status --short` and the complete intended diff. Preserve unrelated
  changes; do not stage all files or discard others' work by default.
- Confirm the release commit(s), target branch, deployment project, and effective
  Vercel root. Production is currently `chelsper/MGO-GPT` / `main`, project
  `chelspers-projects/mgo-gpt`, web source `apps/web`.
- Root and web Vercel manifests differ, including cron definitions. Verify actual
  project configuration before changing schedules, install commands, or roots.
- Verify environment scope without printing secrets. A preview/local environment
  must not accidentally use production DB, NXT, or email credentials.
- For schema/configuration changes, agree on compatibility, backup, and recovery
  before release. `ensureAppSchema()` is not a reversible migration framework.

## 2. Validate The Candidate

From a correctly provisioned checkout:

```bash
git diff --check
cd apps/web
npm ci
npm test
npm run typecheck
npm run build
npm run check:release
```

Stop on failures. Do not weaken a test or bypass a guard merely to release.

`check:release` only detects dirty versions of two known experimental paths
(`plugins/layouts.ts` and `src/__create/PolymorphicComponent.tsx` in the web app).
It is not a complete cleanliness, security, test, or deployment review. If work
intentionally changes those files, resolve their release readiness explicitly.

## 3. Record And Publish The Intended Commit

Record the application/release SHA and test evidence. From the repo root:

```bash
git rev-parse HEAD
git status --short
```

Publish only reviewed commits through the authorized release path to `main`.
Never force-push or amend shared release history as part of routine deployment.
Wait for the hosting deployment to finish; a successful push is not a successful
production release. Record deployment URL/ID and previous known-good release.

## 4. Verify Production

From `apps/web`:

```bash
npm run verify:prod -- <expected-commit-sha>
```

This checks the version endpoint and production HTML asset references. Require the
expected SHA before debugging apparent behavior differences. Browser cache refresh
or NXT reconnection cannot fix the wrong deployed commit.

Then perform relevant read-only smoke checks using approved accounts: sign-in,
My Prospects, Follow-ups, and affected reports. Verify actor/workspace labels and
audiences. Opening a cached report is not a test of a successful NXT refresh.

## 5. Separate Live Acceptance From Smoke Testing

Use [the acceptance matrix](mgo-workflow-readiness.md) to select checks. Real NXT
creates, updates, imports, sends, deletes, or failure injection are not routine
post-deploy smoke tests. Agree on the exact test record, operation, and expected
outcome before any live write.

For an approved write, record its returned ID and verification result. If the
result is uncertain, inspect the durable receipt/checkpoint and verify the existing
object. Never resend a create just to see if deployment worked.

## 6. Monitor Or Recover

Check deployment errors and relevant job/receipt summaries without logging donor
payloads or credentials. Confirm scheduled jobs against the effective deployed
configuration, not just a checked-in manifest.

If regression requires rollback, coordinate with the release owner and select the
previous known-good application release, then verify its SHA/assets and read-only
smoke checks. Code rollback does not reverse runtime schema changes, emails, NXT
writes, imports, or receipts. Preserve evidence; do not delete receipts, reset
import attempts, or clear caches indiscriminately. Reconcile external effects
separately using the affected workflow's recovery contract.

Record release owner, SHA, deployment ID/time, checks and outcomes, known risks,
and recovery decision. Backups/restore ability and branch controls must be
independently confirmed; this checklist does not establish them.
