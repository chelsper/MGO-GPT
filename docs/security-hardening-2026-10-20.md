# JU Security Hardening - October 20, 2026

## Status and Scope

Deployed to JU on October 21, 2026 after explicit user authorization. No production
data mutations, NXT writes, emails, appeals, permission changes, hosting access-setting
changes, or Git push were performed. Unrelated working-tree changes were preserved.

The JU production release is application commit `669e7c7` on deployment
`dpl_AMYYAZCp3znwtDPd7HVufQoCt8ux`, replacing `731f6fd` on
`dpl_en7qBdfAqEoM5z7PbjbF7db3t44u`. This is a bounded hardening pass, not a security
certification or evidence that all dependencies are vulnerability-free.

## Urgent Operational Finding

The previous deployment `dpl_HQB8RYYStXn7xNvURobS8z8kkE3Q` still serves both legacy
submission export endpoints anonymously through its generated deployment URL.
Headers-only probes returned HTTP 200, `text/csv`, and public caching headers.
Response bodies were immediately canceled; no donor CSV content was read or saved.
Deploying fixed application code to the main domain did not remove that old deployment.

Current production returned HTTP 401 and `private, no-store` for anonymous exports.
Probes using an old deployment ID in a version cookie or query on the main domain
also returned 401. These probes do not certify every routing variation.

Requested approval to enable JU-only Vercel Standard Protection for generated/older
deployment URLs, retaining normal access through the production domain. Approval is
still pending. Do not delete deployments or enable protection for the production
domain without separate authorization.

Proposed setting, subject to live preflight and confirmation:

```json
{"ssoProtection":{"deploymentType":"prod_deployment_urls_and_all_previews"}}
```

Apply only to project `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY` in team
`team_3IFhURAiYjacqM7q8OIl6z0G`. Preserve all other settings and the five cron jobs.
The app uses relative browser requests; internal report/portfolio calls derive their
origin from the request. The PDF converter uses a separate configured endpoint with
its own token and platform bypass. Do not change that converter's protection or keys.
After approval, verify old URLs are blocked, the JU domain still reaches normal app
login, cron traffic continues, and converter configuration is unchanged. Avoid
calling live jobs or submitting real documents merely to test access controls.

