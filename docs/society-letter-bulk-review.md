# Society letter bulk recipient review

## Workflow

Under Stewardship > Society Letter Creation > Letter workspace, use
**Review recipients in bulk**. Search and society filters apply to the queue.
The default All recipients view reviews recipients needing review. Selecting
**Reviewed** offers **Edit reviewed recipients** as an optional action rather
than asking staff to review them again. Specific review/issue filters include
editable recipients in that view, including saved choices. Each editing session
contains at most 50 households.

## Approval Shortcut Discoverability (October 5, Not Yet Deployed)

The follow-up fix makes **Continue to document approval** visible in All
recipients and other filtered views whenever they contain saved recipient
reviews for society-query postal letters. It reports the number already
reviewed without suggesting the entire mixed list is complete. A saved approval
batch remains reachable even if search hides all recipients.

The shortcut preserves selected households and filters, only focuses the existing
approval area, and never saves reviews or starts requests. Preview-only sources
and email views do not offer postal approval. Existing readiness checks and
document-approval limits remain unchanged.

Verification: the new tests reproduced three missing-shortcut cases before the
fix. All 203 stewardship tests passed afterward, including four new regression
tests. Typecheck, production build, release guard, and diff check passed. A
fictional, write-blocked browser check confirmed the shortcut in All recipients,
preserved selection, and focused approval area. The live user tab was inspected
without changing its three selections or triggering checks. No deployment or
live record changes were made for this follow-up.

## Automatic Postal Checks (October 5, Not Yet Deployed)

This subsequent change removes the separate delivery-readiness prerequisite
from society-query postal document preparation and approval. The workflow is
now recipient review, **Select reviewed households**, document preview and
approval, then explicit batch continuation in Letter history. The former
whole-list checker is collapsed under **Optional NXT preflight** and never
starts or resumes just by opening the page. Its cached results do not force
another recipient review or prevent document approval; the **Next step** column
shows **Prepare document** for saved reviews. Historical check reasons remain
available in household details.

The automatic fresh NXT check still runs for each selected household before
any appeal writes. It validates both household members, restrictions, prior
letters/exclusions, and appeal settings. A failed or uncertain check prevents
writes and final downloads. Approval never itself calls NXT. Membership
freshness, verified period-specific appeal settings, society hierarchy,
exclusions, 15-day recipient review, exact-document approval, batch limits,
durable receipts, and uncertain-write recovery remain enforced. Email and
legacy grouped-source workflows are unchanged.

This change supersedes the cached-readiness approval requirements in the
historical release sections below. No schema migration or live data changes
are required.

Verification: 5,557 tests passed; 166 opt-in tests skipped. Typecheck,
production build, release-worktree guard, and diff check passed. Existing
PDF.js eval and mixed-import build warnings remain. Finalization/batch fixtures
now start without manual preflight; regressions cover unfinished optional
checks, both-member restrictions, prior letters, and NXT failure/rate limits
preventing writes and downloads. Fictional, write-blocked browser QA confirmed
collapsed optional controls, direct approval navigation, preserved selection,
and selection of reviewed recipients without prior checks. No deployment,
production letter, NXT write, email, or sandbox change was performed.

## Reviewed To Approval (Deployed October 5)

JU deployment and verification are recorded in
[the reviewed-to-approval release note](ju-reviewed-approval-release-2026-10-05.md).

The Reviewed view states that recipient review is complete and provides
**Continue to document approval** for society-query postal letters. This shortcut
only focuses the existing approval area (or existing saved draft); it does not
save recipient choices, select records, start NXT checks, or approve documents.
The selection controls say **Select to edit** and **Edit selected recipients**
when editing is optional. **Select ready households** and **Start document
approval** retain their existing guards and explicit actions.

Delivery status now says **Delivery checks passed** or **Delivery checks need
attention**, rather than using the same Needs review label as recipient review.
When all selected recipients are reviewed but not ready, guidance points to
delivery checks, not another names/address review. Missing, expired, restricted,
or already-acknowledged results still block document approval. Reasons remain
visible; no server validation is changed.

