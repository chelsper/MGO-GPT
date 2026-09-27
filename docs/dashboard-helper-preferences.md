# Organization Helper Preferences

Implemented September 27, 2026. Not yet deployed. This follows the Step 5
contextual-drafting release and does not alter JU or sandbox settings by itself.

## Configuration

Organization Configurations > Institution Profile > Dashboard helper & draft
preferences now includes two collapsed groups, alongside name/avatar/enablement.

| Preference | Default | Allowed values |
| --- | --- | --- |
| Upcoming follow-ups | 7 days | 1-30 whole days |
| Upcoming opportunity dates | 30 days | 1-90 whole days |
| Recent gift window | 30 days including today | 1-90 whole days |
| Stewardship suggestions | Gifts strictly over $1,000 | $0-$1,000,000, whole USD |
| Documentation checks | Gifts at or above $10,000 | $1-$10,000,000, higher than the suggestion threshold |
| Draft tone | Warm and conversational | Warm, professional, brief and direct |
| Approved thank-you wording | Blank, using standard wording | Optional plain text, at most 1,200 characters |

Overdue follow-ups and past expected dates remain included. These controls do not
change society levels, fiscal years, currency, goals, reports, notification
delivery, or background schedules. Existing fresh-source, gift-type, ownership,
deduplication, and record-limit rules remain unchanged. A larger gift window can
show only the history the saved source actually covers; partial coverage remains
explicit. This is not a way to repair an unavailable gift source.

Tone changes standard thank-you wording and suggested meeting questions, not
recorded facts. Approved wording replaces the standard body after the gift amount;
it has no merge-field engine or model execution. Greeting and signature remain
explicit placeholders. The settings editor previews a fictional $2,500 gift
without making a request or loading donor records. Blank wording restores the
selected tone's standard body. Staff must still review each actual draft.

## Persistence And Safety

- Reuses the existing `organization_settings.dashboard_assistant` JSONB field,
  existing Admin/Advancement Services management permission, revision check, and
  atomic profile/audit save. No schema change, migration, or dependency is added.
- Older clients omitting the new fields preserve their saved values. Explicit
  blank wording clears it. Invalid types/ranges and crossed thresholds fail
  before writing, including when combined with existing settings.
- The reminder API reads organization policy once per request and applies it to
  source reads, preference revalidation, and manual documentation-check gates.
  Client-supplied overrides are not accepted. The response includes the policy
  used so its explanation and check button match the displayed results.
- Existing defaults are unchanged. SQL thresholds and dates are parameterized.
  Changing the policy does not alter item revisions or revive valid dismissals.
  A removed candidate is withheld, not deleted; a later eligible return retains
  the same preference unless its underlying facts changed.
- Reminder changes apply on the next open/reload. Draft wording reuses the shell's
  existing settings read and propagation behavior, with no extra request or poll.
  If an open draft receives changed wording, edits stay intact, copying is blocked,
  and restarting requires explicit review/discard. Another session may continue
  using its previously loaded settings until the existing cache refreshes.
- No AI model calls, automatic NXT checks, donor communications, or donor-record
  writes are introduced. Documentation checks remain explicit, rate-limited,
  identity-checked reads through the signed-in viewer's connection.

## Verification

- Full suite: 4,785 tests passed; 51 opt-in tests skipped.
- Separately ran all 15 dashboard PostgreSQL integration tests against the
  disposable local Unix-socket fixture, including the new configurable filters.
- Typecheck, production build, release guard, and whitespace checks passed.
- Synthetic desktop and 390px mobile verification passed. The page had no
  horizontal overflow (390px), and the draft dialog's content/client widths both
  measured 352px. Tone, approved wording, local sample application, review gates,
  and keep-editing/discard were exercised with zero application requests.
- The synthetic preview and disposable database were stopped afterward.

Live Step 5 follow-up verification also completed in the existing authorized JU
workspace: a saved opportunity conversation starter and a donor-briefing meeting
starter displayed attributed context and disabled copy until review. No donor
edits, communications, reminder preferences, or organization settings were saved.
Normal prospect-page reads were allowed to run; no explicit refresh or
documentation check was triggered. The recent-gift source was unavailable for
that workspace, so the live thank-you and Step 4 documentation pilots remain
pending eligible fresh saved gift data. Synthetic tests do not replace that pilot.

## Release And Next Check

Deploy to the explicit JU project using the established clean-archive process;
do not Git-push or deploy the sandbox as a side effect. Verify release identity
and the new settings UI without changing saved production defaults. Then review
one eligible gift when its existing background source is fresh. Do not lower
freshness requirements or trigger a broad refresh solely to manufacture a pilot.
