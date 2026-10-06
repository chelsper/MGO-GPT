# Reusable Import Setups

## Scope

Prepared locally for the JU constituency import workflow. Not deployed as part of this implementation. No production database, NXT constituent, sandbox, email, cron, or environment settings were changed.

- Personal, database-backed setups for active Admin and Advancement Services accounts.
- Save, rename/update, remove, and explicitly load setups across browser sessions/devices.
- Reusable field mappings, import intent, contact inclusion, default contact types, name-format configuration, and supported operations.
- Editable CSV mappings, visible unused columns, missing/duplicate-column blocking, explicit IDs for update-only setups, and fresh per-file primary/contact confirmation.
- No reusable constituent values, matches, replacement IDs, creation approvals, write plans, or row decisions.
- Existing saved import history and NXT creation/update approval paths remain separate and unchanged.

## Deployment Notes

`ensureAppSchema` adds `constituency_import_setups` with a user foreign key, JSON configuration, optimistic revision, and a case-insensitive unique name per user. The change is additive. Rolling back the application can leave the unused table intact; do not delete setups during rollback. No environment variables, dependencies, external services, or scheduled jobs are added.

The shared import field definitions were moved out of the page so the setup API and client use the same supported-field allowlist. `/api/constituency-import/setups` authorizes the authenticated account, never an acting workspace. Updates/removal require the original revision. Another tab's changes require explicitly loading the current setup before overwriting it. List and configuration responses are private and non-cacheable.

The preview route validates setup-based mappings, required IDs, primary flag values, and preparation confirmation before NXT reads or import-run persistence. This is not write authorization; duplicate checks, exact target checks, durable checkpoints, explicit create/send approval, and verification still apply.

## Verification

- Full local suite: 5,720 passed; 170 optional tests skipped.
- Type-check, production build, and Git whitespace checks passed.
- Desktop (1280px) and mobile (390px) controls checked in a headless browser with fictional CSV values, mocked fetch responses, and all external requests blocked. No browser errors or overflow in the added controls.
- Coverage includes owner/role/active-account isolation, sanitized storage, revision conflicts, duplicate names, removals without history changes, exact column reuse, missing/renamed/duplicate headers, default type/primary checks, preparation-only confirmation, reset on new upload, and no NXT calls from setup operations.

Tests do not claim a live database migration or an actual NXT import. On an authorized JU-only deployment, verify the new table and save/reload one configuration-only setup, then delete the test setup. Do not run a live constituent import as a deployment smoke test.

## Release Procedure

Deploy a clean archive directly to JU project `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`, root `apps/web`, using the web Vercel manifest. Do not push Git or deploy the sandbox. Build without domain promotion, verify the candidate's version, page/assets, and unauthenticated API boundaries, then promote that exact candidate.

Rollback: application `92620e62a033c54242cadbcd9667095ac410ca43`, deployment `dpl_8F1NBrCL9qwCzbBZJ3R3x6JHcfnK`. The additive setup table can remain during rollback.

Before this release, sandbox is `dpl_2ErmrZ5uFZvbG3kGYEEodi6k3Brs`; the other app copy is `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`. Preserve both, JU's five cron schedules, and its existing PDF configuration. Record verification below only after deployment completes.
