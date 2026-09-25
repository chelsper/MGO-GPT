# Society Letter Appeal Picker

## Workflow

In Stewardship > Society Letter Creation > Setup > Appeal settings, open
letter-sent or exclusion settings and select **Load appeal choices from NXT**.
Each form shares one catalog load across all its society fields. Nothing loads
from NXT just because the page or settings section opens.

Search by name or code (at least two characters). Matching is local and
case-insensitive; at most 20 results display until the search is narrowed.
Selecting a result fills its lookup code and exact description together. The
summary identifies the society, purpose, and recognition period. Selection
does not save settings, assign an appeal, or approve sending. Enter in the
search field does not submit the settings form.

**Enter or edit appeal manually** retains the previous entry workflow. Existing
numeric system-ID mappings for letter-sent appeals remain supported; selecting
a search result switches explicitly to lookup-code mode, even for numeric
lookup codes. Exclusions continue to use verified lookup codes/descriptions.

Review every society, confirm the dedicated purpose/period, then use the
existing **Verify and save** action. Selection or manual edits clear the
confirmation. A failed lookup or verification keeps the draft and saved
settings intact. Edited exclusion drafts are not labeled verified.

## Safety Boundary

`POST action=inspect_appeals` uses the existing reviewer authorization,
same-origin checks, and request-size limit. It returns private/no-store JSON
before acquiring a workspace mutation lease or reading recipient state.
No revision is needed and client-supplied provider URLs are never used.

The only NXT operation is the same fixed appeal-catalog GET already used by
settings verification: `/fundraising/v1/appeals?include_inactive=true&limit=5000`.
It has a five-second timeout and no request-level retries. Complete count,
bounded size, and unique system IDs are required; no pagination link is
followed. Upstream error bodies are not returned to the browser.

The picker exposes only lookup codes/descriptions, omitting inactive,
unknown-status, invalid, or ambiguous choices. Code/description uniqueness
uses the same case rules as the existing verifier, including inactive records
when detecting ambiguity. Choices are held only in component memory. Reload
is explicit, duplicate clicks share the in-flight request, and leaving aborts
the browser request. Typing, choosing, and changing societies do not call NXT.

Catalog results are suggestions, never authorization. Existing save operations
re-read NXT and validate exact descriptions, identity, distinct society appeals,
separation of sent/excluded appeals, permissions, period, revision, and lease.
No readiness, hierarchy, delivery, appeal-assignment, or exclusion behavior is
relaxed. There are no database migrations or dependency changes.

## Validation and Release

Automated coverage includes bounded GET-only reads, complete-catalog rejection,
inactive/ambiguous choices, private errors, role/origin/size protection, no lease
or recipient reads, explicit loading, local search, result limits, numeric
lookup codes, exact autofill, verification gates, failed-load preservation,
abort/double-click behavior, keyboard focus, and manual entry compatibility.

Final validation on September 25, 2026: 4,307 tests passed, with 21 opt-in
tests skipped. Typecheck, production build, release guard, and diff check
passed. Browser QA used fictional appeals in the actual page components:
desktop selection, 390-pixel mobile layout without horizontal overflow,
keyboard selection with focus restoration, and separate exclusion selection.
No production appeal lookup, settings save, or constituent write was performed
for step 4 validation.

Step 4 is local work and requires a separate deployment. Step 3 was deployed
to JU as `9d8039c`; sandbox was unchanged.

## Remaining UX Sequence

5. Make interrupted review easier to resume: remember the last unfinished
   recipient and preserve draft edits after conflicts, with a comparison
   instead of requiring a potentially destructive reload.
6. Provide a final batch summary: counts by society, joint/individual recipients,
   skipped households, and exact NXT appeals. Clearly distinguish Prepared,
   Mailed, and Email sent. This must not bypass the current delivery gates.
