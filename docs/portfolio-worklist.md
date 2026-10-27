# Portfolio Worklist UX

My Prospects > My Portfolio uses the existing portfolio, prospect and category responses. Sorting/filtering uses saved data and does not change assignments/categories or Top Prospects ranks. Visible expanded contact details can now request a lightweight contact check, as described below; they do not start full-summary or maintenance refreshes.

## Steps

1. Compact cards, optional full details, whole-list pagination and saved-data opportunity ordering.
2. All / Open opportunities / Follow-ups due quick views, with search-aware unique constituent counts.
3. Next step due and Largest open pipeline sorts. Missing values sort last; background updates do not reorder existing cards until Reapply sort.
4. Focus view: one open card at a time, Collapse details, and scroll correction when closing a tall previous card. Collapsing preserves mounted fields and loaded summaries. Compact and Detailed remain available.
5. Show group: when Organize by is My categories or Solicitor role, choose one group before pagination. This is a display filter, not the card's category-assignment control.
6. Last action / Last gift: oldest to newest or newest to oldest. These four options use the same verified saved dates displayed on the cards, never check/maintenance times, planned future actions, or narrative data. Missing/invalid dates and confirmed empty results sort last in both directions; ties sort by name then constituent ID. Sorting applies before pagination and within each selected group. Background arrivals do not reorder existing cards until Reapply sort. The choice is saved per viewer/workspace, without storing constituent data or triggering NXT requests.

## Group Filter

- Group-option counts reflect the current search and quick view across the full portfolio, not only the visible page. Quick-view counts reflect the selected group and search.
- Parent categories and subcategories are separate groups. Uncategorized is available when the existing category response provides it. A constituent appearing in multiple groups retains the existing first-group ownership rule and is counted once.
- Selecting a group starts at page one and retains the current sort, quick view and density. Show all groups removes only the group filter. Show all constituents in an empty result clears group, search and quick view.
- If the selected group disappears during a background update, the worklist stays empty with an Unavailable group option and recovery controls. It does not silently broaden the list.
- Group selection is saved with density, grouping, sorting, quick view and page size in this browser, separately for the signed-in viewer and selected MGO workspace. Returning to a portfolio restores that category or solicitor group, including after a reload. The visible Show group control, filter note and Show all groups button identify and clear the restored subset. Search, pagination and expanded constituent IDs still reset on a new visit. No constituent data or category names are added to browser storage; only the opaque group key is saved.
- Older saved preferences remain compatible, with All categories/roles until a specific group is chosen. A delayed profile key reloads the correct workspace's preferences before writing; it cannot overwrite another workspace's settings. Delayed category results show a loading state and retain the saved selection. A deleted group remains visibly unavailable until explicitly cleared, rather than silently broadening the list. Browser storage being blocked or cleared does not affect server-saved donor category assignments, but prevents remembering the display selection between visits.

## Quiet Rows And Saved Activity

- Compact and Focus rows show positive saved open-opportunity signals, real unfinished next steps, and available last gift/action dates. Unknown/zero opportunities, absent steps and missing dates do not produce filler messages. A row with no signals shows its name and details button.
- The portfolio endpoint projects dates, original check times and optional last-gift amount / last-action summary from the existing `prospect-activity-v1` cache and authorized workspace activity snapshots, alongside its existing bulk contact query. These entries come from the latest-gift endpoint and complete action responses; they are not inferred from FY gift totals, narrative text, scheduled actions or maintenance timestamps.
- Expanded Compact/Focus cards and Detailed view show the available dates, gift amount (including cents) and action description, with each original checked date. Descriptions use NXT's summary field, capped at 2,000 plain-text characters, not a separate full-note request. Missing amounts/descriptions are omitted, not replaced with zero or invented text. Collapsed cards still show dates only.
- Shared optional details live in an additive nullable `activity_details` JSONB column, bound to the same kind, record ID, date and checked time. The writer saves the tuple atomically; the reader rejects mismatched details, including after rollback to a date-only worker. New date-only or verified empty results clear prior details, and failed checks preserve the last successful tuple. Old date-only snapshots remain usable without invalidation or a forced refill. The newest eligible source wins as a whole; a newer date never borrows older details.
- Private activity caches still require an exact workspace, authorizing connection, constituent and origin-specific cache key. A privileged background service publishes separate minimal workspace snapshots, available to authorized MGO and acting Admin views of that workspace. It does not read another user's private cache or save activity into shared assignment JSON. Empty, malformed, future-dated and missing results remain hidden. The newest valid check wins, including a newer verified empty snapshot; old successful dates survive failed checks.
- Saved activity display adds no NXT requests, database round trips or per-card loaders. The opt-in background worker below fills missing dates without opening prospects and does not change the existing on-demand activity TTL. `About this view` explains coverage and freshness limits.

