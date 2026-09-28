# Dashboard Gift Source Recovery

Investigated and fixed locally September 27, 2026. Not deployed yet.

## Confirmed Cause

Production metadata was inspected in database-enforced read-only transactions.
No Blackbaud API calls, donor changes, cache writes, or settings changes were made.
The application release was `fd2346f1bebb26cbc06520af0b4da43a9660a21b`.

- The configured application URL is `https://jumgogpt.app`. There is no explicit
  `BLACKBAUD_REDIRECT_URI` or pinned report-refresh account.
- The selected authorized refresh account was user 2; its connection and reconnect
  epoch were unchanged. The inspected pilot portfolio's assignments had refreshed
  at 05:00 UTC that day, within the existing 72-hour requirement.
- At 23:43 UTC, the prior deployment's exact source identity had a complete
  8,209-gift generation, checked at 22:37 UTC, with 17 published gift pages.
  It covered January 1 through September 27 and had no saved error/cooldown.
- The current deployment's exact source identity had instead started a new scan
  at 23:37 UTC and checkpointed 1,000 gifts. Neither JU browser hostname matched
  these source identities. Multiple earlier deployment identities likewise held
  separate completed or partial scans.

`societySourceScope` passed the request origin to `getBlackbaudConfig`. With no
explicit callback, that helper derives a callback from the origin. Cron requests
arrived on the deployment hostname; users arrived on the custom domain. Thus each
deployment changed the source key, and Nellie's custom-domain read could not see
the cron's completed source. This was not evidence of missing donor gifts.

## Fix And Boundaries

Use the validated, server-configured `AUTH_URL` origin when deriving cache
identity. Preserve the explicit callback when configured. The existing user,
connection ID, reconnect epoch, client ID, and subscription fingerprint remain
part of the key. No OAuth redirect or token-request behavior is changed.

Production lacking both a stable application origin and explicit callback fails
closed; invalid configured URLs fail closed. Vercel preview deployments cannot
access this source. The independently configured sandbox retains its own origin,
database, credentials, and connection identity.

All readers and the scheduled worker use this one resolver. No new polling,
dashboard provider calls, broad refresh endpoint, migration, or dependency is
added. Existing source freshness, assignment freshness, gift-type/amount filters,
five-call worker budget, cooldowns, leases, and complete-publication validation
remain unchanged. The shared annual-society reader benefits from the same fix.

## Verification

- Full suite: 4,796 passed; 52 opt-in tests skipped.
- Focused source, gift, documentation, and worker tests: 123 passed.
- All nine source lifecycle PostgreSQL tests passed against a disposable local
  Unix-socket database. The new regression publishes through one deployment host,
  reads a real saved gift from a browser alias, and advances a second deployment
  with the same source and no additional provider calls. Different application
  origins and previews cannot reuse it. Existing reconnect, quota, partial-source,
  lease, and reconciliation tests continue to pass.
- Typecheck, production build, release guard, and whitespace checks passed.
- The disposable database was stopped and the temporary production connection
  settings were removed after read-only inspection.
- Live verification is still pending deployment and a completed canonical source.

## JU Rollout

1. Deploy this fix to JU only through the normal clean-archive process.
2. Let the existing scheduled worker create and populate the canonical source.
   A one-time normal scan is expected because the old deployment-host keys are
   not reused, copied, or inferred. At the observed 20 total fund/gift pages and
   five calls per ten-minute invocation, this is roughly four invocations if
   there are no cooldowns or other delays, not a promised completion time.
3. Read the canonical source's metadata and verify its completed generation,
   timestamps, coverage, and absence of a retry condition. Do not mistake staged
   rows for completed data or relax freshness to make a pilot pass.
4. Open Nellie in an authorized portfolio and verify an eligible gift, then the
   thank-you starter and explicitly requested documentation check. Nothing should
   be sent or written to NXT as an automatic verification step.

Do not delete old source rows as part of this repair. Any later cleanup needs a
separate, reviewed retention policy. Do not pin or reconnect an account, change
OAuth configuration, deploy the sandbox, or force a broad scan to expedite this
verification.
