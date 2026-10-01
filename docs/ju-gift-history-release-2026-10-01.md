# JU Gift History Import Release - October 1, 2026

Status: candidate validated; deployment and live import verification pending.

## Scope

Adds a staff-only, read-only NXT saved-query import into Received Items. Query
31053 is selected for JU configuration, not a shared application default. The
updated Action query lacks a constituent system-ID output; optional bounded
Action Get checks resolve authoritative recipients. All import steps are explicit
and checkpointed. The app never writes NXT, sends gifts, or deducts stock.

Source keys, corrections, actor/connection binding, active permissions, leases,
version checks, and transaction audits prevent duplicate or unauthorized writes.
App receipts continue using their existing request workflow. An additive schema
adds source metadata, import progress, and audit tables. Imported rows have no
invented assistance request and remain staff-only. Older application rollback
may hide imported rows but does not erase history or reverse this schema.

## Validation

- Full suite: 5,421 passed; 148 opt-in tests skipped.
- Disposable local PostgreSQL: 50 assistance/receipt/import tests passed.
- Typecheck, production build, and whitespace check passed.
- Final release guard and production checks pending.

Previous JU release: 412c903e86c4ee829bda52fd4e6ce38972906112,
dpl_Bdj75XDUZKEp6ARWxURsMafrTtNa. Deployment uses a clean Git archive and explicit
JU Vercel project. No Git push, sandbox deployment, persistent environment changes,
or cron changes are authorized by this release.
