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

No production reviews, appeals or mailing statuses are changed by these tests. The separately authorized JU deployment is recorded below.

Local validation on 2026-10-12: 6,642 tests passed, including 32 isolated database tests; 193 pre-existing opt-in tests skipped. Typecheck and production build passed. A fictional-data browser preview verified the issue filter and explicit bulk confirmation; the mobile viewport had no page overflow. Validation logs: `/tmp/ju-letter-triage-full-tests.log`, `/tmp/ju-letter-triage-typecheck.log`, and `/tmp/ju-letter-triage-build.log`. No live authentication, NXT mutation, or donor-record edits were used for testing.

## JU Deployment, October 12

- Application commit: `cef4059db7aff1a47632225b48696a2b4fd2ed5c`. JU project: `mgo-gpt`, `prj_S8IWnRqqTQwLnd6C5lBfTsMj15VY`.
- Production deployment: `dpl_6HsA3JoYNpFCL1GiM9AvSivkN9yg`, candidate `https://mgo-2xm6qwm6q-chelspers-projects.vercel.app`, promoted to `https://www.jumgogpt.app` only after candidate checks passed.
- Rollback: `dpl_ERS6Kv9pmmGd2wdGu5UWbUYs9SLf`, application commit `ce3506bf2502de7b7c8029fb73a6d7c82e1cdc64`. No schema migration or environment changes were required; existing review, CSV and letter records remain compatible.
- Fresh release verification: 6,642 tests passed across 490 files, including 32 isolated PGlite database tests. The existing 193 opt-in tests remained skipped. Typecheck, local/hosted production builds, release-worktree guard and whitespace checks passed. Existing dependency deprecation and install-script policy warnings were non-blocking.
- An isolated Git archive matched all 1,259 tracked web files. The dry upload contained all 24 intended changed files among 1,391 files, without real environment files, build output, dependencies or the untracked services directory. No Git push was used; unrelated dirty work was not packaged.
- Candidate and live smoke checks verified exact release identity, eight page shells, published assets containing the new review/address controls and existing CSV/PDF controls, unauthenticated 401 responses and cross-site 403 responses, including the new bulk-review action. Valid/invalid/cross-site version-reload checks passed.
- Authenticated live browser verification loaded saved membership successfully: 368 holding-list recipients, 14 already reviewed, 311 straightforward suggestions and 43 questionable recipients at verification time. The Questionable-only filter narrowed the list to 43 with specific reasons. The bulk dialog showed 311 selected suggestions over seven pages and kept saving disabled until explicit acceptance. It was cancelled without saving. Selecting OOD for CSV showed separate address fields and the correct template column headers, including optional blank Line 2. No format defaults, reviews, templates, tracked exports, appeals, letters or mailing statuses were changed. Native Word merging and live NXT writes were not tested against donors.
- The strict before/after Vercel comparison passed: only JU's production deployment identity changed. Sandbox remained `dpl_GZ5Xb6o8Fo7NkhqkrkRXBFhZNSMW`; other project identities, settings, Git connections, five JU cron schedules and PDF settings were unchanged.
- Version-pin caveat: the synthetic old `__vdpl` cookie still routes to the prior deployment. The strict stale-session verifier reported this rather than claiming all existing tabs were current. Explicit latest routing and the reload endpoint passed; the signed-in browser successfully used the new deployment. Staff with older tabs should save edits and use **Load latest version** when prompted.

Evidence: `/tmp/ju-triage-release-` logs `tests.log`, `typecheck.log`, `build.log`; `/tmp/ju-triage-deploy-` files `release.json`, `dry.json`, `candidate.log`, `candidate-identity.json`, `candidate-smoke.log`, `promote.log`, `live-smoke.log`, `current-verification.log`, `version-verification.log`, `projects-before.json`, `projects-after.json`, and `after.log`. The stale-pin failure remains recorded in `version-verification.log`.
