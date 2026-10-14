# JU Campaign Write-Offs and Received Reporting

## Release Scope

Future. Made. Campaign only. Original mapped gift amounts remain stored and visible.
Gift amount and Committed equal the original amount less total write-offs, with
approved campaign-only net overrides. Received subtracts current pledge balances
from Committed. Fiscal-year Received is paid to date on gifts originating in that
year, not a payment-date cash ledger. Nothing is written to NXT.

Verified multi-fund gifts distribute whole-gift deductions proportionally using
integer cents. Write-offs are weighted by gross splits; balances by the net splits
after rounding. Totals reconcile exactly. Split-mode queries require split-level
deductions. Conflicting rows, malformed deductions, or unreconcilable allocations
retain the last complete published snapshot. Negative Received is visible for review.

Adding only write-off/balance mappings preserves source identity and assigned funds.
An affected local exception needs review when its write-off changes; balance-only
changes do not invalidate it. Overrides replace net amounts without subtracting
the write-off again. Legacy snapshots have unknown deductions, not verified zeros.

## Verification Before Release

- 164 campaign tests passed, including 41 isolated PostgreSQL tests.
- Full suite: 6,693 passed; 192 existing opt-in tests skipped.
- Typecheck, production build, release guard and diff checks passed.
- Old-view upgrade was tested twice while preserving existing data, assignments
  and exceptions. Publication, partial mappings, empty results, duplicate conflicts,
  proportional rounding and totals across fiscal years/funds/priorities are covered.
- Production build retains existing dependency eval/chunk-size warnings.

## Activation and Recovery

The schema update adds two nullable columns and replaces the reporting view without
dropping historical data. It does not apply financial mappings automatically. After
release, load query 27460's fields, map total write-offs and current pledge balance,
and complete one refresh. Keep the amount mapped before write-offs; do not count a
pledge and its payments as separate commitments. Verify sample gifts and aggregate
totals against NXT before relying on the new figures.

The rollout uses a clean reviewed Git archive, an explicitly linked JU project,
a production candidate without domain assignment, then smoke checks before promotion.
No shared Git push, sandbox release, persistent environment edits or NXT mutation.
Application rollback does not remove the additive schema or undo financial refreshes.
Before activation, unchanged mappings retain legacy totals. If recovery is needed
after activation, preserve the data and review the reporting view and source snapshot
as well as the application version; do not delete imported rows or audit history.

## Verified JU Release

- Application source: `7926a6718a25b93903af19f48731c28937817afe`.
- Production: `https://www.jumgogpt.app`, deployment
  `dpl_9bwkYjc7CTosVyXCMTFCHyfrb87p`, READY and promoted October 14, 2026.
- Candidate URL: `https://mgo-8cgmwdsc0-chelspers-projects.vercel.app`.
- Previous release: `dpl_5tVz8mDnE9UKH5dLznKwvw5UB5pg`, source
  `9b24cbd3669ca35ce9b6fc6cc38ff6a733b2f625`.
- Uploaded a verified 1,393-file clean archive to the explicit JU project. Hosted
  build and candidate checks passed before promotion. No shared Git push.
- Live version matched the exact application SHA and deployment. Synthetic old
  version-cookie checks also reached the current release, including explicit routing.
- Live/candidate smoke checks verified report page shells, 50 JavaScript assets,
  published financial controls and HTTP 401 for unauthenticated campaign, A-Train,
  and society-letter API reads.
- Signed-in JU campaign loaded the new mapping guidance and retained the previous
  $187,512,797.30 snapshot with 87,550 allocations. This exercised the additive schema
  without changing the source settings, allocations, overrides or fund assignments.
- JU settings and its five cron schedules are unchanged. All other project snapshots
  matched; conference sandbox remains `dpl_GZ5Xb6o8Fo7NkhqkrkRXBFhZNSMW`.
- A bounded campaign 5xx log check on the new release returned no entries.

The pre-deployment browser check saw one campaign HTTP 503 on the previous release;
a single saved-data reload recovered without an NXT refresh. Baseline browser logs
also showed React hydration warnings. Their root cause was not established or
claimed fixed by this release. The post-release signed-in campaign read succeeded.

Activation remains outstanding: no live financial-field mappings were saved and no
NXT campaign query refresh was started. Committed/Received correctly remain unavailable
until those mappings and a complete refreshed snapshot are verified. Original data
and the existing recognition total remain visible. No NXT writes or sends occurred.

Sanitized release evidence is under `/private/tmp/ju-campaign-writeoffs-deploy-*`.
