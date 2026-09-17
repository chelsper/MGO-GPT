# Security And Operational Safety

Reviewed September 17, 2026. The app handles sensitive donor, prospect, fundraiser,
and institutional workflow data. These are operating rules and review boundaries,
not a completed penetration test or compliance certification.

## Credentials And External Ownership

Never commit real credentials, tokens, database URLs, or populated environment
files. Use approved secret management and environment-scoped deployment settings.
Do not share secrets in issues, pull requests, screenshots, email, or chat.

Assign primary and backup owners for GitHub, Vercel/DNS, Neon, Okta, Blackbaud,
and Resend. Grant the minimum access needed. Development should use an isolated
database, approved test accounts, and controlled email recipients, not a copy of
production credentials. There is no global dry-run switch for all NXT writes.

If a secret is exposed, revoke/rotate it, notify the owner, inspect access, and
remove the exposed value from active configuration and repository content. History,
logs, and downloaded copies may still contain it; removing a file is not revocation.
Coordinate any history cleanup without casually rewriting shared release history.

## Authentication Is Not Authorization

Okta/Auth.js sign-in, app admission/roles, selected workspace, and Blackbaud OAuth
are distinct controls. An authenticated user or connected NXT account does not
automatically have access to every workspace, report, or operation.

- Resolve the actual actor and workspace on the server; reject inactive users,
  invalid acting contexts, and stale workspace/version tokens.
- Admins may edit a selected MGO workspace. Preserve the actual author and the
  MGO fundraiser target. Executive-only acting views remain read-only.
- Report audiences are enforced per report. Configuration access is not universal
  published-data access, and display labels/formats are not privacy controls.
- Validate stored NXT IDs for sensitive writes. Do not guess a system ID from a
  Lookup ID, email, name, or reporting alias.
- `AUTH_ALLOW_CREDENTIALS` must equal `false` to disable credentials sign-in under
  current code. Confirm the intended authentication mode with the owner.
- Provision Blackbaud API permissions and scopes for enabled workflows only.
  Inspect actual configuration and provider responses rather than assuming a
  copied scope list grants access or automatically requesting broader access.

See [architecture and permissions](docs/architecture-and-data-ownership.md) for
the role matrix. Role labels and organization settings do not create tenant isolation.

## Donor Data And Logs

Keep provider bodies, contact details, action notes, exports, tokens, and raw donor
screenshots out of public logs and test fixtures. Diagnostics should use restricted,
minimal stage/status information. Sanitize data before sharing incident evidence.

Exports are sensitive even when authorized. Contact columns are opt-in; preserve
spreadsheet-formula neutralization and workspace scoping. Do not replace scoped
caches with global donor caches or persist sensitive response data in browser
storage as an unreviewed performance optimization.

Review retention, access, and cleanup for imports, exports, receipts, and audit
evidence with institutional owners. This pass does not establish a retention policy
or certify encryption/configuration in every external service.

## External Writes And Recovery

Preserve durable creation attempts, write checkpoints, returned NXT IDs, and
original actor evidence. A timeout may follow a successful write; it must not
trigger an automatic duplicate create. Use read-only verification of known IDs.
Do not delete receipts or reset locks to bypass an uncertain outcome.

Keep authorization, duplicate prevention, and provider-call budgets in tests.
Do not use production donor writes or intentional outages as routine test fixtures.
Code rollback does not undo NXT changes or database writes.

Follow the [release checklist](docs/production-deploy-checklist.md). Confirm backup
retention and demonstrate restoration on a disposable database before relying on
rollback promises. Follow-on security review should cover every write path, not
assume older routes inherit the newer reminder/import safeguards.