Saved recipient reviews still expire after 15 days or relevant recipient changes.
Final-document approval remains separate and applies to the exact saved bytes.
The document panel explains this distinction and labels prepared documents as
**Awaiting document approval**. Merely being Reviewed never authorizes appeals.

Verification: 465 focused UI/domain/API tests passed, plus typecheck, production
build, release guard, and diff check. The release suite passed 5,544 tests with
166 skipped. A fictional, write-blocked browser fixture confirmed the Reviewed
shortcut, ready-only selection, and desktop/390px mobile layout. The deployed JU
version and authenticated Reviewed shortcut were verified. Existing PDF.js eval
and mixed-import build warnings remain. No live recipient change, letter approval,
email, or NXT write was performed; the sandbox was not deployed.

The reviewer can preview the personalized Word letter, edit the addressee,
salutation, mailing address, recipient/address-source record, and selected
returned email address, then use **Save & next**. Previous, Skip for now, and
Go to recipient allow navigation without approving another household.
Unsaved changes require an explicit discard before navigation or closing.
Failed saves retain the form and do not advance. Saving an individual counts
that household once in the session summary. Default subsequent sessions omit
already-reviewed households, while skipped ones remain eligible for review.

Full letter-body overrides are not part of this implementation. Shared Word
text and merge-field settings remain in Letter templates. Saved recipient
choices are scoped to the household and period and do not modify NXT.

## Checkbox Selection (October 1)

Release status is tracked in
[the combined stewardship release note](ju-stewardship-combined-release-2026-10-01.md).

Checkboxes for editable query recipients now select people for review, even
when postal readiness is unchecked, stale, or needs attention. **Select for
review (up to 50)** uses the current filters; **Review selected recipients**
opens exactly those recipients, including already-saved choices. Selection and
opening review do not issue API requests, create letters, or apply appeals.

**Select ready households (up to 10)** remains a separate shortcut for document
approval. The entire selection must pass the existing readiness requirements
and the 10-household limit before **Start document approval** is enabled. Mixed
ready/unready selections are not silently reduced. The page explains unmet
requirements, including incomplete refreshes, source edits, and existing drafts.
Preview-only sources still offer review only; email delivery remains gated.

Genuinely unavailable checkboxes now have a visible, accessible explanation.
Checkbox hit targets are larger, and filters, channel changes, and reviewer or
period changes clear selections. Server permission, household, hierarchy,
duplicate, freshness, and delivery checks are unchanged.

Verification: 175 society-letter UI tests passed, including 11 new selection
cases. Full suite: 5,310 passed, 140 opt-in tests skipped. Typecheck and production
build passed. Synthetic browser checks confirmed individual and ready-only
selection, an exact two-recipient review queue, preserved delivery blocking,
and a 390px mobile layout without page overflow. No production records changed.

## Side-by-Side Review (September 25)

On desktop, recipient fields and a personalized Word preview share one dialog.
Progress stays in the fixed header; Close review, Previous, Skip, and Save & next
stay in the fixed footer while the fields and preview scroll independently.
On smaller screens the panels stack and the header/footer remain available.
Organizations do not display spouse-only name labels or joint-greeting guidance.

**Preview personalized letter** renders the current edits on demand. Typing
never triggers a render or an NXT request. After edits or a template-version
change, the previous preview is hidden with a clear **Update letter preview**
prompt. Reverting to exactly the previewed values can reuse that preview.
Embedded Word pages fit the panel width and resize without fetching again.

Preview uses the same sandboxed renderer and server validation as before. It
does not save choices, check the confirmation box, grant readiness, or advance
the queue. Save still requires explicit recipient-review confirmation. Failed
saves retain values and the current recipient. Escape from inside the letter
passes through the parent's unsaved-edit guard, just like closing or skipping.
No database, API payload, hierarchy, delivery, or NXT-write contract changed.

