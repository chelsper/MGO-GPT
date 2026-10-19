# JU FY Pledge Installment Release

Released October 19, 2026. This release includes query 31076 and the separate received-plus-expected projection only. The subsequent counted-amount controls and manual-cash ledger remain local and are not part of this release.

## Identity And Isolation

- Source: `5ae5ab99256d03840ffe4ca6aa53befc5739f205`.
- Deployment: `dpl_3Aqs7kqYdN6S29J1G7HJsHUGvRxJ`.
- Deployment host: `mgo-bnnh2txd6-chelspers-projects.vercel.app`.
- Live: `https://www.jumgogpt.app/reports/dashboards/fy-revenue-goals`.
- Explicit-version link for pinned browsers: `https://www.jumgogpt.app/reports/dashboards/fy-revenue-goals?dpl=dpl_3Aqs7kqYdN6S29J1G7HJsHUGvRxJ`.
- Previous deployment: `dpl_B7KZzcpv9tSc2FrxePFirUPaEosh`, source `2bcf21b5567f9c7a56df80ee2563dea081ab50a4`.
- JU project `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`, scope `chelspers-projects`.

Built from an isolated Git archive, not the dirty worktree. All 1,315 tracked web files matched the source archive; dry-run upload verified 1,456 files and excluded environment secrets, installed modules, builds, and unrelated services. No Git push. Hosted candidate build and smoke checks passed before explicit promotion. Post-promotion project inventory confirmed unchanged settings, all five cron definitions, sandbox deployment and all other project deployments.

## Verification

- Pre-release full suite: 7,147 passed; 192 existing environment-dependent skips.
- Typecheck, build, release-worktree and whitespace checks passed.
- Candidate and live checks confirmed exact commit/deployment identity, dashboard assets, prior campaign/portfolio features, and unauthenticated GET/POST guards (401).
- `verify:prod` matched the exact live source and production environment.
- Signed-in UI displayed the new panel with cash unchanged. All five query output suggestions matched actual metadata.
- First live refresh completed October 19 at 12:38:28 PM Eastern. It verified 14 unpaid installments across 14 pledges, totaling $2,092,000. No partial-result warning or balance error occurred.
- Cash received remained $3,452,296.51. Received plus expected was $5,544,296.51; projected shortfall $955,703.49. These values are point-in-time observations.

The query was executed read-only against NXT and the app saved its source, checkpoints and completed snapshot. No NXT gifts, installment schedules, donor records, appeals or communications were modified. No manual adjustments or additional cash entries were made in production. No database migration was required.

## Recovery

For UI rollback, promote the exact previous JU deployment above. Keep the new pledge snapshot cache intact; it is additive and does not replace either cash-source cache. Do not change the sandbox, credentials or NXT records to roll back this UI. A stale browser pin may require the explicit-version dashboard link; no browser cookies were deleted during this release.

Temporary local verification logs use prefix `/private/tmp/ju-pledge-deploy-`; these are diagnostic artifacts, not required runtime files.
