# Portfolio Worklist UX

My Prospects > My Portfolio uses the existing portfolio, prospect and category responses. Sorting/filtering uses saved data and does not change assignments/categories or Top Prospects ranks. Visible expanded contact details can now request a lightweight contact check, as described below; they do not start full-summary or maintenance refreshes.

## Steps

1. Compact cards, optional full details, whole-list pagination and saved-data opportunity ordering.
2. All / Open opportunities / Follow-ups due quick views, with search-aware unique constituent counts.
3. Next step due and Largest open pipeline sorts. Missing values sort last; background updates do not reorder existing cards until Reapply sort.
4. Focus view: one open card at a time, Collapse details, and scroll correction when closing a tall previous card. Collapsing preserves mounted fields and loaded summaries. Compact and Detailed remain available.
5. Show group: when Organize by is My categories or Solicitor role, choose one group before pagination. This is a display filter, not the card's category-assignment control.

## Group Filter

- Group-option counts reflect the current search and quick view across the full portfolio, not only the visible page. Quick-view counts reflect the selected group and search.
- Parent categories and subcategories are separate groups. Uncategorized is available when the existing category response provides it. A constituent appearing in multiple groups retains the existing first-group ownership rule and is counted once.
- Selecting a group starts at page one and retains the current sort, quick view and density. Show all groups removes only the group filter. Show all constituents in an empty result clears group, search and quick view.
- If the selected group disappears during a background update, the worklist stays empty with an Unavailable group option and recovery controls. It does not silently broaden the list.
- Group selection, search and expanded constituent IDs are in-memory only. Returning to a workspace does not restore a hidden subset. Existing density, grouping, sorting, quick-view and page-size preferences remain scoped to the signed-in viewer and selected workspace. No constituent data or category names are added to browser storage.

## Deliberately Deferred

Recent gift/action sorting remains deferred: saved activity coverage is incomplete, and daily giving snapshots do not provide a uniform all-time activity signal. Missing activity is not evidence of no activity. No new sorting or background refresh behavior is introduced by the saved-date display below.

## Quiet Rows And Saved Activity

- Compact and Focus rows show positive saved open-opportunity signals, real unfinished next steps, and available last gift/action dates. Unknown/zero opportunities, absent steps and missing dates do not produce filler messages. A row with no signals shows its name and details button.
- The portfolio endpoint projects only dates and original check times from the existing `prospect-activity-v1` cache, alongside its existing bulk contact query. These entries come from the latest-gift endpoint and complete action responses; they are not inferred from FY gift totals, narrative text, scheduled actions or maintenance timestamps.
- Activity requires an exact workspace, authorizing connection, constituent and origin-specific cache key. It is not read from another connection or saved into shared assignment JSON. Empty, malformed, future-dated and missing results remain hidden. Old successful checks remain usable with a saved label and checked-date tooltip, not a claim of live freshness.
- Saved activity display adds no NXT requests, database round trips, per-card loaders or refresh jobs. This does not populate activity for previously unopened prospects or change the existing on-demand activity TTL. `About this view` explains the coverage and freshness limits.

## Lightweight Contact Refresh

- Saved contact details appear immediately and remain visible while a check runs or fails. A contact-only check is eligible when details are expanded and on-screen and their saved check is missing or at least 24 hours old. Confirmed empty contacts also count as checked. Collapsed/off-screen cards and the local-only fallback do not fetch contacts. Detailed view checks only visible details, not the whole page or portfolio.
- One request at a time per mounted viewer/workspace, with a short opening delay and 750 ms spacing. Closing/scrolling away cancels queued work. Hidden browser documents pause the queue. Reopening or regrouping a checked card reuses its result for the visit; contact values are never put in localStorage.
- The new `portfolio-contact` endpoint verifies the signed-in viewer, acting workspace, and membership in the saved assignment list. It rechecks saved contacts on the server before accessing NXT. Reads use the viewing admin's connection when acting for an MGO, otherwise the MGO's own connection.
- An atomic, expiring database lease allows only one contact request per authorizing connection/origin across tabs and server workers. The endpoint calls only the exact constituent GET with an 8-second request timeout and no internal retries. It does not search for another constituent, retrieve gifts/actions, rebuild a narrative, or run maintenance.
- A successful read saves a separate contact cache entry. Workspace, connection, constituent and origin are scoped; older concurrent responses cannot overwrite a newer contact-only save. No assignment, giving, or full-summary refresh timestamp is renewed. The existing bulk portfolio read picks these contacts up without an extra database round trip.
- Throttling, a busy connection, network failures, and unverifiable responses stop automatic contact work. Saved values remain visible with a small contact-specific notice and a Retry control after the cooldown. Unknown failures never clear contacts or start a retry loop. A database failure prevents new NXT requests when the shared gate cannot be acquired.
- This is not change detection: unchanged records may receive an on-demand check after 24 hours. NXT change notifications and changes to nightly schedules remain separate, deferred steps.

## Verification

Worklist and actual-page integration tests cover group scoping, duplicate membership, search, quick-view counts, pagination, Focus, unchanged category/rank data, unavailable-group recovery and workspace isolation. Browser QA uses synthetic records; new features are not tested against production until deployed.