## Overnight Background Activity

- `PORTFOLIO_ACTIVITY_ENROLLMENT_MODE` is `allowlist` by default (including existing installations). This mode requires `PORTFOLIO_ACTIVITY_WORKSPACE_IDS`, comma-separated internal workspace user IDs, not fundraiser IDs. `active_mgos` discovers all active users with an MGO role, including combined roles, on each batch. `disabled` stops checks. Unknown modes fail closed. All enabled modes require `PORTFOLIO_ACTIVITY_ORIGIN`, the exact canonical HTTPS origin without a trailing slash; preview deployments are always disabled.
- Optional `PORTFOLIO_ACTIVITY_EXCLUDED_WORKSPACE_IDS` excludes workspaces in either enabled mode. It accepts up to 50 positive internal IDs, like the allowlist. A nonempty malformed exclusion disables the worker rather than ignoring the exclusion. Automatic enrollment has no 50-workspace admission limit; request and candidate-query caps still apply.
- `/api/internal/portfolio-activity-refresh` requires the existing cron secret. Its schedule is offset five minutes from existing portfolio maintenance and ordinarily works from 1:00 AM through 6:59 AM Eastern. An authenticated operator can use `?force=1` for one bounded batch outside that window; it does not bypass enrollment, lease, request budget or Blackbaud cooldown. No browser has to remain open. The subsequent local, default-off morning catch-up option is documented in `portfolio-activity-catchup.md`; it is not yet deployed or enabled.
- The configured report-refresh connection must resolve to an active authorized Admin/Advancement Services user. The worker reads only enrolled active workspaces' currently saved assigned constituents. New assignments enter the queue on the next pass; removed assignments stop being selected. Assignment freshness still follows existing portfolio maintenance. Automatic enrollment reads only local user metadata: it does not change roles, mappings, connections, or assignment snapshots.
- New MGOs still require normal fundraiser mapping and an initial portfolio assignment sync. Once those saved assignments exist, no separate activity enrollment step is needed in `active_mgos` mode. Creating an account, opening a page, or reading Integration Health does not launch activity requests. Workspaces without saved assignments queue no constituents. Integration Health reports enrollment mode, enrolled workspace count, and missing initial assignment snapshots.
- Each constituent has independent gift/action rows in `portfolio_activity_snapshots`. These hold record ID, date, optional finite gift amount / bounded action summary, original check time, service-user provenance and queue state, not full action notes or donor records. Reuse checks only the service user's exact existing activity-cache key. Other saved narrative/FY payloads cannot establish an all-time latest date and are not promoted.
- Each invocation processes at most 20 queue rows and reserves at most eight SKY request slots. One database query reads at most 20 candidates per lane (60 total); the scheduler selects at most 20 of those. A database lease serializes activity workers across workspaces, tabs and server instances. A shared origin-wide cap permits at most 360 slots per Eastern calendar day, including failed attempts. Requests have an eight-second timeout, no internal retry, and 500 ms spacing. The existing subscription quota breaker remains in effect. This cap is additional to, not a substitute for, the provider's limits or other app workloads.
- Latest gifts use the constituent latest-gift endpoint, not the full gift history. Actions use the constituent-specific actions endpoint without FY/fundraiser filtering and exclude future dates. When pagination is returned, the worker saves a validated same-endpoint cursor, seen IDs and latest candidate, resuming in a later batch. It publishes only a complete result. Repeated cursors, mismatched counts/constituents, malformed data, expired scans or more than 10,000 actions/100 pages are deferred rather than reported as no activity. Such exceptional records need investigation; no unbounded fallback scan is launched.
- A latest-gift HTTP 404 with exactly one structured SKY error named `ConstituentDoesNotHaveGifts` and numeric error code `404` is a verified empty gift result, not an hourly failure. It uses the normal successful-check cadence and clears obsolete gift details. Generic 404s, constituent-not-found errors, mixed/malformed errors, authorization failures and the same error on an action request remain unverified. No message-text matching, extra confirmation request or full-gift-history fallback is used.
- First-fill records, pending complete-action scans and confirmed action-write hints share a priority lane. Routine checks and retries have their own lanes. When all lanes have work, the first eight selected rows include four priority, three routine and one retry; empty lanes release their slots. Cache reuse can save a request slot, but no invocation exceeds eight SKY calls. Rows within each lane rotate across workspaces, least-recently-served first, using a new nullable `last_attempt_at` timestamp recorded on saves and deferrals. Large portfolios and repeated errors cannot monopolize the entire batch when other work is due. Within a workspace, incomplete scans and then confirmed write hints precede new first-fill rows, helping scans finish before expiry and preventing newly logged actions from sitting behind a long initial backlog.
- Successful checks become eligible again after 24 hours plus a stable per-row spread of zero to six hours. This is eligibility, not a promise of a check every 30 hours: overnight windows, backlogs, pagination and shared budgets still apply. Existing queue deadlines are not reset or bulk rewritten. A newly created action confirmed by NXT requests an earlier check for that constituent in enabled portfolios, without asserting that it is the latest; a newer hint received during a read still overrides the stagger. Hint failures never fail or retry the user's successful write. External NXT edits/deletions and edits to existing app actions are caught by subsequent scheduled checks; no webhook or real-time guarantee is introduced here.
- Throttling and connection failures pause the worker and persist its retry delay. Other unverifiable responses defer the individual kind for an hour. A gift success survives an action failure. Interrupted jobs resume after the bounded lease expires. Saves are token-fenced and cannot overwrite newer successful checks; a write hint received during a check remains due afterward.
- The first fill can take multiple nights depending on portfolio size, pagination and quota availability. It does not block the page, expand cards, change sorting, start full summaries or add a large maintenance banner.
- Richer saved details do not expand the workspace allowlist, change scheduling/budgets/TTL, or reset queue/check timestamps. Date-only snapshots gain optional details on normal successful checks. Unverified pilot responses and broader portfolio coverage remain a separate operational rollout; this display change does not promise dates for every constituent immediately.

