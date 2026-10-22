# JU Gift History Import Release - October 1, 2026

Status: deployed to JU; query 31053 import completed.

## Production

- Commit: `2aa6f6fa435563b563d29dada19f9966b3c59fcd`.
- Deployment: `dpl_89uEHykDydrH71hhRmKFhtKjW9WX` (READY).
- Production: https://www.jumgogpt.app
- Deployment URL: https://mgo-bs8pyxxd4-chelspers-projects.vercel.app
- Production verification confirmed the exact commit and deployment ID.
- Unauthenticated history-import API access returned 401.
- Sandbox remained `dpl_DjwTBKV1P5PptBLibP4oQC9GAK6N`; the other shared-Git
  copy remained `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`.

All deployments in this release used clean Git archives and explicit JU project
and team IDs. No Git push, sandbox deployment, persistent environment changes,
or cron changes were made.

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

- Full suite: 5,426 passed; 148 opt-in tests skipped.
- Disposable local PostgreSQL: 50 assistance/receipt/import tests passed.
- Typecheck, production build, and whitespace check passed.
- Release guard and production verification passed.

## Live Query Review

Query 31053 returned 834 rows. The reviewed mapping selects 13 catalog gift
categories and excludes six unmatched or non-gift categories. The returned
`Vinyard Vines Tote` spelling is mapped explicitly to `Vineyard Vines Tote`.
Only completed actions with a reviewed gift category are eligible. Recipient IDs
are checked from those selected actions, never inferred from lookup/import IDs.

Receipt dates use Action Custom Field Date, falling back to Action Completed On
only when the first field is blank. Date Added is never substituted. Thirteen
query rows lack a usable date and remain held for review. Each imported receipt
retains its source action, custom-field Import ID, query ID, and date-field basis.

The live app confirmed **344 records added**, with no existing matches or source
conflicts. Four repeated query rows were consolidated; 473 unmatched/non-gift
category rows were excluded. Thirteen undated rows remain visible for review and
were not imported. These counts reconcile to all 834 query rows. All 344 imported
records had their recipient system IDs verified from their completed NXT actions.
No NXT records or inventory availability/stock values were changed.
The Received Items page was verified live with imported-source badges, receipt
dates, recipient/item filters, correction controls, and expandable source details
showing action, custom-field Import ID, query, and date-field basis. Its first
page displayed 50 imported records. The page is left open for the user.

Live verification also caught a client-only comparison error: PostgreSQL JSON key
order was being treated as a changed mapping. The final release normalizes both
saved and current mappings before comparing. A regression test covers key-order
changes and confirms real edits still block importing an outdated preview.
The verified preview survived that deployment without another query or recipient
verification pass. Reconfirming the reviewed mapping enabled the final import.

Previous JU release: 412c903e86c4ee829bda52fd4e6ce38972906112,
dpl_Bdj75XDUZKEp6ARWxURsMafrTtNa. Deployment uses a clean Git archive and explicit
JU Vercel project. No Git push, sandbox deployment, persistent environment changes,
or cron changes are authorized by this release.
