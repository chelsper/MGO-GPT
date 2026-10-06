# JU Import Review Overview

## Scope

Release the streamlined constituency import review to JU only. One filterable
overview separates new records, eligible updates, exceptions, completed records,
and skipped records. Prepared changes show contact types, primary choices,
replacement targets, and full address values. Exceptions open first; explicit
saved-row links retain their target. Unsaved edits block navigation and approval.

Bulk update selection starts empty and excludes new candidates, incomplete
checks, uncertain outcomes, and previous attempts. Creation remains separately
approved. Existing server write checks, recovery, duplicate protection, and audit
history are unchanged. No migration, dependency, environment, schedule, sandbox,
or PDF converter change is included.

## Implementation Verification

- 5,684 automated tests passed; 166 skipped. 433 test files passed, 12 skipped.
- Typecheck, production build, release guard, and diff checks passed.
- Desktop and 390px mobile browser checks passed with fictional records and
  external requests blocked. No clipping or browser errors were found.
- Tests cover separate groups, exact eligible bulk row IDs, cancelled approval,
  unsaved-edit protection, completion verification, and preserved recovery.
- No live imports or NXT writes were performed.

## Release Procedure

Deploy a clean archive of the intended commit directly to JU project
`prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`, root `apps/web`, with its web manifest and
without a Git push or automatic domain promotion. Check startup, version,
entry assets, and the new import bundle before promotion. Verify the live
release and unauthenticated import boundaries afterward.

Rollback target: application commit
`742399479fd3b9a5c249a9870e27519b88aa7b30`, deployment
`dpl_C9bgAksV7CECg2AmJ2BQLrHWiSKK`.

Pre-release sandbox deployment: `dpl_ADQWFXbZ8dbdC7zEKEVEq3ySjjjc`.
Other app copy: `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`.
Preserve JU's five cron paths/schedules and existing PDF settings. Keep unrelated
local work out of the release archive. Record the final deployment and checks
below only after verification.