Side-by-side verification: 4,263 tests passed, with 21 opt-in tests skipped.
Typecheck, production build, release guard and diff check passed. Focused
coverage includes stale-preview hiding, explicit refresh/retry, iframe isolation,
resize cleanup, unchanged review tokens, failed saves, and navigation guards.
Synthetic browser checks covered desktop/390px mobile layouts, fixed progress
and actions, an edited greeting, standard letter-size fitting, and in-memory
Save & next. Step 2 was deployed to JU in release `1213415`; see the separate
JU side-by-side editor release notes.

## Targeted Review Guidance (Step 3)

Workspace issues now link directly to the mailing address, email, greeting,
organization contact chooser, or changed recipient selection. If no recipient
has been chosen, the editor first asks for that explicit choice, then focuses
the requested field. It never selects a constituent, contact, or email on the
reviewer's behalf. Unavailable rows do not offer edit shortcuts.

Inside the editor, missing-field guidance follows the current draft and the
selected delivery method. Postal review does not flag email as missing; email
review does not flag the postal address. Organization contact selection remains
optional: the organization greeting can still be reviewed and saved. Name and
organization mapping explanations are collapsed, while reset warnings, changed
record notices, communication restrictions, confirmation, save failures, and
unsaved-edit protection remain visible.

**View delivery checks** focuses the existing readiness section but does not
start an NXT check. All readiness reasons remain visible in the workspace.
No server validation, hierarchy, deduplication, appeal, or delivery gates change.
Step 3 was deployed to JU in release `9d8039c`; see the separate JU letter
review guidance release notes. Step 4 appeal selection is subsequent local work
documented in [Appeal picker](society-letter-appeal-picker.md).

Step 3 verification: 4,273 tests passed; 21 opt-in tests skipped. Typecheck,
production build, release guard, and diff check passed. Focused coverage checks
direct field focus, explicit selection before focus, live draft guidance,
delivery-method scope in individual/bulk review, unavailable-recipient guards,
and no network requests from shortcuts. Synthetic desktop and 390px mobile
checks confirmed field focus, collapsed help, live issue removal, unsaved-edit
protection, and readiness navigation without starting a check. Production
verification for step 2 was read-only; no live recipient data was changed.

## Draft Preview Boundary

`POST action=preview_recipient_document` requires the same signed-in reviewer
role, same-origin request protections, and request-size limit as other
stewardship operations. It runs before acquiring a mutation lease and does
not require or advance the workspace revision.

The server validates the current period, source signature, household state,
recipient-review token, and allowed recipient choices. The active template
is selected from the household's saved society tier, not from a client-supplied
society key. Its version must match the version shown in the editor.

Only whitelisted recipient fields are merged. Client-supplied delivery flags,
society choices, or other fields cannot grant readiness. Preview uses the saved
query snapshot and template; it does not call NXT, reserve a delivery, save a
review, apply an appeal, or change exclusion/history records. Prepared, sent,
excluded, old-period, and stale-source rows cannot use this editor.

The browser lazily loads the document renderer on Preview. Documents render
inside the same script-disabled, no-network iframe as saved-template previews.
The personalized view is visibly marked Draft, has no send controls or download
of the unmerged template, and explicitly states that delivery checks remain.

Existing preparation, readiness, hierarchy, and duplicate-delivery checks are
unchanged. Saving recipient choices still invalidates prior readiness checks
through their existing saved-values/token binding.

## Verification (2026-09-25)

- Full suite: 4,159 passed; 21 opt-in tests skipped.
- Type checking, production build, release-worktree guard, and diff check pass.
- Unit/API coverage includes authorization, wrong origin, old periods, stale
  source/recipient/template tokens, unknown recipient/address records, injected
  email/permission fields, and read-only draft rendering.
- UI coverage includes the 50-recipient limit, search, saved-recipient scope,
  current revision on each save, failed-save retention, skip/previous/jump,
  unsaved-change protection, and preserved delivery gates.
- Browser QA used synthetic households on an isolated in-memory local server,
  at desktop and 390px mobile widths. Verified edited greeting in Word preview,
  Save & next, skip protection, and correct saved/unchanged session counts.
- No production data, templates, appeal assignments, or letters were changed.

Release status is recorded separately in the JU release notes. These checks
describe the implementation before deployment.
