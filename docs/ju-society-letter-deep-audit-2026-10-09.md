# JU society-letter workflow: incident trace and recovery audit

Date: October 9, 2026. Scope: JU production Society Letter Creation, with emphasis on the saved letters still blocked at 3:50 PM Eastern. These findings describe the observed state and tested paths, not a guarantee against every future provider failure.

## Executive findings

1. **The user's browser was not running the deployed fixes.** The host-only, HttpOnly `__vdpl` cookie pinned it to the 11:13 AM deployment. Vercel runtime logs place the 3:48-3:52 PM workspace and API requests on that older release. A cookie-free production smoke test passed while this existing session still ran old code.
2. **The saved appeal receipts contain the legacy 150-character generated comment.** That exceeds the documented 50-character constituent appeal comment field. Current production already has a narrow recovery path to submit a 45-character stable reference after fresh reconciliation, preserving the original audit text. The pinned session missed that fix. The stored HTTP 400 alone does not identify the provider's exact rejected field; no real retry was submitted during this audit.
3. **Three organization letters hit a second, independent false address mismatch.** Their approved address blocks contain the verified organization name on the first line, followed by the actual preferred NXT address. All address permission, status, ownership, and date checks passed. The name prefix caused the text comparison to fail. A local fix now accepts that exact verified organization-name prefix without rewriting the approved document or relaxing address restrictions.
4. **One household has an unresolved communication-policy hold.** Both members have active `No Solicitation` codes; one also has `No E-Mail`. The application conservatively blocks these instructions. That is not a formatting defect and must not be cleared automatically. Staff need to decide whether this stewardship acknowledgment is permitted under the organization's communication policy.

## Release evidence

| Check | Observed result |
| --- | --- |
| JU production, no cookie | Commit `d471b3b13d429ff4c2b020af3a539af9ae2a3693`, deployment `dpl_BwBgtnb4JJEKhM1LeJWZKmGgfbZv` |
| User browser version cookie | `dpl_AnFrXKBYQmhjCn4jSjjaUSYZfonQ` |
| Old deployment | Commit `6253225fa6debfe284204afdd8eaf640f373f24e`, created October 9 at 11:13 AM Eastern |
| Same public version endpoint with synthetic old cookie | Returns the old deployment |
| Same synthetic cookie plus explicit current `dpl` query parameter | Returns current production |
| Platform configuration | Skew-protection maximum age 43,200 seconds; no threshold reported in the inspected settings |

This was not merely a stale screenshot or stale JavaScript file. Requests actually reached the old server deployment. The installed `@vercel/react-router/entry.server.js` sets the version cookie on document responses without an explicit Path, so different parent paths can hold pins. Ordinary reload is insufficient when a pin is present.

