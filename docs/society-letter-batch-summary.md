# Society Letter Batch Summary (Step 6)

Deployed to JU on September 27, 2026, following the household-appeal release.
Commit: `67409a81dcfefb0329b955eca886238044f18542`.
Deployment: `dpl_CCq1Bx4VCZg1udCf11HJmyuTiUep` (READY).
No new NXT calls, delivery permissions, background jobs, or schema changes.
The existing one-household finalization boundary remains.

## Staff Experience

The final postal-letter confirmation and existing batch preview show letter,
joint-recipient, single-recipient, and distinct constituent-record counts.
Society totals count the letter actually being created, not extra letters for
lower tiers covered by the hierarchy. Larger/unknown household membership is
shown separately rather than guessed as a spouse pair.

Each batch in **Letter history** shows the same counts and separate delivery
statuses: Prepared (not mailed), Mailed, Email sent, queued, needs verification,
and cancelled. A reserved postal letter with incomplete member receipts is
not presented as ready. Email sent means provider acceptance; confirmed
delivery is reported separately and uncertain submissions are not called sent.

Expandable details show exact frozen appeal code, description, system ID,
date, and confirmed/expected household member assignments. They never infer
an NXT appeal from a mailed state or local lower-tier coverage. Legacy letters
without receipt evidence say so. These are saved results, not a live NXT check.

## Selection Accounting

New reservations persist a versioned `selectionSummary` in the existing
delivery payload. Counts come from the same-period saved source, deduplicated
by household, before reservation. They distinguish selected, not selected,
excluded, already covered, and already reserved. No other household's name,
contact information, or IDs are copied into this snapshot.

"Not selected" is the safe interpretation of skipped here: it does not mean
the reviewer explicitly rejected the recipient, that the household is excluded,
or that delivery checks passed. People absent from the saved query are not
counted. Review-queue skips are not retrospectively reconstructed. Older
batches without a snapshot say counts were not recorded, rather than zero.

The server derives these values, includes them in the preview token, and
ignores client-supplied summary values. A changed selection context invalidates
the confirmation. Receipt recovery cannot overwrite the frozen summary.
Counts are informational and never authorize a send or NXT write.

## Validation

Unit and UI tests cover mixed delivery outcomes, partial household appeal
receipts, distinct periods/appeal metadata, missing legacy facts, member-ID
deduplication, selection scope, snapshot consistency, and no requests from
summary interactions. Workflow tests cover both reservation paths, ignoring
tampered client counts, and stale preview rejection. Local PostgreSQL coverage
checks that receipt updates preserve the original selection snapshot.

Browser QA uses fictional local data only, including multiple societies,
joint and single recipients, older email history, and expanded receipt details.
No live NXT writes or emails are used for testing.

September 27 validation: 4,418 tests passed, 30 opt-in tests skipped. The
temporary local PostgreSQL suite separately passed all 11 checks, including
selection-snapshot preservation across receipt updates. Build, typecheck,
release-worktree guard, and diff checks passed. Desktop and 390-pixel mobile
checks confirmed readable collapsed/expanded summaries and an unchanged
disabled final-creation gate until letter preview and approval. Temporary
browser overrides, preview server, and test database were cleaned up.

## Production Release

Production alias https://www.jumgogpt.app verified against the exact commit
and deployment ID. Deployment URL:
https://mgo-2mu7259bz-chelspers-projects.vercel.app

Released a clean commit archive to explicit JU project
`prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`, not the dirty workspace. Dry-run manifest:
988 files, 10,854,348 bytes; only `.env.example`, no secrets, dependency trees,
build output, Git metadata, or local Vercel credentials. No Git push occurred.

Read-only production smoke checks returned HTTP 200 for the society-letter page
and all three root JS assets. The unauthenticated society-letter API returned
HTTP 401. These checks did not create letters, send emails, assign appeals, or
test authenticated live NXT writes.

Pre/post project inventories confirmed the sandbox stayed on
`dpl_ENmzD3EbKu716ignscxABeyh6ZoM` with its Git connection disconnected, and the
other linked copy stayed on `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`. All recorded
cron schedules remained unchanged. This uses the baseline at the start of
this release, not the older sandbox deployment in the prior release note.

Previous JU release: `dpl_8tSWew7K48hr6GUXDZYnmYMkdKiV` / commit
`35346dcb7fe0beef0f304ba455228da639aca483`. It understands household appeal
receipts but does not display these summaries. Never roll back further to
pre-finalization code after real appeal reservations without reconciliation;
preserve all delivery history and NXT assignments.
