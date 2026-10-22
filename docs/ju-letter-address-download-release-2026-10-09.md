# JU Letter Address and Download Recovery Release

Released October 9, 2026, approximately 4:47 PM Eastern, to JU only.

- Application commit: `e29e65de99a03ddf64240bb629a5c463723f4c3e`.
- Final deployment: `dpl_DJYvxvAvghicJAkAGc4vLSrebAPj`.
- Live site: https://www.jumgogpt.app.
- Candidate: https://mgo-708xzmnd9-chelspers-projects.vercel.app.
- Earlier release in this operation: `30e9a2f9f67251fa9621a322896b6d81c23f88bb`,
  `dpl_EPG99cXwM5t8aNyJ1KUQCizX34W1`.
- Pre-operation rollback: `dpl_BwBgtnb4JJEKhM1LeJWZKmGgfbZv`, application
  `d471b3b13d429ff4c2b020af3a539af9ae2a3693`.

## Changes

Organization address matching now accepts an optional leading organization name
only when it matches the freshly verified organization that owns the address.
Street, unit, ZIP, address validity, and communication restrictions remain checked.
Approved documents and recipient choices are not rewritten.

Completed-letter subset downloads include prepared and already-mailed letters.
Blocked neighbors no longer hide the completed download controls. Mailing still
includes only selected prepared letters and requires separate confirmation of
physical dispatch. Downloading does not mark anything mailed.

The workspace can detect an older client release and offer an explicit update.
Its reload handler clears only framework version pins, never authentication
cookies, and accepts only the Society Letters return destination. Hosted checks
exposed that Vercel consumes the reserved `dpl` query parameter before the handler;
the final release uses a separate `expectedDeployment` validation parameter.
Both successful and rejected reloads are now covered by hosted smoke checks.

## Verification

- Final full suite: 6,404 passed; 193 opt-in skipped. This includes 26 isolated
  PGlite letter database tests. The skips include unrelated PostgreSQL suites
  and the hosted PDF test; they are not claimed as passing.
- Typecheck, release-worktree checks, and the final hosted production build passed.
- Exact committed web files were compared with the tested workspace and released
  from isolated Git archives. No shared-branch push or unrelated changes included.
- Candidate and live checks passed: release identity, main pages/assets,
  completed-download UI, embedded public commit, unauthorized API rejection,
  invalid reload rejection, and successful reload redirect.
- A synthetic old-cookie request returned 303, cleared only the three expected
  `__vdpl` paths, and preserved the requested history view.
- Vercel before/after inventory confirmed only JU's production identity changed.
  Sandbox deployment `dpl_GeiPFGgbaBEYVvM2HW2GeD3TcK2t`, other projects, schedules,
  project settings, and PDF settings remained unchanged.
- The user's browser was verified on the final deployment pin and letter asset
  `/assets/page-DE2c1ZtV.js`. Both completed-subset ZIP buttons were enabled: one
  for the single completed letter in the newer mixed batch, one for four in the
  older mixed batch. No download or mailing button was pressed.

The automated browser reported a client-blocked redirect during the reload. Its
cookie inspection nevertheless confirmed the final deployment pin; returning
normally to letter history loaded the verified final asset and controls. No browser
security setting was disabled and no login cookie was manually changed.

An independent synthetic stale-session gate still fails its "all old sessions are
current" condition: an explicit old pin can serve its old deployment. Explicit
latest routing succeeds, and this user's final browser was checked separately.
Do not report this as a fleet-wide forced upgrade. Older releases predating the
notice require a coordinated reload; retiring them through Vercel's skew threshold
was not authorized or performed.

## Remaining Work

The read-only audit found seven completed saved documents, but the user confirmed
only two actual downloads. Three organization-address holds need the existing
saved-letter continuation to recheck them under the fix. Two communication-code
holds still require staff review. Eight further letters remain pending after a
batch stopped at a held household. Deployment does not complete those writes.

Six letters were marked mailed by the user while attempting downloads. No status
was corrected by the agent. Stored mailing status is not download evidence or
proof of physical dispatch. All seven completed document byte streams and their
per-batch ZIP assembly had already been validated in memory without downloading.

No appeals submitted, emails sent, documents regenerated, mailing statuses changed,
source queries refreshed, schema migrated, or PDF credentials rotated. Hosted PDF
conversion and real NXT writes were not exercised by this deployment verification.

Local evidence: `/tmp/ju-letter-recovery-deploy-*`,
`/tmp/ju-letter-reload-routing-full-tests.log`,
`/tmp/ju-letter-reload-routing-typecheck.log`, and the earlier read-only audit logs.
These temporary logs are not public release assets.
