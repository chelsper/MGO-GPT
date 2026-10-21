# Automatic JU Release Gate

## Scope And Activation

Prepared October 21, 2026. No deployment, Git push, branch-protection mutation,
Vercel setting change, database change, or live integration write is part of this
implementation. Existing production remains unchanged until an authorized release.

The checked-in build path now runs the gate automatically. The GitHub workflow
starts running only after it is published. A read-only GitHub check found `main`
unprotected; required-check enforcement is not yet active. Activate it only after
the new workflow has run successfully on GitHub, so an unavailable check does not
block everyone. Inspect all repository-connected Vercel projects before any push.

## One Build Entry Point

From `apps/web`:

```sh
npm ci --no-audit --no-fund
npm run build
```

`build` runs the following in order and stops on the first failure:

1. Offline role/workflow tests, including release-gate regression tests. Every
   required suite and assertion must pass; missing, empty, skipped, failed, or
   interrupted checks are rejected. Test credentials are removed and unmocked
   network requests are blocked.
2. React Router route type generation and TypeScript checking.
3. The production React Router build.
4. Confirmation that build outputs exist and source files did not change while
   checks were running.

There is no skip flag, reused passing report, or successful partial mode. A local
lock prevents overlapping builds from overwriting each other's evidence. If a
process is killed, confirm it is no longer running before removing a stale
`apps/web/.vitest/release/build.lock` and starting over. Build output is disposable
and cleared on each fresh run. Developer source and database records are untouched.

Both existing Vercel manifests invoke `npm run build`, so ordinary Git and CLI
source builds use this path. The JU release must still select `apps/web/vercel.json`:
the root manifest has different cron schedules and must not be substituted.

The GitHub workflow is `.github/workflows/ju-release-gate.yml`. It runs on every
pull request, `main` push, merge group, and manual dispatch, without path filters.
It uses Node 24, locked npm dependencies, SHA-pinned actions, read-only repository
permissions, no persisted checkout credential, and no production secrets or deploy
step. Test evidence is retained for 14 days. The workflow does not authorize or
automatically perform production deployment.

## Candidate Verification And Approval

The completed build emits `build/client/.well-known/ju-release-checks.json`.
It contains a source fingerprint, commit SHA, pass indicators, test/file counts,
and completion time, not secrets, donor data, filenames, or detailed test output.
A local build without release metadata has a null commit and is not promotable.
Detailed local evidence remains under `.vitest` and is not published with the app.

For an authorized release, use a clean archive of the intended commit and the
existing private JU project link. Create a staged production candidate with
`vercel deploy --prod --skip-domain`, the explicit web manifest, and matching
`githubCommitSha` metadata and `VERCEL_GIT_COMMIT_SHA` build/runtime values. Do not
use `--prebuilt`, an old build directory, or a build-command override.

Use a current authenticated Vercel CLI. Supply the existing JU automation bypass
through the secure `VERCEL_AUTOMATION_BYPASS_SECRET` environment variable, not a
command-line argument or checked-in file. Never disable deployment protection.
Replace the placeholders below with the actual candidate identity:

```sh
npm run release:verify -- --deployment dpl_CANDIDATE --sha FULL_40_CHARACTER_SHA
```

This reads deployment metadata, restricts the target to the JU project and unique
JU hostname, requires a ready production candidate with the expected commit, and
checks its exact runtime version and passing build receipt. It also checks sign-in
and Okta-provider availability, built assets, anonymous protected-API denials and
non-cacheability, and the retired proxy. All HTTP checks are GET/HEAD; no auth
cookies, donor payloads, refresh calls, NXT writes, or email sends are used.
Redirects are not followed, so the bypass cannot leak to another origin.

After the user explicitly approves this release:

```sh
npm run release:promote -- --deployment dpl_CANDIDATE --sha FULL_40_CHARACTER_SHA --approve-production dpl_CANDIDATE
```

The command repeats candidate checks, rechecks its metadata, promotes only that
deployment in the JU scope, and performs the same read-only checks on the main
domain without a protection bypass. The approval argument must match the candidate;
it records the operator's acknowledgement, not independently authenticated user
consent. Do not run it without the user's actual approval.

If promotion is uncertain or live verification fails, stop and inspect the live
alias/version. The command does not retry promotion, silently roll back, or change
data. For a later retry after inspection, repeat all checks. Continue separate
signed-in smoke tests and scheduled-job/protection verification from the deployment
checklist; this script does not exercise an actual Okta login or database write.

## Hosting And Repository Enforcement

Once the workflow is published and passes, require the exact `JU release gate`
GitHub check for `main` (and merge queue if used), retaining appropriate review and
emergency-recovery controls. Confirm the expected GitHub Actions source when
configuring the required check. Verify the rule with a deliberately failing PR
using fictional data before relying on it.

Do not assume branch protection covers CLI deployments. The build gate and checked
promotion command cover the supported CLI path. A Vercel administrator can still
bypass repo policy, run a different build, or promote an older deployment directly.
Restrict deploy credentials and review Vercel automatic-domain assignment and
Deployment Checks before enabling any automated publishing path. Do not claim
platform-level enforcement until those settings are separately verified.

References: [Vercel build configuration](https://vercel.com/docs/project-configuration),
[staged CLI deployment](https://vercel.com/docs/cli/deploy), and
[Deployment Checks](https://vercel.com/docs/deployment-checks).

## Limits

The receipt is build evidence, not a cryptographic attestation or replacement for
source review. Required suites use fictional data and mocked provider boundaries;
the full test suite, real-browser role journeys, disposable-database tests, and
hosted-converter checks keep their own prerequisites. No missing live-provider
check is counted as passed. Newly published receipt routing, GitHub Actions, and
remote Vercel builds require verification during activation; local tests alone do
not establish their success.

## Local Verification

October 21, 2026: the complete new build entry point passed **1,269 tests in 56
files, with none skipped**, route type generation, TypeScript checks, the
production build, and unchanged-source verification. This adds 67 release-build
and promotion safeguards to the previous 1,202-test workflow set. A real child
process exiting nonzero stopped the build before its production-build step.

CI YAML parsing and checks for event coverage, immutable action pins, read-only
permissions, absent production secrets, and the mandatory build step passed.
Invoking the actual promotion CLI without the matching approval exited nonzero
before any network/hosting command. Whitespace and release worktree checks passed.
The full local run used the installed Node 20.19.1 runtime; Node 24 CI/hosted
execution still needs activation-time verification. No remote candidate was
created or promoted during this work.
