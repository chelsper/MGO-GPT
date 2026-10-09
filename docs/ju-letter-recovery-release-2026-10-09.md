# JU Letter Recovery Release

Released October 9, 2026 to JU only.

- Application commit: `5340476102b5eb5d1cdf6b2f47c32e12fb33a1c8`.
- Deployment: `dpl_7nxZjgiaSABJpwMjp8NfP7btQ4Uq`.
- Live site: https://www.jumgogpt.app.
- Candidate: https://mgo-96lcrpawy-chelspers-projects.vercel.app.
- Rollback: `dpl_4reoVpUL8f6k5p47dqtCVDkmpS5b`, application
  `765de1130e9de3ba41d2d6a0eb088f8fd3d2f84b`.

Release includes unified saved-pause handling, safe continuation after temporary
failures, recovery guidance appropriate to each failure, and one-click draft
preparation. The completed-letter subset feature is subsequent local work and is
not part of this deployment.

## Verification

- Previously tested exact web source: 6,287 default tests passed; 210 opt-in
  skipped. Focused letters: 1,140 passed, 19 skipped. Local PGlite database:
  17 passed separately. Typecheck, build, and release-worktree check passed.
- Archived exact commit; compared tracked web bytes with tested working files.
  Deployment manifest excluded real environment files, generated builds, and
  dependencies. No Git push or unrelated working-tree changes included.
- Candidate build passed before promotion. Candidate and live smoke checks
  verified release identity, key pages/assets, new preparation/recovery UI, and
  unauthenticated API rejection. Repository production verification passed.
- Vercel inventory before/after confirmed only JU production identity changed.
  Sandbox, other deployments, project configuration, schedules, and PDF settings
  were unchanged. No schema migration or secret change.
- No live letters created, appeals written, recipients mailed, or authenticated
  PDF conversion performed. These checks do not prove external-provider writes.

Evidence: `/tmp/ju-letter-unified-` logs and sanitized project snapshots.
