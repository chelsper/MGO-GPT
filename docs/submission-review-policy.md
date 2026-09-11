# Submission Review Policy

Routine donor/activity logs and opportunity updates do not require Advancement
Services approval. A legacy `Pending` or `Ready for CRM` value alone is not work.

## Queue behavior

- Verified `synced` or `success` activity appears in History as **Synced to NXT**.
- Routine logs with `not_requested` or no sync status appear in History as
  **Saved in app**. The UI explicitly says NXT sync is not confirmed.
- An explicit sync failure or nonblank sync error always remains actionable,
  even if the saved review status is Approved or the sync status says synced.
- Unfinished or unknown sync states on routine activity remain visible for NXT
  follow-up. Approval cannot resolve them; reviewers may save notes.
- Existing clarification questions remain in Waiting on requester. The owner
  can answer them, and the reviewer receives the response notification.
- Constituent suggestions and legacy donor updates marked Data update,
  Assignment request, or Add to top prospects keep their review workflow.
- Separate data requests, list requests, import reviews, and assignments retain
  their existing workflows.

The shared client policy is `apps/web/src/utils/submissionReview.js`. Database
counts and clarification previews use its SQL counterpart in
`apps/web/src/app/api/utils/submissionReviewSql.js`. Update and test both when
changing classification rules.

## Safety boundaries

This is a display and notification-policy change, not a data migration. It does
not approve old submissions, mark unsynced records as synced, or write to NXT.
Original status, notes, and sync evidence remain stored. Routine history no
longer generates approval emails or outstanding-work badges.

The review and resubmit APIs recheck the saved record so stale tabs cannot
reopen or approve history-only activity. Review writes are guarded against
concurrent status/sync changes. These endpoints do not retry NXT writes.
