# Portfolio Worklist UX

My Prospects > My Portfolio uses the existing portfolio, prospect and category responses. The worklist controls do not request NXT data, change assignments/categories, change Top Prospects ranks, or start refreshes.

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
- Opening, expanding, filtering and sorting the list add no NXT requests, database round trips, per-card loaders or refresh jobs. This does not populate activity for previously unopened prospects or change the existing on-demand activity TTL. `About this view` explains the coverage and freshness limits.

## Verification

Worklist and actual-page integration tests cover group scoping, duplicate membership, search, quick-view counts, pagination, Focus, unchanged category/rank data, unavailable-group recovery and workspace isolation. Browser QA uses synthetic records; new features are not tested against production until deployed.
