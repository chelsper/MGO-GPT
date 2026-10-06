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

## Verified Release

Promoted to <https://www.jumgogpt.app> on October 6, 2026.

- Application commit: `92620e62a033c54242cadbcd9667095ac410ca43`.
- Deployment: `dpl_8F1NBrCL9qwCzbBZJ3R3x6JHcfnK`, READY.
- Release rerun: 5,684 tests passed, 166 skipped; 433 files passed, 12 skipped.
  Typecheck, local and hosted builds, release guard, and diff checks passed.
  Existing dependency/build warnings remain unchanged.
- All archived web files matched the tested workspace. The upload excluded
  local environment files, build output, untracked services, and unrelated
  local edits. The effective manifest retained all five JU cron schedules.
- Candidate and live version endpoints matched the expected application SHA
  and deployment ID. Homepage, import page, entry assets, and the import bundle
  returned 200. The served bundle contained the new overview and approval labels.
- Import history and preview endpoints returned 401 without an app session.
  Candidate checks used Vercel deployment-protection access, not app login.
- JU project/root/build settings, PDF settings, Git linkage, and five cron
  paths/schedules were unchanged. Sandbox and the other app copy remained on
  the exact pre-release deployment IDs recorded above.
- No Git push, PDF converter deployment, authenticated import, or NXT write
  was performed. Promotion followed candidate verification; the live domain
  remained on the prior application release until that promotion.