[Vercel's official documentation](https://vercel.com/docs/skew-protection) describes cookie-based document-navigation pinning, clearing the pin, and using a custom threshold to retire problematic releases. Do not disable skew protection globally as a shortcut: it also protects ongoing workflows from mixed client/server versions.

## Saved-letter verification

The audit read all 10 active deliveries, all their approved Word documents, and the three canceled history entries. It compared each active document's stored hash and size with the actual bytes, in memory. All 10 passed. All active letters still have document approval records. No donor documents or complete profiles were exported into this repository.

Current-code simulations used fresh read-only NXT profiles, assigned appeals, solicit codes, consents, and the appeal catalog, then replaced all writes and persistence with in-memory test doubles. The application's SQL and NXT transport imports were explicitly disabled in the simulation bundle.

| Saved delivery ID prefix | Finding | Recovery simulation |
| --- | --- | --- |
| `b1801ddd` | Single full constituent; legacy comment | Complete; one simulated assignment |
| `632e36cc` | Two full constituent spouses; legacy comment | Complete; two simulated assignments |
| `7dec0d68` | Full constituent plus relationship-only spouse | Complete; one simulated assignment; spouse retained in household |
| `c98f9aa9` | Full constituent plus relationship-only spouse | Complete; one simulated assignment; spouse retained in household |
| `fc02d311` | Two full constituent spouses | Complete; two simulated assignments |
| `371d5166` | Two full constituent spouses | Complete; two simulated assignments |
| `40a13867` | Verified organization name above preferred address | Complete with local address fix |
| `773aaee4` | Verified organization name above preferred address | Complete with local address fix |
| `eb4935ec` | Verified organization name above preferred address | Complete with local address fix |
| `fcec44ea` | Active communication instructions | Remains blocked; no simulated assignment |

For every successful simulation, a repeat run submitted zero additional assignments, approved document metadata/date/member IDs stayed unchanged, and the completed letter could be selected for an in-memory ZIP download. These are **simulated outcomes, not production completion statuses**. The real saved receipts were not edited.

Relationship-only spouses are not separate full constituent records eligible for an independent appeal assignment. They remain in the letter's household and acknowledgment history. A current reciprocal link to the full-constituent spouse is required; the exception is postal-only and does not excuse a missing or inaccessible full constituent.

## Stage-by-stage trace

| Stage | Expected behavior and checks | Evidence / remaining concern |
| --- | --- | --- |
| Query settings and import | Map constituent and spouse system IDs, preserve separate name/contact/address fields, combine active society queries | Query streaming and conflicting-row/deduplication tests passed. This audit did not rerun the production source queries. |
| Household and hierarchy | One household per identity group; highest qualifying society letter; lower-tier coverage retained | Workflow and hierarchy tests passed. All 10 saved member sets are unique within each letter. |
| Recipient review | Save choices and merge values, including organization contacts; keep valid reviews for 15 days | Recipient, recovery, source-token and date tests passed. Material data/template changes can still invalidate an unapproved draft. |
| Membership freshness | New preparation uses a completed, current period snapshot less than 24 hours old | Snapshot was current during the audit. Refreshing membership and re-reviewing unchanged recipient wording are not the same task. |
| Document preparation and approval | Persist exact rendered bytes, hash, approval, date and selection before NXT updates | All 10 active saved Word documents intact. Opening each preview again is not a second approval requirement. |
| Fresh NXT check | Validate current identity, household links, preferred address, restrictions, prior appeals and catalog before writing | Read-only checks isolated the organization-prefix defect and the communication-policy hold. |
| Appeal submission | Use system IDs and dedicated period/tier appeals; persist intent before each POST | Current recovery produces 45-character stable comments. Real NXT POST acceptance was not exercised. |
| Partial/uncertain write | Reconcile exact assigned appeal/date/comments; never blindly repeat a timeout or ambiguous write | Finalization, receipt, automatic verification, retry and database tests passed. Connection/quota/uncertain transport failures still pause work. |
| Batch continuation | Resume approved saved letters without regenerating documents; separately selected recovery may leave record-specific conflicts for staff | Current bulk recovery can proceed past a record-specific `needs_review` result when `stop` is false. Whole-batch continuation deliberately stops at the first unresolved household. Use selected saved-letter recovery for partial batches. |
| Download | Select only completed letters; verify document integrity and membership before ZIP/PDF assembly | Nine simulated recoveries yielded valid selected Word ZIPs. A blocked neighbor does not have to hold a completed selected subset. |
| PDF | Convert prepared Word templates privately; merge only saved PDF documents | These 10 existing documents are Word, not PDF. A combined PDF cannot be inferred from their completion. Hosted conversion was not re-certified in this audit. |
| Mark mailed | Explicit dispatch confirmation after actual mailing; only completed selected letters affected | Dispatch route and subset tests passed. No production letter was marked mailed. |
| Email | Separate explicitly enabled path with duplicate-send safeguards | No email delivery was tested against a real recipient or provider. Postal completion is not evidence of email delivery. |
| Deployment | Verify both a clean session and a previously pinned session | Old verification tested only the first. The new optional stale-session gate reproduced the failure against production. |

## Local fixes prepared

- `societyLetterAddressMatch.js` now accepts the original address or one leading line equal to the freshly verified organization owner's name. The owner type and system ID must match. Arbitrary contacts, different organizations, changed street/unit/ZIP, and missing address permissions are not accepted. Existing exact-format matches remain valid.
- `societyLetterReadiness.js` supplies the live owner profile to that comparison. It still checks all address and communication restrictions.
- `LetterReleaseNotice.jsx` discovers the public latest version without credentials, on mount and bounded focus checks. It offers an explicit update action; it does not reload automatically, retry indefinitely, or send NXT updates. Busy work disables the action and the user must confirm saved edits before navigation.
- The reload API clears only the framework's host-only version pins for the workspace's relevant paths, retains login cookies, validates the requested deployment, rejects cross-site triggers, and redirects only to the Society Letters workspace. It has no database/NXT transport access.
- Vite explicitly exposes only the public build commit for client comparison; the existing environment prefix would otherwise omit that value. A production build was inspected to confirm the metadata is in the letter-page bundle.
- `/api/version` has `Cache-Control: no-store`.
- `verify-production-deploy.mjs` accepts `VERIFY_STALE_DEPLOYMENT_ID` to test an existing-session pin and explicit latest-version routing without authentication cookies. It fails rather than claiming a clean-session check proves everyone is updated.

These code changes are **local, not deployed**. No production configuration, business database row, letter, or NXT appeal was changed by this investigation.

After the user explicitly approved the browser repair, only the host-only `__vdpl` cookie at `/` on `www.jumgogpt.app` was removed and JU was reloaded. The framework then set the current production pin `dpl_BwBgtnb4JJEKhM1LeJWZKmGgfbZv`. The authenticated workspace reopened on the same saved batch, with **Continue saved letters** enabled rather than the old disabled create button. No appeal-update control was clicked. Authentication remained intact; the app renewed its own session token during reload, but the audit did not delete or modify authentication cookies.

## Verification and limits

- Full current suite: **6,400 passed, 193 skipped**, 477 passing test files and 14 opt-in files skipped.
- The 26 society-letter database safeguard tests ran against isolated PGlite, including receipt/persistence checks. This is not a substitute for a multi-process PostgreSQL concurrency exercise.
- The 193 skips are opt-in PostgreSQL integration tests for other areas plus the one hosted PDF test. The private converter credentials were redacted by Vercel, so the hosted PDF test was not represented as passing.
- Type checking and production build passed. The focused address/readiness/version tests passed. Existing unrelated `OpportunityRefresh` test `act` warnings remain; no test failed.
- The synthetic stale-session production check failed intentionally and correctly: current public production was healthy, while the old pin still served the old commit. Explicit current-version routing worked.
- Live diagnosis used bounded GET requests, checked the shared provider cooldown, performed no token refresh, and did not automatically retry failed requests. Database transactions were read-only.
- No live POST, mailing, email, fresh source import, converter credential rotation, or sandbox deployment was performed.

The 150-character stored comments and current 45-character replacement are directly observed. The underlying 50-character field limit is documented in [Blackbaud's Import Guide](https://webfiles-sc1.blackbaud.com/files/support/guides/re7/import.pdf), Constituent Appeal Comments (`CAPComment`). The exact original SKY validation response was not retained in the saved receipt, so provider acceptance still needs one controlled, approved production confirmation after release.

## Safe recovery and release order

1. Release only the verified JU changes using the isolated JU deployment procedure. Do not push a shared branch as a deployment shortcut or change the sandbox.
2. Verify the new public commit and the previously pinned session. Run `VERIFY_STALE_DEPLOYMENT_ID=dpl_AnFrXKBYQmhjCn4jSjjaUSYZfonQ npm run verify:prod -- <new-commit>` from `apps/web`. An old-session failure is a release follow-through issue, not a reason to tell the user to keep re-reviewing letters.
3. With the user's approval and no active work, remove the version pin/reload after deployment. This was completed for the existing production release during the audit; the new local fix still needs deployment and a post-release version check. For organization-wide retirement of a bad release, separately coordinate Vercel's supported skew-protection threshold. The newly added notice cannot appear inside an older deployment that predates it.
4. Continue **one existing approved saved letter**, rather than create a replacement. Confirm the real NXT assigned appeal for each full constituent and confirm the saved document remains identical. This is the first necessary real write, not an audit side effect.
5. Continue the remaining eligible saved letters, preserving partial progress. Download completed selected Word letters now; do not cancel/recreate them solely to change file format.
6. Leave the communication-restricted household on hold until staff resolve the policy. Do not silently reinterpret `No Solicitation` or remove NXT preferences.

## Follow-up improvements, not silently implemented

- Show the actual applicable communication code and member alongside a staff-review route. Decide explicitly whether and how a stewardship-only exception can be approved, scoped to channel/purpose/period and audited without overwriting NXT preferences.
- Show sanitized field-level provider diagnostics and a correlation ID for administrators, without exposing raw donor payloads or tokens. A generic HTTP 400 is insufficient for support.
- Add a private, fictional-recipient PDF health probe that runs in the deployed app environment, where secrets are available without exporting or rotating them. Keep it separate from donor delivery and rate-limit it.
- Treat saved Word-to-PDF conversion as a separate immutable document derivative if desired: retain original approval/hash, require verification of the converted output, and never create another appeal as a side effect.
- Put version-pin validation into the standard JU release checklist and capture the previous production deployment ID before each critical fix. Maintain compatibility for active batches rather than silently forcing reloads.

## Local evidence locations

Temporary, local-only artifacts include `/tmp/ju-letter-deep-audit.log`, `/tmp/ju-letter-deep-audit-remaining.log`, `/tmp/ju-letter-blocker-differences.log`, `/tmp/ju-letter-organization-recovery.log`, `/tmp/ju-letter-stale-session-gate.log`, `/tmp/ju-letter-audit-full-tests.log`, `/tmp/ju-letter-audit-typecheck.log`, and `/tmp/ju-letter-audit-build.log`. They are not release assets and may be removed by the operating system. Do not upload raw runtime logs or donor details to public issue trackers.

## Follow-up: actual downloads versus completion

The user subsequently confirmed only two actual downloads. A fresh read-only check at approximately 4:30 PM Eastern found 20 active letters: seven with complete, verified NXT appeal receipts; three held on organization-address comparisons; two held on communication codes; and eight still pending after a new batch stopped at a held household. This supersedes the earlier ten-letter inventory, not its point-in-time findings. The real completed receipts now include the 45-character comments and NXT assignment IDs, confirming that current production's compact-comment path has succeeded. Downloads remain a separate event.

Six letters were marked mailed in saved history. The user said they were using that action after downloading; no statuses were corrected by the agent. A mailed flag is not proof of a successful download or physical dispatch. Download handlers do not set that flag; mailing requires a separate confirmed action.

An additional UI defect was traced: `CompletedLetterActions` selected only `prepared` letters. Once all the completed letters in a mixed batch were marked `mailed`, its subset-download controls disappeared, while blocked letters still disabled the whole-batch download. Individual downloads remained available deeper in the recipient details, but the visible grouped workflow became a dead end.

The local correction includes both prepared and mailed completed documents in the download selection, while mailing confirmation includes only selected prepared letters. Previously mailed letters cannot be marked again through that control. Mailing is no longer styled as the primary action and its confirmation explicitly says it does not create, download, print, or send files. All seven currently completed documents passed stored-byte validation and per-batch ZIP assembly in memory; nothing was actually downloaded by the audit.

Follow-up verification: **6,402 tests passed, 193 opt-in skipped**, including 26 isolated letter database tests; typecheck and production build passed. The user explicitly authorized deploying the JU-only address and download-access fixes. Release details and browser-version verification are recorded separately after promotion. No appeals, mailing states, or donor documents are to be altered by deployment.
