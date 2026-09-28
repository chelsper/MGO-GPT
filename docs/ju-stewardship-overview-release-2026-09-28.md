# JU Stewardship Overview and Postal Approval Release

Deployed September 28, 2026 to https://www.jumgogpt.app.

- Commit: `a75959003eac2eb5725291c23861fcbc3420e3e6`.
- Project: `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY` (`mgo-gpt`).
- Deployment: `dpl_DS1vKD2ruyCNqGooxnBKAmU1w8DH`, `READY`.
- Deployment URL: https://mgo-bdvsdi2pa-chelspers-projects.vercel.app.
- Previous known-good deployment: `dpl_HjEB8TFBVXxzJTUoirKgMHgEFdL3`.

The clean archive contained only committed work. No Git push, project settings,
scheduled jobs, dependencies, or persistent environment settings were changed.
The placeholder-only `.env.example` was included, but no private environment
files, desktop metadata, node_modules, or unrelated working changes were uploaded.

The release adds saved postal document approval and a small saved-data overview.
Postal draft/document tables are additive and created with the existing schema
initializer. Existing records and receipts are retained. Word approval is
available; private PDF conversion remains configuration-gated and was not
provisioned or enabled during this release. See `society-letter-postal-batches.md`.

## Verification

- Pre-release: 5,049 tests passed, 99 skipped; 14 temporary PostgreSQL tests
  separately passed. Build, typecheck, release guard, and diff checks passed.
- Remote production build completed. `/api/version` returned the exact release
  SHA and deployment ID. Entry, root, and index assets returned 200 JavaScript.
- Signed-in Stewardship showed saved counts; its Letter history link loaded
  the existing empty history successfully. No membership refresh, readiness
  checks, document approval, letter creation, email, or NXT write was triggered.
- Sandbox `dpl_3qV2sErmJxS7WbA2GJCG4vpbLFKk` and other copy
  `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp` remained unchanged. Sandbox Git is still
  disconnected. All three project configurations matched pre-deploy snapshots.
- Existing dependency deprecation/install-script warnings remain separate work.

Application rollback can use the previous deployment, but must preserve the
new additive tables and any saved documents/receipts. Code rollback cannot undo
letters or external appeal assignments. The later history-filter improvement is
not part of this deployment.