### Pilot Verification And Rollback

1. Run the unit/integration suites, typecheck and production build. The optional `apps/web/scripts/check-portfolio-activity-postgres.mjs` runs actual store and portfolio SQL against an explicitly supplied disposable local PostgreSQL socket and removes its uniquely named synthetic schema.
2. Configure one approved workspace ID and the canonical production origin. After deployment, run one secret-authenticated batch; compare last dates with NXT for representative old gifts, multiple actions, future-only actions and known empty results. Verify the same saved results as both the MGO and an acting Admin. Confirm there are no activity requests on page loading, sorting or expansion.
3. Check subsequent scheduled invocations resume work without a browser and preserve the daily cap. Only expand the allowlist after this pilot succeeds. Do not promise all portfolios will fill overnight.
4. To stop new reads in either mode, set `PORTFOLIO_ACTIVITY_ENROLLMENT_MODE=disabled` and redeploy; an in-flight bounded batch may finish. To return to a selected pilot, set mode `allowlist` and its approved workspace IDs, then redeploy. Clearing the allowlist alone does not disable `active_mgos`. Saved dates remain available. No NXT data was modified and no snapshot deletion is needed.

### Staged Coverage Expansion (Pilot Runbook)

- Keep the existing workspace allowlist unchanged until the no-gifts fix has a successful live recheck and the fair scheduler has been deployed. Do not clear saved failures just to make the health page appear complete.
- The existing six-hour window and ten-minute cadence provide at most 36 scheduled batches, or 288 request slots nightly, below the 360 hard daily cap. Each constituent needs at least two calls for first-fill (gift plus action), before action pagination. Count workspace-scoped assignments, not unique people across the organization. Saved values remain visible throughout rollout.
- Add only one approved workspace per rollout, starting with a smaller portfolio. Record gift/action totals, never-verified rows, explicit empty results, error counts, request use and oldest successful check separately. Verify the first-fill backlog falls while the existing pilot continues receiving routine checks; allow multiple nights rather than raising caps or forcing a full refresh.
- Only add another workspace after those checks pass. If throttling, persistent errors or stalled progress appear, pause expansion and investigate. Do not reconnect accounts, reset queues, or change credential access to force acceptance. A production cron secret configured as non-readable must remain non-readable; wait for scheduled execution when a supported manual invocation is unavailable.
- The scheduler migration only adds a nullable timestamp. It does not delete snapshots, renew old checks or rewrite deadlines. An older worker can ignore the column after rollback; no reverse data migration is needed. Queue fairness becomes accurate as the new worker records attempts.

