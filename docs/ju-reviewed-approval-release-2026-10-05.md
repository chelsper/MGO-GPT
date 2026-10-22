# JU reviewed-to-approval release - October 5, 2026

## Deployment

- Application commit: `b1c2249bf5d8a92d608d4a02ed11a7e0100d4459`.
- JU project: `mgo-gpt` (`prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`).
- Production: https://www.jumgogpt.app.
- Deployment: `dpl_DkB38suSGTHqv6cqap97KTRiPG6M`, READY.
- Deployment URL: https://mgo-9l33ytsae-chelspers-projects.vercel.app.
- Previous JU deployment: `dpl_3EaEM2RNzo9KS2adVCH3jyXJWguT`.

Deployed from a clean archive of the application commit, using explicit JU
project/team IDs and the existing web cron manifest. The upload dry run was
audited for secrets, local artifacts, donor documents, and converter source.
No Git push, environment change, database migration, or sandbox deployment.

## User-facing changes

The Reviewed filter now states **Recipient review complete** and leads with
**Continue to document approval**. Previously saved drafts use **Continue saved
document approval**. These shortcuts only focus the existing approval area.
**Edit reviewed recipients** is optional, not a prerequisite to approval.

Delivery checks have distinct labels: **Delivery checks passed** and **Delivery
checks need attention**. Prepared documents say **Awaiting document approval**;
approved documents offer **View approved document**. Saved recipient review,
current delivery checks, and exact-document approval remain separate safeguards.
No server validation or NXT-write behavior changed.

## Verification

- Full suite: 5,544 passed, 166 skipped; 423 passed test files, 12 skipped.
- Focused UI/domain/API coverage: 465 passed during implementation.
- Typecheck, local production build, release guard, and diff check passed.
- Fictional write-blocked browser checks covered the approval shortcut, ready-only
  selection, and desktop/390px mobile layout.
- Production `/api/version` returned the exact application commit and deployment.
- Published entry, index, and root JavaScript assets returned HTTP 200.
- Unauthenticated society-letter API access returned HTTP 401.
- Authenticated live smoke check confirmed the Reviewed heading and optional
  editing action; the shortcut focused **Approve letters**.

The live check showed existing saved recipient reviews with delivery checks still
needing attention. Those checks were not run and no recipient choices were saved.
No documents were prepared, approved, or sent; no NXT records were modified.
Live delivery and NXT write operations were deliberately not tested.

The build still reports PDF.js eval and mixed static/dynamic import warnings.
Vercel also reported an unresolved `canvas` dependency warning; the
deployment completed successfully. This release does not remediate those warnings.

## Isolation

Before/after project checks confirmed all five JU cron paths and schedules were
preserved. Project root, runtime, framework, and Git-link metadata were unchanged.
The sandbox and other app-copy production targets remained respectively:

- `mgo-gpt-conference-sandbox`: `dpl_DjwTBKV1P5PptBLibP4oQC9GAK6N`.
- `mgo-gpt-y1r7`: `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`.

The PDF converter project was not deployed or reconfigured. Its project-list
production-target field was null before and after; that field is not evidence of
converter availability. Existing PDF settings and Word/PDF batch limits were not
changed by this release.
