# Society Letter Dates and Review Window

Implemented and deployed to JU on October 1, 2026.

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

## JU Release

- Application source: `1986feea2160d0a04410a0f64d6241df87a30fcc`.
- Previous JU source: `c09934ff096aacc4bb565fa5b87bfbe6afdd8261`, deployment
  `dpl_5RLLKJgeS5fJLBbYVnaGzo5YpXTA`.
- Clean source archive deployed directly to JU project
  `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`; no Git push, schema changes, or
  persistent environment configuration changes.
- Deployment `dpl_3pYpANuonPdHprKv3fQcb5Tqz58Z` is READY at
  `https://mgo-z3gfxzfqk-chelspers-projects.vercel.app`, aliased to
  `https://www.jumgogpt.app`.
- Production version verification returned the exact source SHA and new HTML
  assets. Unauthenticated society-letter API access returned 401.
- Read-only browser verification confirmed the global date control, 15-day
  review guidance, retained reviewed recipients, and the city/state comma in
  both an existing recipient's editor and the rendered personalized Word
  preview. The editor was cancelled without saving, then the verification tab
  was closed. No live recipient saves, date changes, NXT checks/writes,
  exclusions, final documents, or sends were performed.
- The sandbox remained at `dpl_DjwTBKV1P5PptBLibP4oQC9GAK6N`; the other copy
  remained at `dpl_29oY1mAgmUuZJGGHR9ySSakcJDKp`.
- Existing dependency deprecation, PDF.js eval, mixed-import, and optional
  canvas build warnings were non-blocking. PDF service provisioning, larger
  batches, and compressed PDF output remain outside this release; production
  still reports the private converter as not configured.
