# Exception-focused society letter review

## Staff workflow

1. Open Society Letters and choose **Questionable only**. Use **Focus on an issue** to narrow the list, then **Review questionable recipients** to work through it.
2. Possible issues include missing or multiple organization contacts; incomplete constituent/spouse names; missing separate address fields; conflicting household addresses; matching addresses in separate households; changed/expired reviews; and template/merge-field problems.
3. **See matching recipients** opens other recipients at a matching address, even when the current search or society filter hides them. Households are never combined based on an address. Shared addresses remain advisory after individual review and do not impose a new delivery block.
4. Choose **Confirm straightforward recipients** for a table of proposed names and addresses. Uncheck anyone who needs individual attention, accept the selected suggestions, and save them together. This handles up to 5,000 recipients, with 50 displayed per page. The count uses the current search and society, not the issue filter.
5. Continue to CSV export or the existing document workflow. Review does not apply appeals, create documents, send letters, or mark letters mailed.

Individual and joint suggestions use preferred names, falling back to first names. Both household members are retained; different last names stay separate. Organizations use their sole returned contact and retain the organization name. A postal suggestion does not select or approve an email address. Saved per-society CSV formatting still applies when exporting.

Existing reviewed choices, expired/changed reviews, local unsaved drafts, unavailable records, excluded/covered recipients and records with detected issues are not bulk-confirmed. They remain accessible for individual review. The review window remains 15 days.

## Boundaries

- Triage uses the saved current holding list, not live NXT or postal validation. It is not a guarantee that data is correct or that every duplicate address is detected.
- Address matching ignores case, spacing, commas and periods, but retains unit numbers and complete address components. It does not infer family relationships, expand street abbreviations, or compare against historical mailings outside the holding list.
- Address Line 2 and country may be blank. Street, city, state and ZIP must be present and consistent with the full block for bulk suggestions. International formats or manually edited full addresses without separate fields stay in individual review.
- The bulk confirmation endpoint uses the existing reviewer authorization, same-origin checks, workspace revision and database lease. Automatic calls are rejected. The original suggestion revision and every source review token must still match.
- The server recomputes suggestions against the entire saved holding list, not just selected IDs or the visible society. Client-provided wording or a claim of being straightforward is never trusted.
- All selections pass the existing recipient validator before a single state save. Validation or persistence failure cannot leave a partially saved review batch. Successful reviews use the existing audited saved-by/date format; snapshots, delivery history and NXT stay unchanged. No schema migration is needed.

## Verification

Pure tests cover contact/name/address exceptions, joint names, exact shared-address grouping, separate units, manual choices and template fields. API tests cover explicit confirmation, authorization, cross-site/automatic rejection, stale suggestions/tokens, hidden shared addresses, 5,000-row limits and atomic failure. UI tests cover issue filters, matching-recipient navigation, selection/pagination and failures. The opt-in isolated PGlite suite verifies persistence and review validity after a database round trip. All tests use fictional data.

Implementation is local until a separately authorized JU deployment. No production reviews, appeals or mailing statuses are changed by these tests.

Local validation on 2026-10-12: 6,642 tests passed, including 32 isolated database tests; 193 pre-existing opt-in tests skipped. Typecheck and production build passed. A fictional-data browser preview verified the issue filter and explicit bulk confirmation; the mobile viewport had no page overflow. Validation logs: `/tmp/ju-letter-triage-full-tests.log`, `/tmp/ju-letter-triage-typecheck.log`, and `/tmp/ju-letter-triage-build.log`. No live authentication, NXT mutation, or donor-record edits were used for testing.
