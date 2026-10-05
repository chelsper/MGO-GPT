# JU automatic postal checks release - October 5, 2026

## Deployment

- Application commit: `76133f84650df7388621d4c15e475f31466eaa26`.
- JU project: `mgo-gpt` (`prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`).
- Production: https://www.jumgogpt.app.
- Deployment: `dpl_5evnxiwhxPXUdcD6zEt8b5KtADiT`, READY.
- Deployment URL: https://mgo-ajm535jz6-chelspers-projects.vercel.app.
- Previous known-good deployment: `dpl_DkB38suSGTHqv6cqap97KTRiPG6M`.

Released from a clean commit archive with explicit JU project/team IDs and the
existing web manifest. The audited upload excluded environment files, local
artifacts, donor documents, and converter source. No Git push, database migration,
project setting changes, or sandbox deployment.

## Workflow

Reviewed society-query postal recipients can proceed directly to preparing and
approving documents, without a separate whole-list delivery check. The approval
shortcut is also available in All recipients and filtered views. Optional NXT
preflight is collapsed by default and does not start or resume on page load.

Fresh NXT checks remain automatic before appeal writes for each selected
household, including both members. Restrictions, duplicate letters, exclusions,
hierarchy, exact-document approval, durable receipts, and uncertain-result
recovery remain enforced. Downloads still require confirmed appeal receipts.
No email, PDF conversion configuration, or batch-limit changes.

## Verification

- Full suite: 5,557 passed, 166 opt-in tests skipped.
- Final focused UI/domain/API suite: 348 passed.
- Typecheck, production build, release-worktree guard, and diff check passed.
- Live version endpoint returned the exact application SHA and deployment ID.
- Entry, index, and root JavaScript assets returned HTTP 200.
- Unauthenticated society-letter API access returned HTTP 401.
- Authenticated live workspace showed collapsed optional preflight, the approval
  shortcut in All recipients, and 24 saved reviews ready for document approval.
- The shortcut focused the approval heading without changing selections.

No recipients were selected, edited, refreshed, approved, or sent during the live
check. No NXT writes or production document creation were performed. Known local
PDF.js eval and mixed-import warnings remain; hosted installation also reported
dependency deprecations and install-script policy warnings. Build and smoke checks
completed successfully; dependency remediation was not part of this release.

## Isolation

All five JU cron paths/schedules, root, runtime, framework, build/install project
settings, and Git-link metadata were unchanged. The conference sandbox remained
on `dpl_DjwTBKV1P5PptBLibP4oQC9GAK6N`, and the other app copy remained on
`dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`. The converter project was not deployed or
reconfigured; its project-list production-target field was null before and after,
which is not an availability test of that separate service.
