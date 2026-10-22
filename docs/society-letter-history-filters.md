# Saved Letter History Filters

Implemented locally September 28, 2026; not yet deployed. The earlier overview
and postal batch release is recorded in `ju-stewardship-overview-release-2026-09-28.md`.

The Stewardship overview now links directly to ready-to-mail or unfinished
batches. Open drafts still go to the existing approval workspace. Letter history
adds four status buttons and a recipient/society/constituent-ID search using the
already loaded saved history. No additional requests, NXT checks, polling,
document generation, approvals, or mail actions are introduced by filtering.

The overview and history share the same saved-state predicates. Prepared postal
letters with appeal receipts require all members verified and a complete receipt
to qualify as ready to mail. Legacy prepared letters without receipts retain
their existing classification. Cancelled letters appear only in All batches.
Accepted email is counted with mailed/emailed; acceptance is not a claim of
confirmed delivery. Existing per-letter delivery labels remain visible.

History buttons count batches, while the overview's Ready to mail card counts
letters. Mixed batches can appear in more than one status view. Search and status
filters keep each whole batch intact, including pending members; all existing
download, approval, mailing, and duplicate-prevention safeguards stay in place.
An explicit message explains the full-batch scope of actions when filtered.

Only allowlisted view/filter keys enter URLs and navigation history. Recipient
searches stay in memory, not URL parameters or persistent storage. Filters
survive workspace navigation and browser Back. Filter changes replace the current
entry rather than creating many Back steps. New-batch completion resets the
history filters/search so the newly created batch remains visible.

## Validation

- Full suite: 5,063 passed, 99 existing opt-in tests skipped.
- Focused shared-status, overview, navigation, and page tests: 79 passed.
- Typecheck, build, release guard, and diff checks passed.
- Fictional-data browser QA verified direct links, status changes, and member-ID
  search at desktop and 390px widths without horizontal overflow.
- No production letters, appeals, recipients, or permissions were changed while
  implementing this follow-up.
