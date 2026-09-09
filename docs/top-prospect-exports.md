# Top Prospect Exports

## Entry points

- My Prospects > Top Prospects > Export prospects: export the current filtered list, preserving its order, or all active prospects in the current workspace.
- Advancement Services > Top Prospect Exports (`/prospect-exports`): search and multi-select active MGO users for one master export. Admins have the same access. Select all shown adds search results without dropping previous selections; Clear selection resets all choices.
- Closed/archived prospects and closed opportunity detail are explicit opt-ins. Normal exports include active prospects and open opportunities only.

## Workbook

Excel is the default. Prospect Summary contains one row per saved prospect/workspace. Opportunity Detail contains one row per linked opportunity/workspace. Export Notes explains the scope, saved-data semantics and attribution. Dates/numbers have native Excel types; headers are frozen and filterable. CSV is a summary-only alternative.

Columns and format are remembered per signed-in user in browser local storage. Workspace selections, donor data and inclusion of closed records are not stored as preferences. Contact columns are off by default. Required columns identify the MGO, constituent and prospect saved timestamp. Choosing optional cached information also adds its freshness column.

Portfolio rank is within the owner's active list, not a master-wide ranking. Pipeline uses saved open opportunity ask amounts, not the Team Standings FY revenue metric. Unknown amounts result in a blank pipeline instead of a partial total. Shared prospects and opportunities remain labeled by MGO; do not sum them as unique institutional totals. Opportunity references identify the same NXT/shared opportunity across workspaces.

## Data and safety

The export API reads saved prospects, opportunities, linked constituent identity, portfolio identity/giving snapshots and (when requested) existing recent activity caches. It never calls SKY or an AI model, runs portfolio enrichment, saves report snapshots, or changes any donor record. Normal application schema initialization still runs as it does for other authenticated routes. Exports do not require reconnecting Blackbaud.

Optional recent action/gift caches must match the selected workspace, current signed-in connection user and app origin. A master export cannot read another user's connection-private cache. Thus optional values may be blank even if an MGO has seen them in their own session. Latest known action may come from saved local action history; its NXT cache timestamp does not date that local action. Export notes describe this distinction. Saved timestamps do not claim current NXT verification.

The server independently validates all workspace and prospect IDs. MGOs can export their own workspace. Existing authorized executive/admin acting views can export the currently selected workspace. Only admin/Advancement Services session roles can request the multi-MGO master or list its roster. A changed/inaccessible filtered prospect makes the request fail visibly rather than silently producing an incomplete file. Changing the acting workspace invalidates an old export request.

Limits: 50 selected MGOs, 10,000 prospect rows, 1,000 linked opportunities per prospect and 25,000 exported opportunity rows. Larger selections fail visibly; nothing is silently truncated. CSV quotes fields and neutralizes formula-leading text. XLSX stores donor strings as literal text, never as formulas. Responses use attachment headers and `private, no-store`. No donor payloads, SQL errors or credentials are logged by the export route.

Keep downloaded files in approved institutional storage and share only with authorized recipients. Use Excel to retain text IDs and the full opportunity/freshness notes; CSV readers can infer their own column types.

## Verification

Tests cover 301 prospects, multi-opportunity separation, shared ownership, role enforcement, forged/changed IDs, filtered ordering, active defaults, cached-data isolation, missing versus zero values, calendar dates, CSV formula safety, real XLSX write/read-back, remembered choices and multi-MGO UI controls. No live NXT records are used in tests.
