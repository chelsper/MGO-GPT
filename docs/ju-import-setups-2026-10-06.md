# Reusable Import Setups

## Scope

Deployed to JU on October 6, 2026. The additive setup schema is initialized through the existing application schema guard. No constituent import, NXT write, sandbox deployment, email, cron configuration, or environment setting change was performed for this release.

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

Tests do not claim a production setup save/reload/delete round trip or an actual NXT import. A configuration-only round trip remains a follow-up check with explicit approval for a temporary setup. Do not run a live constituent import as a deployment smoke test.

## Release Procedure

Deploy a clean archive directly to JU project `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`, root `apps/web`, using the web Vercel manifest. Do not push Git or deploy the sandbox. Build without domain promotion, verify the candidate's version, page/assets, and unauthenticated API boundaries, then promote that exact candidate.

Rollback: application `92620e62a033c54242cadbcd9667095ac410ca43`, deployment `dpl_8F1NBrCL9qwCzbBZJ3R3x6JHcfnK`. The additive setup table can remain during rollback.

Before this release, sandbox is `dpl_2ErmrZ5uFZvbG3kGYEEodi6k3Brs`; the other app copy is `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`. Preserve both, JU's five cron schedules, and its existing PDF configuration. Record verification below only after deployment completes.

## Verified Release

- Application commit: `1c966eb25036cb123f76e7400b99e592a22de687`.
- JU deployment: `dpl_HHvrNmbdUZqg8eCkkuSaoAkJEwGS`, `https://mgo-996ni76yz-chelspers-projects.vercel.app`.
- Live domain: `https://www.jumgogpt.app`. `/api/version` confirms the application commit and deployment above.
- A clean Git archive matched all 1,131 tested web files. No Git push was used. The candidate was checked before promoting that exact deployment.
- Candidate and live root/import pages and JavaScript assets returned 200. The served import bundle contains saved-setup, editable-mapping, and per-file confirmation controls.
- Unauthenticated setup GET/POST/PUT/DELETE, saved-run GET, and preview POST requests returned 401. No authenticated import or NXT write was used.
- Before/after Vercel snapshots confirm the sandbox and other app copy retained the exact deployment IDs above. JU's root, framework, build/install settings, Git linkage, five cron paths/schedules, and PDF environment identities/batch size were unchanged.
- Signed-in browser verification was inconclusive: the browser continued receiving an older import-page bundle after ordinary and cache-ignoring reloads, while independent live requests served the new bundle. Browser settings and live saved setups were left untouched. Do not describe an authenticated save/reload/delete check as completed.
- Build completed successfully. Vercel retained a non-blocking optional `canvas` resolution warning; this release adds no dependency on it.

Release evidence is retained locally in `/tmp/ju-import-setups-deploy.log`, `/tmp/ju-import-setups-projects-before.json`, and `/tmp/ju-import-setups-projects-after.json`. These temporary files are not required for application operation.
