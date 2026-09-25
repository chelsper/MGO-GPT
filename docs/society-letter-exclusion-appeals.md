# Society Letter Exclusion Appeals

## Behavior

Stewardship reviewers can configure a dedicated NXT exclusion appeal for each
annual society and recognition period. This configuration is separate from
letter-sent appeals. The app verifies lookup codes, exact descriptions, active
status, distinct IDs, and description uniqueness against the complete Fundraising
API catalog. The create endpoint uses descriptions to resolve appeal IDs.

JU's supplied lookup codes and descriptions are:

- `CY26OODEX-MGO`: `CY 2026 OOD Letter Excluded - MGOGPT`
- `CY26PRESSOCEX-MGO`: `CY 2026 Pres Society Letter Excluded - MGO GPT`

These are configuration values, not hard-coded application defaults. Screenshots
of new appeal forms do not prove the appeals were saved in NXT. No production
settings, existing exclusions, or NXT records were changed during implementation.

Once configured, excluding a household requires an explicit confirmation, a
reason, and an editable exclusion date (default organization-local today, no
future dates). The reason is sent verbatim as the appeal comments. The date is the
constituent appeal assignment date, not the appeal definition's start date.

The app chooses the highest qualifying society from the current combined query
snapshot, never a browser-provided appeal or society. Every active annual society
must be represented and membership must be less than 24 hours old. Individuals
and organizations get one assignment; a verified spouse pair gets the same
highest-tier exclusion appeal on both records. No lower-tier appeal is added.
The local exclusion still covers every society for the period, even after an
upgrade or membership refresh. A new non-overlapping period is eligible again.

## Safety And Recovery

- The existing revision/lease lock serializes all operations. The app saves its
  exclusion before any NXT write, so failures do not return recipients to the
  mailing list. Existing app-only exclusions are not silently backfilled.
- All member identities, names, reciprocal spouse links, and complete assigned
  appeal lists are checked before the first POST. Ambiguous records stop writes.
- Existing matching appeal assignments are preserved, including their original
  comments and dates. They are not duplicated or overwritten.
- Each member has durable `pending`, `uncertain`, `verified`, or `existing`
  evidence. The uncertain state is persisted before the POST. No automatic POST
  retry occurs. A successful response must be read back with matching constituent,
  appeal, assignment ID, date, and comments before becoming verified.
- A timeout, process crash, missing response ID, or mismatched read-back stays
  uncertain. Read-only verification may reconcile a single exact matching record;
  an absent or ambiguous record never authorizes resubmission.
- Explicitly rejected POST responses (400/401/403/404/413/415/422/429) stay pending
  for an explicit continuation after correction. Errors during read-back do not
  receive this retry exception. Partial spouse success resumes only untouched
  members after every uncertain result has been resolved.
- Excluded displays per-member progress and verification/continuation controls.
  Restoring an NXT-linked exclusion requires its appeal to be removed manually
  from each member in NXT, then verified absent. The app never deletes NXT history.
  An uncertain submission cannot be restored merely because it is not yet visible.
- Readiness recognizes configured current-period exclusion appeals independently
  of sent appeals. It holds these records rather than marking them acknowledged.
- No letters are generated or sent by this workflow. No letter history is created.
  Existing source-query delivery gates remain unchanged. Sandbox is unaffected.

Persistence is additive JSON in `stewardship_letters.readiness.exclusionPolicy`
and `stewardship_letters.exclusions[].nxt`; no schema migration or new cron is used.
The existing Blackbaud connection, shared cooldown, and reviewer authorization
are used. The NXT Data Integration API must be available to the connected account.

## API Contract

Verified against Blackbaud's official reference on September 25, 2026:

- [Create a constituent appeal](https://developer.sky.blackbaud.com/api#api=nxt-data-integration&operation=CreateConstituentAppeal):
  `POST /nxt-data-integration/v1/re/constitappeals`, with `constituent_id` (int32),
  `appeal_description`, `appeal_date`, and `comments`; response has assignment `id`.
- [Appeal list](https://developer.sky.blackbaud.com/api#api=58bdd6c8d7dcde06046081d7&operation=ListAppeals):
  `GET /fundraising/v1/appeals?include_inactive=true&limit=5000`. Incomplete catalogs
  are held; the app does not infer uniqueness from a partial page.
- Constituent identity and assigned appeals are verified via the Constituent API
  single-constituent GET endpoints. No deletes or edits to existing assignments.

## Rollout

Deploy only to the explicitly selected JU project. Verify and save the two
exclusion appeal mappings in the new settings disclosure. First validate one
explicitly approved exclusion, including its NXT comments/date; do not use a donor
record as an unapproved write test. Check an existing-assignment case, a spouse
pair, and read-only recovery before wider use. Configure the sandbox independently.

## Verification

September 25, 2026 local checks:

- Full automated suite: 4,113 passed, 21 skipped.
- Nine isolated PostgreSQL integration checks passed, including persisted uncertain
  exclusion state and stale-lease protection. No production database was used.
- Type-check and production build passed.
- The actual exclusion dialog was checked with synthetic data and built app CSS
  at desktop and 390px mobile widths. The mobile form scrolls without horizontal
  overflow, and confirmation enables the action only after a reason is entered.
- `git diff --check` passed. An existing Browserslist database-age warning remains.

Not yet deployed or verified through a live NXT write. Existing exclusions and
production configuration remain unchanged.

## Rejection Investigation - September 25, 2026

The feature was subsequently deployed to JU as `d44d27d`; see
`ju-exclusion-appeals-release-2026-09-25.md`. A staff-initiated exclusion of
1st Coast Cargo was saved locally, but its appeal POST was definitively rejected.
That release retained the rejection timestamp, but not its HTTP status or provider
error identifier. Vercel request logs contain no provider error detail, so the
specific rejection cause cannot be established from that attempt.

Bounded read-only checks with the same JU connection confirmed that Fundraising
and Data Integration both return the configured appeal with the expected ID and
description (HTTP 200). The complete constituent appeal list contained no matching
exclusion assignment. There was no shared quota pause. These facts do not prove
permission to create an appeal and do not identify the original POST's error.
No retry or NXT write was performed during this investigation.

The local diagnostic correction retains safe HTTP status, a bounded retry delay,
and an unambiguous provider error name/code on each failed write. It never stores
raw provider messages or echoed donor/request payloads. Read-only verification
preserves the earlier rejection guidance instead of hiding it. Unknown/5xx results
remain uncertain and cannot be replayed; explicit rejected responses retain the
existing staff-confirmed continuation guard. Restore help now explains that an
appeal must be removed only if it actually exists in NXT.

This correction is not yet deployed. A single guarded retry for the exact saved
assignment has been requested from the user, but has not been authorized or run.
Focused verification: 85 tests passed; typecheck, production build, and whitespace
checks passed. Production records and sandbox settings were not changed.
