# Architecture And Data Ownership

Reviewed September 17, 2026. See the application SHA and verification evidence in
[Developer Handoff](../DEVELOPER_HANDOFF.md). This is the implemented system, not
a proposed multi-tenant architecture or a security certification.

## Request And Deployment Model

```text
Browser / React 18
  -> React Router 7 + Vite, Hono server entry
  -> authenticated API routes under src/app/api
  -> server-side role and workspace checks
  -> Neon/Postgres app records, caches, and write receipts
  -> Blackbaud SKY API only where the workflow requires it

Vercel cron -> authenticated internal routes -> bounded refresh workers
Resend     <- notification workflows
Okta/Auth.js -> app identity; Blackbaud OAuth -> separate CRM connection
```

The production application is `apps/web`. The mobile/generated root scaffold is
not the web deployment. `src/__create`, `__create`, and build plugins contain
runtime plumbing; do not remove them as unused code without a build and route test.

## Code Map

Paths below are relative to the repository, not a developer's machine.

| Responsibility | Entry point |
| --- | --- |
| Web dependencies and commands | [package.json](../apps/web/package.json) |
| Server/build integration | [vite.config.ts](../apps/web/vite.config.ts) |
| Sign-in providers | [auth route](../apps/web/src/app/api/auth/[...auth]/route.js) |
| Roles and acting-workspace rules | [workspaceRoles.js](../apps/web/src/utils/workspaceRoles.js) |
| Actual user versus workspace owner | [getWorkspaceUser.js](../apps/web/src/app/api/utils/getWorkspaceUser.js) |
| Write authorization | [workspaceWritePermission.js](../apps/web/src/app/api/utils/workspaceWritePermission.js) |
| Database initialization | [ensureAppSchema.js](../apps/web/src/app/api/utils/ensureAppSchema.js) |
| NXT transport and pagination | [blackbaud.js](../apps/web/src/app/api/utils/blackbaud.js) |
| Main prospect UI | [My Prospects](../apps/web/src/app/my-top-prospects/page.jsx) |
| Portfolio presentation and explicit summary reads | [PortfolioTier.jsx](../apps/web/src/app/my-top-prospects/PortfolioTier.jsx), [usePortfolioSummary.js](../apps/web/src/app/my-top-prospects/usePortfolioSummary.js) |
| Portfolio refresh/category controls and local follow-up composer | [Module ownership map](my-prospects-modules.md) |
| Prospect-detail summary, opportunity, and activity presentation | [Module ownership map](my-prospects-modules.md#ownership-map); query, editor, confirmation, and mutation ownership remains in the parent |
| Reminder-linked NXT action state | [pendingActionNxt.js](../apps/web/src/app/api/utils/pendingActionNxt.js) |
| Report audience checks | [reportAccess.js](../apps/web/src/app/api/utils/reportAccess.js) |
| Organization settings | [organizationSettings.js](../apps/web/src/app/api/utils/organizationSettings.js) |

The step 6 first pass extracts portfolio presentation, refresh/category controls,
the local follow-up composer, and giving helpers from My Prospects behind existing
and direct behavior tests. The second pass extracts prospect-detail display while
retaining parent-owned editors, drafts, confirmations, and mutation callbacks.
Both leave workspace/query orchestration and legacy NXT write routes unchanged.
See the [module map](my-prospects-modules.md)
for local versus deployed status and the next bounded slices. Large UI and
integration files still need incremental extraction, not a prerequisite rewrite.
Route authorization must remain server-side.

## Permissions

Roles can be combined. Stored identifiers are `admin`, `advancement_services`,
`executive`, and `mgo`; changing visible terminology does not change permissions.
Legacy role names are normalized at the boundary.

| Actor/context | Current boundary |
| --- | --- |
| MGO in own workspace | Authorized prospect and follow-up work within that workspace; each endpoint still checks its own access rules |
| Executive viewing an MGO | Read-only acting view; Executive alone does not grant delegated writes |
| Admin viewing an MGO | Delegated editing is allowed; the Admin remains the actor, the selected MGO is the workspace owner and fundraiser-credit target |
| Admin viewing an Executive-only workspace | Viewing is permitted; delegated editing requires the target to have the MGO role |
| Admin or Advancement Services | Reviewer/management capability, including access management and organization settings under current route guards |
| Pledge Payments and master Top Prospect export | Actual active Admin/Advancement Services identity, not permission borrowed from an acting workspace |
| Shared reports | Report-specific audience checks; no universal Admin bypass for published configurable dashboards or custom-field reports |
| Dashboard arrangement | Admin-only layout controls; not a substitute for report audience authorization |

Treat four identities separately: authenticated actor, selected workspace owner,
NXT connection owner, and credited fundraiser. Do not infer any of them from a
display name or client-supplied ID. Invalid/inactive acting targets fail write
authorization. Combined roles must be tested, not reduced to the first role.

Configuration managers may preview drafts where the relevant route permits it;
that does not grant every manager access to every published report. Query output
labels and formatting are not column-level privacy controls.

## Sources Of Truth

| Data | Authority and local representation |
| --- | --- |
| Constituent identity, contact details, gifts, installments, fundraiser assignments | NXT is authoritative. App records and snapshots are saved views, not proof of current NXT values |
| User access and fundraiser mapping | App `users` and invitations; NXT verifies the mapped fundraiser for protected writes |
| Top Prospect membership, rank, categories, workflow status | App `prospects`, `portfolio_categories`, and `portfolio_category_assignments` |
| Primary next step and additional reminders | App prospect next-action fields and `pending_actions`; completing one is not an NXT action write |
| Team discussion | App `discussion_items`, participants, and constituent links; resolution is independent of reminder completion |
| Linked opportunities | NXT-backed opportunity fields plus local workflow state in `prospect_opportunities`; use the owning route's mapping, not a generic bidirectional merge |
| NXT action submission evidence | `pending_action_nxt_receipts` for reminder-linked actions; older action/submission paths have their own stored IDs and sync state |
| Import identity and writes | `constituency_import_runs`, rows, creation lock, and creation attempts; persistent checkpoints must survive retries and browser sessions |
| Portfolio saved data | Summary, contact, activity, giving, and constituent snapshots have different scopes and freshness rules |
| Standings and shared reports | `report_snapshots_cache` plus report configuration and audience; snapshot time is part of the result |
| Pledge worklist | Query 12033 bounds discovery; `pledge_payment_jobs` and items retain verified results and checkpoints |
| Requests and operational history | `submissions`, list/data requests, pool records, and assignment audits; queue eligibility is distinct from historical status |

See [field mapping](blackbaud-field-mapping.md) and [metric definitions](metrics-and-reporting.md)
before changing meaning or attempting reconciliation. A cached blank is not a
confirmed absence; a cached ID match is not authorization for an import write.

## Refresh Boundaries

| Data | How it refreshes |
| --- | --- |
| Portfolio contacts | Saved data first; expanded visible records may make a bounded contact-only check after the freshness interval. Per-connection/origin gates prevent parallel refresh storms |
| Portfolio giving and full summaries | Scheduled overnight maintenance and explicit refresh, with separate freshness policies, checkpoints, and throttling controls |
| Last gift/action dates | Dedicated saved activity snapshots with opt-in, budgeted enrichment; not a full NXT read on every card render |
| Built-in shared reports | Saved reads; explicit refresh or scheduled due-time processing. A scheduled invocation is not a guarantee of a successful refresh |
| Pledge Payments | Explicit browser-driven, checkpointed refresh; normal reads and tab changes use saved results |
| Imports | Explicit staged workflow, resumable row-level progress; leaving the page does not authorize a background import |
| Prospect exports | Saved app data only; exporting must not trigger NXT enrichment |

Preserve cache scoping by connection, workspace, and origin where used. Some
workspace-visible projections deliberately share authorized saved results; do not
replace these checks with a global union of private connection caches.

Portfolio maintenance retries reads under bounded budgets; this is not permission
to retry CRM creates. Keep last-good values on failures, expose stale/unknown states,
and respect shared cooldowns. Universal NXT webhook/change-feed invalidation is
not implemented. Details: [portfolio worklist](portfolio-worklist.md),
[giving cache](portfolio-giving-cache.md), and [pledge payments](pledge-payments.md).

## Write And Recovery Boundaries

- Reminder-linked actions persist submission intent and the returned NXT action
  ID. A known/uncertain submission blocks a second create from that reminder.
- Planned actions remain incomplete. Verified planned creation does not record
  completed local activity or complete the app reminder.
- Completed-action flow verifies identity, metadata, and completion before recording
  local success; optional reminder completion has a separate guarded condition.
- Recovery for a known action ID reads that same action. It does not create another
  action, silently complete the reminder, or rewrite NXT to match expectations.
- Imports recheck identity and duplicates, claim a creation lock, and retain durable
  attempt evidence. A timeout or incomplete check must not become a clear nonmatch.
- Existing action and opportunity routes have different histories and safeguards.
  Do not claim the new reminder receipt protocol covers every NXT write route.

## Configuration And Adaptability Limits

`organization_settings` is a singleton, not an institution/tenant boundary. Labels,
branding, selected mappings, and report audiences are configurable, but July fiscal
years, Eastern time, specific query IDs, and some report definitions remain in code.
The authentication domain policy also uses environment configuration. A setting's
presence does not prove every consumer uses it.

Step 5 phase 1 connects profile branding and terminology to the shared AppShell,
adds revision-checked profile saves and atomic audit rows, and centralizes the
existing standings calendar and pledge query contract. Protected reporting
preferences cannot be changed through profile saves. Other consumers still have
institution-specific rules; the policy constant is not a supported customization
switch. See [organization configuration](organization-configuration.md) for the
coverage map, rollout limits, and deployment status.

Schema setup is runtime `ensureAppSchema()` DDL and compatibility logic, not a
versioned migration/rollback system. Establish migration and restore discipline
before broad schema refactors.

Both the root and `apps/web` contain Vercel manifests. They currently differ,
including the activity refresh schedule. Confirm the effective project root and
deployed schedules before changing either. See the [release checklist](production-deploy-checklist.md).
