# Import Field Results

Status: implemented locally; not deployed. JU production and the sandbox were not changed by this work.

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
