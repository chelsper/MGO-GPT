# Blackbaud NXT Field Mapping

This is the working mapping sheet for syncing data between `jumgogpt.app` and Blackbaud Raiser's Edge NXT.

Use this document to decide:
- which app fields should map to NXT
- which NXT field is the source of truth
- whether the flow is `pull`, `push`, `bidirectional`, or `local only`
- any special selection rules such as "Primary only"

Recommended rollout:
1. Start with `pull` mappings only.
2. Link local records to Blackbaud IDs.
3. Keep workflow-only fields local until read-only sync is stable.

## Direction Guide

| Direction | Meaning |
|---|---|
| `pull` | Data comes from Blackbaud into the app |
| `push` | Data originates in the app and writes to Blackbaud |
| `bidirectional` | Data may update in either system |
| `local only` | Stay in the app only; do not sync to Blackbaud |

## Constituent

| App entity | App field | Blackbaud object | Blackbaud field / endpoint | Selection rule | Direction | Source of truth | Notes |
|---|---|---|---|---|---|---|---|
| `constituents` | `blackbaud_constituent_id` | Constituent | `id` | Store exact NXT constituent ID | `pull` | Blackbaud NXT | Primary link key |
| `constituents` | `name` | Constituent | `name` | Use `Constituent.name`, which is Blackbaud's computed display/full name | `pull` | Blackbaud NXT | |
| `constituents` | `lookup_id` | Constituent | `lookup_id` | Use the Blackbaud user-defined constituent identifier | `pull` | Blackbaud NXT | Optional secondary identifier |
| `constituents` | `preferred_name` | Constituent | `preferred_name` | Use `Constituent.preferred_name` when present; otherwise fall back to first/display name in the app | `pull` | Blackbaud NXT | Individuals only |
| `constituents` | `email` | Constituent | `email.address` | Use `Constituent.email.address` only when `Constituent.email.primary = true`; otherwise leave blank | `pull` | Blackbaud NXT | |
| `constituents` | `phone` | Constituent | `phone.number` | Use `Constituent.phone.number` only when `Constituent.phone.primary = true`; otherwise leave blank | `pull` | Blackbaud NXT | |
| `constituents` | `address` | Constituent | `address.formatted_address` | Use `Constituent.address.formatted_address` only when `Constituent.address.preferred = true`; otherwise leave blank | `pull` | Blackbaud NXT | Preferred mailing address only |
| `constituents` | `organization` | Constituent / employment / organization link | TBD | `Constituent (Get)` does not expose a direct organization/employer field; decide whether this comes from another endpoint | `pull` | Blackbaud NXT | Needs decision |

## Lifetime Giving (LifetimeGivingRead)

| App entity | App field | Blackbaud object | Blackbaud field / endpoint | Selection rule | Direction | Source of truth | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `constituent_lifetime_giving` | `total_giving` | LifetimeGivingRead | `total_giving.value` | Use the cumulative lifetime giving total as returned | `pull` | Blackbaud NXT | Good candidate for donor summary cards and constituent detail views |
| `constituent_lifetime_giving` | `total_received_giving` | LifetimeGivingRead | `total_received_giving.value` | Use the received-only lifetime giving total as returned | `pull` | Blackbaud NXT | Useful if we separate committed vs received giving |
| `constituent_lifetime_giving` | `total_pledge_balance` | LifetimeGivingRead | `total_pledge_balance.value` | Use pledge balance exactly as returned | `pull` | Blackbaud NXT | Read-only stewardship and planning metric |
| `constituent_lifetime_giving` | `total_soft_credits` | LifetimeGivingRead | `total_soft_credits.value` | Use soft credits total exactly as returned | `pull` | Blackbaud NXT | Optional in the UI until needed |
| `constituent_lifetime_giving` | `total_years_given` | LifetimeGivingRead | `total_years_given` | Use the Blackbaud computed value | `pull` | Blackbaud NXT | Good summary and affinity signal |
| `constituent_lifetime_giving` | `consecutive_years_given` | LifetimeGivingRead | `consecutive_years_given` | Use the Blackbaud computed value | `pull` | Blackbaud NXT | Strong stewardship signal for MGO context |

## Fundraiser Assignments (FundraiserAssignmentRead)