### September 19 Expansion Preparation

- The read-only overnight audit of the original pilot (Leslie, workspace 7) found 215 verified gift results and 215 verified action results, no current errors or pending action scans, and 288 reserved requests across 36 successful scheduled invocations. Confirmed empty results count as verified, not missing. Richer details still fill on routine checks.
- The production environment allowlist is now staged as `7,10`, adding only Scott (workspace 10, 81 saved assigned constituents). Environment changes apply on the next production deployment; this preparation did not redeploy or run a refresh. All existing timing, request caps, service permissions, origin restrictions and cooldowns remain unchanged. Restore `7` and redeploy to stop Scott's future checks without deleting saved snapshots.
- Both portfolios together have 296 workspace-scoped constituents and need at least 592 requests for a complete gift/action pass before pagination. With 288 scheduled slots nightly, completion and ongoing checks span multiple nights. After deployment, verify Scott's first-fill backlog falls while Leslie's existing saved results continue to receive routine checks before adding another workspace.
- The earlier two-workspace pilot used manual admission. The subsequent approved automatic-enrollment rollout below replaces that production selection while retaining the allowlist as a rollback option.

### Automatic Enrollment Rollout

- Enable `PORTFOLIO_ACTIVITY_ENROLLMENT_MODE=active_mgos` on the canonical production deployment after tests and the successful pilot audit. Retain `7,10` as the fallback allowlist; it is ignored in automatic mode. Leave exclusions empty unless an operator deliberately pauses a workspace. No queue reset, forced catch-up pass, NXT write, credential change, or budget increase is part of this rollout.
- The September 19 read-only roster has five active MGO workspaces and 908 workspace-scoped assigned constituents: at least 1,816 requests for a full gift/action pass before pagination. At 288 scheduled slots per night, even the minimum needs more than six nightly windows; retries, routine work, and pagination can take longer. Automatic enrollment does not mean every record is refreshed every night.
- Each scheduled batch discovers new active MGOs and drops inactive, role-removed, and excluded workspaces from eligibility. Saved results are retained. Fair queues distribute the existing shared budget across enrolled portfolios, including newly added portfolios. New accounts with no saved assignment snapshot wait for normal onboarding, rather than starting a broad NXT discovery scan.
- Check Setup > Integration Health > Last gift / action enrichment for `Automatic enrollment: active MGOs`, the expected workspace count, setup gaps, first-fill backlog, failures, cooldowns, and the unchanged 360-call daily cap. Recheck saved progress after overnight windows. Persistent throttling, errors, or unchanged backlogs should be investigated, not bypassed with repeated manual syncs.
- The per-portfolio coverage view separates records with both checks saved from records waiting for a first gift/action check. It also shows due check counts, classified errors, latest success, and expandable oldest-check/latest-attempt evidence. Verified empty results count as checked; first-fill counts, due checks, and errors overlap. The view reads saved worker snapshots only, does not promise amounts/descriptions for every record, and cannot prove an overnight run finished solely from a recent timestamp.

