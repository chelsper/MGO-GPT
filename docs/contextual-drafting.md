# Contextual Drafting and Meeting Preparation

Step 5 of the combined improvement roadmap, implemented September 27, 2026.
Not yet deployed. Steps 1 through 4 remain the current JU production release.

## Where It Appears

- Dashboard > Check in with Nellie > a visible recent gift > **Draft a thank-you**.
- Dashboard > Check in with Nellie > a visible opportunity or follow-up > **Prepare for a conversation**.
- Top Prospects or My Portfolio > expanded **Donor briefing** > **Prepare for a meeting** when attributed saved facts are available.

Gift drafts support a thank-you starter or internal meeting notes. Other contexts
offer meeting notes only. This avoids treating a lifetime-giving total, pledge,
or last-gift summary as a verified new receipt. Hidden reminders do not offer
drafting. The existing fresh-source requirements still control gift availability;
this change does not fix or bypass an unavailable saved gift source.

## User Workflow

1. Open a draft explicitly. Saved context and source labels appear beside the editor.
2. Edit the text. Thank-you starters leave the preferred greeting and signature
   for the user rather than deriving first names, titles, or household greetings.
3. Review the facts and wording, then check the review confirmation. The copy
   button stays disabled while either generated greeting/signature placeholder remains.
4. Copy the edited text for use in an approved organizational tool. No email is
   sent, letter prepared, NXT action logged, next step completed, or reminder dismissed.

Meeting notes distinguish saved facts from suggested discussion questions and
leave the conversation goal, actual notes, and agreed next step for the user.
They explicitly say they are preparation, not a record of a completed meeting.
Source labels travel with the default meeting text, but not with donor-facing
thank-you copy. Users can edit all text, so the review remains a human responsibility.

Edits exist only in the mounted draft. Nothing is persisted in database, browser
storage, URL, or query cache. Closing, replacing, or changing draft type with
edits requires an in-app discard choice; a before-unload guard warns when leaving
with edits. Changing donor/workspace clears the dialog to avoid cross-context
leakage. Changing the current source facts blocks copying until the user explicitly
restarts from the new details. No source refresh silently overwrites user edits.

## Boundaries

- This is a deterministic contextual starter, **not a generative AI model**.
- No model/provider integration, API route, schema, migration, scheduled job,
  network call, or new NXT read/write is introduced.
- Uses the already-authorized reminder payload or existing attributed donor
  briefing. Existing summary loading policies and workspace authorization are unchanged.
- No inference of donor intent, prior thanks, communication permission, tax
  deductibility, gift impact, or missing solicitation documentation.
- Gift drafts advise checking prior acknowledgments and contact preferences.
  They are not tax receipts or approval to contact a donor.
- Source strings remain plain text; no HTML or Markdown execution. Builders bound
  source lengths and remove control/directional characters.
- Copying is explicit, has no automatic retry, and reports clipboard failures
  without claiming success. A failed copy leaves the editable text available.
- No auto-population of completed-action fields: preparation must not become a
  false record of contact.

## Implementation

- `apps/web/src/utils/outreachDrafts.js`: pure context adapters and starter builder.
- `apps/web/src/components/OutreachDraft.jsx` and `.css`: portal-mounted native
  modal, editor, review/copy controls, discard protection, and source-change guard.
- `DashboardAssistant` reuses its existing viewer/workspace-keyed panel.
- `DonorBriefing` reuses its existing sections; the detail panel supplies the
  viewer/workspace scope and portfolio worklists already remount on scope changes.

## Verification

Final checks: 4,756 tests passed; 49 opt-in integration tests skipped. Typecheck,
production build, release guard, and diff whitespace checks passed. No new database
code was introduced, so no live or disposable database check was required for this step.

Unit and component tests cover incomplete context, honest source boundaries,
plain-text handling, placeholder/review gates, copy failure and concurrency,
source changes, discard/reset, navigation warnings, no new requests/storage,
and workspace/donor isolation. The existing portfolio integration tests cover
unchanged loading and navigation. A synthetic desktop/390px mobile preview checked
layout, contextual text, editing, copying, and the in-app discard prompt; no live
donor records or connected NXT account were used.

The original browser-native discard prompt stalled the in-app browser during
testing and was replaced with the tested in-app choice. A later Chrome preview
control connection detached after the mobile checks; the remaining keep-editing
and focus behavior is covered by component tests. The synthetic preview server
was stopped after verification.

## Next Step

After deployment, pilot with a small authorized set: one thank-you starter, one
opportunity conversation, and one donor briefing. Review the wording with staff
and confirm source quality before considering persistent private drafts,
organization-approved wording, or a separately governed AI rewrite option.
Step 4's live documentation-check pilot also still needs an eligible fresh gift.
