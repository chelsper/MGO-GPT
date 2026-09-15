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

Recent gift/action sorting needs reliable dates and freshness metadata in the existing loaded portfolio data. Current activity caches are incomplete and connection-scoped; daily giving snapshots do not provide a uniform all-time activity signal. Do not fetch one summary per constituent, reuse another user's private activity cache, infer dates from narrative text, or present missing activity as no activity. A future step should first expose small, appropriately scoped saved-date fields without triggering NXT calls, then add clearly labeled optional sorts.

## Verification

Worklist and actual-page integration tests cover group scoping, duplicate membership, search, quick-view counts, pagination, Focus, unchanged category/rank data, unavailable-group recovery and workspace isolation. Browser QA uses synthetic records; new features are not tested against production until deployed.