## Lightweight Contact Refresh

- Saved contact details appear immediately and remain visible while a check runs or fails. A contact-only check is eligible when details are expanded and on-screen and their saved check is missing or at least 24 hours old. Confirmed empty contacts also count as checked. Collapsed/off-screen cards and the local-only fallback do not fetch contacts. Detailed view checks only visible details, not the whole page or portfolio.
- One request at a time per mounted viewer/workspace, with a short opening delay and 750 ms spacing. Closing/scrolling away cancels queued work. Hidden browser documents pause the queue. Reopening or regrouping a checked card reuses its result for the visit; contact values are never put in localStorage.
- The new `portfolio-contact` endpoint verifies the signed-in viewer, acting workspace, and membership in the saved assignment list. It rechecks saved contacts on the server before accessing NXT. Reads use the viewing admin's connection when acting for an MGO, otherwise the MGO's own connection.
- An atomic, expiring database lease allows only one contact request per authorizing connection/origin across tabs and server workers. The endpoint calls only the exact constituent GET with an 8-second request timeout and no internal retries. It does not search for another constituent, retrieve gifts/actions, rebuild a narrative, or run maintenance.
- A successful read saves a separate contact cache entry. Workspace, connection, constituent and origin are scoped; older concurrent responses cannot overwrite a newer contact-only save. No assignment, giving, or full-summary refresh timestamp is renewed. The existing bulk portfolio read picks these contacts up without an extra database round trip.
- Throttling, a busy connection, network failures, and unverifiable responses stop automatic contact work. Saved values remain visible with a small contact-specific notice and a Retry control after the cooldown. Unknown failures never clear contacts or start a retry loop. A database failure prevents new NXT requests when the shared gate cannot be acquired.
- This is not change detection: unchanged records may receive an on-demand check after 24 hours. NXT change notifications and changes to nightly schedules remain separate, deferred steps.

## Next-Step Editor

- My Portfolio and Top Prospects share the same title, optional notes and due-date fields. Today, Tomorrow and In 1 week use Eastern calendar dates; No date clears an existing due date. Existing notes remain available when collapsed.
- The editor identifies the selected workspace owner and explicitly labels these as JUMGOGPT-only pending actions, not NXT action logs. Existing Admin attribution and server-side workspace permissions are unchanged. Opening the Portfolio next-step editor makes no request; no new queries, NXT calls or maintenance work are added to either editor.
- Portfolio prevents repeat submissions while saving, retains drafts on failure, asks before discarding unsaved input, and traps/restores keyboard focus. Top Prospects preserves a dirty draft through saved-data refreshes and refuses to save against a different primary step if that change arrives during editing. This is client-side draft protection, not a server-side concurrent-edit lock.
- Explicitly clearing a due date, notes or discussion note now differs from omitting that field in a partial update. Omitted values remain unchanged. Existing completion and discussion-link behavior is retained; reassignment and a larger Team Discussion redesign remain separate work.

## Verification

### Portfolio Log Action Panel

