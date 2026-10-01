# Society Letter Dates and Review Window

Implemented October 1, 2026. Not yet deployed.

## Behavior

- Structured mailing addresses use `City, State ZIP`. Existing saved addresses
  are corrected only when they match their known components. Free-form edits
  are not guessed or rewritten. The comma-only correction does not invalidate
  existing recipient review tokens.
- Template sample previews also use the shared address formatter rather than
  a separate hard-coded address. Both the full-address merge field and the
  collapsed native Word address block include the city/state comma.
- Recipient choices stay reviewed through 15 elapsed days after saving. An
  older review retains its edited values and offers a quick re-review. Changed
  membership, source configuration, contact choices, or recipient details still
  require review; routine refresh timestamps and letter dates do not.
- NXT membership and delivery readiness retain their separate 24-hour checks.
  A saved recipient review never grants permission to send or apply appeals.
- New previews already use the current date in the organization's time zone.
  Letter workspace now offers Use today's date for all letters. It refreshes
  the displayed date and, after confirmation, updates the one active uncreated
  postal draft if it has an older date. There is no client-supplied date.
- Updating an older draft requires current eligibility/readiness and unchanged
  letter details apart from date and the comma correction. It drops only the
  draft's document references and approvals, so new documents must be prepared
  and previewed. Saved recipient reviews, history, and stored prior document
  bytes remain unchanged. No NXT writes occur.
- Created, queued-for-appeals, mailed, and emailed history is not redated.
  Date changes do not clear the holding-list filters or current selections.

## Batch Size

Postal document approval remains limited to 10 households, independently of
the 50-recipient review limit. The app prepares documents separately, verifies
every stored document when approving a batch, and enforces a 4 MiB combined
download limit. Larger worklists should be implemented as resumable smaller
batches rather than simply removing these limits. This is an application
safety limit, not a Blackbaud query limit.

## Verification

- Regular suite rerun before release: 421 files and 5,527 tests passed; 164
  opt-in tests skipped.
- Production build, type-check, release guard, and whitespace checks passed.
- Coverage includes the exact 15-day boundary, expiry retaining edits, stable
  tokens after the comma correction, legacy separate address fields, Word
  address/date rendering, date confirmation, stale draft IDs, immutable
  finalized history, fresh-readiness requirements, and preserved UI selection.
- Offline browser checks used the actual page with synthetic data and blocked
  external requests. The date action retained reviewed status and selection.
  Desktop and 390px mobile confirmation layouts fit; the mobile date panel had
  matching 314px client and scroll widths. Viewport reset and preview stopped.
- No production records, NXT appeals, emails, or live letters were changed.
- Follow-up preview regression: two assertions reproduced the missing comma
  in template samples before the fix; 327 targeted document, recipient,
  workflow, finalization, route, and shared-helper tests passed afterward.
