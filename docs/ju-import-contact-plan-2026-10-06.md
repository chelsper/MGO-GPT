# JU Import Contact Plan

## Scope

Deploy the contact preparation improvements to JU only. The import page now
shows mapped email and phone counts, explicit inclusion or omission choices,
and a one-click option to include both kinds. File-wide defaults fill blank
contact types without replacing CSV values. Invalid or conflicting primary
flags and unresolved inclusion choices stop preparation before NXT reads or
saved-import persistence. New files do not inherit earlier contact choices.

The existing creation, matching, review, contact recovery, and checkpointed
send safeguards remain in place. Preparation does not authorize NXT writes.
No database migration, dependency changes, environment changes, new schedules,
sandbox changes, or PDF converter changes are included.

## Verification

- Implementation full suite: 5,655 passed, 166 skipped; 431 test files passed,
  12 skipped. Includes isolated contact-recovery PostgreSQL checks.
- Final focused tests: 104 passed, including actual-page upload/preview tests.
- Typecheck, build, release guard, and diff checks passed.
- Real component checked in desktop and mobile headless Chrome using fictional
  contacts, production CSS, and blocked external requests. No horizontal
  overflow or browser errors; inclusion/default/exclusion controls passed.
- No live constituent imports or NXT writes were performed.

## Release Procedure

Deploy a clean archive of the intended commit directly to JU project
`prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`, root `apps/web`, without a Git push or
automatic domain promotion. Verify candidate startup, commit, and assets before
promotion, then verify the live site and unauthenticated import boundaries.
Preserve all five existing cron paths and schedules.

Rollback target: application commit
`d1fbf0ca22bbc90da4d7f4f66fc1673fbe703886`, deployment
`dpl_DATzKdUN3bhHA1cTsE874wo74kmW`. Sandbox should remain at
`dpl_DjwTBKV1P5PptBLibP4oQC9GAK6N`; the other app copy should remain at
`dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`. No converter deployment is part of this
release. Live acceptance of an import requires separate staff approval.

## Verified Release

Promoted to <https://www.jumgogpt.app> on October 6, 2026:

- Application commit: `742399479fd3b9a5c249a9870e27519b88aa7b30`.
- Deployment: `dpl_C9bgAksV7CECg2AmJ2BQLrHWiSKK`, READY.
- Final release rerun: 5,655 tests passed, 166 skipped; 431 files passed,
  12 skipped. Typecheck, local build, hosted build, release guard, and diff
  checks passed. Existing dependency/build warnings remain.
- Candidate version, homepage, import page, and three entry assets passed
  before promotion. The served import bundle contained the new contact-plan
  labels. Candidate checks used Vercel deployment-protection access.
- Live version matched the expected commit and deployment. Homepage, import
  page, and entry assets returned 200; import history and preview endpoints
  rejected requests without an app session with 401.
- JU root/build settings, PDF settings, and all five cron paths/schedules were
  unchanged. Sandbox and the other app copy remained on their prior releases.
  The PDF converter remained at `dpl_7rXAGQ6svuqwCh3ryqbtAxMRzYxL`.
- No Git push, live import, or NXT write was performed. Unrelated local work
  was not included in the clean release archive.
