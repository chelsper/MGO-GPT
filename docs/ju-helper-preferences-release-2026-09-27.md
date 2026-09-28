# JU Helper Preferences Release

Deployed September 27, 2026 to https://www.jumgogpt.app.

## Release Identity

- Commit: `fd2346f1bebb26cbc06520af0b4da43a9660a21b`.
- Vercel project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY` (`mgo-gpt`).
- Deployment: `dpl_AXwrGYUGdknNrTRf8eLa9mTn3Cyd`, status `READY`.
- Deployment URL: https://mgo-6d3yii7ps-chelspers-projects.vercel.app.
- Previous release: `7f9885d23dc794ff4f0f9634fe9eb12fa489d6dc`,
  deployment `dpl_5VSe9XnSrLoe62twKLuw5jrSngvF`.

Deployed a clean tracked-file archive to the explicit JU project. No Git push,
database migration, environment-setting change, or sandbox deployment occurred.
Unrelated worktree changes were excluded and preserved.

## Delivered Scope

Organization Configurations > Institution Profile > Dashboard helper & draft
preferences now provides reminder windows, gift thresholds, draft tone, and
optional organization-approved thank-you wording. Existing defaults are retained.
The sample preview uses fictional data. See `dashboard-helper-preferences.md`
for validation, persistence, and safety boundaries. No new automatic messages,
NXT writes, background jobs, or model calls are introduced.

## Verification

- Release rerun: 4,785 tests passed; 51 opt-in tests skipped.
- All 15 dashboard PostgreSQL integration tests passed separately during feature
  verification against a disposable local fixture, not production.
- Typecheck, production build, release guard, and whitespace checks passed.
- Production alias returned the exact release SHA and deployment ID. Entry,
  index, and root JavaScript assets each returned HTTP 200 with nonempty bodies.
- Signed-in production settings loaded successfully. Both new sections expanded;
  defaults were 7/30/30 days, $1,000/$10,000 thresholds, warm conversational tone,
  and blank custom wording. The fictional thank-you preview displayed correctly.
- No settings were edited or saved during the live smoke check. No donor records,
  communications, reminder preferences, or explicit NXT checks were changed.
- The verification tab was closed afterward.
- Before/after snapshots confirmed the conference sandbox retained deployment
  `dpl_3ES2MmNzTHbbvEXriPpm2r2dr7CR` and the other copy retained
  `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`. Their latest-deployment lists were unchanged.

Vercel's install step still reported dependency deprecations (including tar and
uuid) and install-script approval warnings. This release changed no dependencies;
these warnings did not fail the build and need a separate dependency review.

## Next Validation

The prior authorized live pilot found the workspace's recent-gift source
unavailable. Diagnose freshness/source health read-only before adding more helper
features. Then pilot one eligible gift's thank-you starter and manual documentation
check. Do not relax freshness safeguards or force broad NXT refreshes to produce
test candidates. Opportunity conversation and donor-briefing starters have already
been checked in the live workspace without saving or sending anything.