| App entity | App field | Blackbaud object | Blackbaud field / endpoint | Selection rule | Direction | Source of truth | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `constituent_fundraiser_assignments` | `assignment_id` | FundraiserAssignmentRead | `id` | Pull assignment record ID from `GET /constituents/{id}/fundraiserassignments` with `include_inactive=false` by default | `pull` | Blackbaud NXT | Read-only identifier for linked assignment records |
| `constituent_fundraiser_assignments` | `fundraiser_id` | FundraiserAssignmentRead | `fundraiser_id` | Pull active fundraiser IDs from `GET /constituents/{id}/fundraiserassignments?include_inactive=false` unless an admin history view needs inactive rows too | `pull` | Blackbaud NXT | Best candidate for showing NXT fundraiser ownership |
| `constituent_fundraiser_assignments` | `amount` | FundraiserAssignmentRead | `amount.value` | Use the assignment amount exactly as returned | `pull` | Blackbaud NXT | Read-only planning context |
| `constituent_fundraiser_assignments` | `appeal_id` | FundraiserAssignmentRead | `appeal_id` | Pull linked appeal ID when present | `pull` | Blackbaud NXT | Optional context only |
| `constituent_fundraiser_assignments` | `campaign_id` | FundraiserAssignmentRead | `campaign_id` | Pull linked campaign ID when present | `pull` | Blackbaud NXT | Optional context only |
| `constituent_fundraiser_assignments` | `fund_id` | FundraiserAssignmentRead | `fund_id` | Pull linked fund ID when present | `pull` | Blackbaud NXT | Optional restricted-fund context |
| `constituent_fundraiser_assignments` | `start` | FundraiserAssignmentRead | `start` | Use assignment start date exactly as returned | `pull` | Blackbaud NXT | Useful for assignment age and active-range displays |
| `constituent_fundraiser_assignments` | `end` | FundraiserAssignmentRead | `end` | Use assignment end date when present; leave blank for open-ended active assignments | `pull` | Blackbaud NXT | Mostly useful in historical/admin views |
| `constituent_fundraiser_assignments` | `type` | FundraiserAssignmentRead | `type` | Use solicitor-type label exactly as returned | `pull` | Blackbaud NXT | Examples include Major Donor, Fund, or Volunteer |

## Constituent Write-Back (ConstituentEdit)

These fields are writable in RE NXT, but they should not all be turned on at once. Start with the low-risk identity fields and keep governance/privacy fields behind an admin-only workflow.

| App entity | App field | Blackbaud object | Blackbaud field / endpoint | Selection rule | Direction | Source of truth | Notes |
|---|---|---|---|---|---|---|---|
| `constituent_edit` | `first` | ConstituentEdit | `first` | For linked individual constituents only; push only when intentionally editing the canonical first name in NXT | `push` | Blackbaud NXT | Individuals only; max 50 chars |
| `constituent_edit` | `middle` | ConstituentEdit | `middle` | For linked individual constituents only; push only when intentionally editing the canonical middle name in NXT | `push` | Blackbaud NXT | Individuals only; max 50 chars |
| `constituent_edit` | `last` | ConstituentEdit | `last` | For linked individual constituents only; push only when intentionally editing the canonical last name in NXT | `push` | Blackbaud NXT | Individuals only; max 100 chars |
| `constituent_edit` | `preferred_name` | ConstituentEdit | `preferred_name` | For linked individual constituents only; push when the app is explicitly updating preferred name | `push` | Blackbaud NXT | Individuals only; max 50 chars |
| `constituent_edit` | `lookup_id` | ConstituentEdit | `lookup_id` | Only push if the organization wants the app to manage constituent lookup IDs; otherwise leave NXT as the source of truth | `push` | Blackbaud NXT | High-governance field; likely admin-only |
| `constituent_edit` | `inactive` | ConstituentEdit | `inactive` | Only push from an admin or reviewer workflow with explicit intent; do not infer from local app inactivity | `push` | Blackbaud NXT | High-risk write-back |
| `constituent_edit` | `gives_anonymously` | ConstituentEdit | `gives_anonymously` | Only push from an explicit privacy/profile workflow, not from prospect workflow forms | `push` | Blackbaud NXT | Privacy-sensitive |
| `constituent_edit` | `requests_no_email` | ConstituentEdit | `requests_no_email` | Only push from an explicit communications preferences workflow | `push` | Blackbaud NXT | Communications preference |
| `constituent_edit` | `is_solicitor` | ConstituentEdit | `is_solicitor` | Do not push automatically from app solicitor-request workflows; require reviewer/admin confirmation | `push` | Blackbaud NXT | Keep a manual approval gate |
| `constituent_edit` | `organization_name` | ConstituentEdit | `name` | For linked organization constituents only; push to `ConstituentEdit.name` because that field is editable only for organization records | `push` | Blackbaud NXT | Organizations only; do not use for individuals |

## Prospect

