# JU Stewardship And Campaign Dashboard Release

Deployed October 7, 2026, following explicit authorization to include both the
stewardship workflow and pending campaign-dashboard changes. JU only; no Git
push, sandbox release, NXT query refresh, letter approval, or appeal write.

## Included

- Postal letters use a saved draft for single and batch creation. Prepared
  documents can be approved together without reopening every preview. The
  explicit approval click continues into bounded, resumable NXT checks and
  appeal processing. Returning to the page never starts writes automatically.
- Unchanged approvals survive routine membership refreshes and a new day.
  Actual recipient, template, policy, exclusion, document-integrity, and review
  validity checks remain. The document date stays fixed until explicitly updated.
- Consent responses no longer require an owner field absent from the documented
  response. Partial, conflicting, inaccessible, and uncertain records still block.
  Verified reciprocal spouse-only records remain in the joint letter and duplicate
  suppression; only full constituents receive appeals. The receipt distinguishes
  an inapplicable spouse-only assignment from a confirmed appeal.
- Campaign funds have separate Unassigned and Assigned views with search and
  pagination; assigned funds remain editable. Gift exceptions keep precedence.
- The campaign has Overview, Fiscal years, Five pillars, and Gift detail sections.
  Fiscal-year recognition aggregates the entire published snapshot and preserves
  an unknown-date bucket. Gift-detail filters do not alter campaign totals.
- Committed and Received are explicitly unconfigured. Their definitions and
  complete payment source still require confirmation; no cash or commitment
  numbers are inferred from pledge balances or campaign recognition.

No schema migration, dependency, schedule, environment, or PDF service change.

## Verification

- Full suite: 458 test files and 6,056 tests passed; 14 files and 174 existing
  opt-in tests skipped. Campaign SQL tests used isolated PGlite, not production.
- Typecheck, production build, release-worktree guard, and diff checks passed.
- Git archive matched all 1,185 tested web files. All 29 changed files were in
  the inspected upload; no real environment files or local dependencies included.
- Candidate and live release identity, eight page shells, three JavaScript assets,
  and unauthenticated GET/POST protection for campaign and letters endpoints passed.
- Signed-in live verification confirmed the ten prepared letters and existing
  Blocker document approval were retained, optional previews displayed, and the
  batch approval checkbox was available without opening the remaining letters.
  It was left unchecked. No approval or processing was submitted.
- Signed-in campaign displayed all four sections, FY2019-FY2027 recognition,
  and the unchanged $187,437,125.95 campaign total. Fund views showed 465 unassigned
  and 11 assigned funds; both views were inspected without saving any assignment.
- Existing browser tabs initially reused old HTML; fresh release-tagged URLs
  displayed the new controls. Server identity and public asset checks were current.
- JU root, build/install settings, Git linkage, cron definitions, and PDF setting
  identities were unchanged. Other Vercel project release identities were unchanged.
- Existing optional canvas/dependency warnings remain; hosting build succeeded.

## Release And Recovery

- Application SHA: `7270fb6db370b6745ee1ef4ff16f8a1fe54bc565`.
- JU project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY` (`mgo-gpt`).
- Deployment: `dpl_TEhBXcHRCLE6xVNj9XktfLRjoDtB`.
- Candidate: `https://mgo-lvn168ygm-chelspers-projects.vercel.app`.
- Live: `https://www.jumgogpt.app`.
- Sandbox remained `dpl_H5mHhcYkDbkCZvteAeSSoqkaT2fs` during this release.
- Previous JU / rollback target: `dpl_7xhrQMNrYHqBhwqyZ2Hd9HquyNuj`,
  SHA `c27c91ab879f7084098a63ce845e56df2ebbffb3`.

Pause active postal processing before any rollback. Old code does not understand
the new spouse-only receipt status or v2 draft fingerprint; preserve documents,
approvals, receipts, and reservations and reconcile before resuming. A code
rollback never reverses later staff-authorized NXT writes or letters.

Evidence: `/tmp/ju-letter-workflow-` files `release.json`, `release-tests.log`,
`release-build.log`, `dry.json`, `deploy.log`, `candidate-smoke.log`,
`promote.log`, `live-smoke.log`, `projects-before.json`, and `projects-after.json`.
