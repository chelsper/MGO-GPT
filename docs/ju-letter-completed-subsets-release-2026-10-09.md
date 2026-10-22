# JU Completed-Letter Subsets Release

Released October 9, 2026 to JU only.

- Application commit: `d471b3b13d429ff4c2b020af3a539af9ae2a3693`.
- Deployment: `dpl_BwBgtnb4JJEKhM1LeJWZKmGgfbZv`.
- Live site: https://www.jumgogpt.app.
- Deployment URL: https://mgo-kjkza0994-chelspers-projects.vercel.app.
- Rollback: `dpl_7nxZjgiaSABJpwMjp8NfP7btQ4Uq`, application commit
  `5340476102b5eb5d1cdf6b2f47c32e12fb33a1c8`.

## Included

Completed letters in mixed postal batches can be selected for a saved-document
ZIP or combined PDF download and explicitly marked mailed separately. The UI
lists included recipients and omitted counts/names. Whole-batch actions retain
their existing meaning. Incomplete letters retain their documents and reservations.

Dispatch requires physical-mail confirmation, complete saved household receipts,
verified document bytes, a current workspace revision and lease, and an atomic
exact-selection update. Repeated confirmation preserves existing mailed audit
data. Downloads do not mark letters mailed, create letters, or write to NXT.
This release also cancels an existing Team Discussion deep-link timer on unmount.

## Verification

- Prior full suite on this source: 6,329 passed, 219 opt-in skipped. Typecheck and
  production build passed. No tests were disabled to achieve passing results.
- Fresh pre-release focused suite plus follow-up regressions: 1,218 passed,
  2 opt-in skipped. All 26 letter-store database tests ran against isolated
  PGlite. Skipped checks were hosted PDF conversion and supplied-template samples.
- Release-worktree and diff checks passed. Exact committed web files matched the
  tested workspace. Clean upload contained no real environment files, generated
  builds, or dependencies. Unrelated working changes were excluded; no Git push.
- Hosted candidate build passed before promotion. Candidate/live smoke checks
  verified expected SHA/deployment, key pages/assets, new completed-letter UI,
  and authentication protection including the selected-download endpoint.
- Repository production version/asset verification passed. Before/after project
  inventory showed only JU production identity changed. Sandbox, other projects,
  project settings, cron schedules, and PDF configuration were unchanged.
- No migration, credentials change, live document generation, authenticated
  donor download, appeal write, email send, or mailing-status update was performed.
  Read-only deployment smoke checks are not live-provider workflow acceptance.

Evidence: `/tmp/ju-letter-subset-release-tests.log`,
`/tmp/ju-letter-subset-full-final.log`, and `/tmp/ju-letter-subset-deploy-` logs,
manifest, and sanitized project snapshots.

After release, staff can verify one completed-letter download in a mixed batch.
Mark a letter mailed only after its actual postal dispatch. Deployment rollback
does not undo physical mail or any subsequently recorded delivery status.