| App entity | App field | Blackbaud object | Blackbaud field / endpoint | Selection rule | Direction | Source of truth | Notes |
|---|---|---|---|---|---|---|---|
| `prospects` | `blackbaud_constituent_id` | Constituent | `id` | Match to linked constituent | `pull` | Blackbaud NXT | Added for linking |
| `prospects` | `prospect_name` | Constituent | Display / full name | Use linked constituent name | `pull` | Blackbaud NXT | If linked |
| `prospects` | `expected_close_fy` | Opportunity or local workflow | TBD | Keep local unless you decide to sync opportunity forecast | `local only` | App | Recommended local for phase 1 |
| `prospects` | `ask_amount` | Opportunity rollup or local ranking | TBD | Keep local rollup until opportunity sync is defined | `local only` | App | |
| `prospects` | `ask_type` | Local workflow | N/A | Internal categorization | `local only` | App | |
| `prospects` | `status` | Prospect / opportunity rollup | TBD | Keep local until opportunity sync is stable | `local only` | App | |
| `prospects` | `priority_order` | Local ranking | N/A | User-managed ordering | `local only` | App | |
| `prospects` | `closed_amount` | Opportunity outcomes | TBD | May eventually pull from linked NXT opportunities | `local only` | App | Start local |
| `prospects` | `next_action_text` | Local workflow | N/A | Internal next step | `local only` | App | |
| `prospects` | `next_action_due_date` | Local workflow | N/A | Internal next step due date | `local only` | App | |

## Prospect Opportunities

| App entity | App field | Blackbaud object | Blackbaud field / endpoint | Selection rule | Direction | Source of truth | Notes |
|---|---|---|---|---|---|---|---|
| `prospect_opportunities` | `id` | Opportunity | `id` | Add a future `blackbaud_opportunity_id` when ready | `local only` | App | Not implemented yet |
| `prospect_opportunities` | `title` | Opportunity | TBD | Opportunity title / description | `local only` | App | Defer until write-back design |
| `prospect_opportunities` | `current_stage` | Opportunity | Stage | Possible future mapping | `local only` | App | |
| `prospect_opportunities` | `estimated_amount` | Opportunity | Amount | Possible future mapping | `local only` | App | |
| `prospect_opportunities` | `opportunity_status` | Opportunity | Status / outcome | Possible future mapping | `local only` | App | |
| `prospect_opportunities` | `closed_amount` | Opportunity | Closed / booked amount | Possible future mapping | `local only` | App | |
| `prospect_opportunities` | `close_date` | Opportunity | Close date | Possible future mapping | `local only` | App | |
| `prospect_opportunities` | `decline_reason` | Opportunity | Outcome notes | Possible future mapping | `local only` | App | |

## Prospect Pool

| App entity | App field | Blackbaud object | Blackbaud field / endpoint | Selection rule | Direction | Source of truth | Notes |
|---|---|---|---|---|---|---|---|
| `prospect_pool` | `blackbaud_constituent_id` | Constituent | `id` | Use when reviewer adds a known NXT person into the pool | `pull` | Blackbaud NXT | |
| `prospect_pool` | `prospect_name` | Constituent | Display / full name | Pull from linked constituent if matched | `pull` | Blackbaud NXT | Otherwise manual |
| `prospect_pool` | `email` | Constituent | `email.address` | Use `Constituent.email.address` only when `Constituent.email.primary = true` and the pool item is linked | `pull` | Blackbaud NXT | Otherwise local |
| `prospect_pool` | `phone` | Constituent | `phone.number` | Use `Constituent.phone.number` only when `Constituent.phone.primary = true` and the pool item is linked | `pull` | Blackbaud NXT | Otherwise local |
| `prospect_pool` | `note` | Local workflow | N/A | Internal note from Advancement Services | `local only` | App | |
| `prospect_pool` | `needs_contact_info` | Local workflow | N/A | Internal request flag | `local only` | App | |
| `prospect_pool` | `contact_info_request_note` | Local workflow | N/A | Internal request note | `local only` | App | |
| `prospect_pool` | `solicitor_requested` | Local workflow | N/A | Internal workflow flag | `local only` | App | |

## Submissions

