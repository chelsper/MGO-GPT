# Legacy NXT Create Safety

Implemented for the September 21, 2026 reliability audit's first finding.
This is a worktree change, not evidence of a production deployment or live NXT
write acceptance. Other audit findings remain open.

## Scope

The shared `blackbaudApiFetch` transport now makes at most one POST attempt per
invocation, even when a caller supplies a retry count. This also affects POST-based
query execution and other create wrappers. GET requests retain bounded retries;
existing PATCH/DELETE behavior is unchanged. OAuth token exchange uses a separate
transport. Import and reminder-action write protections remain in place.

Durable submission claims were added to four older remote-create entry points:

- `POST /api/prospects/[id]/actions`
- `POST /api/prospects/[id]/opportunities`
- `POST /api/submissions/donor-update`
- `POST /api/submissions/opportunity-update` when creating a new remote opportunity

The action route's fallback create variants were removed. A rejected or uncertain
create is never followed by a different create payload. Updating an already linked
opportunity and local-only submissions are outside these new claims.

## State And Duplicate Protection

`nxt_create_receipts` is an additive table in `ensureAppSchema`. Its initialization
is serialized by a PostgreSQL advisory transaction lock. No existing constituent,
action, opportunity, or import data is backfilled or altered by the migration.

Before calling NXT, each protected route must persist a `processing` claim.
The returned numeric NXT ID must be checkpointed as `created` before local workflow
completion. Only after the local work succeeds does the receipt become `complete`.
An ambiguous create becomes `review`. A lost process can leave `processing`; neither
state expires or silently unlocks.

Two immutable unique keys protect the workspace owner's request fingerprint and
provider payload fingerprint for each record kind. A partial unique index also
allows only one unresolved create per owner, kind, and constituent. It blocks
edited retries and competing requests until the first is complete or verified.
Fingerprint checks continue to block an identical create after completion.

This deliberately favors safety over retry convenience. Even a provider 4xx or a
connection failure after claim acquisition remains held. A failure to save the
claim prevents the NXT call. A failure after remote creation retains the guard,
even if the returned NXT ID could not be saved. Never delete or reset a receipt
solely because a user did not see a success response.

## Read-Only Recovery

Protected form errors link to **Saved NXT submissions** at `/nxt-write-recovery`.
Integration Health also links there. It follows the selected workspace and the
same Admin/MGO editing permissions; an Executive viewing another workspace cannot
reconcile its receipts.

1. Opening or reloading the page reads saved receipts only, up to 100 with unresolved
   entries first. It does not call NXT.
2. **Verify existing record only** reads the saved NXT ID, or an existing system ID
   explicitly supplied by the user if no ID was returned. It never creates a record.
3. Verification compares ID, constituent, and the saved create payload's identifying
   fields. Actions include summary, date, category, completion, description,
   opportunity, and fundraisers when supplied. Opportunities include name, purpose,
   status, amounts, and dates when supplied. Missing or mismatched values fail closed.
4. A successful comparison atomically records `verified`, its NXT ID, reviewer, and
   timestamp, provided the receipt has not changed during the read. Fresh processing
   claims cannot be verified while the original request may still be running.

Verification does not recreate local activity, re-run metadata patches, complete
reminders, send email, or claim that those steps succeeded. An administrator must
reconcile interrupted local work separately. If no matching remote record can be
confirmed, leave the submission held for investigation. There is intentionally no
"nothing exists, resend" override: a failed read does not prove absence.

## Boundaries And Release Checks

- These receipts protect new submissions after deployment, not historical writes.
- Claims are workspace-owner scoped. They are not cross-owner semantic deduplication,
  and do not replace the separate import/reminder claim systems.
- Fingerprints cannot identify every semantically equivalent action. Changing
  content after a verified/completed result can represent a new legitimate action.
- Preflight reads and local work before the claim keep their existing behavior.
  This is not a transaction spanning the application database and Blackbaud.
- `complete` means the route finished its local workflow; existing metadata sync
  warnings are still possible. `verified` means only the saved create was found.
- Keep the additive table if rolling back app code. Rolling back the code also
  removes the new create guards and restores the old retry risk.
- Do not copy JU's receipt payloads, database, or connection credentials into the
  conference sandbox. Start from a separate database and separate NXT connection.

Regression coverage includes timeout/5xx transport behavior, missing IDs, concurrent
requests, edited retries, claim and checkpoint failures, interrupted completion,
read-only recovery, ownership, authorization, mismatches, and the recovery UI.

The optional real-PostgreSQL test is
`apps/web/scripts/check-nxt-create-receipts-postgres.mjs`. It accepts only an explicitly
disposable local socket under `/private/tmp/nxt-create-pg.*`, creates a random schema,
and drops that schema afterward. It exercises the actual migration and guard with
mocked provider calls. Eight competing requests must produce exactly one create
callback. It never connects to NXT or a production database.

Before release, run the full test suite, typecheck, build, and clean-release check.
After deployment, use a read-only signed-in smoke check of recovery-page access.
Live write acceptance belongs in the isolated sandbox with explicit authorization,
including interrupted-response verification. Do not use JU records as test writes.

## Worktree Verification, September 21

- Full suite: 309 files, 3,567 tests passed.
- Type checking, production build, and `git diff --check` passed.
- Disposable PostgreSQL migration/concurrency test passed; its server was stopped.
- The preexisting mixed static/dynamic import warning for
  `constituentListRefresh.js` remains unrelated to this fix.
- No production deployment, production data migration, NXT write, or live-write
  acceptance test was performed. The worktree is intentionally uncommitted, so a
  clean-release check is still required as part of the approved release.
