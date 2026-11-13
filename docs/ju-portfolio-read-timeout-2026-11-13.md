# Portfolio Read Timeout Follow-Up

## Production Evidence

At November 13, 2026, 9:36 AM Eastern, `/api/version` confirmed the import
improvements are already live at `ac17bac4390add875dbdd8429670741a6f1f969a`,
deployment `dpl_EG5dVtPko2Rm3fWsE7c5scMCpJd2`. No repeat import deployment is
needed. The local import hydration tests and notes remain in their separate
worktree; this change does not resolve the inconclusive Chrome console check.

A narrowly scoped database SELECT at 9:37 AM Eastern ran in an explicit
read-only RepeatableRead transaction. Kaye's latest job had four historical
failed attempts, three with confirmed recovery. The remaining attempt occurred
at 5:00 AM Eastern on November 13: `Blackbaud request timed out`, one recorded
call, 8,002 milliseconds, classified as `summary_processing`/HTTP 500.
The previously complete summary was retained without an error marker; the
giving snapshot had not been successfully refreshed since November 8.
No donor identity, payload, credentials, or raw endpoint is recorded here.

## Local Change

The shared API client marks a timeout as safely deferrable only when its own
request deadline aborted a GET. A timeout-like message or a write request cannot
produce this signal. The explicit code and boolean survive the identity
sanitizer and nested current-FY giving route. The app returns HTTP 504 without
inventing an NXT provider HTTP response.

Nightly portfolio processing defers only the recognized read-timeout response,
using the existing pending item, persisted retry count, and job pause. At most
two deferrals are allowed, each at least ten minutes apart. The existing fair
rotation, read reservations, daily limits, cancellation, and subscription
cooldowns still govern continuation; ten minutes is not a promised execution
time. After the ceiling, the item remains failed for investigation.

No immediate transport retry is added for background work. Manual stale/full
jobs, authentication/permission/identity errors, malformed responses, and NXT
writes gain no automatic retry. Good snapshots are retained during deferral.
There is no schema, budget, schedule, access, or timing-warning UI change.

## Recovery Boundary

This patch does not retroactively reset failed items or rewrite job history.
Kaye's saved attempt was investigated, not retried or declared recovered.
After an approved deployment, use a deliberately scoped read recovery or let
the existing nightly scheduler select due work, then check saved evidence again.
Do not use a broad full-portfolio refresh or clear failure counters to conceal
the old attempt. No live NXT read/write or production mutation was performed
during this investigation.

## Verification

Offline regressions cover real abort deadlines, write-method exclusions,
unknown timeout text, nested error propagation, identity sanitization, bounded
deferrals, manual-job exclusions, retained snapshots, and successful continuation.
The mandatory workflow gate passed 2,900 tests across 156 files, none skipped.
The full release build repeated that gate and passed route generation, type
checking, and the production build at 9:46 AM Eastern on November 13. Its local
receipt has no release commit assigned; protected CI and hosted release checks
remain required before promotion. No schema change or database mutation is part
of this patch. Local validation is not proof that the live record has recovered.