- Log action opens a right-side panel in Compact, Focus and Detailed views without unmounting the worklist. Search, grouping, category, pagination, expansion and scroll stay in place; closing returns focus to the initiating button. Mobile uses a full-width panel with a scrollable body and persistent footer.
- The selected constituent is fixed. Opening reads only the current app profile, verifies the viewer/workspace, and shows the credited fundraiser plus Admin author where applicable. It does not load a constituent summary or refresh NXT contacts.
- Date, category, interaction type and summary are the primary fields. Optional notes expand in place. The existing full form remains available for dictation, additional fundraiser credit, opportunity links and new reminders; a dirty quick draft must be explicitly discarded before switching, and does not transfer.
- Both forms use `submitActionUpdate` and the existing donor-update/prospect-action endpoints. Panel requests include a pinned viewer/workspace/constituent context. Server validation, NXT fundraiser attribution, durable create receipts and read-back verification remain authoritative. A selected prospect's failed identity preflight does not trigger fuzzy link repair from this panel.
- Quick logging deliberately leaves existing next steps and pending reminders unchanged. The full form's existing follow-up behavior is unchanged. Successful saves invalidate relevant app caches without starting a bulk portfolio refresh.
- The panel never automatically retries a write. Explicit pre-write rejection permits correction; uncertain results lock the form and link to Saved NXT submissions. A tab-scoped attempt marker contains only timing/receipt metadata, not donor names or notes. Read-only receipt checks can confirm a completed/verified result; absent or unresolved receipts never unlock automatic resubmission.
- In-flight saves prevent closing. Dirty drafts have an in-panel discard choice and a reload warning. Desktop/mobile QA uses fictional records and an entirely mocked transport, not live NXT writes.

Worklist and actual-page integration tests cover group scoping, duplicate membership, search, quick-view counts, pagination, Focus, unchanged category/rank data, unavailable-group recovery and workspace isolation. Browser QA uses synthetic records; new features are not tested against production until deployed.

Next-step tests cover date boundaries, optional notes, request counts, failed saves, duplicate submission, keyboard focus, draft refreshes, changed primary steps, explicit field clearing and workspace write permissions. Synthetic browser QA checks the shared fields at desktop and narrow card widths without writing production records.

## Category Preference Release: 2026-10-16

Deployed source: `f7bf5cef9ff86e478a0327a8b256009c0bde0f28`.
JU deployment: `dpl_8XhJaVFLYxD4PvAdDNapDJq5A3oy`, hosted at
`mgo-ifwpsxq3l-chelspers-projects.vercel.app`, promoted to
`https://www.jumgogpt.app` after protected-candidate verification.
Rollback target: `dpl_GUXkUsaQjUjRv3YqNZN1Y6rBjVhN`, source
`e570cf265ae219b246145f9aa448c3ccca411d36`.

The selected category/solicitor group is now part of the existing browser-local
viewer/workspace preference. Workspace-key changes remount the view before a
save can overwrite another workspace's preference. Initial category loading
keeps the selection and shows a loading notice. Existing preferences remain
compatible; users must choose a category once because earlier versions did not
store that selection. This does not sync preferences across browsers/devices.
No database schema or NXT integration changes are included.

Fresh full regression: 6,969 passed, 192 existing environment-dependent skips.
All 151 focused portfolio tests and all 92 isolated campaign database tests ran
and passed. Coverage includes page/tab remounts, delayed profiles/categories,
viewer/workspace changes, older/corrupt/blocked storage, deleted categories,
explicit filter clearing, and unchanged donor assignments. Typecheck, local and
hosted builds, whitespace checks, and the release guard passed.

The committed archive supplied 1,420 hash-verified upload files. Unrelated local
changes, including the existing overnight-activity documentation edit, were
excluded and preserved. No Git push was performed. Candidate and live checks
verified the exact release identity, portfolio and existing campaign feature
assets, page responses, and unauthenticated API access guards. Live functional
category changes and existing-session version cookies were not exercised.

JU settings and all five cron schedules are unchanged, with cron hosts following
the promoted release. The sandbox and all other Vercel projects were unchanged.
No authenticated data writes, portfolio sync, campaign refresh, or NXT record
updates were performed. These verification notes are committed separately from
the deployed application source.

Evidence: `/private/tmp/ju-portfolio-category-release-*`,
`/private/tmp/ju-portfolio-category-deploy-*`,
`/private/tmp/ju-portfolio-category-candidate-smoke.log`,
`/private/tmp/ju-portfolio-category-live-smoke.log`, and
`/private/tmp/ju-portfolio-category-verify-prod.log`.
