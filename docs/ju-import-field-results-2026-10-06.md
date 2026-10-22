# Import Field Results

Status: deployed to JU on October 6, 2026. The sandbox and other app copy were not changed by this release.

## Scope

- Saved attempted/created rows show separate constituent, field, contact-type, and primary-setting outcomes. Accepted writes, verification, intentional omission, no-op plans, and linked corrections are distinct.
- One next-action control uses existing read-only verification, original history, contact recovery, linked correction, or quick-import progress. It does not initiate an NXT write or grant approval.
- Exported review CSV includes created/target IDs, field outcomes/check times, outstanding fields, next action, and correction ID. Existing audit columns remain. Formula escaping is enabled.
- Old plans are collapsed history. Unsaved edits and active operations disable result actions.
- Verification audits record whether they checked applied values or requested fields/settings. Legacy value-only contact checks do not claim type or previous-primary verification. Standard completion and quick-import identity evidence are both supported.
- Run reads return only allowlisted omitted-contact context derived from exact saved mappings, using the existing authorized reviewer response. No raw upload is added to the response.

No database migration, dependency, scheduled job, NXT write endpoint, or change to send/creation authorization is required. Existing duplicate, identity, concurrency, and uncertain-outcome protections remain.

## Validation

- Full Vitest suite: 437 files passed, 13 skipped; 5,765 tests passed, 170 skipped. Skipped integration/live suites were not run.
- Type checking and production build passed after the final changes. Scoped whitespace/diff checks passed.
- Desktop and 390px mobile UI inspected using the actual import page with fictional local fixtures and external requests blocked. Verified readable results, visible next action, expandable history, and no horizontal overflow.
- Tests cover partial primary updates, verification scope, stale/mismatched evidence, full standard completion, unknown creation, source omissions, linked correction navigation, unsaved-edit locks, and exported formula escaping. Reconciliation tests assert NXT reads only.
- No live import, constituent/contact write, or production setup mutation was performed. The separately requested signed-in temporary setup save/reload check remains pending user approval.

## Release Checks

Deploy only to the verified JU project when requested; do not push to a shared branch or change sandbox aliases. Inspect an existing saved import read-only after deployment. Confirm that a partial import shows its remaining fields and that an existing correction opens the same saved batch. Do not resend or re-import a record as a smoke test. Any controlled live write test requires separate explicit authorization.

## Verified Release

- Application commit: `87698e39e11b24678fc989dfde04929970d765c2`.
- JU project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`.
- Deployment: `dpl_FA563Tyg5deuAdEN6Z6YLJ7sQ6uo`, `https://mgo-qk798exyd-chelspers-projects.vercel.app`.
- Live domain: `https://www.jumgogpt.app`; `/api/version` confirms the commit and deployment above.
- A clean Git archive matched all 1,135 tested web files. No real environment files or local credentials were uploaded. Unrelated working-tree changes were excluded. No Git push was used.
- Built with the web Vercel manifest without domain promotion, checked the candidate, then promoted that exact deployment. Candidate and live root/import pages and JavaScript assets returned 200. The import bundle contains the field-outcome panel, safe next actions, original-plan history, and expanded CSV export controls.
- Unauthenticated saved-setup GET, saved-run GET, and empty reconcile POST returned 401 on both candidate and live domains. No authenticated import or NXT write was performed. Signed-in setup mutations and live import acceptance remain untested by this release.
- Before/after metadata confirms the sandbox stayed on `dpl_Cg3aAihYRK8i7jwbWYMoVwqF6cAm` and the other app copy stayed on `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`. JU's root, framework, build/install settings, Git linkage, five cron paths/schedules, and PDF environment identities/batch size were unchanged. The PDF converter project metadata was unchanged.
- Vercel build succeeded. Existing dependency deprecation/install-script notices and the non-blocking optional `canvas` resolution warning remain; this release adds no dependency.

Rollback: promote the previous JU deployment `dpl_HHvrNmbdUZqg8eCkkuSaoAkJEwGS`, application commit `1c966eb25036cb123f76e7400b99e592a22de687`. Added verification-scope metadata is backward-compatible and can remain. Never delete import history or resend changes as part of rollback.

Temporary local evidence: `/tmp/ju-import-field-results-deploy.log`, `/tmp/ju-import-field-results-candidate-smoke.log`, `/tmp/ju-import-field-results-live-smoke.log`, and `/tmp/ju-import-field-results-projects-{before,after}.json`.
