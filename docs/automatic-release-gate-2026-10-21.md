# Automatic JU Release Gate

## Scope And Activation

Prepared and deployed October 21, 2026; GitHub enforcement activated October 22.
JU production runs the verified
release `51c77829860643cc0c319c1eb37b5ab5983c0d35`, deployment
`dpl_3zU6uv9La3C7Vcef18AHuhvk1Qcd`. Repository synchronization does not replace this
live deployment. No database repair or live NXT write was performed.

The checked-in build path runs the gate automatically. GitHub now requires the
exact `JU release gate` check from GitHub Actions (app ID `15368`) on `main`, with
strict/up-to-date checking and enforcement for administrators. Pull requests are
required, with zero required approvals so a sole developer is not locked out.
Force pushes and branch deletion are prohibited.

With the user's October 22 approval, the duplicate `mgo-gpt-y1r7` project's Git
connection was removed. Its existing production deployment, protection, cron
configuration, and domain-assignment setting were verified unchanged. It no
longer builds from repository pushes. The JU project's Git connection remains,
but `autoAssignCustomDomains` is false: Git builds must not silently replace the
tested production release. Use explicit checked promotion for future releases.
The conference sandbox and PDF converter were not changed.

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

The exact `JU release gate` check is required on `main` and is bound to the
verified GitHub Actions app, not an arbitrary status publisher. The workflow also
supports merge-group events if a merge queue is introduced. Enforcement was
verified with a deliberately failing PR using only fictional test data.

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
created or promoted during the initial implementation.

## Hosted Release Verification

The first hosted candidate, `dpl_B5TKdhZHAmfokDhcgLUcKWnoBHMd`, was blocked by
four pipeline UI tests on Node 24. The simulated browser's `AbortSignal` was being
passed into Node's native `Request` constructor, which rejects signals from the
jsdom realm. The test transport now handles browser cancellation independently of
the server request. Three additional regressions cover preserved request fields,
already-aborted requests, and in-flight cancellation without handler replay. No
test was skipped or weakened, and production stayed on the previous good release
until the corrected candidate passed.

The corrected hosted Node 24 build passed **1,272 tests in 56 files, none skipped**,
route type generation, TypeScript, the production build, and source verification.
The same complete build also passed locally. The staged candidate's exact commit,
public build receipt, runtime version, sign-in page, Okta provider, JavaScript
assets, protected API denials, and retired proxy were verified before promotion.
The checked promotion command repeated candidate checks and verified the live
domain afterward.

Post-release checks confirmed the authenticated campaign dashboard renders,
current and sampled older unique deployment URLs remain behind Vercel protection,
anonymous export APIs return non-cacheable 401 responses, and stale deployment
pins do not bypass export authorization. All five cron paths and schedules remain
unchanged and now target the new deployment. The duplicate project retained its
existing production deployment and Git settings. No real Okta login exchange,
NXT writes, email sending, or donor-data mutation was exercised in these checks.

## GitHub Enforcement Verification

On October 22, [release PR #2](https://github.com/chelsper/MGO-GPT/pull/2) published
the source already deployed to JU and the release workflow. The first
[GitHub Actions run](https://github.com/chelsper/MGO-GPT/actions/runs/39806341556)
passed the Node 24 dependency install, mandatory tests, type checks, production
build, and report upload. The GitHub check-run API identified its source as
`github-actions`, app ID `15368`, before that exact check was required on `main`.
GitHub then reported the release PR's merge state as `CLEAN`.

[Validation PR #3](https://github.com/chelsper/MGO-GPT/pull/3) added one deliberate
failure in an existing mandatory test suite, isolated on
`codex/ju-enforcement-proof`. Its
[GitHub Actions run](https://github.com/chelsper/MGO-GPT/actions/runs/39806827376)
failed specifically on that assertion; GitHub reported `mergeStateStatus: BLOCKED`.
The PR was closed without merging. No merge attempt, admin bypass, fake passing
status, or temporary weakening of branch protection was used to test enforcement.

The default branch previously lagged the deployed source. PR #2 reconciles that
history so new branches inherit the gate rather than waiting for a nonexistent
workflow. Only committed source is published; unrelated dirty workspace files
are not included. The main-domain production release remains the separately
verified deployment above, even when GitHub or Vercel builds a newer commit.