| App entity | App field | Blackbaud object | Blackbaud field / endpoint | Selection rule | Direction | Source of truth | Notes |
|---|---|---|---|---|---|---|---|
| `submissions` | `submission_type` | N/A | N/A | Workflow-only record | `local only` | App | |
| `submissions` | `donor_name` | Possibly contact report context | TBD | Keep local for now | `local only` | App | |
| `submissions` | `interaction_type` | Contact report | TBD | Candidate future write-back | `local only` | App | Defer |
| `submissions` | `transcript` | N/A | N/A | Internal reference | `local only` | App | |
| `submissions` | `notes` | Contact report / action notes | TBD | Candidate future write-back | `local only` | App | Defer |
| `submissions` | `next_step` | Local workflow | N/A | Internal reviewer + MGO workflow | `local only` | App | |
| `submissions` | `status` | Local workflow | N/A | Review queue state | `local only` | App | |
| `submissions` | `reviewer_notes` | Local workflow | N/A | Internal clarification loop | `local only` | App | |
| `submissions` | `blackbaud_action_id` | Action | `id` | Store the created RE NXT action ID after successful write-back | `pull` | Blackbaud NXT | Future action sync |
| `submissions` | `blackbaud_sync_status` | Action sync lifecycle | N/A | Track whether sync is pending, synced, skipped, or failed | `local only` | App | Operational state only |
| `submissions` | `blackbaud_sync_error` | Action sync lifecycle | N/A | Store the latest Blackbaud sync error for troubleshooting | `local only` | App | Operational state only |

## Action Write-Back (CreateAction)

| App entity | App field | Blackbaud object | Blackbaud field / endpoint | Selection rule | Direction | Source of truth | Notes |
|---|---|---|---|---|---|---|---|
| `action` | `summary` | Action | `summary` | Map the combined update summary into the Blackbaud action summary | `push` | App | Character limit 255 |
| `action` | `description` | Action | `description` | Concatenate action notes and next step into the Blackbaud action description | `push` | App | |
| `action` | `constituent_id` | Action | `constituent_id` | Use the linked constituent's stored `blackbaud_constituent_id` | `push` | Blackbaud NXT | Required |
| `action` | `date` | Action | `date` | Use the update submission date in ISO-8601 format | `push` | App | Required |
| `action` | `category` | Action | `category` | Map interaction type to Blackbaud values: `call -> Phone Call`, `visit/event -> Meeting`, `email -> Email`, otherwise `Task/Other` | `push` | App | Required |
| `action` | `direction` | Action | `direction` | Default to `Outbound` unless the app later captures inbound direction | `push` | App | |
| `action` | `author` | Action | `author` | Use the signed-in user's display name when available | `push` | App | Optional |
| `action` | `completed` | Action | `completed` | Set `true` only when the app intentionally marks the action complete; otherwise leave false or omit | `push` | App | Relevant for edit flow |
| `action` | `completed_date` | Action | `completed_date` | When completed is true, send the completion timestamp in ISO-8601 format | `push` | App | Relevant for edit flow |
| `action` | `outcome` | Action | `outcome` | Only send when the app can confidently map the result to `Successful` or `Unsuccessful` | `push` | App | Defer until outcome UX exists |
| `action` | `type` | Action | `type` | Optional subtype that complements category; use only after confirming valid Action table values in NXT | `push` | App | Defer until taxonomy is defined |
| `action` | `opportunity_id` | Action | `opportunity_id` | Only include once app opportunities are linked to NXT opportunity IDs | `push` | Blackbaud NXT | Phase 2 |
| `action` | `update` | Action | `PATCH /constituent/v1/actions/{action_id}` | Use when a synced local submission is intentionally edited and the matching NXT action should be revised in place | `push` | App | Use stored `submissions.blackbaud_action_id` |
| `action` | `delete` | Action | `DELETE /constituent/v1/actions/{action_id}` | Only delete when a synced local submission is explicitly removed or intentionally replaced | `push` | App | Use stored `submissions.blackbaud_action_id`; do not auto-delete on routine edits |

## Blackbaud Search Phase 1

Recommended first implementation:

1. Read-only constituent search from Blackbaud
2. Match/select one constituent
3. Save `blackbaud_constituent_id` locally
4. Pull only:
   - display name
   - primary email
   - primary phone
   - organization (once defined)

Do **not** write updates back to NXT in phase 1.

## Open Decisions

- Which NXT field should drive `constituents.organization`?
- Do you want to sync NXT opportunities later, or keep app opportunities local?
- Should the app ever write contact reports/actions back to NXT?
- Should prospect owner / fundraiser assignment come from `GET /constituents/{id}/fundraiserassignments` in NXT or stay local?

## Notes

- OAuth is already connected.
- Before real NXT data can flow, the Blackbaud app still needs data scopes beyond `offline_access`.
- Once scopes are added, reauthorize and test the read-only route:
  - `/api/blackbaud/constituents/search?q=smith`
- The first dormant write-back scaffold is prepared for `POST /constituent/v1/actions`, but it should remain off until Okta and data scopes are ready.