[Vercel Standard Protection](https://vercel.com/docs/deployment-protection) excludes
production domains, unlike the all-deployments setting. Its
[authentication documentation](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication)
documents the API setting and application to existing deployments.

## Historical Evidence Limits

A seven-day project export-log query returned ten request entries, and a targeted
query for the old deployment returned four. Returned old-deployment timestamps
match the initial review probes and this follow-up's headers-only probes. The
retrieved entries contain request path/status/deployment information, but no caller
IP, user identity, or authentication attribution. Log retention and query coverage
are not proof that no other access occurred. Exploitation cannot be confirmed or
ruled out from this sample; retain available evidence and involve the appropriate
security owner if broader historical access records are available.

Local metadata files are permission-restricted and are not included in Git:
`/private/tmp/ju-hardening-export-logs.jsonl` and
`/private/tmp/ju-hardening-old-export-logs.jsonl`.

## Dependency Changes

- Auth.js `0.37.4` to `0.41.3`; React Router packages aligned on `7.18.2`.
- Hono `4.12.7` to `4.13.13`; Hono Node adapter pinned to patched `1.19.15`.
- WebSocket `8.19.0` to `8.22.0`; Lodash/Lodash ES to `4.18.1`.
- PDF.js `3.11.174` to `5.5.207`, removing the old optional canvas/tar dependency
  chain. Modern worker URLs and canvas rendering are supported. Text extraction
  disables evaluation and releases workers/blob URLs on success and failure.
- Vite `6.4.4`, Vitest `3.2.7`, and compatible transitive patches. Scoped AJV 8 and
  QS 6 overrides remove pinned vulnerable versions without changing their major line.
- No forced audit fix, React upgrade, Tailwind migration, or ExcelJS downgrade.

PDF.js `5.6.205` was tested initially but rejected after the follow-up audit identified
a second advisory. The selected `5.5.207` is outside both currently reported affected
ranges, supports Node 20.19+, and passed the repeated PDF tests. See the upstream
[original PDF advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-wgrm-67xf-hhpq)
and [later scripting advisory](https://github.com/mozilla/pdf.js/security/advisories/GHSA-hq66-cqwq-w95j).

Use `npm ci` with the committed npm lockfile and existing `.npmrc`; do not use the
older Bun lockfile for this release. The pre-existing Hono bridge advertises Node
22.20+/Vite 7 peer requirements although this checkout runs Node 20.19.1/Vite 6 with
legacy peer resolution. This pass preserves that bridge and validates its build;
aligning the runtime/build-tool baseline requires a separate migration.

## Remaining Audit Findings

Production dependency audit: **32 entries before, 9 after**. Critical entries fell
from three to zero; seven high and two moderate remain. Counts include dependency
chains, not separate confirmed application exploits.

- `braces` has no patched version in the current audit. Its dependency chain accounts
  for all seven high production entries through micromatch/fast-glob/ts-morph and the
  Vercel build adapter. Reviewed app calls use fixed source-file patterns and trusted
  build configuration, not user-supplied glob patterns. The default not-found loader
  also uses a fixed pattern. Keep untrusted patterns out of these paths; recheck
  upstream fixes and plan replacement rather than suppressing the advisory.
- ExcelJS retains UUID 8. The reviewed ExcelJS calls use `v4()`, while the
  [UUID advisory](https://github.com/uuidjs/uuid/security/advisories/GHSA-w5hq-g745-h8pq)
  concerns buffer bounds in `v3()`, `v5()`, and `v6()`. No affected call site was
  found. Do not downgrade ExcelJS or force a major UUID override solely to clear
  the scanner without workbook regression testing.

Including development tools: **16 entries remain: 2 critical, 9 high, 5 moderate**.
The critical chain is Vitest/Tinypool; additional entries include the Vitest mocker
and Tailwind/PostCSS parser chains. They require a separate tested tooling migration
or upstream fixes. Do not expose the dev/test server publicly or execute untrusted
tests with production credentials. This change does not claim those findings are fixed.

## Verification

- Full suite with isolated campaign/stewardship PGlite enabled: 7,372 passed,
  170 environment-gated skipped, no failures (before the additional Hono context test).
- Separate real PostgreSQL suites: 16 passed, including concurrent startup across
  16 independent sessions and pending-opportunity transaction protections.
- Final focused authentication/PDF rerun: 21 passed, including one added real Hono
  context-middleware check. Combined unique tests executed: 7,389 passed.
- New tests use real Auth.js for old/new/expired/chunked sessions, workspace email
  restrictions, malformed bearer input, and missing secrets. Okta route tests cover
  provider configuration, CSRF, PKCE, and rejecting unsolicited callbacks; discovery
  and storage are mocked, not live Okta/NXT.
- Real PDF.js test extracts and rasterizes both pages of a fictional PDF. Extraction
  cleanup and existing postal-approval tests pass.
- Production-built localhost browser harness successfully extracts text and renders
  two pages using the actual browser worker. Browser tab and local server were closed.
- Type checking, full production build, and whitespace checks passed.

After the separate PostgreSQL run, 154 environment-gated checks remain unrun.
No fresh live Okta exchange, hosted PDF conversion, production import, outbound
email, or NXT write was performed. Existing import, authorization, letter-workflow,
and workbook regression suites passed, but do not replace a controlled live release
smoke test. Test-only PostgreSQL was stopped after verification.

Evidence logs: `/private/tmp/ju-hardening-full-tests.log`,
`/private/tmp/ju-hardening-postgres-tests.log`, `/private/tmp/ju-hardening-typecheck.log`,
`/private/tmp/ju-hardening-final-focused-tests.log`, `/private/tmp/ju-hardening-build.log`,
and the before/after audit JSON files under
`/private/tmp/ju-hardening-*`. No credentials or donor exports are included in this report.

## October 21 Deployment Verification

- Deployed an isolated Git archive of `669e7c70752cc110cbce8fb9ccff23a1e73273c6`.
  All 1,334 tracked web files matched the commit, and all 1,479 upload hashes were
  verified. Unrelated working-tree files were excluded.
- Fresh focused tests: 177 passed. Release preflight passed. The production audit
  remained at nine entries: zero critical, seven high, two moderate.
- Vercel's clean `npm ci` production build passed on its existing Node 24 runtime.
  The candidate was checked before promotion; the main domain remained on the
  previous release until promotion.
- Candidate and live checks confirmed anonymous legacy exports, runtime diagnostics,
  and upload/transcription/business-card handlers return 401 with private no-store
  responses. The retired generic proxy returns 410. Malformed bearer input returns
  401 without crashing. Export response bodies were not retained; no audio or media
  was submitted.
- Sign-in, auth-provider configuration, and anonymous session endpoints responded
  normally. The existing signed-in session loaded Reports and My Dashboards without
  reauthentication. No fresh live Okta exchange was performed.
- Strict live version and synthetic previous-release-cookie checks passed. The
  expected commit, deployment, and assets matched; explicit latest routing worked.
- A bounded 50-request runtime sample contained 43 HTTP 200 responses, six expected
  401 responses, and one expected 410 response. No server errors or database-startup
  conflicts appeared in that sample; this is not a guarantee against future errors.
- All five cron paths, schedules, and enabled state were preserved. Their generated
  deployment hosts advanced to the new release. Future deployment-protection work
  must verify compatibility with those hosts before changing access settings.
- Compared all 12 projects before and after: only JU's production deployment changed.
  JU's root, framework, Node version, build settings, access protection, and skew
  protection settings were unchanged.
- No production import, hosted PDF conversion, report refresh, email, appeal, or NXT
  write was used as a live test. The previously noted environment-gated tests remain
  unrun. The old-deployment access gap still awaits separate approval.

Release evidence is under `/private/tmp/ju-hardening-*`, including
`deploy.log`, `candidate-smoke.log`, `live-smoke.log`, `live-version.log`,
`release-smoke-tests.log`, and permission-restricted `runtime-smoke.jsonl` and project
snapshots. These local files are not part of the release or committed documentation.

## Remaining Release Follow-up

1. Resolve the old-deployment access gap only after the separate hosting approval,
   including cron and PDF access compatibility checks.
2. Use controlled fictional data for any additional live integration tests; do not
   use a production import, real letter, or NXT write merely to test the release.
3. Plan the remaining Vitest/Tinypool and Node/Vite/Hono bridge migration separately,
   retaining regression coverage and checking whether upstream braces fixes exist.
