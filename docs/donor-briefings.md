# Saved Donor Briefings

First step of the combined AI/workflow improvement roadmap. This is a
deterministic briefing, not a new external AI-provider integration.

## Surfaces

- Top Prospects: expand **Donor briefing** in the constituent summary panel.
- My Portfolio: show a card's details, then expand **Donor briefing**.
- Prospect Pool and other legacy narratives are unchanged in this release.

## Data And Loading

The shared pure builder in `apps/web/src/utils/donorBriefing.js` describes only
supplied saved facts: education/business connection, lifetime giving, latest
gift/action, open opportunities, saved pledge report, and open next step.
Unavailable sections are omitted, not interpreted as no giving or engagement.
No interests, intent, or recommended outreach are inferred.

Top Prospects reuses its existing recent-activity query once for both the
briefing and activity cards. Its existing summary/activity loading policy is
unchanged. Loaded app opportunities take precedence over old narrative prose
or the summary's limited proposal sample. Closing an opportunity or completing
a next step updates the briefing when the existing detail query updates.

Portfolio list/card opening does not request a briefing. Explicit expansion
reads `/api/blackbaud/constituents/:id/summary?saved_only=1`, which returns the
newest available saved summary, including expired snapshots with their original
check dates. A miss returns an empty mapped result, never a live NXT fallback.
Workspace authorization and connection-scoped cache reads remain enforced.
The existing **Refresh this summary** action still explicitly refreshes NXT.
Previously saved briefing information stays visible during refresh and failure.

Dates appear beside their sources; a recent giving check does not imply that
relationship information was also refreshed. Pledge balances remain integer
cents and stale/incomplete report data is qualified. Draft/recommendation text
from legacy narratives is never used as evidence.

## Verification

Coverage includes cache-only misses/expired snapshots/authentication, rejected
live-refresh combinations, wrong-constituent summaries, missing/invalid values,
future action dates, closed opportunities, duplicate opportunity IDs, completed
next steps, source dates, refresh failure, no added reads, and workspace changes.
UI preview uses synthetic records only, not a production database or credentials.

## Next Steps

1. Dashboard-only Nellie priorities using verified facts, with snooze/dismiss.
2. Gift-driven stewardship prompts with gift-level deduplication.
3. Missing-documentation checks only when history coverage is known complete.
4. Reviewed drafting and meeting preparation, then a small pilot.

These follow-on steps are not implemented by this release. No donor writes,
database migration, background schedules, or production/sandbox deployment
are part of the briefing change.
