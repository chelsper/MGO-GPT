# Society letter bulk recipient review

## Workflow

Under Stewardship > Society Letter Creation > Ready for letters, use
**Review recipients in bulk**. Search and society filters apply to the queue.
The default scope is recipients needing review; **All editable recipients**
also includes saved choices. Each session contains at most 50 households.

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
